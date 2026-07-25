/**
 * seed-prompt-examples-v2.mjs
 * 提示词工作台 few-shot 数据灌入 V2
 *
 * 新增数据源：
 * 1. VidProM (167万视频prompt) → 筛选高质量灌入 video 平台
 * 2. GPT-Image-2 (15000+) → 新平台 gpt-image，带分类
 * 3. FLUX photoreal-portrait → 补充 flux 高质量人像
 *
 * 用法: HF_TOKEN=hf_xxx node scripts/seed-prompt-examples-v2.mjs
 */

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
    if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

async function getDatasetId(name) {
    const existing = await supabaseRest(`datasets?name=eq.${encodeURIComponent(name)}&select=id`);
    if (existing && existing.length > 0) return existing[0].id;
    throw new Error(`数据集 "${name}" 不存在，请先运行 seed-prompt-examples.mjs 创建`);
}

async function insertItem(datasetId, item) {
    const key = item.prompt.slice(0, 60);
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
            reference_image_url: item.imageUrl || "",
            quality_score: item.quality || 8,
        }),
    });
    return true;
}

// ─── 自动分类 ───────────────────────────────────────────────────

function classifyPrompt(text) {
    const t = text.toLowerCase();
    if (/\b(portrait|face|woman|man|girl|boy|person|model|beauty)\b/.test(t)) return "character";
    if (/\b(landscape|city|forest|ocean|mountain|sky|sunset|nature|street)\b/.test(t)) return "scene";
    if (/\b(product|bottle|package|brand|commercial|advertising)\b/.test(t)) return "product";
    if (/\b(camera|lens|aperture|focal|shot|angle|aerial|drone|tracking|pan)\b/.test(t)) return "camera";
    if (/\b(mood|atmosphere|dream|ethereal|dark|moody|cinematic|dramatic)\b/.test(t)) return "mood";
    if (/\b(style|art|painting|watercolor|oil|anime|cyberpunk|surreal)\b/.test(t)) return "style";
    if (/\b(running|dancing|fighting|walking|flying|explosion|motion)\b/.test(t)) return "action";
    return "general";
}

// ─── 1. VidProM 视频提示词 ──────────────────────────────────────

async function seedVidProM(datasetId) {
    console.log("\n=== VidProM 视频提示词 ===");
    const url = `${HF_MIRROR}/datasets/WenhaoWang/VidProM/resolve/main/VidProM_unique.csv`;
    // 下载前 500KB（CSV 格式，每行一条）
    const res = await fetch(url, { headers: { Authorization: `Bearer ${HF_TOKEN}`, Range: "bytes=0-500000" } });
    if (!res.ok) throw new Error(`VidProM download ${res.status}`);
    const text = await res.text();
    console.log(`  下载 ${(text.length / 1024).toFixed(0)} KB`);

    const lines = text.split("\n").slice(1); // skip header
    const prompts = [];
    for (const line of lines) {
        // CSV: uuid,"prompt",time,toxicity,obscene,...
        const match = line.match(/^[^,]+,"((?:[^"]|"")*)",/);
        if (!match) continue;
        const prompt = match[1].replace(/""/g, '"').trim();
        // 提取毒性分数（第4列）
        const cols = line.split(",");
        const toxicity = parseFloat(cols[cols.length - 6]) || 0;
        if (prompt.length < 30 || prompt.length > 500) continue; // 过滤太短/太长
        if (toxicity > 0.01) continue; // 过滤有毒内容
        prompts.push({ prompt, toxicity });
    }
    console.log(`  有效条目: ${prompts.length}`);

    // 按长度排序（越长描述越丰富），取 top 30
    prompts.sort((a, b) => b.prompt.length - a.prompt.length);
    const selected = prompts.slice(0, 30);

    let inserted = 0;
    for (let i = 0; i < selected.length; i++) {
        const { prompt } = selected[i];
        const category = classifyPrompt(prompt);
        const ok = await insertItem(datasetId, {
            platform: "video",
            prompt,
            title: `视频提示词#${i + 1}（VidProM）`,
            tags: ["video", "vidprom", category],
            quality: prompt.length > 200 ? 9 : 8,
        });
        if (ok) inserted++;
    }
    console.log(`  灌入: ${inserted} 条视频提示词`);
    return inserted;
}

// ─── 2. GPT-Image-2 提示词 ──────────────────────────────────────

