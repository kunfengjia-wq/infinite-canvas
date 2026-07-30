/**
 * 分镜工作台 AI 服务 - 内置 Skills
 * 每个步骤对应一个专用 system prompt，调用 requestImageQuestion 流式接口
 * 数据驱动：优先从 Supabase skills 表加载 prompt，本地硬编码作为 fallback
 */
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";
import type { AiSceneResult, AiShotResult, StoryAssets } from "@/types/storyboard";
import { getSkillPrompt } from "@/services/db/skills-repo";
import { recordGeneration } from "@/services/db/history-repo";
import { supabase } from "@/services/db/supabase-client";
import { withRetry, parseJsonArray, parseJsonObject, TtlCache } from "@/services/ai-utils";

// ─── Few-shot 检索（Supabase dataset_items）─────────────────────

const fewShotCache = new TtlCache("fewshot:storyboard");

/** 按 tag 从 dataset_items 检索高质量 few-shot 示例，注入 system prompt 尾部 */
async function getStoryboardFewShot(tag: string, limit = 3): Promise<string> {
    const cached = fewShotCache.get(tag);
    if (cached !== undefined) return cached;

    try {
        const { data } = await supabase
            .from("dataset_items")
            .select("title, prompt")
            .contains("tags", [tag])
            .order("quality_score", { ascending: false })
            .limit(limit);

        if (!data || data.length === 0) {
            fewShotCache.set(tag, "");
            return "";
        }

        const examples = data
            .map((item: { title: string; prompt: string }, i: number) => `参考示例${i + 1}（${item.title}）：\n${item.prompt}`)
            .join("\n\n");

        const result = `\n\n---\n以下是专业参考示例，仅供风格和结构参考，不要照搬内容：\n\n${examples}`;
        fewShotCache.set(tag, result);
        return result;
    } catch {
        fewShotCache.set(tag, "");
        return "";
    }
}

// ─── Skill: 资产提取 ─────────────────────────────────────────────

const ASSET_EXTRACTOR_SYSTEM = `你是一位资深影视美术指导，精通广告片、微电影、MV、纪录片、动画等多种影视类型的视觉资产体系。用户会给你一段剧本/故事文本，你需要从中提取所有视觉资产。

提取四类资产：
1. characters（角色）：name, appearance(仅外貌：发色/发型/体型/面部特征/肤色，禁止描述手持物品), personality(性格), costume(仅穿着：衣物/鞋/配饰如耳环项链，禁止描述手持道具/武器/包), keywords(英文), keywordsZh(中文翻译)
2. locations（场景/地点）：name, description(环境描述，含空间结构和材质), timeOfDay(时间), lighting(光线氛围), keywords(英文), keywordsZh(中文翻译)
3. props（道具）：name, description(外观描述，含材质/颜色/尺寸感), significance(剧情意义), keywords(英文), keywordsZh(中文翻译)
4. products（产品/品牌资产，广告片必填）：name, brand(品牌), appearance(产品外观：形态/颜色/材质/光泽), packaging(包装描述), significance(品牌意义/卖点), keywords(英文), keywordsZh(中文翻译)

【资产隔离原则（极其重要，双向隔离）】
- 角色 ≠ 道具：角色手中/身上的物品（剑、包、伞、手机等）必须单独提取到 props，不得写入角色的 appearance/costume/keywords
- 角色 ≠ 场景：角色 keywords 不得包含任何环境描述
- 角色 ≠ 其他角色：每个角色独立描述，不得提及同伴
- 道具 ≠ 人物：道具 keywords 不得包含手持/佩戴/使用的人物（如 hand holding, woman wearing）
- 道具 ≠ 场景：道具必须是孤立物体，不得包含桌面/房间/户外等环境
- 场景 ≠ 特定角色：场景 keywords 不得包含具体角色名或外貌描述（可含 "silhouette" 作为比例参考）
- 产品 ≠ 人物：产品 keywords 不得包含模特/手/使用者

【keywords 规范（极其重要）】
keywords 是用于 AI 生图的英文提示词，必须是纯英文逗号分隔标签。同时 keywordsZh 提供对应中文翻译。

■ 角色 keywords 格式（三视图/参考图，禁止带场景）：
  结构：character design sheet, [视图], [主体描述], [外貌细节], [服装], [姿势], white background, reference sheet, concept art
  必须包含：character design sheet / turnaround / front view, side view, back view / T-pose / white background / clean background
  禁止包含：任何场景、环境、背景描述（如 in a room, forest, city）
  禁止包含：手持道具、武器、配件（如 holding sword, with bag）——道具单独提取
  禁止包含：其他角色、动物、陪衬物（如 with friend, accompanied by dog）
  角色必须是独立的、干净的、无附属物的纯角色设定图
  示例："character design sheet, front view, side view, back view, young woman, long straight black hair, emerald green eyes, oval face, slim figure, crimson silk cheongsam, gold hoop earrings, neutral T-pose, white background, reference sheet, concept art, ultra detailed"
  示例翻译："角色设计图, 正面视图, 侧面视图, 背面视图, 年轻女性, 黑色长直发, 翠绿色眼睛, 鹅蛋脸, 纤细身材, 深红色丝绸旗袍, 金色圈形耳环, 中性T字姿势, 白色背景, 参考图, 概念艺术, 超精细"

■ 道具 keywords 格式（孤立物体，禁止带场景/人物）：
  结构：[物体名], [材质/颜色/细节], isolated object, white background, studio lighting, product photography, close-up
  禁止包含：任何环境（桌面/房间/户外）、人物（hand, person, woman）、使用场景
  示例："antique bronze pocket watch, cracked glass face, roman numerals, tarnished chain, isolated object, white background, soft studio lighting, product photography, close-up, ultra detailed"

■ 产品 keywords 格式（商业产品照，禁止带人物）：
  结构：[产品名], [外观/材质/颜色], [包装], clean white background, studio softbox lighting, hero angle, product photography, 8k, commercial
  禁止包含：模特、手、使用者（如 hand holding, model wearing, person using）
  示例："premium glass skincare bottle, frosted texture, gold metallic cap, minimalist label design, clean white background, studio softbox lighting, hero angle, product photography, 8k render, commercial quality"

■ 场景 keywords 格式（唯一允许完整环境的类型，禁止带特定角色）：
  结构：[室内/室外], [地点], [空间结构], [材质], [时间/光线], [氛围], wide angle, cinematic
  禁止包含：具体角色名、外貌描述、特定人物（可用 "distant silhouette" 做比例参考）
  示例："interior, abandoned warehouse, high ceiling, rusty corrugated metal walls, broken skylight windows, volumetric sunlight beams, dust particles in air, concrete floor with cracks, cinematic lighting, wide angle, atmospheric, photorealistic"

【其他专业要求】
1. 角色外貌必须具体可视化，禁止"长得很帅""非常漂亮"等模糊描述
2. 广告类剧本必须提取 products（产品外观、包装、品牌调性）
3. 场景描述需包含光线方向/色温信息
4. 道具需注明材质（金属/木质/玻璃/织物等）
5. keywordsZh 是 keywords 的逐条中文翻译，用逗号分隔，方便用户理解

严格以 JSON 格式输出，不要输出任何其他文字：
{"characters":[...],"locations":[...],"props":[...],"products":[...]}`;

/** 风格 → keywords 后缀映射表（覆盖 visual-styles.ts 全部 27 种 + 扩展） */
type StyleSuffixEntry = { charSuffix: string; locSuffix: string; propSuffix: string; prodSuffix: string; styleNote: string };

