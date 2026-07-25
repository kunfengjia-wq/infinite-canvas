/**
 * seed-professional-db.mjs
 * 将专业数据库（镜头语言/视觉风格/情绪氛围）同步到 Supabase dataset_items 表
 *
 * 用法: node scripts/seed-professional-db.mjs
 * 无外部依赖，使用 Supabase REST API
 */

const SUPABASE_URL = "https://wqgvydmxiuhsxodduigi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxZ3Z5ZG14aXVoc3hvZGR1aWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NzEzMzEsImV4cCI6MjEwMDQ0NzMzMX0.gmFXYouU2jc0zLsW7KYbC-i-fEnp1SYXZc-xOfZQefU";

const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
};

async function rest(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`REST ${res.status}: ${text}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

// ─── 数据集定义 ─────────────────────────────────────────────────

const DATASETS = [
    { name: "镜头语言数据库", description: "景别/角度/运镜/焦距/光线/转场 专业词汇表", platform: "all", category: "cinematography" },
    { name: "视觉风格库", description: "30+ 视觉风格预设（写实/动画/艺术流派/文化/科幻/现代设计）", platform: "all", category: "visual_style" },
    { name: "情绪氛围库", description: "22 种情绪氛围及对应色彩/光线关键词", platform: "all", category: "mood" },
];

// ─── 镜头语言数据 ───────────────────────────────────────────────

const CINEMATOGRAPHY_ITEMS = [
    // 景别
    { title: "大远景", prompt: "extreme wide shot, vast landscape, tiny subject, epic scale, establishing geography", tags: ["shot_type"] },
    { title: "远景", prompt: "wide shot, full environment, subject in context, spatial relationship", tags: ["shot_type"] },
    { title: "全景", prompt: "full shot, entire body visible, head to toe, action in environment", tags: ["shot_type"] },
    { title: "中全景", prompt: "medium wide shot, knees up, cowboy shot, american shot", tags: ["shot_type"] },
    { title: "中景", prompt: "medium shot, waist up, conversational framing, balanced subject-background", tags: ["shot_type"] },
    { title: "中近景", prompt: "medium close-up, chest up, emotional connection, interview framing", tags: ["shot_type"] },
    { title: "近景", prompt: "close-up, face fills frame, emotion detail, intimate", tags: ["shot_type"] },
    { title: "特写", prompt: "extreme close-up on feature, eyes/hands/object detail, dramatic emphasis", tags: ["shot_type"] },
    { title: "大特写", prompt: "macro detail shot, single feature isolated, texture visible, intense focus", tags: ["shot_type"] },
    { title: "微距", prompt: "macro photography, microscopic detail, shallow depth of field, tiny subject magnified", tags: ["shot_type"] },
    { title: "过肩", prompt: "over-the-shoulder shot, OTS, conversation perspective, foreground blur", tags: ["shot_type"] },
    { title: "主观视角", prompt: "POV shot, first person perspective, subjective camera, immersive", tags: ["shot_type"] },
    // 角度
    { title: "平视", prompt: "eye level angle, neutral perspective, natural viewing", tags: ["angle"] },
    { title: "俯视", prompt: "high angle, looking down, subject appears small/vulnerable", tags: ["angle"] },
    { title: "仰视", prompt: "low angle, looking up, subject appears powerful/dominant", tags: ["angle"] },
    { title: "鸟瞰", prompt: "bird's eye view, top-down, overhead shot, god's perspective", tags: ["angle"] },
    { title: "低角度", prompt: "worm's eye view, extreme low angle, dramatic upward", tags: ["angle"] },
    { title: "荷兰角", prompt: "dutch angle, tilted frame, canted angle, unease, disorientation", tags: ["angle"] },
    { title: "过肩角", prompt: "over-shoulder angle, partial foreground figure, depth layers", tags: ["angle"] },
    { title: "主观", prompt: "subjective angle, character's viewpoint, diegetic camera", tags: ["angle"] },
    { title: "客观", prompt: "objective angle, neutral observer, detached documentary view", tags: ["angle"] },
    { title: "倾斜", prompt: "oblique angle, skewed horizon, tension, instability", tags: ["angle"] },
    // 运镜
    { title: "固定", prompt: "static shot, locked camera, stable composition, observational", tags: ["movement"] },
    { title: "推", prompt: "dolly in, push in, camera moves toward subject, increasing intimacy/tension", tags: ["movement"] },
    { title: "拉", prompt: "dolly out, pull back, camera moves away, revealing context/isolation", tags: ["movement"] },
    { title: "摇", prompt: "pan shot, camera rotates horizontally, surveying scene, following action", tags: ["movement"] },
    { title: "移", prompt: "tracking shot, lateral movement, sliding parallel to action", tags: ["movement"] },
    { title: "跟", prompt: "follow shot, camera follows subject movement, pursuit perspective", tags: ["movement"] },
    { title: "升", prompt: "crane up, rising shot, ascending perspective, revelation", tags: ["movement"] },
    { title: "降", prompt: "crane down, descending shot, grounding, arriving", tags: ["movement"] },
    { title: "环绕", prompt: "orbit shot, 360 rotation around subject, heroic moment, time suspension", tags: ["movement"] },
    { title: "一镜到底", prompt: "one-take, continuous shot, no cuts, immersive flow, choreographed movement", tags: ["movement"] },
    { title: "航拍", prompt: "aerial shot, drone footage, sweeping landscape, epic establishing", tags: ["movement"] },
    { title: "斯坦尼康", prompt: "steadicam, smooth floating movement, gliding through space, organic flow", tags: ["movement"] },
    { title: "手持", prompt: "handheld camera, shaky cam, documentary feel, raw energy, urgency", tags: ["movement"] },
    { title: "轨道", prompt: "dolly track, rail shot, precise linear movement, cinematic smoothness", tags: ["movement"] },
    { title: "摇臂", prompt: "jib shot, boom arm movement, dramatic vertical sweep", tags: ["movement"] },
    { title: "甩镜", prompt: "whip pan, swish pan, rapid blur transition, energetic scene change", tags: ["movement"] },
    { title: "变焦推拉", prompt: "zoom in/out, focal length change, vertigo effect, dolly zoom", tags: ["movement"] },
    // 焦距
    { title: "鱼眼", prompt: "fisheye lens, extreme barrel distortion, 180° field of view, surreal perspective", tags: ["lens"] },
    { title: "超广角", prompt: "ultra wide lens, 14-20mm, exaggerated perspective, vast space, dramatic distortion", tags: ["lens"] },
    { title: "广角", prompt: "wide angle lens, 24-35mm, environmental context, slight distortion, dynamic depth", tags: ["lens"] },
    { title: "标准", prompt: "standard lens, 50mm, natural perspective, human eye equivalent, balanced", tags: ["lens"] },
    { title: "中长焦", prompt: "medium telephoto, 85-105mm, portrait lens, flattering compression, soft bokeh", tags: ["lens"] },
    { title: "长焦", prompt: "telephoto lens, 135-300mm, compressed space, isolated subject, voyeuristic distance", tags: ["lens"] },
    { title: "微距镜头", prompt: "macro lens, 1:1 magnification, extreme close focus, tiny details revealed", tags: ["lens"] },
    // 光线
    { title: "自然光", prompt: "natural light, available light, golden hour, soft daylight, authentic atmosphere", tags: ["lighting"] },
    { title: "伦勃朗光", prompt: "Rembrandt lighting, triangle cheek shadow, dramatic portrait, chiaroscuro", tags: ["lighting"] },
    { title: "蝴蝶光", prompt: "butterfly lighting, paramount lighting, shadow under nose, glamorous, beauty", tags: ["lighting"] },
    { title: "轮廓光", prompt: "rim light, edge lighting, backlit outline, subject separation, halo effect", tags: ["lighting"] },
    { title: "逆光", prompt: "backlight, silhouette, lens flare, atmospheric haze, dramatic contrast", tags: ["lighting"] },
    { title: "顶光", prompt: "top light, overhead lighting, eye socket shadows, interrogation, harsh noon", tags: ["lighting"] },
    { title: "底光", prompt: "under lighting, uplight, horror lighting, unnatural shadows, eerie", tags: ["lighting"] },
    { title: "侧光", prompt: "side lighting, split lighting, half shadow, duality, dramatic contrast", tags: ["lighting"] },
    { title: "达芬奇调色", prompt: "DaVinci color grading, cinematic color science, teal-orange, film look, professional grade", tags: ["lighting"] },
    { title: "霓虹光", prompt: "neon lighting, colorful glow, cyberpunk ambiance, pink-blue-cyan, night city", tags: ["lighting"] },
    { title: "体积光", prompt: "volumetric light, god rays, light shafts through fog/dust, atmospheric depth", tags: ["lighting"] },
    { title: "烛光", prompt: "candlelight, warm flickering, intimate, low-key, romantic period feel", tags: ["lighting"] },
    // 转场
    { title: "硬切", prompt: "straight cut, hard cut, immediate scene change, fast pace", tags: ["transition"] },
    { title: "叠化", prompt: "dissolve, cross dissolve, gradual blend, time passing, dreamy transition", tags: ["transition"] },
    { title: "淡入黑", prompt: "fade to black, chapter ending, finality, dramatic pause", tags: ["transition"] },
    { title: "黑淡入", prompt: "fade from black, new beginning, chapter opening, awakening", tags: ["transition"] },
    { title: "划像", prompt: "wipe transition, geometric push, scene displacement, retro feel", tags: ["transition"] },
    { title: "匹配剪辑", prompt: "match cut, visual rhyme, shape/action continuity, poetic connection", tags: ["transition"] },
    { title: "跳切", prompt: "jump cut, time compression, same angle skip, nouvelle vague energy", tags: ["transition"] },
    { title: "L-Cut", prompt: "L-cut, sound continues over new image, audio bridge, smooth dialogue transition", tags: ["transition"] },
    { title: "J-Cut", prompt: "J-cut, sound precedes image, audio lead-in, anticipation building", tags: ["transition"] },
    { title: "闪白", prompt: "flash to white, overexposure burst, memory flash, explosion, revelation", tags: ["transition"] },
    { title: "模糊转场", prompt: "blur transition, focus pull between scenes, dreamlike shift, soft morph", tags: ["transition"] },
    { title: "遮罩转场", prompt: "mask transition, object wipes frame, foreground pass-through, invisible cut", tags: ["transition"] },
];

// ─── 视觉风格数据 ───────────────────────────────────────────────

const VISUAL_STYLE_ITEMS = [
    { title: "电影写实", prompt: "cinematic realism, film grain, anamorphic lens, dramatic lighting, shallow depth of field, color graded, 24fps motion blur", tags: ["realism"] },
    { title: "纪录片", prompt: "documentary style, handheld camera, natural light, raw footage, observational, cinéma vérité, interview framing", tags: ["realism"] },
    { title: "商业广告", prompt: "commercial quality, product shot, studio lighting, premium feel, clean background, high-end retouching, hero shot", tags: ["realism"] },
    { title: "胶片质感", prompt: "film photography, 35mm stock, kodak portra 400, fujifilm superia, organic grain, warm analog tones, halation", tags: ["realism"] },
    { title: "时尚大片", prompt: "fashion editorial, haute couture, dramatic pose, magazine cover, high fashion lighting, avant-garde styling", tags: ["realism"] },
    { title: "日系动漫", prompt: "anime style, cel shading, vibrant colors, detailed eyes, clean lineart, manga inspired, sakura petals, dynamic action lines", tags: ["animation"] },
    { title: "美漫", prompt: "american comic book style, bold outlines, halftone dots, dynamic action, graphic novel, ben day dots, heroic proportions", tags: ["animation"] },
    { title: "3DCG", prompt: "3D render, CGI, octane render, unreal engine 5, physically based rendering, ray tracing, subsurface scattering, global illumination", tags: ["animation"] },
    { title: "定格动画", prompt: "stop motion animation, claymation, miniature sets, handcrafted textures, tactile materials, laika studios aesthetic, visible fingerprints", tags: ["animation"] },
    { title: "水墨动画", prompt: "chinese ink animation, flowing brush strokes, ink wash diffusion, ethereal movement, traditional cel animation, misty mountains", tags: ["animation"] },
    { title: "像素艺术", prompt: "pixel art, 8-bit aesthetic, 16-bit era, retro game sprites, limited palette, dithering, nostalgic gaming", tags: ["animation"] },
    { title: "印象派", prompt: "impressionist painting, visible brushstrokes, light and color study, monet style, plein air, atmospheric, fleeting moment", tags: ["art_movement"] },
    { title: "表现主义", prompt: "expressionism, distorted forms, bold unnatural colors, emotional intensity, edvard munch, angular shapes, inner turmoil", tags: ["art_movement"] },
    { title: "超现实主义", prompt: "surrealism, dreamlike impossible scenes, dali melting clocks, magritte mystery, subconscious imagery, floating objects", tags: ["art_movement"] },
    { title: "波普艺术", prompt: "pop art, andy warhol, bold flat colors, comic style, repetition, consumer culture, screen print, soup cans", tags: ["art_movement"] },
    { title: "洛可可", prompt: "rococo, ornate decoration, pastel palette, gold leaf, playful elegance, 18th century french, fragonard, boucher", tags: ["art_movement"] },
    { title: "巴洛克", prompt: "baroque, dramatic chiaroscuro, rich deep colors, grandeur, caravaggio lighting, dynamic composition, religious intensity", tags: ["art_movement"] },
    { title: "新艺术运动", prompt: "art nouveau, organic flowing curves, floral motifs, alphonse mucha, decorative borders, whiplash lines, stained glass", tags: ["art_movement"] },
    { title: "装饰艺术", prompt: "art deco, geometric patterns, gold and black, 1920s gatsby, symmetrical luxury, sunburst motifs, chrysler building", tags: ["art_movement"] },
    { title: "中国水墨", prompt: "chinese ink painting, shan shui landscape, brush and ink on rice paper, negative space, zen minimalism, calligraphic strokes", tags: ["cultural"] },
    { title: "工笔重彩", prompt: "gongbi painting, fine meticulous brushwork, rich mineral colors, detailed realism, chinese traditional, silk painting, court art", tags: ["cultural"] },
    { title: "敦煌壁画", prompt: "dunhuang murals, buddhist art, flying apsaras, mineral pigments, ancient chinese cave art, halos, flowing ribbons", tags: ["cultural"] },
    { title: "浮世绘", prompt: "ukiyo-e, japanese woodblock print, hokusai great wave, flat color planes, bold outlines, nature scenes, geisha and samurai", tags: ["cultural"] },
    { title: "波斯细密画", prompt: "persian miniature, intricate ornamental detail, flat perspective, gold illumination, islamic geometric art, garden scenes", tags: ["cultural"] },
    { title: "赛博朋克", prompt: "cyberpunk, neon lights, rain-soaked streets, holographic ads, dystopian city, blade runner, chrome implants, dark future", tags: ["scifi_fantasy"] },
    { title: "蒸汽朋克", prompt: "steampunk, brass gears and clockwork, victorian era, steam powered machinery, copper pipes, airships, goggles", tags: ["scifi_fantasy"] },
    { title: "太阳朋克", prompt: "solarpunk, green technology harmony, sustainable utopia, plants and solar panels, optimistic future, community gardens", tags: ["scifi_fantasy"] },
    { title: "哥特", prompt: "gothic, dark architecture, pointed arches, stained glass windows, dramatic shadows, medieval cathedral, ravens, fog", tags: ["scifi_fantasy"] },
    { title: "暗黑奇幻", prompt: "dark fantasy, eldritch horror, ominous atmosphere, twisted creatures, grimdark aesthetic, eerie glow, cursed relics", tags: ["scifi_fantasy"] },
    { title: "太空歌剧", prompt: "space opera, epic interstellar scale, massive starships, nebula backdrops, alien worlds, cosmic drama, laser battles", tags: ["scifi_fantasy"] },
    { title: "极简主义", prompt: "minimalism, clean composition, generous negative space, simple geometry, monochrome palette, essential forms only", tags: ["modern_design"] },
    { title: "孟菲斯", prompt: "memphis design, bold geometric shapes, clashing bright colors, playful patterns, 1980s postmodern, squiggles and dots", tags: ["modern_design"] },
    { title: "酸性设计", prompt: "acid graphics, chrome liquid metal, distorted typography, rave culture, holographic gradients, experimental layout", tags: ["modern_design"] },
    { title: "Y2K", prompt: "Y2K aesthetic, 2000s futurism, metallic surfaces, butterflies, glossy plastic, pink chrome, cyber optimism", tags: ["modern_design"] },
    { title: "蒸汽波", prompt: "vaporwave, retro futurism, greek statues, pastel gradients, glitch art, 80s-90s nostalgia, japanese text, sunset grid", tags: ["modern_design"] },
];

// ─── 情绪氛围数据 ───────────────────────────────────────────────

const MOOD_ITEMS = [
    { title: "紧张", prompt: "tense atmosphere, high contrast shadows, desaturated cold tones, shallow focus, rapid cuts, heartbeat rhythm", tags: ["mood"] },
    { title: "温馨", prompt: "warm cozy atmosphere, golden soft light, warm amber tones, gentle bokeh, intimate framing, homey comfort", tags: ["mood"] },
    { title: "压抑", prompt: "oppressive atmosphere, low-key lighting, muted gray-green tones, confined framing, heavy shadows, suffocating stillness", tags: ["mood"] },
    { title: "欢快", prompt: "joyful cheerful mood, bright saturated colors, bouncy rhythm, sunny high-key lighting, playful angles, confetti energy", tags: ["mood"] },
    { title: "悲伤", prompt: "melancholic sadness, blue-gray desaturated palette, soft diffused light, rain or mist, slow movement, empty space", tags: ["mood"] },
    { title: "激昂", prompt: "passionate intensity, bold red-orange tones, dramatic rim lighting, dynamic angles, fast sweeping movement, heroic", tags: ["mood"] },
    { title: "神秘", prompt: "mysterious enigmatic mood, deep purple-teal shadows, fog and haze, partial revelation, candlelight, hidden corners", tags: ["mood"] },
    { title: "浪漫", prompt: "romantic dreamy mood, soft pink-golden glow, lens flare, shallow depth of field, floating particles, sunset warmth", tags: ["mood"] },
    { title: "恐怖", prompt: "horror dread atmosphere, sickly green-black tones, harsh underlighting, distorted shadows, flickering light, isolation", tags: ["mood"] },
    { title: "宁静", prompt: "serene tranquil mood, soft pastel palette, gentle natural light, still water reflections, minimal movement, breathing space", tags: ["mood"] },
    { title: "史诗感", prompt: "epic grandeur, vast scale, golden hour volumetric light, sweeping crane shots, orchestral weight, monumental composition", tags: ["mood"] },
    { title: "怀旧", prompt: "nostalgic reminiscence, faded warm film tones, soft vignette, dust particles in light, analog grain, memory-like blur", tags: ["mood"] },
    { title: "梦幻", prompt: "dreamlike ethereal mood, iridescent soft glow, floating elements, pastel fog, impossible physics, fairy dust sparkles", tags: ["mood"] },
    { title: "冷峻", prompt: "cold austere mood, steel blue-gray palette, harsh clinical light, geometric precision, emotional distance, Nordic minimalism", tags: ["mood"] },
    { title: "热烈", prompt: "fiery passionate energy, blazing red-gold saturation, dynamic movement, sparks and embers, carnival lights, explosive", tags: ["mood"] },
    { title: "孤独", prompt: "lonely isolation, single small figure in vast space, cool desaturated tones, long shadows, empty environments, silence", tags: ["mood"] },
    { title: "希望", prompt: "hopeful optimism, dawn light breaking through, warm rays in darkness, upward composition, green sprouts, open horizon", tags: ["mood"] },
    { title: "绝望", prompt: "despair and hopelessness, crushed darkness, ashen drained colors, downward spirals, broken objects, void emptiness", tags: ["mood"] },
    { title: "幽默", prompt: "humorous comedic tone, bright flat lighting, exaggerated expressions, quirky angles, pastel pops, timing pauses", tags: ["mood"] },
    { title: "庄重", prompt: "solemn dignified mood, deep rich tones, symmetrical composition, slow deliberate movement, ceremonial lighting, gravitas", tags: ["mood"] },
    { title: "荒诞", prompt: "absurdist surreal humor, impossible juxtapositions, flat deadpan lighting, oversized props, fish-out-of-water scale", tags: ["mood"] },
    { title: "治愈", prompt: "healing soothing mood, soft watercolor light, gentle green-warm palette, slow breathing rhythm, nature textures, comfort", tags: ["mood"] },
];

// ─── 执行 ───────────────────────────────────────────────────────

async function ensureDataset(meta) {
    // 查找同名数据集
    const existing = await rest(`datasets?name=eq.${encodeURIComponent(meta.name)}&select=id`);
    if (existing && existing.length > 0) return existing[0].id;
    // 创建
    const created = await rest("datasets", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(meta),
    });
    return created[0].id;
}

async function seedItems(datasetId, items) {
    let inserted = 0;
    for (const item of items) {
        // 按 title + dataset_id 去重
        const existing = await rest(`dataset_items?dataset_id=eq.${datasetId}&title=eq.${encodeURIComponent(item.title)}&select=id`);
        if (existing && existing.length > 0) continue;
        await rest("dataset_items", {
            method: "POST",
            body: JSON.stringify({
                dataset_id: datasetId,
                title: item.title,
                prompt: item.prompt,
                negative_prompt: "",
                platform: "all",
                tags: item.tags,
                reference_image_url: "",
                quality_score: 10,
            }),
        });
        inserted++;
    }
    return inserted;
}

async function main() {
    console.log("=== 专业数据库同步到 Supabase ===\n");

    const [cineId, styleId, moodId] = await Promise.all(DATASETS.map(ensureDataset));
    console.log(`数据集就绪: 镜头语言=${cineId}, 视觉风格=${styleId}, 情绪氛围=${moodId}\n`);

    const n1 = await seedItems(cineId, CINEMATOGRAPHY_ITEMS);
    console.log(`镜头语言: 新增 ${n1}/${CINEMATOGRAPHY_ITEMS.length} 条`);

    const n2 = await seedItems(styleId, VISUAL_STYLE_ITEMS);
    console.log(`视觉风格: 新增 ${n2}/${VISUAL_STYLE_ITEMS.length} 条`);

    const n3 = await seedItems(moodId, MOOD_ITEMS);
    console.log(`情绪氛围: 新增 ${n3}/${MOOD_ITEMS.length} 条`);

    console.log("\n=== 完成 ===");
}

main().catch((err) => {
    console.error("同步失败:", err.message);
    process.exit(1);
});