async function seedGptImage(datasetId) {
    console.log("\n=== GPT-Image-2 提示词 ===");
    const url = `${HF_MIRROR}/datasets/Goku-OpenLab/gpt-image-2-prompts-datasets/resolve/main/metadata.jsonl`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${HF_TOKEN}`, Range: "bytes=0-300000" } });
    if (!res.ok) throw new Error(`GPT-Image-2 download ${res.status}`);
    const text = await res.text();
    console.log(`  下载 ${(text.length / 1024).toFixed(0)} KB`);

    const lines = text.split("\n").filter((l) => l.trim());
    const entries = [];
    for (const line of lines) {
        try {
            const obj = JSON.parse(line);
            // 优先取中文 prompt（i18n.zh.p），否则取 raw_p
            const prompt = obj.i18n?.zh?.p || obj.raw_p || "";
            const title = obj.i18n?.zh?.t || obj.slug || "";
            const category = obj.category || "";
            const tags = obj.i18n?.zh?.tags || obj.i18n?.en?.tags || [];
            if (prompt.length < 20) continue;
            // 跳过含模板变量的（{argument name=...}）
            if (prompt.includes("{argument")) continue;
            entries.push({ prompt, title, category, tags });
        } catch { /* skip */ }
    }
    console.log(`  有效条目: ${entries.length}`);

    // 按分类多样性选取，每类最多5条
    const byCategory = {};
    for (const e of entries) {
        const cat = e.category || "other";
        if (!byCategory[cat]) byCategory[cat] = [];
        if (byCategory[cat].length < 5) byCategory[cat].push(e);
    }
    const selected = Object.values(byCategory).flat().slice(0, 30);
    console.log(`  分类: ${Object.keys(byCategory).join(", ")}`);

    let inserted = 0;
    for (let i = 0; i < selected.length; i++) {
        const e = selected[i];
        const ok = await insertItem(datasetId, {
            platform: "gpt-image",
            prompt: e.prompt,
            title: `GPT-Image: ${e.title || `#${i + 1}`}`,
            tags: ["gpt-image", e.category.toLowerCase().replace(/\s+/g, "_"), ...e.tags.slice(0, 3)],
            quality: 9,
        });
        if (ok) inserted++;
    }
    console.log(`  灌入: ${inserted} 条 GPT-Image 提示词`);
    return inserted;
}

// ─── 3. FLUX 高质量人像 ─────────────────────────────────────────

async function seedFluxPortrait(datasetId) {
    console.log("\n=== FLUX Photoreal Portrait ===");
    const url = `${HF_MIRROR}/datasets/k-mktr/improved-flux-prompts-photoreal-portrait/resolve/main/20241003-02_flux_photo_portrait.jsonl`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${HF_TOKEN}`, Range: "bytes=0-100000" } });
    if (!res.ok) throw new Error(`FLUX portrait download ${res.status}`);
    const text = await res.text();

    const lines = text.split("\n").filter((l) => l.trim());
    const entries = [];
    for (const line of lines) {
        try {
            const obj = JSON.parse(line);
            if (obj.prompt && obj.prompt.length > 50) entries.push(obj.prompt);
        } catch { /* skip */ }
    }
    console.log(`  有效条目: ${entries.length}`);

    // 取前 15 条（都是高质量的）
    const selected = entries.slice(0, 15);
    let inserted = 0;
    for (let i = 0; i < selected.length; i++) {
        const ok = await insertItem(datasetId, {
            platform: "flux",
            prompt: selected[i],
            title: `FLUX人像#${i + 1}（photoreal-portrait）`,
            tags: ["flux", "portrait", "photoreal", "character"],
            quality: 9,
        });
        if (ok) inserted++;
    }
    console.log(`  灌入: ${inserted} 条 FLUX 人像提示词`);
    return inserted;
}

// ─── 主流程 ─────────────────────────────────────────────────────

async function main() {
    console.log("=== 提示词工作台 V2 数据灌入 ===\n");

    const datasetId = await getDatasetId("提示词工作台Few-shot示例库");
    console.log(`目标数据集: ${datasetId}`);

    const n1 = await seedVidProM(datasetId);
    const n2 = await seedGptImage(datasetId);
    const n3 = await seedFluxPortrait(datasetId);

    console.log(`\n=== 完成: 视频${n1} + GPT-Image${n2} + FLUX人像${n3} = ${n1 + n2 + n3} 条 ===`);
}

main().catch((err) => {
    console.error("灌入失败:", err.message);
    process.exit(1);
});
