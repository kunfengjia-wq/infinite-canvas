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

// ─── Few-shot 检索（Supabase dataset_items）─────────────────────

const fewShotCache = new Map<string, string>();

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
1. characters（角色）：name, appearance(外貌描述，具体到发色/发型/体型/面部特征), personality(性格), costume(服装细节), keywords(英文), keywordsZh(中文翻译)
2. locations（场景/地点）：name, description(环境描述，含空间结构和材质), timeOfDay(时间), lighting(光线氛围), keywords(英文), keywordsZh(中文翻译)
3. props（道具）：name, description(外观描述，含材质/颜色/尺寸感), significance(剧情意义), keywords(英文), keywordsZh(中文翻译)
4. products（产品/品牌资产，广告片必填）：name, brand(品牌), appearance(产品外观：形态/颜色/材质/光泽), packaging(包装描述), significance(品牌意义/卖点), keywords(英文), keywordsZh(中文翻译)

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

■ 道具 keywords 格式（孤立物体，禁止带场景）：
  结构：[物体名], [材质/颜色/细节], isolated object, white background, studio lighting, product photography, close-up
  禁止包含：任何环境、人物、场景
  示例："antique bronze pocket watch, cracked glass face, roman numerals, tarnished chain, isolated object, white background, soft studio lighting, product photography, close-up, ultra detailed"

■ 产品 keywords 格式（商业产品照）：
  结构：[产品名], [外观/材质/颜色], [包装], clean white background, studio softbox lighting, hero angle, product photography, 8k, commercial
  示例："premium glass skincare bottle, frosted texture, gold metallic cap, minimalist label design, clean white background, studio softbox lighting, hero angle, product photography, 8k render, commercial quality"

■ 场景 keywords 格式（唯一允许完整环境的类型）：
  结构：[室内/室外], [地点], [空间结构], [材质], [时间/光线], [氛围], wide angle, cinematic
  示例："interior, abandoned warehouse, high ceiling, rusty corrugated metal walls, broken skylight windows, volumetric sunlight beams, dust particles in air, concrete floor with cracks, cinematic lighting, wide angle, atmospheric, photorealistic"

【其他专业要求】
1. 角色外貌必须具体可视化，禁止"长得很帅""非常漂亮"等模糊描述
2. 广告类剧本必须提取 products（产品外观、包装、品牌调性）
3. 场景描述需包含光线方向/色温信息
4. 道具需注明材质（金属/木质/玻璃/织物等）
5. keywordsZh 是 keywords 的逐条中文翻译，用逗号分隔，方便用户理解

严格以 JSON 格式输出，不要输出任何其他文字：
{"characters":[...],"locations":[...],"props":[...],"products":[...]}`;

export async function aiExtractAssets(config: AiConfig, script: string, onDelta?: (text: string) => void): Promise<StoryAssets> {
    return withRetry(async () => {
        const systemPrompt = (await getSkillPrompt("sb_asset_extraction")) ?? ASSET_EXTRACTOR_SYSTEM;
        const fewShot = await getStoryboardFewShot("asset_extraction");
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt + fewShot },
            { role: "user", content: `请从以下剧本中提取视觉资产：\n\n${script}` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        const result = parseJsonObject<StoryAssets>(raw);
        recordGeneration({ skillId: "sb_asset_extraction", inputText: script.slice(0, 500), outputText: raw.slice(0, 1000), model: config.model });
        return result;
    });
}

/** 重新生成单个资产（对某一项不满意时使用） */
export async function aiRegenerateAsset(config: AiConfig, script: string, assetType: "characters" | "locations" | "props" | "products", assetName: string, onDelta?: (text: string) => void): Promise<Record<string, unknown>> {
    return withRetry(async () => {
        const typeLabel = { characters: "角色", locations: "场景/地点", props: "道具", products: "产品/品牌" }[assetType];
        const keywordRules: Record<string, string> = {
            characters: "keywords 必须是三视图格式：以 'character design sheet, front view, side view, back view' 开头，包含外貌/服装细节，以 'neutral T-pose, white background, reference sheet, concept art' 结尾。禁止包含任何场景/环境。禁止包含手持道具、武器、其他角色、动物——角色必须是独立干净的纯角色设定图。",
            locations: "keywords 是完整环境描述：包含室内/室外、空间结构、材质、光线、氛围，以 'wide angle, cinematic' 结尾。",
            props: "keywords 必须是孤立物体：以物体名+材质/颜色开头，以 'isolated object, white background, studio lighting, product photography, close-up' 结尾。禁止包含环境/人物。",
            products: "keywords 必须是商业产品照格式：以产品名+外观开头，以 'clean white background, studio softbox lighting, hero angle, product photography, 8k, commercial' 结尾。",
        };
        const systemPrompt = `你是一位资深影视美术指导。用户会给你一段剧本和一个已有的${typeLabel}名称「${assetName}」，你需要重新为该${typeLabel}生成更详细、更专业的视觉描述。