const STYLE_SUFFIX_MAP: { pattern: RegExp; entry: StyleSuffixEntry }[] = [
    // ─── 动画 / CG ───
    { pattern: /3dcg|3d\s*cg|三维|CG/i, entry: {
        charSuffix: "3D render, CGI, octane render, unreal engine, physically based rendering, ray tracing, global illumination, subsurface scattering, clean topology, smooth geometry",
        locSuffix: "3D render, CGI, octane render, unreal engine, ray tracing, global illumination, volumetric lighting, detailed 3D environment",
        propSuffix: "3D render, CGI, octane render, physically based rendering, ray tracing, clean topology, studio lighting, 3D model",
        prodSuffix: "3D product render, CGI, octane render, physically based rendering, ray tracing, clean background, studio lighting",
        styleNote: "\n\n【风格强制】本项目视觉风格为 3DCG（三维计算机图形渲染）。所有 keywords 必须体现 3D 渲染特征（3D render, CGI, octane render, unreal engine, PBR, ray tracing, global illumination, subsurface scattering）。这是 CG 渲染而非真实摄影——画面应有明确的 3D 建模/渲染质感（光滑几何体、精确光照计算、材质着色器），而不是真实相机拍摄的照片。禁止出现 photograph, DSLR, film grain, natural photography 等真实摄影词汇。",
    }},
    { pattern: /皮克斯|pixar/i, entry: {
        charSuffix: "Pixar-style 3D character, rounded shapes, big expressive eyes, subsurface scattering, soft global illumination, vibrant saturated colors, cartoon proportions",
        locSuffix: "Pixar-style 3D environment, soft global illumination, vibrant colors, smooth surfaces, whimsical atmosphere, stylized 3D",
        propSuffix: "Pixar-style 3D object, smooth geometry, soft shadows, vibrant colors, clean topology, stylized",
        prodSuffix: "Pixar-style 3D product render, soft global illumination, smooth surfaces, vibrant colors, whimsical",
        styleNote: "\n\n【风格强制】本项目视觉风格为皮克斯风格（风格化 3D 动画）。所有 keywords 必须体现皮克斯式风格化 3D（Pixar-style, rounded shapes, cartoon proportions, soft GI, vibrant colors），严禁出现 photorealistic, hyperrealistic, real skin, pores 等写实词汇。材质应为光滑塑料感/橡胶感/陶感。",
    }},
    { pattern: /日系|动画|anime|二次元/i, entry: {
        charSuffix: "anime style, cel shading, clean lines, vibrant colors, detailed eyes, 2D illustration",
        locSuffix: "anime background, cel shading, vibrant colors, detailed scenery, Makoto Shinkai style",
        propSuffix: "anime style object, cel shading, clean lines, vibrant colors, 2D illustration",
        prodSuffix: "anime style product, cel shading, clean lines, vibrant colors",
        styleNote: "\n\n【风格强制】本项目视觉风格为日系动画。所有 keywords 必须体现赛璐璐着色、清晰线条、扁平化光影，严禁出现 photorealistic, 3D render, ray tracing 等写实/3D词汇。",
    }},
    { pattern: /二维手绘|手绘|hand.?drawn|2d/i, entry: {
        charSuffix: "2D hand-drawn illustration, clean ink lines, flat colors, expressive poses, storybook quality",
        locSuffix: "2D hand-drawn background, painterly, soft gradients, illustrated environment, whimsical",
        propSuffix: "2D hand-drawn object, clean outlines, flat shading, illustrated, charming",
        prodSuffix: "2D illustrated product, clean lines, flat colors, charming, hand-drawn feel",
        styleNote: "\n\n【风格强制】本项目视觉风格为二维手绘。所有 keywords 必须体现手绘插画感（ink lines, flat colors, illustrated），严禁出现 photorealistic, 3D render, ray tracing。",
    }},
    { pattern: /定格|stop.?motion|黏土|claymation/i, entry: {
        charSuffix: "stop motion character, claymation, handcrafted texture, miniature, tactile, Laika studios style",
        locSuffix: "stop motion set, miniature diorama, handcrafted, tactile materials, practical lighting",
        propSuffix: "stop motion prop, claymation, handcrafted, miniature, tactile texture",
        prodSuffix: "stop motion product, miniature, handcrafted, practical lighting, tactile",
        styleNote: "\n\n【风格强制】本项目视觉风格为定格动画。所有 keywords 必须体现手工质感（claymation, handcrafted, miniature, tactile），严禁出现 photorealistic, CGI, digital render。",
    }},
    { pattern: /国风水墨|水墨|chinese.?ink/i, entry: {
        charSuffix: "chinese ink painting style, brush strokes, flowing ink, ethereal, traditional animation, xuan paper texture",
        locSuffix: "chinese ink landscape, shan shui, brush strokes, negative space, misty mountains, ethereal",
        propSuffix: "chinese ink painting object, brush strokes, flowing ink, minimalist, traditional",
        prodSuffix: "chinese ink style product, brush strokes, elegant, minimalist, traditional aesthetic",
        styleNote: "\n\n【风格强制】本项目视觉风格为国风水墨。所有 keywords 必须体现水墨画语言（brush strokes, flowing ink, negative space, xuan paper），严禁出现 photorealistic, 3D, neon。",
    }},
    { pattern: /低多边形|low.?poly/i, entry: {
        charSuffix: "low poly character, geometric facets, flat shading, polygon art, clean edges, minimalist 3D",
        locSuffix: "low poly environment, geometric facets, flat shading, polygon landscape, clean edges",
        propSuffix: "low poly object, geometric facets, flat shading, polygon art, clean edges",
        prodSuffix: "low poly product, geometric facets, flat shading, minimalist 3D, clean",
        styleNote: "\n\n【风格强制】本项目视觉风格为低多边形。所有 keywords 必须体现多边形面片感（low poly, geometric facets, flat shading），严禁出现 photorealistic, smooth, organic。",
    }},
    { pattern: /像素|pixel/i, entry: {
        charSuffix: "pixel art character, 16-bit, sprite, retro game, clean pixels, nostalgic gaming",
        locSuffix: "pixel art environment, 16-bit, tileset, retro game, detailed pixelwork",
        propSuffix: "pixel art object, 16-bit, sprite, retro game, clean pixels",
        prodSuffix: "pixel art product, 16-bit, retro, clean pixels, nostalgic",
        styleNote: "\n\n【风格强制】本项目视觉风格为像素艺术。所有 keywords 必须体现像素感（pixel art, 8-bit, 16-bit, sprite），严禁出现 photorealistic, smooth, high resolution。",
    }},
    // ─── 艺术画风 ───
    { pattern: /水彩|watercolor/i, entry: {
        charSuffix: "watercolor illustration, soft washes, bleeding edges, transparent layers, paper texture, delicate",
        locSuffix: "watercolor landscape, soft washes, wet-on-wet, transparent layers, paper texture, atmospheric",
        propSuffix: "watercolor object, soft washes, bleeding edges, transparent, paper texture",
        prodSuffix: "watercolor product illustration, soft washes, delicate, transparent layers, artistic",
        styleNote: "\n\n【风格强制】本项目视觉风格为水彩。所有 keywords 必须体现水彩质感（soft washes, bleeding edges, transparent, paper texture），严禁出现 photorealistic, 3D, sharp edges。",
    }},
    { pattern: /油画|oil.?painting/i, entry: {
        charSuffix: "oil painting portrait, impasto, rich texture, visible brushstrokes, classical technique, canvas",
        locSuffix: "oil painting landscape, impasto, rich colors, visible brushstrokes, classical, canvas texture",
        propSuffix: "oil painting still life, impasto, rich texture, visible brushstrokes, classical",
        prodSuffix: "oil painting product, rich texture, visible brushstrokes, classical, artistic",
        styleNote: "\n\n【风格强制】本项目视觉风格为油画。所有 keywords 必须体现油画质感（impasto, visible brushstrokes, canvas texture, rich colors），严禁出现 photorealistic, digital, flat。",
    }},
    { pattern: /素描|sketch/i, entry: {
        charSuffix: "pencil sketch, graphite, cross-hatching, tonal shading, hand-drawn, artistic study",
        locSuffix: "pencil sketch environment, graphite, cross-hatching, perspective study, tonal",
        propSuffix: "pencil sketch object, graphite, cross-hatching, tonal shading, study",
        prodSuffix: "pencil sketch product, graphite, cross-hatching, artistic, hand-drawn",
        styleNote: "\n\n【风格强制】本项目视觉风格为素描。所有 keywords 必须体现铅笔素描感（graphite, cross-hatching, tonal shading），严禁出现 color, photorealistic, 3D。",
    }},
    { pattern: /浮世绘|ukiyo/i, entry: {
        charSuffix: "ukiyo-e style, japanese woodblock print, flat colors, bold outlines, hokusai inspired",
        locSuffix: "ukiyo-e landscape, japanese woodblock print, flat colors, bold outlines, wave patterns",
        propSuffix: "ukiyo-e style object, japanese woodblock print, flat colors, bold outlines",
        prodSuffix: "ukiyo-e style product, japanese woodblock print, flat colors, decorative",
        styleNote: "\n\n【风格强制】本项目视觉风格为浮世绘。所有 keywords 必须体现木版画感（woodblock print, flat colors, bold outlines），严禁出现 photorealistic, 3D, gradient。",
    }},
    { pattern: /插画|illustration/i, entry: {
        charSuffix: "digital illustration, clean lines, vibrant colors, stylized, editorial quality",
        locSuffix: "digital illustration environment, stylized, vibrant colors, editorial, detailed",
        propSuffix: "digital illustration object, clean lines, vibrant colors, stylized",
        prodSuffix: "digital illustration product, stylized, vibrant, editorial quality",
        styleNote: "\n\n【风格强制】本项目视觉风格为插画风。所有 keywords 必须体现插画感（illustration, stylized, clean lines），严禁出现 photorealistic, photograph。",
    }},
    { pattern: /漫画|comic|manga/i, entry: {
        charSuffix: "comic book style, bold outlines, halftone dots, dynamic action, graphic novel, ink",
        locSuffix: "comic book environment, bold outlines, halftone dots, dramatic perspective, graphic novel",
        propSuffix: "comic book style object, bold outlines, halftone dots, dynamic, graphic",
        prodSuffix: "comic book style product, bold outlines, halftone, dynamic, graphic",
        styleNote: "\n\n【风格强制】本项目视觉风格为漫画风。所有 keywords 必须体现漫画感（bold outlines, halftone dots, graphic novel），严禁出现 photorealistic, smooth, 3D。",
    }},
    // ─── 科幻 / 奇幻 ───
    { pattern: /赛博朋克|cyberpunk/i, entry: {
        charSuffix: "cyberpunk style, neon-lit, chrome implants, holographic HUD, rain-soaked, dystopian fashion",
        locSuffix: "cyberpunk cityscape, neon lights, holographic signs, rain-soaked streets, dystopian, blade runner",
        propSuffix: "cyberpunk gadget, neon glow, chrome, holographic, futuristic tech, dystopian",
        prodSuffix: "cyberpunk product, neon accent, chrome, holographic, futuristic, dark background",
        styleNote: "\n\n【风格强制】本项目视觉风格为赛博朋克。所有 keywords 必须体现赛博朋克美学（neon, chrome, holographic, dystopian, rain），严禁出现 pastoral, natural light, warm cozy。",
    }},
    { pattern: /蒸汽朋克|steampunk/i, entry: {
        charSuffix: "steampunk character, brass goggles, victorian fashion, mechanical limbs, copper gears, leather",
        locSuffix: "steampunk environment, brass gears, steam pipes, victorian architecture, copper, mechanical",
        propSuffix: "steampunk gadget, brass, copper gears, steam powered, victorian, mechanical",
        prodSuffix: "steampunk product, brass, copper, gears, victorian design, mechanical aesthetic",
        styleNote: "\n\n【风格强制】本项目视觉风格为蒸汽朋克。所有 keywords 必须体现蒸汽朋克美学（brass, gears, steam, victorian, copper），严禁出现 modern, digital, neon。",
    }},
    { pattern: /科幻未来|sci.?fi|futuristic/i, entry: {
        charSuffix: "sci-fi character, futuristic suit, holographic interface, sleek design, advanced technology",
        locSuffix: "sci-fi environment, futuristic architecture, holographic displays, sleek surfaces, advanced tech",
        propSuffix: "sci-fi gadget, futuristic, sleek, holographic, advanced technology, glowing",
        prodSuffix: "sci-fi product, futuristic design, sleek, holographic accent, advanced, clean",
        styleNote: "\n\n【风格强制】本项目视觉风格为科幻未来。所有 keywords 必须体现未来科技感（futuristic, holographic, sleek, advanced tech），严禁出现 vintage, rustic, medieval。",
    }},
    { pattern: /奇幻|fantasy|史诗/i, entry: {
        charSuffix: "fantasy character, ethereal glow, magical aura, ornate armor, epic, mythical",
        locSuffix: "fantasy landscape, magical atmosphere, ethereal glow, epic scale, mythical architecture",
        propSuffix: "fantasy artifact, magical glow, ornate, mythical, enchanted, ethereal",
        prodSuffix: "fantasy product, magical glow, ornate design, ethereal, epic quality",
        styleNote: "\n\n【风格强制】本项目视觉风格为奇幻史诗。所有 keywords 必须体现奇幻感（magical, ethereal, ornate, epic, mythical），严禁出现 modern, mundane, everyday。",
    }},
    { pattern: /末日|废土|post.?apocalyptic/i, entry: {
        charSuffix: "post-apocalyptic character, tattered clothing, dust-covered, survival gear, weathered, gritty",
        locSuffix: "post-apocalyptic wasteland, ruins, overgrown, dust, desolate, abandoned structures",
        propSuffix: "post-apocalyptic prop, weathered, rusty, makeshift, survival, worn",
        prodSuffix: "post-apocalyptic product, weathered, worn, gritty, survival aesthetic",
        styleNote: "\n\n【风格强制】本项目视觉风格为末日废土。所有 keywords 必须体现废土感（ruins, weathered, rusty, desolate, gritty），严禁出现 clean, pristine, luxury。",
    }},
    { pattern: /哥特|gothic|暗黑/i, entry: {
        charSuffix: "gothic character, dark attire, pale skin, dramatic shadows, medieval, ornate dark",
        locSuffix: "gothic architecture, pointed arches, stained glass, dramatic shadows, dark atmosphere, medieval",
        propSuffix: "gothic object, dark ornate, dramatic shadows, medieval, macabre, intricate",
        prodSuffix: "gothic product, dark aesthetic, ornate, dramatic lighting, medieval inspired",
        styleNote: "\n\n【风格强制】本项目视觉风格为哥特暗黑。所有 keywords 必须体现哥特美学（dark, ornate, pointed arches, dramatic shadows），严禁出现 bright, cheerful, pastel。",
    }},
    { pattern: /梦幻|童话|fairy.?tale|whimsical/i, entry: {
        charSuffix: "fairy tale character, whimsical, soft pastel, magical sparkle, storybook, gentle",
        locSuffix: "fairy tale environment, whimsical, soft pastel, magical glow, storybook, enchanted forest",
        propSuffix: "fairy tale object, whimsical, soft pastel, magical sparkle, storybook, charming",
        prodSuffix: "fairy tale product, whimsical, soft pastel, magical, charming, storybook quality",
        styleNote: "\n\n【风格强制】本项目视觉风格为梦幻童话。所有 keywords 必须体现童话感（whimsical, soft pastel, magical, storybook），严禁出现 dark, horror, gritty, dystopian。",
    }},
    // ─── 影视写实（默认方向，但也要明确） ───
    { pattern: /电影写实|cinematic|胶片|film/i, entry: {
        charSuffix: "cinematic, film grain, dramatic lighting, shallow depth of field, color graded",
        locSuffix: "cinematic, wide angle, film grain, dramatic lighting, atmospheric, color graded",
        propSuffix: "isolated object, white background, studio lighting, product photography, close-up, ultra detailed",
        prodSuffix: "clean white background, studio softbox lighting, hero angle, product photography, 8k, commercial",
        styleNote: "",
    }},
    { pattern: /纪录片|documentary/i, entry: {
        charSuffix: "documentary style, natural light, candid, raw, observational, handheld feel",
        locSuffix: "documentary style, natural light, raw footage, observational, handheld, vérité",
        propSuffix: "documentary style object, natural light, raw, unstyled, authentic",
        prodSuffix: "documentary style product, natural light, authentic, raw, unstyled",
        styleNote: "",
    }},
    { pattern: /广告|commercial/i, entry: {
        charSuffix: "commercial quality, studio lighting, premium, high-end, polished, editorial",
        locSuffix: "commercial quality, studio lighting, premium, clean, high-end, polished",
        propSuffix: "commercial product shot, studio lighting, premium, clean background, high-end, 8k",
        prodSuffix: "commercial product photography, studio softbox, hero angle, premium, 8k, clean background",
        styleNote: "",
    }},
    // ─── 3D / CG 补充 ───
    { pattern: /写实CG|游戏过场|realistic\s*cg/i, entry: {
        charSuffix: "hyper-realistic CG character, unreal engine 5, metahuman, PBR materials, ray tracing, cinematic lighting, 8k detail",
        locSuffix: "hyper-realistic CG environment, unreal engine 5, ray tracing, volumetric fog, PBR materials, cinematic",
        propSuffix: "hyper-realistic CG object, PBR materials, ray tracing, unreal engine, 8k, studio lighting",
        prodSuffix: "hyper-realistic CG product, PBR materials, ray tracing, studio lighting, 8k, clean background",
        styleNote: "\n\n【风格强制】本项目视觉风格为写实CG（游戏过场级别）。所有 keywords 必须体现高端 CG 渲染（unreal engine 5, metahuman, PBR, ray tracing, 8k），这是 CG 渲染而非真实摄影，禁止出现 photograph, DSLR, film grain。",
    }},
    { pattern: /卡通渲染|toon\s*shad/i, entry: {
        charSuffix: "toon shaded character, cel shading, bold outlines, flat colors, stylized 3D, vibrant",
        locSuffix: "toon shaded environment, cel shading, bold outlines, flat colors, stylized 3D, vibrant",
        propSuffix: "toon shaded object, cel shading, bold outlines, flat colors, stylized 3D",
        prodSuffix: "toon shaded product, cel shading, bold outlines, flat colors, stylized",
        styleNote: "\n\n【风格强制】本项目视觉风格为卡通渲染（Toon Shading）。所有 keywords 必须体现卡通着色（cel shading, bold outlines, flat colors），严禁出现 photorealistic, PBR, ray tracing。",
    }},
    { pattern: /等距|isometric/i, entry: {
        charSuffix: "isometric character, 30 degree angle, clean vector, miniature, diorama, stylized",
        locSuffix: "isometric environment, 30 degree angle, clean vector, miniature diorama, no perspective distortion",
        propSuffix: "isometric object, 30 degree angle, clean vector, miniature, stylized",
        prodSuffix: "isometric product, 30 degree angle, clean vector, miniature, stylized",
        styleNote: "\n\n【风格强制】本项目视觉风格为等距视角。所有 keywords 必须体现等距投影（isometric, 30 degree angle, no perspective distortion），严禁出现 wide angle, fisheye, vanishing point。",
    }},
    // ─── 二维动画补充 ───
    { pattern: /吉卜力|ghibli/i, entry: {
        charSuffix: "Studio Ghibli style, soft watercolor textures, gentle expressions, warm palette, hand-painted, whimsical",
        locSuffix: "Studio Ghibli background, lush nature, soft clouds, warm light, hand-painted, pastoral, detailed scenery",
        propSuffix: "Studio Ghibli style object, soft watercolor, hand-painted, warm, whimsical, gentle",
        prodSuffix: "Studio Ghibli style product, soft watercolor, hand-painted, warm palette, whimsical",
        styleNote: "\n\n【风格强制】本项目视觉风格为吉卜力。所有 keywords 必须体现吉卜力工作室美学（hand-painted, soft watercolor, warm palette, lush nature），严禁出现 3D render, CGI, photorealistic。",
    }},
    { pattern: /动态图形|motion\s*graphic/i, entry: {
        charSuffix: "motion graphics style, clean vector, geometric shapes, bold colors, flat design, animated",
        locSuffix: "motion graphics environment, clean vector, geometric, bold colors, flat design, dynamic",
        propSuffix: "motion graphics object, clean vector, geometric, bold colors, flat, minimal",
        prodSuffix: "motion graphics product, clean vector, geometric, bold colors, flat design",
        styleNote: "\n\n【风格强制】本项目视觉风格为动态图形。所有 keywords 必须体现 MG 动画美学（clean vector, geometric shapes, bold colors, flat design），严禁出现 photorealistic, texture, grain。",
    }},
    // ─── 艺术画风补充 ───
    { pattern: /涂鸦|街头|graffiti|street\s*art/i, entry: {
        charSuffix: "graffiti style, spray paint, bold tags, street art, urban, vibrant colors, dripping paint",
        locSuffix: "street art mural, graffiti wall, spray paint, urban, bold colors, dripping, wheat paste",
        propSuffix: "graffiti style object, spray paint, bold, street art, urban, vibrant",
        prodSuffix: "street art style product, spray paint, bold colors, urban, graffiti aesthetic",
        styleNote: "\n\n【风格强制】本项目视觉风格为涂鸦/街头艺术。所有 keywords 必须体现街头美学（spray paint, graffiti, urban, dripping paint），严禁出现 clean, minimal, corporate。",
    }},
    { pattern: /扁平设计|flat\s*design/i, entry: {
        charSuffix: "flat design character, clean vector, minimal shading, geometric, bold colors, simple shapes",
        locSuffix: "flat design environment, clean vector, minimal, geometric, bold colors, no gradients",
        propSuffix: "flat design object, clean vector, minimal shading, geometric, bold colors",
        prodSuffix: "flat design product, clean vector, minimal, geometric, bold colors, simple",
        styleNote: "\n\n【风格强制】本项目视觉风格为扁平设计。所有 keywords 必须体现扁平化（flat, clean vector, minimal shading, geometric），严禁出现 realistic, texture, 3D, gradient。",
    }},
    { pattern: /线条画|line\s*art/i, entry: {
        charSuffix: "line art, clean ink lines, no fill, minimalist, elegant contours, black on white",
        locSuffix: "line art environment, clean ink lines, no fill, architectural, elegant, minimalist",
        propSuffix: "line art object, clean ink lines, no fill, minimalist, elegant contours",
        prodSuffix: "line art product, clean ink lines, no fill, minimalist, elegant",
        styleNote: "\n\n【风格强制】本项目视觉风格为线条画。所有 keywords 必须体现纯线条（line art, ink lines, no fill, minimalist），严禁出现 color fill, realistic, 3D, shading。",
    }},
    { pattern: /粉彩|pastel/i, entry: {
        charSuffix: "soft pastel colors, gentle tones, dreamy, delicate, light and airy, muted palette",
        locSuffix: "soft pastel environment, gentle tones, dreamy, delicate, light and airy, muted",
        propSuffix: "soft pastel object, gentle tones, dreamy, delicate, muted palette",
        prodSuffix: "soft pastel product, gentle tones, dreamy, delicate, light, muted",
        styleNote: "\n\n【风格强制】本项目视觉风格为粉彩。所有 keywords 必须体现柔和粉彩色调（soft pastel, gentle, dreamy, muted palette），严禁出现 bold, neon, high contrast, dark。",
    }},
    { pattern: /拼贴|collage/i, entry: {
        charSuffix: "collage art, mixed media, cut paper, layered textures, vintage clippings, eclectic",
        locSuffix: "collage environment, mixed media, cut paper, layered, vintage clippings, eclectic",
        propSuffix: "collage object, mixed media, cut paper, layered textures, vintage, eclectic",
        prodSuffix: "collage style product, mixed media, cut paper, layered, vintage, eclectic",
        styleNote: "\n\n【风格强制】本项目视觉风格为拼贴艺术。所有 keywords 必须体现拼贴感（collage, mixed media, cut paper, layered textures），严禁出现 clean, digital, smooth, 3D。",
    }},
    { pattern: /点彩|pointillism/i, entry: {
        charSuffix: "pointillism, tiny dots, optical color mixing, seurat style, vibrant, textured",
        locSuffix: "pointillism landscape, tiny dots, optical color mixing, vibrant, textured, impressionist",
        propSuffix: "pointillism object, tiny dots, optical color mixing, vibrant, textured",
        prodSuffix: "pointillism product, tiny dots, optical color mixing, vibrant, artistic",
        styleNote: "\n\n【风格强制】本项目视觉风格为点彩。所有 keywords 必须体现点彩画法（pointillism, tiny dots, optical color mixing），严禁出现 smooth, flat, digital, clean lines。",
    }},
    // ─── 科幻/奇幻补充 ───
    { pattern: /机甲|mecha/i, entry: {
        charSuffix: "mecha pilot, mechanical armor, futuristic suit, glowing cockpit, industrial design, metal panels",
        locSuffix: "mecha hangar, industrial, metal panels, warning stripes, hydraulic systems, sci-fi military",
        propSuffix: "mecha part, mechanical, metal panels, hydraulic, industrial, glowing accents",
        prodSuffix: "mecha-inspired product, mechanical, metal panels, industrial design, glowing accents",
        styleNote: "\n\n【风格强制】本项目视觉风格为机甲。所有 keywords 必须体现机甲美学（mecha, mechanical, metal panels, hydraulic, industrial），严禁出现 organic, soft, pastel, cute。",
    }},
    { pattern: /仙侠|xianxia|修仙/i, entry: {
        charSuffix: "xianxia character, flowing robes, ethereal qi, celestial, jade ornaments, mystical aura, chinese mythology",
        locSuffix: "xianxia landscape, floating mountains, misty peaks, celestial palace, waterfalls, mystical clouds",
        propSuffix: "xianxia artifact, jade, glowing runes, celestial, mystical, ancient chinese",
        prodSuffix: "xianxia style product, jade, celestial, mystical, elegant, chinese mythology",
        styleNote: "\n\n【风格强制】本项目视觉风格为仙侠。所有 keywords 必须体现仙侠美学（flowing robes, celestial, jade, mystical, floating mountains），严禁出现 cyberpunk, neon, mechanical。",
    }},
    { pattern: /克苏鲁|lovecraft|cthulhu/i, entry: {
        charSuffix: "lovecraftian horror, eldritch, tentacles, cosmic dread, ancient ones, maddening, dark",
        locSuffix: "lovecraftian environment, eldritch architecture, non-euclidean, cosmic horror, dark, oppressive",
        propSuffix: "lovecraftian artifact, eldritch, tentacles, ancient, cosmic horror, dark, ominous",
        prodSuffix: "lovecraftian product, eldritch, dark, ancient, cosmic horror, ominous",
        styleNote: "\n\n【风格强制】本项目视觉风格为克苏鲁。所有 keywords 必须体现宇宙恐怖（eldritch, tentacles, cosmic dread, non-euclidean），严禁出现 bright, cheerful, cute, pastel。",
    }},
    { pattern: /太空歌剧|space\s*opera/i, entry: {
        charSuffix: "space opera character, epic scale, starship captain, futuristic uniform, cosmic backdrop",
        locSuffix: "space opera environment, epic starships, nebula, alien worlds, interstellar, cosmic scale",
        propSuffix: "space opera prop, futuristic, cosmic, alien technology, epic scale",
        prodSuffix: "space opera product, futuristic, cosmic, sleek, epic, interstellar",
        styleNote: "\n\n【风格强制】本项目视觉风格为太空歌剧。所有 keywords 必须体现史诗太空感（epic scale, starships, nebula, interstellar, cosmic），严禁出现 mundane, everyday, grounded。",
    }},
    { pattern: /太阳朋克|solarpunk/i, entry: {
        charSuffix: "solarpunk character, green technology, sustainable fashion, optimistic, plants and tech harmony",
        locSuffix: "solarpunk city, green architecture, solar panels, plants and tech harmony, optimistic future, bright",
        propSuffix: "solarpunk gadget, green technology, sustainable, organic curves, solar powered",
        prodSuffix: "solarpunk product, green technology, sustainable, organic, optimistic, bright",
        styleNote: "\n\n【风格强制】本项目视觉风格为太阳朋克。所有 keywords 必须体现绿色乌托邦（green technology, sustainable, plants and tech, optimistic），严禁出现 dystopian, dark, neon, grimy。",
    }},
    // ─── 现代设计/潮流 ───
    { pattern: /极简|minimal/i, entry: {
        charSuffix: "minimalist, clean composition, negative space, simple geometry, monochrome, elegant",
        locSuffix: "minimalist environment, clean, negative space, simple geometry, monochrome, serene",
        propSuffix: "minimalist object, clean, simple geometry, monochrome, negative space",
        prodSuffix: "minimalist product, clean, simple, monochrome, negative space, elegant",
        styleNote: "",
    }},
    { pattern: /蒸汽波|vaporwave/i, entry: {
        charSuffix: "vaporwave aesthetic, retro futurism, greek statues, pastel gradient, glitch, 80s 90s nostalgia",
        locSuffix: "vaporwave environment, retro futurism, pastel gradient, greek columns, glitch art, neon pink",
        propSuffix: "vaporwave object, retro futurism, pastel gradient, glitch, chrome, nostalgia",
        prodSuffix: "vaporwave product, retro futurism, pastel gradient, chrome, glitch, nostalgic",
        styleNote: "\n\n【风格强制】本项目视觉风格为蒸汽波。所有 keywords 必须体现蒸汽波美学（retro futurism, pastel gradient, greek statues, glitch, 80s/90s），严禁出现 modern, clean, corporate。",
    }},
    { pattern: /y2k/i, entry: {
        charSuffix: "Y2K aesthetic, metallic, butterfly, glossy, futuristic retro, pink chrome, 2000s",
        locSuffix: "Y2K environment, metallic surfaces, glossy, futuristic retro, pink chrome, 2000s nostalgia",
        propSuffix: "Y2K object, metallic, glossy, pink chrome, futuristic retro, 2000s",
        prodSuffix: "Y2K product, metallic, glossy, pink chrome, futuristic retro, 2000s aesthetic",
        styleNote: "\n\n【风格强制】本项目视觉风格为 Y2K。所有 keywords 必须体现千禧美学（metallic, glossy, pink chrome, butterfly, 2000s），严禁出现 minimalist, matte, natural。",
    }},
    { pattern: /酸性|acid\s*graphic/i, entry: {
        charSuffix: "acid graphics, chrome text, liquid metal, distorted, rave culture, neon on black",
        locSuffix: "acid graphics environment, chrome, liquid metal, distorted, rave, neon on black",
        propSuffix: "acid graphics object, chrome, liquid metal, distorted, neon, rave",
        prodSuffix: "acid graphics product, chrome, liquid metal, distorted, neon, rave aesthetic",
        styleNote: "\n\n【风格强制】本项目视觉风格为酸性设计。所有 keywords 必须体现酸性美学（chrome, liquid metal, distorted, rave, neon on black），严禁出现 clean, corporate, pastel, soft。",
    }},
    { pattern: /故障艺术|glitch/i, entry: {
        charSuffix: "glitch art, digital distortion, RGB shift, corrupted data, pixel sorting, VHS artifacts",
        locSuffix: "glitch art environment, digital distortion, RGB shift, corrupted, pixel sorting, datamosh",
        propSuffix: "glitch art object, digital distortion, RGB shift, corrupted, pixel sorting",
        prodSuffix: "glitch art product, digital distortion, RGB shift, corrupted, VHS artifacts",
        styleNote: "\n\n【风格强制】本项目视觉风格为故障艺术。所有 keywords 必须体现数字故障感（glitch, RGB shift, corrupted, pixel sorting, datamosh），严禁出现 clean, smooth, pristine。",
    }},
    { pattern: /霓虹|neon/i, entry: {
        charSuffix: "neon-lit, glowing tubes, vibrant colors on dark, electric, nightlife, luminous",
        locSuffix: "neon-lit environment, glowing tubes, vibrant colors on dark, electric, nightlife, signs",
        propSuffix: "neon object, glowing tubes, vibrant on dark, electric, luminous",
        prodSuffix: "neon product, glowing tubes, vibrant on dark, electric, luminous, dramatic",
        styleNote: "\n\n【风格强制】本项目视觉风格为霓虹。所有 keywords 必须体现霓虹灯光感（neon, glowing tubes, vibrant on dark, electric），严禁出现 natural light, daylight, matte。",
    }},
    { pattern: /包豪斯|bauhaus/i, entry: {
        charSuffix: "bauhaus style, geometric primitives, primary colors, functional design, grid, modernist",
        locSuffix: "bauhaus architecture, geometric primitives, primary colors, functional, grid, modernist",
        propSuffix: "bauhaus object, geometric primitives, primary colors, functional, modernist",
        prodSuffix: "bauhaus product, geometric, primary colors, functional design, modernist, grid",
        styleNote: "\n\n【风格强制】本项目视觉风格为包豪斯。所有 keywords 必须体现包豪斯美学（geometric primitives, primary colors, functional, grid），严禁出现 ornate, decorative, organic, realistic。",
    }},
    { pattern: /复古海报|retro\s*poster|vintage\s*poster/i, entry: {
        charSuffix: "vintage poster style, bold typography, limited palette, WPA style, propaganda art, flat",
        locSuffix: "vintage poster environment, bold typography, limited palette, travel poster, flat colors",
        propSuffix: "vintage poster object, bold, limited palette, flat colors, retro print",
        prodSuffix: "vintage poster product, bold typography, limited palette, flat, retro print",
        styleNote: "\n\n【风格强制】本项目视觉风格为复古海报。所有 keywords 必须体现复古海报感（bold typography, limited palette, flat colors, WPA style），严禁出现 photorealistic, 3D, gradient。",
    }},
    // ─── 影视写实补充 ───
    { pattern: /黑色电影|film\s*noir/i, entry: {
        charSuffix: "film noir, high contrast, dramatic shadows, venetian blind lighting, 1940s, black and white",
        locSuffix: "film noir environment, high contrast, dramatic shadows, rain-slicked streets, 1940s, chiaroscuro",
        propSuffix: "film noir object, high contrast, dramatic shadows, 1940s, black and white",
        prodSuffix: "film noir product, high contrast, dramatic shadows, chiaroscuro, 1940s aesthetic",
        styleNote: "\n\n【风格强制】本项目视觉风格为黑色电影。所有 keywords 必须体现黑色电影美学（high contrast, dramatic shadows, chiaroscuro, 1940s），严禁出现 bright, colorful, cheerful。",
    }},
    { pattern: /音乐MV|music\s*video/i, entry: {
        charSuffix: "music video aesthetic, dynamic lighting, stylized, performance, dramatic, high energy",
        locSuffix: "music video set, dynamic lighting, stylized, performance stage, dramatic, high energy",
        propSuffix: "music video prop, stylized, dynamic lighting, dramatic, high energy",
        prodSuffix: "music video product, stylized, dynamic lighting, dramatic, performance aesthetic",
        styleNote: "",
    }},
    { pattern: /时尚|fashion/i, entry: {
        charSuffix: "fashion photography, editorial, haute couture, dramatic pose, magazine cover, high fashion",
        locSuffix: "fashion editorial set, studio, dramatic lighting, high-end, magazine quality",
        propSuffix: "fashion accessory, editorial, haute couture, premium, magazine quality",
        prodSuffix: "fashion product, editorial, haute couture, premium, magazine cover quality",
        styleNote: "",
    }},
];

