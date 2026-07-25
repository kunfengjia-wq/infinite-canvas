/**
 * seed-prompt-examples.mjs
 * 从 HuggingFace 镜像拉取各平台高质量提示词示例，筛选后灌入 Supabase dataset_items 表
 * 供提示词工作台 few-shot 系统使用
 *
 * 用法: node scripts/seed-prompt-examples.mjs
 * 依赖: hyparquet (纯 JS parquet 解析)
 */

import { parquetReadObjects } from "hyparquet";

const SUPABASE_URL = "https://wqgvydmxiuhsxodduigi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxZ3Z5ZG14aXVoc3hvZGR1aWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NzEzMzEsImV4cCI6MjEwMDQ0NzMzMX0.gmFXYouU2jc0zLsW7KYbC-i-fEnp1SYXZc-xOfZQefU";
const HF_TOKEN = process.env.HF_TOKEN || "";
const HF_MIRROR = "https://hf-mirror.com";

const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
};

async function supabaseRest(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase REST ${res.status}: ${text}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

// ─── HF 数据集获取（使用 datasets viewer API）────────────────────

async function fetchHfDatasetRows(datasetId, split = "train", offset = 0, length = 100) {
    // 获取 parquet 文件列表
    const listUrl = `${HF_MIRROR}/api/datasets/${datasetId}/parquet/default/${split}`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${HF_TOKEN}` } });
    if (!listRes.ok) throw new Error(`HF parquet list ${listRes.status}`);
    const files = await listRes.json();
    if (!files || files.length === 0) throw new Error("No parquet files");

    // 下载第一个 parquet 文件（用镜像域名替换）
    const fileUrl = files[0].replace("https://huggingface.co", HF_MIRROR);
    const fileRes = await fetch(fileUrl, { headers: { Authorization: `Bearer ${HF_TOKEN}` } });
    if (!fileRes.ok) throw new Error(`HF parquet download ${fileRes.status}`);
    const buffer = await fileRes.arrayBuffer();

    // 用 hyparquet 解析
    const rows = await parquetReadObjects({ file: buffer });
    // 返回 offset~offset+length 范围
    return rows.slice(offset, offset + length);
}

// ─── 平台数据集配置 ─────────────────────────────────────────────

const PLATFORM_SOURCES = [
    {
        platform: "midjourney",
        dataset: "gaodrew/midjourney-prompts-highquality",
        promptField: "prompt",
        negativeField: null,
        titleField: null,
        minLength: 80,
        maxLength: 600,
        targetCount: 20,
    },
    {
        platform: "sd",
        dataset: "Gustavosta/Stable-Diffusion-Prompts",
        promptField: "Prompt",
        negativeField: "Negative",
        titleField: null,
        minLength: 50,
        maxLength: 500,
        targetCount: 20,
    },
    {
        platform: "sd",
        dataset: "k-mktr/improved-flux-prompts",
        promptField: "prompt",
        negativeField: null,
        titleField: null,
        minLength: 50,
        maxLength: 500,
        targetCount: 10,
        tag: "flux",
    },
];

// ─── 筛选逻辑 ──────────────────────────────────────────────────

/** 自动分类提示词类别 */
function classifyPrompt(prompt) {
    const lower = prompt.toLowerCase();
    // 角色类
    if (/portrait|woman|man|girl|boy|person|face|eyes|hair|warrior|knight|wizard|character|人物|少女|少年|战士|法师|角色/.test(lower)) return "character";
    // 产品类
    if (/product|bottle|watch|shoe|perfume|commercial|packaging|产品|香水|手表|商业/.test(lower)) return "product";
    // 镜头类
    if (/aerial|drone|tracking shot|dolly|crane|pan |zoom|close-up|wide shot|macro|航拍|运镜|镜头|俯拍|仰拍/.test(lower)) return "camera";
    // 氛围类
    if (/atmosphere|mood|dreamy|mysterious|horror|romantic|tension|氛围|梦幻|神秘|恐怖|浪漫/.test(lower)) return "mood";
    // 风格类
    if (/style|anime|cyberpunk|watercolor|oil painting|pixel|vaporwave|风格|赛博|水墨|像素/.test(lower)) return "style";
    // 动作类
    if (/running|jumping|fighting|dancing|flying|walking|奔跑|跳跃|打斗|舞蹈|飞行/.test(lower)) return "action";
    // 道具类
    if (/sword|shield|potion|artifact|weapon|道具|武器|剑|盾|药水/.test(lower)) return "prop";
    // 场景类（默认）
    return "scene";
}

function isValidPrompt(text, config) {
    if (!text || typeof text !== "string") return false;
    const trimmed = text.trim();
    if (trimmed.length < config.minLength || trimmed.length > config.maxLength) return false;
    // 过滤纯 URL、纯数字、过短无意义内容
    if (/^https?:\/\//.test(trimmed)) return false;
    if (/^\d+$/.test(trimmed)) return false;
    // 至少包含 3 个英文单词或 10 个中文字符
    const wordCount = trimmed.split(/\s+/).length;
    const cjkCount = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length;
    if (wordCount < 3 && cjkCount < 10) return false;
    return true;
}

function generateTitle(prompt) {
    // 取前 30 个字符作为标题
    const clean = prompt.replace(/\n/g, " ").trim();
    return clean.length > 40 ? clean.slice(0, 40) + "..." : clean;
}

// ─── 灌入 Supabase ─────────────────────────────────────────────

async function ensureDataset() {
    const name = "提示词工作台Few-shot示例库";
    const existing = await supabaseRest(`datasets?name=eq.${encodeURIComponent(name)}&select=id`);
    if (existing && existing.length > 0) return existing[0].id;
    const created = await supabaseRest("datasets", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ name, description: "各平台高质量提示词示例，用于 AI 生成时 few-shot 参考", platform: "multi", category: "prompt_examples" }),
    });
    return created[0].id;
}

async function insertExample(datasetId, item) {
    // 去重：同 platform + prompt 前 50 字符
    const key = item.prompt.slice(0, 50);
    const existing = await supabaseRest(`dataset_items?dataset_id=eq.${datasetId}&platform=eq.${item.platform}&prompt=like.${encodeURIComponent(key + "%")}&select=id`);
    if (existing && existing.length > 0) return false;

    await supabaseRest("dataset_items", {
        method: "POST",
        body: JSON.stringify({
            dataset_id: datasetId,
            title: item.title,
            prompt: item.prompt,
            negative_prompt: item.negative || "",
            platform: item.platform,
            tags: item.tags || [],
            reference_image_url: "",
            quality_score: item.quality || 8,
        }),
    });
    return true;
}

// ─── 主流程 ─────────────────────────────────────────────────────

async function main() {
    console.log("=== 提示词工作台 Few-shot 数据灌入 ===\n");

    const datasetId = await ensureDataset();
    console.log(`目标数据集 ID: ${datasetId}\n`);

    let totalInserted = 0;

    for (const source of PLATFORM_SOURCES) {
        console.log(`\n--- ${source.platform} ← ${source.dataset} ---`);
        let inserted = 0;
        let scanned = 0;

        // 一次性下载并解析 parquet
        let allRows;
        try {
            allRows = await fetchHfDatasetRows(source.dataset, "train", 0, 99999);
            console.log(`  下载完成，共 ${allRows.length} 行`);
        } catch (err) {
            console.error(`  获取失败: ${err.message}`);
            continue;
        }

        for (const row of allRows) {
            if (inserted >= source.targetCount) break;
            scanned++;
            const prompt = row[source.promptField];
            if (!isValidPrompt(prompt, source)) continue;

            const negative = source.negativeField ? row[source.negativeField] || "" : "";
            const title = source.titleField ? row[source.titleField] : generateTitle(prompt);
            const category = classifyPrompt(prompt);
            const tags = [source.platform, category, source.tag || "hf-sourced"].filter(Boolean);

            const ok = await insertExample(datasetId, {
                platform: source.platform,
                prompt: prompt.trim(),
                negative: negative.trim(),
                title,
                tags,
                quality: 8,
            });
            if (ok) inserted++;
        }

        console.log(`  扫描 ${scanned} 条，灌入 ${inserted}/${source.targetCount} 条`);
        totalInserted += inserted;
    }

    // ─── 视频平台示例（手工精选，HF 无现成数据）───────────────────
    console.log("\n--- 视频平台精选示例（手工） ---");
    const videoExamples = [
        { platform: "kling", title: "城市延时摄影", prompt: "城市天际线延时摄影，从黄昏到夜晚，灯光逐渐亮起，车流形成光轨，天空从橙红渐变为深蓝，云朵快速流动", negative: "", tags: ["kling", "scene", "camera", "curated"] },
        { platform: "kling", title: "水墨山水运动", prompt: "中国水墨画风格，远山如黛，云雾缭绕缓缓流动，一叶扁舟在江面缓缓前行，飞鸟掠过天际，笔墨晕染效果", negative: "", tags: ["kling", "scene", "style", "curated"] },
        { platform: "kling", title: "产品旋转展示", prompt: "一瓶高端香水在大理石台面上缓慢360度旋转，柔和的侧光勾勒瓶身曲线，背景虚化为金色光斑，微距细节展现玻璃质感", negative: "", tags: ["kling", "product", "camera", "curated"] },
        { platform: "kling", title: "武侠角色亮相", prompt: "一位白衣剑客站在竹林深处，风吹竹叶纷飞，他缓缓拔剑，剑身反射月光寒芒，衣袂飘动，气场凌厉", negative: "", tags: ["kling", "character", "action", "curated"] },
        { platform: "runway", title: "Cinematic tracking shot", prompt: "Cinematic tracking shot following a woman walking through a rain-soaked Tokyo alley at night, neon signs reflecting off wet pavement, shallow depth of field, anamorphic lens flare, moody atmospheric lighting", negative: "", tags: ["runway", "character", "camera", "curated"] },
        { platform: "runway", title: "Aerial landscape reveal", prompt: "Sweeping aerial drone shot rising above morning fog to reveal a vast mountain valley with a winding river below, golden hour sunlight breaking through clouds, volumetric light rays, epic landscape photography", negative: "", tags: ["runway", "scene", "camera", "curated"] },
        { platform: "runway", title: "Slow motion nature", prompt: "Extreme slow motion macro shot of a hummingbird hovering near a red flower, iridescent feathers catching sunlight, wings creating motion blur, pollen particles floating in the air, shallow depth of field, nature documentary style", negative: "", tags: ["runway", "scene", "camera", "curated"] },
        { platform: "runway", title: "Character reveal", prompt: "Dramatic dolly-in shot revealing a mysterious figure standing at the edge of a cliff overlooking a stormy ocean, wind blowing their coat, dark clouds swirling overhead, lightning illuminating the scene intermittently, cinematic color grading", negative: "", tags: ["runway", "character", "mood", "curated"] },
        { platform: "runway", title: "Product commercial", prompt: "Smooth orbit shot around a luxury watch on a reflective black surface, studio lighting creating precise highlights on the metal case, camera slowly circles to reveal the intricate dial details, premium commercial aesthetic, clean minimal background", negative: "", tags: ["runway", "product", "camera", "curated"] },
        { platform: "runway", title: "Sci-fi environment", prompt: "Slow push-in through a massive abandoned space station corridor, flickering emergency lights casting red shadows, floating debris in zero gravity, steam venting from broken pipes, alien symbols glowing on the walls, atmospheric horror sci-fi", negative: "", tags: ["runway", "scene", "mood", "curated"] },
    ];

    let videoInserted = 0;
    for (const ex of videoExamples) {
        const ok = await insertExample(datasetId, { ...ex, quality: 9 });
        if (ok) videoInserted++;
    }
    console.log(`  灌入 ${videoInserted}/${videoExamples.length} 条视频平台示例`);
    totalInserted += videoInserted;

    console.log(`\n=== 完成：共灌入 ${totalInserted} 条平台专属示例 ===`);
}

main().catch((err) => {
    console.error("灌入失败:", err.message);
    process.exit(1);
});