输出要求：
1. 仅输出该单个${typeLabel}的 JSON 对象（不要数组）
2. 字段与原来一致，但描述要更具体、更可视化
3. ${keywordRules[assetType]}
4. keywords 纯英文逗号分隔标签，keywordsZh 提供逐条中文翻译
5. 严格以 JSON 格式输出，不要输出任何其他文字`;
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `剧本：\n${script}\n\n请重新生成${typeLabel}「${assetName}」的详细视觉描述：` },
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
    return withRetry(async () => {
        const systemPrompt = (await getSkillPrompt("sb_scene_split")) ?? SCENE_SPLITTER_SYSTEM;
        const fewShot = await getStoryboardFewShot("scene_split");
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt + fewShot },
            { role: "user", content: `请将以下剧本拆分为场景：\n\n${script}` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
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
        return parseJsonArray<AiShotResult>(raw);
    });
}

// ─── Skill: 画面描述生成 ─────────────────────────────────────────

const VISUAL_DESCRIPTOR_SYSTEM = `你是一位视觉描述大师，精通摄影、灯光、调色和构图的专业词汇。用户会给你一个镜头的完整信息（景别、角度、运镜、焦距、光线、动作、氛围）以及项目资产，你需要生成一段电影级画面视觉描述。

要求：
1. 描述涵盖七要素：主体、动作、环境、光线、色彩、构图、材质/质感
2. 必须体现镜头语言：将运镜方式转化为画面动态描述（如"镜头缓缓推近"、"航拍俯瞰大地"）
3. 必须体现光线设计：说明光源方向、色温、光影效果（如"逆光勾勒发丝轮廓，暖金色光晕弥漫"）
4. 必须结合资产信息确保视觉一致性（角色外貌、场景环境、产品外观）
5. 使用专业色彩词汇：不要"红色"，用"深绯红"、"铁锈红"、"珊瑚粉"
6. 加入材质/质感描述：皮肤质感、织物纹理、金属反光、玻璃折射、烟雾颗粒
7. 100-200字，信息密度高，每句话都有视觉价值，适合作为 AI 生图/生视频输入
8. 直接输出描述文本，不要加引号或前缀`;

export async function aiGenerateVisualDescription(config: AiConfig, shot: { shotType: string; angle: string; action: string; mood?: string; dialogue?: string; cameraMovement?: string; lens?: string; lighting?: string; composition?: string }, sceneContext: string, assetsContext?: string, onDelta?: (text: string) => void): Promise<string> {
    const systemPrompt = (await getSkillPrompt("sb_visual_description")) ?? VISUAL_DESCRIPTOR_SYSTEM;
    const fewShot = await getStoryboardFewShot("visual_description");
    const userContent = [
        `场景背景：${sceneContext}`,
        assetsContext ? `\n项目资产（角色/场景/道具）：\n${assetsContext}` : "",
        `\n镜头信息：景别=${shot.shotType}，角度=${shot.angle}，动作=${shot.action}${shot.cameraMovement ? `，运镜=${shot.cameraMovement}` : ""}${shot.lens ? `，镜头=${shot.lens}` : ""}${shot.lighting ? `，光线=${shot.lighting}` : ""}${shot.composition ? `，构图=${shot.composition}` : ""}${shot.mood ? `，氛围=${shot.mood}` : ""}${shot.dialogue ? `，对白="${shot.dialogue}"` : ""}`,
        "\n请生成画面视觉描述：",
    ].join("\n");
    const messages: AiTextMessage[] = [
        { role: "system", content: systemPrompt + fewShot },
        { role: "user", content: userContent },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
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
        return parseJsonObject<TransitionSuggestion>(raw);
    });
}

// ─── 工具函数 ────────────────────────────────────────────────────

/** 带重试的 AI 调用包装（JSON 解析失败时自动重试） */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // 仅在 JSON 解析类错误时重试，其他错误直接抛出
            if (!lastError.message.includes("JSON") && !lastError.message.includes("格式异常")) throw lastError;
        }
    }
    throw lastError ?? new Error("重试耗尽");
}

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

function parseJsonArray<T>(raw: string): T[] {
    // 尝试从 AI 输出中提取 JSON 数组
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("AI 返回格式异常，未找到 JSON 数组");
    const jsonStr = cleaned.slice(start, end + 1);
    try {
        return JSON.parse(jsonStr) as T[];
    } catch {
        throw new Error("AI 返回的 JSON 解析失败，请重试");
    }
}

function parseJsonObject<T>(raw: string): T {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("AI 返回格式异常，未找到 JSON 对象");
    const jsonStr = cleaned.slice(start, end + 1);
    try {
        return JSON.parse(jsonStr) as T;
    } catch {
        throw new Error("AI 返回的 JSON 解析失败，请重试");
    }
}