/** 根据视觉风格返回 keywords 后缀/风格修饰 */
function getStyleKeywordSuffix(visualStyle?: string): StyleSuffixEntry {
    const style = (visualStyle ?? "").trim();
    if (!style) {
        // 无风格 → 默认写实
        return {
            charSuffix: "concept art, ultra detailed",
            locSuffix: "wide angle, cinematic, photorealistic",
            propSuffix: "isolated object, white background, studio lighting, product photography, close-up",
            prodSuffix: "clean white background, studio softbox lighting, hero angle, product photography, 8k, commercial",
            styleNote: "",
        };
    }
    // 匹配已知风格
    for (const { pattern, entry } of STYLE_SUFFIX_MAP) {
        if (pattern.test(style)) return entry;
    }
    // 自定义风格：将用户输入的风格名直接注入，让 AI 自行匹配
    return {
        charSuffix: `${style} style, consistent visual aesthetic`,
        locSuffix: `${style} style environment, consistent visual aesthetic`,
        propSuffix: `${style} style object, consistent visual aesthetic`,
        prodSuffix: `${style} style product, consistent visual aesthetic`,
        styleNote: `\n\n【风格强制】本项目视觉风格为「${style}」（自定义风格）。所有 keywords 和描述必须严格体现「${style}」的视觉特征，使用该风格的专业术语。禁止偏离到写实摄影或其他无关风格。`,
    };
}

