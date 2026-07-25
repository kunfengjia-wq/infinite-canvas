/**
 * seed-visual-description-db.mjs
 * 从 Video-Detailed-Caption (VDC_1k) 灌入画面描述专业数据
 *
 * 每条含: camera_caption / background_caption / main_object_caption / short_caption / detailed_caption
 * 精选电影感强的条目，灌入为 sb_visual_description 的 few-shot 参考
 *
 * 用法: HF_TOKEN=hf_xxx node scripts/seed-visual-description-db.mjs
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
    const existing = await supabaseRest(`dataset_items?dataset_id=eq.${datasetId}&prompt=like.${encodeURIComponent(key + "%")}&select=id`);
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

// ─── 电影感评分 ─────────────────────────────────────────────────

const CINEMATIC_KEYWORDS = [
    "cinematic", "dramatic", "close-up", "wide-angle", "tracking shot", "pan",
    "tilt", "dolly", "crane", "slow motion", "depth of field", "bokeh",
    "silhouette", "golden hour", "backlit", "rim light", "chiaroscuro",
    "atmospheric", "moody", "noir", "aerial", "bird's eye", "low angle",
    "high angle", "dutch angle", "lens flare", "volumetric", "haze",
    "shadow", "contrast", "warm tone", "cool tone", "desaturated",
];

function cinematicScore(entry) {
    const text = [entry.camera_caption, entry.background_caption, entry.detailed_caption].join(" ").toLowerCase();
    let score = 0;
    for (const kw of CINEMATIC_KEYWORDS) {
        if (text.includes(kw)) score++;
    }
    // 长度加分（描述越丰富越好）
    if (text.length > 800) score += 2;
    if (text.length > 1500) score += 2;
    return score;
}

// ─── 主流程 ─────────────────────────────────────────────────────

async function main() {
    console.log("=== 画面描述专业数据灌入 (Video-Detailed-Caption) ===\n");

    const datasetId = await ensureDataset("画面描述示例库(VDC)", "Video-Detailed-Caption多维度结构化画面描述few-shot", "visual_description");
    console.log(`目标数据集: ${datasetId}`);

    // 下载 VDC_1k.jsonl（约 2-3MB）
    console.log("\n下载 VDC_1k.jsonl ...");
    const url = `${HF_MIRROR}/datasets/wchai/Video-Detailed-Caption/resolve/main/VDC_1k.jsonl`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${HF_TOKEN}` } });
    if (!res.ok) throw new Error(`VDC download ${res.status}`);
    const text = await res.text();
    console.log(`  大小: ${(text.length / 1024 / 1024).toFixed(1)} MB`);

    const lines = text.split("\n").filter((l) => l.trim());
    const entries = [];
    for (const line of lines) {
        try { entries.push(JSON.parse(line)); } catch { /* skip */ }
    }
    console.log(`  解析: ${entries.length} 条`);

    // 按电影感评分排序，取 top 30
    const scored = entries
        .map((e) => ({ ...e, score: cinematicScore(e) }))
        .sort((a, b) => b.score - a.score);

    const selected = scored.slice(0, 30);
    console.log(`  精选: ${selected.length} 条 (score range: ${selected[selected.length - 1]?.score} ~ ${selected[0]?.score})`);

    let inserted = 0;
    for (let i = 0; i < selected.length; i++) {
        const e = selected[i];
        // 构建结构化画面描述示例
        const description = {
            camera: e.camera_caption || "",
            background: e.background_caption || "",
            subject: e.main_object_caption || "",
            overall: e.short_caption || "",
            detailed: e.detailed_caption || "",
        };

        const source = e.video_source || "unknown";
        const ok = await insertItem(datasetId, {
            platform: "storyboard",
            prompt: JSON.stringify(description, null, 2),
            title: `画面描述示例#${i + 1}（${source}，电影感${e.score}分）`,
            tags: ["storyboard", "visual_description", "vdc", source],
            quality: Math.min(10, 7 + Math.floor(e.score / 5)),
        });
        if (ok) inserted++;
    }

    console.log(`\n=== 完成: 灌入 ${inserted}/${selected.length} 条画面描述示例 ===`);
}

main().catch((err) => {
    console.error("灌入失败:", err.message);
    process.exit(1);
});
