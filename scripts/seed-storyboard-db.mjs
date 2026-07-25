/**
 * seed-storyboard-db.mjs
 * 从 ConStoryBoard + ShotBench 灌入分镜工作流专业数据
 *
 * - ConStoryBoard: 107K 镜头描述 → 筛选高质量 → 灌入 dataset_items (platform="storyboard")
 * - ShotBench: 3572 条 QA → 提取专业词汇 → 灌入 dataset_items (platform="all", category="cinematography_vocab")
 *
 * 用法: HF_TOKEN=hf_xxx node scripts/seed-storyboard-db.mjs
 * 依赖: hyparquet
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

// ─── 数据集管理 ─────────────────────────────────────────────────

async function ensureDataset(name, description, category) {
    const existing = await supabaseRest(`datasets?name=eq.${encodeURIComponent(name)}&select=id`);
    if (existing && existing.length > 0) return existing[0].id;
    const created = await supabaseRest("datasets", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ name, description, platform: "storyboard", category }),
    });
    return created[0].id;
}

async function insertItem(datasetId, item) {
    const key = item.prompt.slice(0, 50);
    const existing = await supabaseRest(`dataset_items?dataset_id=eq.${datasetId}&platform=eq.${item.platform}&prompt=like.${encodeURIComponent(key + "%")}&select=id`);
    if (existing && existing.length > 0) return false;
    await supabaseRest("dataset_items", {
        method: "POST",
        body: JSON.stringify({
            dataset_id: datasetId,
            title: item.title,
            prompt: item.prompt,
            negative_prompt: "",
            platform: item.platform,
            tags: item.tags || [],
            reference_image_url: "",
            quality_score: item.quality || 8,
        }),
    });
    return true;
}

// ─── ConStoryBoard 灌入 ─────────────────────────────────────────

async function seedConStoryBoard(datasetId) {
    console.log("\n=== ConStoryBoard 镜头描述 ===");
    const url = `${HF_MIRROR}/datasets/escapist413/ConStoryBoard/resolve/main/all_annotations_hf.json`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${HF_TOKEN}`, Range: "bytes=0-500000" } });
    if (!res.ok) throw new Error(`ConStoryBoard download ${res.status}`);
    const text = await res.text();

    // JSON 可能被截断，找到最后一个完整的 shot 对象
    const dataStart = text.indexOf('"data"');
    if (dataStart === -1) throw new Error("Cannot find data field");

    // 提取所有完整的 description 字段
    const descRegex = /"description":\s*"((?:[^"\\]|\\.)*)"/g;
    const descriptions = [];
    let match;
    while ((match = descRegex.exec(text)) !== null) {
        const desc = match[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
        descriptions.push(desc);
    }
    console.log(`  解析到 ${descriptions.length} 条描述`);

    // 筛选高质量描述（长度 150-800 字符，包含镜头语言关键词）
    const cameraKeywords = /camera|shot|angle|zoom|pan|tilt|dolly|tracking|close-up|wide|lens|lighting|composition|frame|movement|push in|pull out|crane|handheld|aerial|镜头|运镜|构图|光线|角度|景别/;
    const qualityDescs = descriptions.filter((d) => {
        if (d.length < 150 || d.length > 800) return false;
        if (!cameraKeywords.test(d)) return false;
        // 至少包含 2 个镜头语言要素
        let score = 0;
        if (/camera|movement|zoom|pan|tilt|dolly|tracking|push|pull|镜头|运镜/.test(d)) score++;
        if (/light|shadow|illuminat|glow|光|影/.test(d)) score++;
        if (/compos|frame|angle|perspective|构图|角度/.test(d)) score++;
        if (/close-up|wide|medium|shot|景别/.test(d)) score++;
        if (/mood|atmosphere|tension|serene|dramatic|氛围|情绪/.test(d)) score++;
        return score >= 2;
    });

    console.log(`  高质量筛选: ${qualityDescs.length} 条`);

    // 灌入前 30 条
    const target = Math.min(30, qualityDescs.length);
    let inserted = 0;
    for (let i = 0; i < qualityDescs.length && inserted < target; i++) {
        const desc = qualityDescs[i];
        const title = desc.slice(0, 50).replace(/\n/g, " ") + (desc.length > 50 ? "..." : "");
        const tags = ["storyboard", "shot_description", "constoryboard"];
        // 自动分类
        if (/close-up|extreme close|特写|macro/.test(desc)) tags.push("close_up");
        else if (/wide|aerial|landscape|远景|全景/.test(desc)) tags.push("wide_shot");
        else tags.push("medium_shot");

        const ok = await insertItem(datasetId, { platform: "storyboard", prompt: desc, title, tags, quality: 9 });
        if (ok) inserted++;
    }
    console.log(`  灌入 ${inserted}/${target} 条`);
    return inserted;
}

// ─── ShotBench 词汇提取 ─────────────────────────────────────────

async function seedShotBench(datasetId) {
    console.log("\n=== ShotBench 专业词汇 ===");
    const listUrl = `${HF_MIRROR}/api/datasets/Vchitect/ShotBench/parquet/default/test`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${HF_TOKEN}` } });
    if (!listRes.ok) throw new Error(`ShotBench list ${listRes.status}`);
    const files = await listRes.json();
    const fileUrl = files[0].replace("https://huggingface.co", HF_MIRROR);
    const fileRes = await fetch(fileUrl, { headers: { Authorization: `Bearer ${HF_TOKEN}` } });
    if (!fileRes.ok) throw new Error(`ShotBench download ${fileRes.status}`);
    const buffer = await fileRes.arrayBuffer();
    const rows = await parquetReadObjects({ file: buffer });
    console.log(`  下载完成: ${rows.length} 条 QA`);

    // 从 options 中提取所有专业词汇（按 category 分组）
    const vocabByCategory = {};
    for (const row of rows) {
        const cat = row.category;
        if (!vocabByCategory[cat]) vocabByCategory[cat] = new Set();
        try {
            const opts = JSON.parse(row.options);
            Object.values(opts).forEach((v) => vocabByCategory[cat].add(v));
        } catch { /* skip */ }
    }

    // 灌入每个 category 的词汇汇总
    let inserted = 0;
    for (const [cat, terms] of Object.entries(vocabByCategory)) {
        const termList = [...terms].sort();
        const prompt = `[${cat}] 专业术语: ${termList.join(", ")}`;
        const title = `ShotBench-${cat} (${termList.length} terms)`;
        const ok = await insertItem(datasetId, {
            platform: "all",
            prompt,
            title,
            tags: ["storyboard", "cinematography_vocab", "shotbench", cat.replace(/\s+/g, "_")],
            quality: 10,
        });
        if (ok) inserted++;
        console.log(`  ${cat}: ${termList.length} 个术语`);
    }
    console.log(`  灌入 ${inserted} 条词汇汇总`);
    return inserted;
}

// ─── 主流程 ─────────────────────────────────────────────────────

async function main() {
    console.log("=== 分镜工作流专业数据灌入 ===\n");

    const descDatasetId = await ensureDataset("分镜镜头描述示例库", "ConStoryBoard 高质量镜头描述，供 sb_shot_generation/sb_visual_description few-shot", "shot_description");
    const vocabDatasetId = await ensureDataset("镜头语言专业词汇库(ShotBench)", "ShotBench 8维度专业术语汇总，供 AI 参考", "cinematography_vocab");

    console.log(`镜头描述数据集: ${descDatasetId}`);
    console.log(`专业词汇数据集: ${vocabDatasetId}`);

    const n1 = await seedConStoryBoard(descDatasetId);
    const n2 = await seedShotBench(vocabDatasetId);

    console.log(`\n=== 完成: 镜头描述 ${n1} 条 + 词汇 ${n2} 条 ===`);
}

main().catch((err) => {
    console.error("灌入失败:", err.message);
    process.exit(1);
});