export async function aiExtractAssets(config: AiConfig, script: string, onDelta?: (text: string) => void, visualStyle?: string): Promise<StoryAssets> {
    // 超长剧本分块提取（每块约 6000 字，避免超出模型 token 限制导致只识别一部分）
    const CHUNK_SIZE = 6000;
    if (script.length <= CHUNK_SIZE) {
        return extractAssetsSingle(config, script, onDelta, visualStyle);
    }

    // 按段落/场景标记分块（优先在自然断点切割）
    const chunks = splitScriptIntoChunks(script, CHUNK_SIZE);
    const allResults: StoryAssets[] = [];

    for (let i = 0; i < chunks.length; i++) {
        onDelta?.(`正在提取第 ${i + 1}/${chunks.length} 段...\n`);
        const result = await extractAssetsSingle(config, chunks[i], undefined, visualStyle);
        allResults.push(result);
    }

    // 合并去重（按 name 去重）
    return mergeAssets(allResults);
}

/** 将超长剧本按自然断点分块 */
function splitScriptIntoChunks(script: string, maxSize: number): string[] {
    const chunks: string[] = [];
    // 先按场景标记分割（如 "第N场"、"INT."、"EXT."、空行等）
    const segments = script.split(/(?=(?:第[\d一二三四五六七八九十]+场|INT\.|EXT\.|SCENE\s*\d+|\n\s*\n))/i);

    let current = "";
    for (const seg of segments) {
        if ((current + seg).length > maxSize && current.length > 0) {
            chunks.push(current.trim());
            current = seg;
        } else {
            current += seg;
        }
    }
    if (current.trim()) chunks.push(current.trim());

    // 如果某个 chunk 仍然超长，硬切
    const finalChunks: string[] = [];
    for (const chunk of chunks) {
        if (chunk.length <= maxSize * 1.5) {
            finalChunks.push(chunk);
        } else {
            for (let i = 0; i < chunk.length; i += maxSize) {
                finalChunks.push(chunk.slice(i, i + maxSize));
            }
        }
    }
    return finalChunks;
}

