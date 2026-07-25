/**
 * seed-scene-assets-db.mjs
 * 从 MovieSum + screenplay-format-conventions 灌入场景拆分/资产提取专业数据
 *
 * - MovieSum: 2200部电影结构化剧本 → 精选场景拆分+资产提取 few-shot 示例
 * - screenplay-format-conventions: 场景头语法/角色规则/转场关键词 → 知识条目
 *
 * 用法: HF_TOKEN=hf_xxx node scripts/seed-scene-assets-db.mjs
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

// ─── MovieSum 解析 ──────────────────────────────────────────────

function parseMovieSumScenes(scriptXml) {
    // 解析 <scene> 块
    const scenes = [];
    const sceneRegex = /<scene>([\s\S]*?)<\/scene>/g;
    let match;
    while ((match = sceneRegex.exec(scriptXml)) !== null) {
        const block = match[1];
        const heading = (block.match(/<stage_direction>([\s\S]*?)<\/stage_direction>/) || [])[1] || "";
        const descriptions = [...block.matchAll(/<scene_description>([\s\S]*?)<\/scene_description>/g)].map((m) => m[1]);
        const characters = [...block.matchAll(/<character>([\s\S]*?)<\/character>/g)].map((m) => m[1]);
        const dialogues = [...block.matchAll(/<dialogue>([\s\S]*?)<\/dialogue>/g)].map((m) => m[1]);
        scenes.push({ heading, description: descriptions.join(" "), characters, dialogues });
    }
    return scenes;
}

async function seedMovieSum(datasetId) {
    console.log("\n=== MovieSum 场景拆分+资产提取示例 ===");
    const url = `${HF_MIRROR}/datasets/rohitsaxena/MovieSum/resolve/main/train.jsonl`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${HF_TOKEN}`, Range: "bytes=0-5000000" } });
    if (!res.ok) throw new Error(`MovieSum download ${res.status}`);
    const text = await res.text();
    console.log(`  下载 ${(text.length / 1024 / 1024).toFixed(1)} MB`);

    // 解析 JSONL（可能最后一行截断）
    const lines = text.split("\n").filter((l) => l.trim());
    const movies = [];
    for (const line of lines) {
        try { movies.push(JSON.parse(line)); } catch { /* skip truncated */ }
    }
    console.log(`  解析到 ${movies.length} 部电影`);

    let sceneInserted = 0;
    let assetInserted = 0;

    for (const movie of movies.slice(0, 10)) {
        const scenes = parseMovieSumScenes(movie.script);
        if (scenes.length < 3) continue;

        // ─── 场景拆分示例：取前3个场景作为"输入剧本→输出场景列表"的示范 ───
        const sceneList = scenes.slice(0, 4).map((s, i) => ({
            title: `第${i + 1}场：${s.heading.replace(/^(INT\.|EXT\.|INT\.\/EXT\.)\s*/, "").replace(/\s*--?\s*/, " · ")}`,
            summary: s.description.slice(0, 120),
            characters: s.characters,
            hasDialogue: s.dialogues.length > 0,
        }));

        const scenePrompt = JSON.stringify(sceneList, null, 2);
        const ok1 = await insertItem(datasetId, {
            platform: "storyboard",
            prompt: scenePrompt,
            title: `场景拆分示例：${movie.movie_name}（${scenes.length}场）`,
            tags: ["storyboard", "scene_split", "moviesum"],
            quality: 9,
        });
        if (ok1) sceneInserted++;

        // ─── 资产提取示例：从场景中抽取角色/地点 ───
        const allChars = [...new Set(scenes.flatMap((s) => s.characters))].slice(0, 6);
        const allLocations = [...new Set(scenes.map((s) => s.heading).filter(Boolean))].slice(0, 5);

        if (allChars.length >= 2) {
            const assetExample = {
                characters: allChars.map((name) => ({ name, appearance: "(从剧本描述提取)", keywords: name.toLowerCase().replace(/\s+/g, "_") })),
                locations: allLocations.map((h) => {
                    const parts = h.replace(/^(INT\.|EXT\.|INT\.\/EXT\.)\s*/, "").split(/\s*--?\s*/);
                    return { name: parts[0]?.trim() || h, timeOfDay: parts[1]?.trim() || "DAY", keywords: parts[0]?.trim().toLowerCase().replace(/\s+/g, "_") || "" };
                }),
            };
            const ok2 = await insertItem(datasetId, {
                platform: "storyboard",
                prompt: JSON.stringify(assetExample, null, 2),
                title: `资产提取示例：${movie.movie_name}（${allChars.length}角色/${allLocations.length}场景）`,
                tags: ["storyboard", "asset_extraction", "moviesum"],
                quality: 8,
            });
            if (ok2) assetInserted++;
        }
    }

    console.log(`  场景拆分示例: ${sceneInserted} 条`);
    console.log(`  资产提取示例: ${assetInserted} 条`);
    return sceneInserted + assetInserted;
}

// ─── screenplay-format-conventions 知识灌入 ─────────────────────

async function seedFormatConventions(datasetId) {
    console.log("\n=== screenplay-format-conventions 知识条目 ===");
    const base = `${HF_MIRROR}/datasets/Rattata/screenplay-format-conventions/resolve/main/`;
    const files = [
        { file: "scene_heading_grammar.json", title: "场景头语法规则", tags: ["scene_split", "grammar"] },
        { file: "character_cue_rules.json", title: "角色标识规则", tags: ["asset_extraction", "character_rules"] },
        { file: "element_types.json", title: "剧本元素分类", tags: ["screenplay_format", "element_types"] },
        { file: "transition_keywords.json", title: "转场关键词表", tags: ["scene_split", "transition"] },
        { file: "industry_glossary.json", title: "影视行业术语表", tags: ["knowledge", "glossary"] },
    ];

    let inserted = 0;
    for (const { file, title, tags } of files) {
        try {
            const res = await fetch(base + file, { headers: { Authorization: `Bearer ${HF_TOKEN}` } });
            if (!res.ok) { console.error(`  ${file}: ${res.status}`); continue; }
            const data = await res.json();
            const prompt = JSON.stringify(data, null, 2);
            const ok = await insertItem(datasetId, {
                platform: "all",
                prompt,
                title,
                tags: ["storyboard", "screenplay_grammar", ...tags],
                quality: 10,
            });
            if (ok) inserted++;
            console.log(`  ${title}: ${prompt.length} 字符`);
        } catch (err) {
            console.error(`  ${file} 失败: ${err.message}`);
        }
    }
    console.log(`  灌入 ${inserted}/${files.length} 条`);
    return inserted;
}

// ─── 主流程 ─────────────────────────────────────────────────────

async function main() {
    console.log("=== 场景拆分+资产提取 专业数据灌入 ===\n");

    const sceneDatasetId = await ensureDataset("场景拆分与资产提取示例库", "MovieSum结构化剧本few-shot + 剧本格式规范知识", "scene_asset");
    console.log(`目标数据集: ${sceneDatasetId}`);

    const n1 = await seedMovieSum(sceneDatasetId);
    const n2 = await seedFormatConventions(sceneDatasetId);

    console.log(`\n=== 完成: MovieSum ${n1} 条 + 格式规范 ${n2} 条 ===`);
}

main().catch((err) => {
    console.error("灌入失败:", err.message);
    process.exit(1);
});