/** 合并多块提取结果，按 name+type+描述相似度去重 */
function mergeAssets(results: StoryAssets[]): StoryAssets {
    const merged: StoryAssets = { characters: [], locations: [], props: [], products: [] };

    for (const result of results) {
        for (const key of ["characters", "locations", "props", "products"] as const) {
            for (const item of result[key] ?? []) {
                const name = (item as { name?: string }).name?.trim().toLowerCase() ?? "";
                const desc = getAssetDescription(item).toLowerCase();

                // 查找是否已存在相似资产（同名+描述重叠度高）
                const existingIdx = (merged[key] as { name?: string }[]).findIndex((existing) => {
                    const existName = (existing.name ?? "").trim().toLowerCase();
                    if (existName !== name) return false;
                    // 同名时检查描述相似度（简单关键词重叠）
                    const existDesc = getAssetDescription(existing).toLowerCase();
                    return textSimilarity(desc, existDesc) > 0.6;
                });

                if (existingIdx === -1) {
                    // 新资产，直接加入
                    (merged[key] as unknown[]).push(item);
                } else {
                    // 同名且相似，合并描述（取更长的描述）
                    const existing = (merged[key] as Record<string, unknown>[])[existingIdx];
                    const existDesc = getAssetDescription(existing);
                    if (desc.length > existDesc.length) {
                        // 用更详细的替换
                        (merged[key] as unknown[])[existingIdx] = item;
                    }
                }
            }
        }
    }
    return merged;
}

/** 提取资产的主要描述文本 */
function getAssetDescription(item: unknown): string {
    const obj = item as Record<string, unknown>;
    return [obj.appearance, obj.description, obj.keywords, obj.costume, obj.personality]
        .filter(Boolean)
        .map(String)
        .join(" ");
}

/** 简单文本相似度（基于关键词重叠率） */
function textSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const wordsA = new Set(a.split(/[\s,，、;；]+/).filter((w) => w.length > 1));
    const wordsB = new Set(b.split(/[\s,，、;；]+/).filter((w) => w.length > 1));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let overlap = 0;
    for (const w of wordsA) {
        if (wordsB.has(w)) overlap++;
    }
    return overlap / Math.min(wordsA.size, wordsB.size);
}

/** 单次资产提取（原始逻辑） */
async function extractAssetsSingle(config: AiConfig, script: string, onDelta?: (text: string) => void, visualStyle?: string): Promise<StoryAssets> {
    return withRetry(async () => {
        // 始终使用本地规范（含 keywords 分类型规则），不被远程旧版覆盖
        const styleSuffix = getStyleKeywordSuffix(visualStyle);
        const systemPrompt = ASSET_EXTRACTOR_SYSTEM + styleSuffix.styleNote;
        const fewShot = await getStoryboardFewShot("asset_extraction");
        const styleHint = visualStyle ? `\n\n【视觉风格】${visualStyle}（keywords 必须匹配此风格）` : "";
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt + fewShot },
            { role: "user", content: `请从以下剧本中提取视觉资产：${styleHint}\n\n${script}` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        const result = parseJsonObject<StoryAssets>(raw);
        recordGeneration({ skillId: "sb_asset_extraction", inputText: script.slice(0, 500), outputText: raw.slice(0, 1000), model: config.model });
        return result;
    });
}

/** 重新生成单个资产（对某一项不满意时使用） */
export async function aiRegenerateAsset(config: AiConfig, script: string, assetType: "characters" | "locations" | "props" | "products", assetName: string, onDelta?: (text: string) => void, visualStyle?: string): Promise<Record<string, unknown>> {
    return withRetry(async () => {
        const typeLabel = { characters: "角色", locations: "场景/地点", props: "道具", products: "产品/品牌" }[assetType];
        const styleSuffix = getStyleKeywordSuffix(visualStyle);
        const keywordRules: Record<string, string> = {
            characters: `keywords 必须是三视图格式：以 'character design sheet, front view, side view, back view' 开头，包含外貌/服装细节，以 'neutral T-pose, white background, reference sheet, ${styleSuffix.charSuffix}' 结尾。禁止包含任何场景/环境。禁止包含手持道具、武器、其他角色、动物——角色必须是独立干净的纯角色设定图。`,
            locations: `keywords 是完整环境描述：包含室内/室外、空间结构、材质、光线、氛围，以 '${styleSuffix.locSuffix}' 结尾。禁止包含具体角色名、外貌描述、特定人物（可用 distant silhouette 做比例参考）。`,
            props: `keywords 必须是孤立物体：以物体名+材质/颜色开头，以 '${styleSuffix.propSuffix}' 结尾。禁止包含环境（桌面/房间/户外）、人物（hand, person, woman）、使用场景。`,
            products: `keywords 必须是商业产品照格式：以产品名+外观开头，以 '${styleSuffix.prodSuffix}' 结尾。禁止包含模特、手、使用者（hand holding, model wearing, person using）。`,
        };
        const systemPrompt = `你是一位资深影视美术指导。用户会给你一段剧本和一个已有的${typeLabel}名称「${assetName}」，你需要重新为该${typeLabel}生成更详细、更专业的视觉描述。${styleSuffix.styleNote}

输出要求：
1. 仅输出该单个${typeLabel}的 JSON 对象（不要数组）
2. 字段与原来一致，但描述要更具体、更可视化
3. ${keywordRules[assetType]}
4. keywords 纯英文逗号分隔标签，keywordsZh 提供逐条中文翻译
5. 严格以 JSON 格式输出，不要输出任何其他文字`;
        const styleHint = visualStyle ? `\n视觉风格：${visualStyle}` : "";
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `剧本：\n${script}${styleHint}\n\n请重新生成${typeLabel}「${assetName}」的详细视觉描述：` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        return parseJsonObject<Record<string, unknown>>(raw);
    });
}

// ─── Skill: 场景拆分 ─────────────────────────────────────────────

const SCENE_SPLITTER_SYSTEM = `你是一位专业的影视分镜师，擅长广告片、微电影、MV、纪录片、动画的节奏把控。用户会给你一段剧本/故事文本，你需要将其拆分为独立的场景。

要求：
1. 每个场景代表一个连续的时空单元（同一地点、同一时间段）
2. 场景标题格式："第N场：地点/时间"（如"第1场：教室-白天"）
3. summary 用1-2句话概括该场景的核心内容和情绪走向
4. scriptExcerpt 必须完整复制该场景对应的原始剧本文本（包括所有对白和动作描写，不要改写）
5. timeRange：根据剧本时间标记或内容节奏推算时间范围（如"00:00-00:15"），广告片注意快节奏（单场5-15s），微电影可舒缓（单场20-60s）
6. mood：场景情绪氛围，从以下选择或组合：紧张、温馨、压抑、欢快、悲伤、激昂、神秘、浪漫、恐怖、宁静、史诗感、怀旧、梦幻、冷峻、热烈、孤独、希望、绝望、幽默、庄重、荒诞、治愈
7. colorTone：场景主色调（如"暖金色调"、"冷蓝灰调"、"高饱和撞色"、"莫兰迪低饱和"、"黑白影调"）
8. 合理拆分，不要过细（一般3-15个场景）

严格以 JSON 数组格式输出，不要输出任何其他文字：
[{"title":"第1场：教室-白天","summary":"老师宣布考试成绩，主角紧张等待","scriptExcerpt":"老师站在讲台上...","timeRange":"00:00-00:15","mood":"紧张","colorTone":"冷白日光调"}]`;

export async function aiSplitScenes(config: AiConfig, script: string, onDelta?: (text: string) => void): Promise<AiSceneResult[]> {
    // 超长剧本分块拆分场景
    const CHUNK_SIZE = 6000;
    if (script.length <= CHUNK_SIZE) {
        return splitScenesSingle(config, script, onDelta);
    }

    const chunks = splitScriptIntoChunks(script, CHUNK_SIZE);
    const allScenes: AiSceneResult[] = [];

    for (let i = 0; i < chunks.length; i++) {
        onDelta?.(`正在拆分第 ${i + 1}/${chunks.length} 段场景...\n`);
        const scenes = await splitScenesSingle(config, chunks[i], undefined);
        allScenes.push(...scenes);
    }

    // 重新编号场景标题
    return allScenes.map((scene, idx) => ({
        ...scene,
        title: scene.title.replace(/^第[\d一二三四五六七八九十百]+场/, `第${idx + 1}场`) || `第${idx + 1}场：${scene.title}`,
    }));
}

/** 单次场景拆分（原始逻辑） */
async function splitScenesSingle(config: AiConfig, script: string, onDelta?: (text: string) => void): Promise<AiSceneResult[]> {
    return withRetry(async () => {
        const systemPrompt = (await getSkillPrompt("sb_scene_split")) ?? SCENE_SPLITTER_SYSTEM;
        const fewShot = await getStoryboardFewShot("scene_split");
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt + fewShot },
            { role: "user", content: `请将以下剧本拆分为场景：\n\n${script}` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        recordGeneration({ skillId: "sb_scene_split", inputText: script.slice(0, 300), outputText: raw.slice(0, 500), model: config.model });
        return parseJsonArray<AiSceneResult>(raw);
    });
}

// ─── Skill: 镜头生成 ─────────────────────────────────────────────

const SHOT_GENERATOR_SYSTEM = `你是一位顶级分镜师/摄影指导，精通电影级镜头语言。用户会给你一个场景的描述和相关资产信息，你需要为该场景设计专业的镜头列表。

每个镜头包含以下字段（括号内为常用参考值，可根据实际需要自由扩展，不限于列表）：
- shotType 景别（参考：大远景、远景、全景、中全景、中景、中近景、近景、特写、大特写/微距、过肩、主观视角、双人镜头等，也可使用如"无人机俯瞰"、"FPV穿越"等更具体的描述）
- angle 角度（参考：平视、俯视、仰视、鸟瞰、蛙眼/极低角度、荷兰角、过肩角、主观、客观、倾斜等，也可自由组合如"倾斜俯冲"、"旋转仰拍"）
- cameraMovement 运镜（参考：固定、推、拉、摇、移、跟、升、降、环绕、一镜到底、航拍、斯坦尼康、手持、轨道、摇臂、甩镜、变焦推拉等，也可使用如"FPV穿越跟拍"、"360度旋转上升"、"无人机俯冲"等）
- lens 焦距（参考：鱼眼、超广角、广角、标准、中长焦、长焦、微距等，也可使用如"移轴镜头"、"变形宽银幕"、"潜望镜"等）
- lighting 光线（参考：自然光、伦勃朗光、蝴蝶光、轮廓光、逆光、顶光、底光、侧光、达芬奇调色、霓虹光、体积光、实景光源等，也可使用如"烛光"、"屏幕光"、"闪电"、"激光"等）
- composition 构图（参考：中心构图、三分法、对称、引导线、框中框、负空间、对角线、前景遮挡、填满画面、留头空间、低地平线、高地平线、黄金螺旋、多层纵深等，也可自由组合如"对称+引导线"、"前景虚化+负空间"）
- transition 转场（到下一镜头，参考：硬切、叠化、淡入黑、黑淡入、划像、匹配剪辑、跳切、L-Cut、J-Cut、闪白、模糊转场、遮罩转场等，也可使用如"速度斜坡"、"动态遮罩"、"粒子消散"等）
- action: 画面动作描述（具体可视化，像给摄影师下指令）
- dialogue: 该镜头台词（必须从剧本原文提取，格式"角色名：台词"，无对白则为空字符串）
- duration: 预估时长（如"3s"、"5s"）
- mood: 情绪氛围

专业规则：
1. 每场景3-8个镜头，注意节奏：广告片快切（2-4s/镜头），叙事片舒缓（4-8s/镜头）
2. 景别必须有变化节奏（如 全景→中景→特写→远景 的呼吸感），禁止全部中景平视
3. 运镜选择需匹配情绪：紧张=手持/快推，浪漫=斯坦尼康/环绕，史诗=航拍/摇臂，纪实=固定/手持跟拍
4. 焦距选择需匹配空间感：压迫=长焦压缩，开阔=广角，亲密=中长焦，细节=微距
5. 光线需匹配氛围：温馨=自然光/烛光，悬疑=侧光/底光，商业=蝴蝶光/达芬奇调色，夜店=霓虹光
6. 转场需有逻辑：同场景内=硬切/跳切，时间流逝=叠化，章节感=淡入黑，创意衔接=匹配剪辑/遮罩转场
7. 【重要】剧本中的每一句对白都必须分配到某个镜头的 dialogue 字段，绝不遗漏
8. 结合角色资产确保动作与角色外貌/性格一致

严格以 JSON 数组格式输出，不要输出任何其他文字：
[{"shotType":"全景","angle":"平视","cameraMovement":"斯坦尼康","lens":"广角","lighting":"自然光","composition":"引导线","transition":"硬切","action":"主角推开门走进教室，阳光从走廊洒入","dialogue":"老师：这次考试成绩出来了","duration":"4s","mood":"紧张"}]`;

export async function aiGenerateShots(config: AiConfig, sceneTitle: string, sceneSummary: string, script: string, assetsContext?: string, projectMeta?: string, onDelta?: (text: string) => void): Promise<AiShotResult[]> {
    return withRetry(async () => {
        const systemPrompt = (await getSkillPrompt("sb_shot_generation")) ?? SHOT_GENERATOR_SYSTEM;
        const fewShot = await getStoryboardFewShot("storyboard");
        const userContent = [
            projectMeta ? `【项目信息】${projectMeta}` : "",
            `场景：${sceneTitle}`,
            `概要：${sceneSummary}`,
            assetsContext ? `\n相关资产：\n${assetsContext}` : "",
            `\n相关剧本片段：\n${script}`,
            "\n请为该场景设计镜头列表：",
        ].filter(Boolean).join("\n");
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt + fewShot },
            { role: "user", content: userContent },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        recordGeneration({ skillId: "sb_shot_generation", inputText: sceneTitle.slice(0, 200), outputText: raw.slice(0, 500), model: config.model });
        return parseJsonArray<AiShotResult>(raw);
    });
}

// ─── Skill: 画面描述生成 ─────────────────────────────────────────

const VISUAL_DESCRIPTOR_SYSTEM = `你是一位视觉描述大师，精通多种视觉风格的画面构建。用户会给你一个镜头的完整信息（景别、角度、运镜、焦距、光线、动作、氛围）、项目资产以及【视觉风格】，你需要生成严格匹配该风格的画面视觉描述。

核心规则：
1. 【风格优先】严格遵循用户指定的视觉风格，不同风格的描述语言完全不同：
   - 3DCG：强调「3D render、CGI、octane render、unreal engine、PBR、ray tracing、global illumination、subsurface scattering、clean topology」，这是 CG 渲染而非真实摄影，禁止出现"photograph/DSLR/film grain/natural photography"等真实摄影词汇
   - 皮克斯：强调「Pixar-style、rounded shapes、cartoon proportions、soft GI、vibrant colors、光滑塑料感」，禁止出现"photorealistic/real skin/pores"等写实词汇
   - 电影写实：强调「胶片颗粒、浅景深、自然光、真实材质纹理、色彩分级」
   - 日系动画：强调「赛璐璐着色、清晰线条、大眼睛、扁平化光影」
   - 其他风格：使用该风格的专业术语
2. 描述涵盖七要素：主体、动作、环境、光线、色彩、构图、材质/质感
3. 必须体现镜头语言：将运镜方式转化为画面动态描述
4. 必须体现光线设计：说明光源方向、色温、氛围
5. 材质描述必须匹配风格（3DCG=光滑塑料感/橡胶感；写实=皮肤毛孔/织物纤维）
6. 100-200字，信息密度高，适合作为 AI 生图/生视频输入
7. 直接输出描述文本，不要加引号或前缀`;

export async function aiGenerateVisualDescription(config: AiConfig, shot: { shotType: string; angle: string; action: string; mood?: string; dialogue?: string; cameraMovement?: string; lens?: string; lighting?: string; composition?: string }, sceneContext: string, assetsContext?: string, onDelta?: (text: string) => void, visualStyle?: string): Promise<string> {
    const systemPrompt = (await getSkillPrompt("sb_visual_description")) ?? VISUAL_DESCRIPTOR_SYSTEM;
    const fewShot = await getStoryboardFewShot("visual_description");
    const userContent = [
        visualStyle ? `【视觉风格】${visualStyle}（描述必须严格匹配此风格，禁止偏离）` : "",
        `场景背景：${sceneContext}`,
        assetsContext ? `\n项目资产（角色/场景/道具）：\n${assetsContext}` : "",
        `\n镜头信息：景别=${shot.shotType}，角度=${shot.angle}，动作=${shot.action}${shot.cameraMovement ? `，运镜=${shot.cameraMovement}` : ""}${shot.lens ? `，镜头=${shot.lens}` : ""}${shot.lighting ? `，光线=${shot.lighting}` : ""}${shot.composition ? `，构图=${shot.composition}` : ""}${shot.mood ? `，氛围=${shot.mood}` : ""}${shot.dialogue ? `，对白="${shot.dialogue}"` : ""}`,
        "\n请生成画面视觉描述：",
    ].filter(Boolean).join("\n");
    const messages: AiTextMessage[] = [
        { role: "system", content: systemPrompt + fewShot },
        { role: "user", content: userContent },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    recordGeneration({ skillId: "sb_visual_description", inputText: shot.action.slice(0, 200), outputText: raw.slice(0, 500), model: config.model });
    return raw.trim();
}

// ─── Skill: 剧本生成/改写 ─────────────────────────────────────────

const SCRIPT_GENERATOR_SYSTEM = `你是一位专业编剧。根据用户提供的概念/大纲/灵感，生成或改写一段完整的短剧本。

要求：
1. 输出标准剧本格式：场景标题（INT./EXT. 地点-时间）+ 动作描写 + 对白
2. 包含清晰的起承转合结构
3. 角色对白自然、有个性
4. 动作描写简洁可视化，适合后续分镜
5. 长度控制在 500-1500 字
6. 如果是改写，保留核心情节但优化结构和表达
7. 直接输出剧本正文，不要加解释或前缀`;

export async function aiGenerateScript(config: AiConfig, concept: string, mode: "generate" | "rewrite" = "generate", onDelta?: (text: string) => void): Promise<string> {
    const systemPrompt = (await getSkillPrompt("sb_script_generation")) ?? SCRIPT_GENERATOR_SYSTEM;
    const userContent = mode === "rewrite"
        ? `请改写以下剧本，优化结构、对白和节奏：\n\n${concept}`
        : `请根据以下概念/灵感创作一段短剧本：\n\n${concept}`;
    const messages: AiTextMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    recordGeneration({ skillId: "sb_script_generation", inputText: concept.slice(0, 500), outputText: raw.slice(0, 1000), model: config.model });
    return raw.trim();
}

// ─── Skill: 角色一致性描述 ────────────────────────────────────────

const CHARACTER_CONSISTENCY_SYSTEM = `你是角色视觉一致性专家。给定角色的基础描述，生成一段标准化的外貌锚定描述，确保在多个镜头/场景中保持视觉一致。

要求：
1. 输出一段 50-100 字的标准化外貌描述（英文），包含：性别、年龄段、发型发色、面部特征、体型、标志性服装/配饰
2. 描述要具体、无歧义，适合作为 AI 生图的角色锚定 prompt
3. 避免模糊词汇（如"好看"），使用精确视觉词汇
4. 输出格式：纯英文描述文本，不要加引号或前缀`;

export async function aiCharacterConsistency(config: AiConfig, characterName: string, baseDescription: string, onDelta?: (text: string) => void): Promise<string> {
    const systemPrompt = (await getSkillPrompt("sb_character_consistency")) ?? CHARACTER_CONSISTENCY_SYSTEM;
    const messages: AiTextMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `角色名：${characterName}\n基础描述：${baseDescription}\n\n请生成标准化外貌锚定描述：` },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    recordGeneration({ skillId: "sb_character_consistency", inputText: baseDescription.slice(0, 200), outputText: raw.slice(0, 300), model: config.model });
    return raw.trim();
}

// ─── Skill: 转场建议 ─────────────────────────────────────────────

const TRANSITION_ADVISOR_SYSTEM = `你是影视剪辑师。给定相邻两个场景的信息，推荐最合适的转场方式。

输出 JSON 格式：
{"transition": "转场类型", "reason": "选择理由（一句话）", "duration": "建议时长"}

转场类型参考（可根据创意需要自由扩展）：
- cut（硬切）：节奏快、同场景内
- dissolve（叠化）：时间流逝、情绪过渡
- fade_to_black（淡入黑）：章节结束、重大转折
- fade_from_black（黑淡入）：新章节开始
- wipe（划像）：场景大跳转
- match_cut（匹配剪辑）：视觉/动作衔接
- jump_cut（跳切）：同角度时间压缩
- l_cut / j_cut（声音先行/画面先行）：对白衔接
- 也可使用：速度斜坡、动态遮罩、粒子消散、闪回、旋转转场等更创意的方式

严格以 JSON 格式输出，不要输出任何其他文字。`;

export interface TransitionSuggestion {
    transition: string;
    reason: string;
    duration: string;
}

export async function aiSuggestTransition(config: AiConfig, sceneA: { title: string; summary: string; mood?: string }, sceneB: { title: string; summary: string; mood?: string }, onDelta?: (text: string) => void): Promise<TransitionSuggestion> {
    return withRetry(async () => {
        const systemPrompt = (await getSkillPrompt("sb_transition_advisor")) ?? TRANSITION_ADVISOR_SYSTEM;
        const fewShot = await getStoryboardFewShot("transition");
        const userContent = `场景A：${sceneA.title}\n概要：${sceneA.summary}${sceneA.mood ? `\n氛围：${sceneA.mood}` : ""}\n\n场景B：${sceneB.title}\n概要：${sceneB.summary}${sceneB.mood ? `\n氛围：${sceneB.mood}` : ""}\n\n请推荐转场方式：`;
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt + fewShot },
            { role: "user", content: userContent },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        recordGeneration({ skillId: "sb_transition_advisor", inputText: `${sceneA.title} → ${sceneB.title}`, outputText: raw.slice(0, 300), model: config.model });
        return parseJsonObject<TransitionSuggestion>(raw);
    });
}

// ─── 工具函数 ────────────────────────────────────────────────────

/** 将 StoryAssets 构建为传递给 AI 的上下文字符串 */
export function buildAssetsContext(assets: StoryAssets): string {
    if (!assets) return "";
    const parts: string[] = [];
    if (assets.characters?.length) {
        parts.push("【角色】");
        assets.characters.forEach((c) => {
            parts.push(`- ${c.name}：${c.appearance}${c.costume ? `，服装：${c.costume}` : ""}${c.keywords ? ` [关键词: ${c.keywords}]` : ""}`);
        });
    }
    if (assets.locations?.length) {
        parts.push("【场景】");
        assets.locations.forEach((l) => {
            parts.push(`- ${l.name}：${l.description}${l.timeOfDay ? `，时间：${l.timeOfDay}` : ""}${l.lighting ? `，光线：${l.lighting}` : ""}${l.keywords ? ` [关键词: ${l.keywords}]` : ""}`);
        });
    }
    if (assets.props?.length) {
        parts.push("【道具】");
        assets.props.forEach((p) => {
            parts.push(`- ${p.name}：${p.description}${p.significance ? `（${p.significance}）` : ""}${p.keywords ? ` [关键词: ${p.keywords}]` : ""}`);
        });
    }
    if (assets.products?.length) {
        parts.push("【产品/品牌】");
        assets.products.forEach((p) => {
            parts.push(`- ${p.name}${p.brand ? `（${p.brand}）` : ""}：${p.appearance}${p.packaging ? `，包装：${p.packaging}` : ""}${p.significance ? `，品牌意义：${p.significance}` : ""}${p.keywords ? ` [关键词: ${p.keywords}]` : ""}`);
        });
    }
    return parts.join("\n");
}

/** 构建项目元信息上下文（类型/时长/风格/平台） */
export function buildProjectMetaContext(project: { projectType?: string; targetDuration?: number; visualStyle?: string; targetPlatform?: string }): string {
    const parts: string[] = [];
    if (project.projectType) parts.push(`项目类型：${project.projectType}`);
    if (project.targetDuration) parts.push(`目标时长：${project.targetDuration}秒`);
    if (project.visualStyle) parts.push(`视觉风格：${project.visualStyle}`);
    if (project.targetPlatform) parts.push(`目标平台：${project.targetPlatform}`);
    return parts.join("，");
}
