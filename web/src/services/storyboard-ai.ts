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

// ─── Skill: 资产提取 ─────────────────────────────────────────────

const ASSET_EXTRACTOR_SYSTEM = `你是一位影视美术指导。用户会给你一段剧本/故事文本，你需要从中提取所有视觉资产。

提取三类资产：
1. characters（角色）：name, appearance(外貌描述), personality(性格), costume(服装), keywords(用于AI生图的关键词，英文)
2. locations（场景/地点）：name, description(环境描述), timeOfDay(时间), lighting(光线), keywords(英文关键词)
3. props（道具）：name, description(外观描述), significance(剧情意义), keywords(英文关键词)

要求：
1. keywords 字段用英文逗号分隔的关键词，适合作为 AI 生图提示词的一部分
2. 角色外貌描述要具体（发色、发型、体型、特征等）
3. 不要遗漏重要角色和关键道具

严格以 JSON 格式输出，不要输出任何其他文字：
{"characters":[{"name":"小明","appearance":"17岁男生，黑色短发，瘦高","personality":"内向紧张","costume":"白色校服","keywords":"young boy, short black hair, slim, school uniform"}],"locations":[...],"props":[...]}`;

export async function aiExtractAssets(config: AiConfig, script: string, onDelta?: (text: string) => void): Promise<StoryAssets> {
    return withRetry(async () => {
        const systemPrompt = (await getSkillPrompt("sb_asset_extraction")) ?? ASSET_EXTRACTOR_SYSTEM;
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `请从以下剧本中提取视觉资产：\n\n${script}` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        const result = parseJsonObject<StoryAssets>(raw);
        recordGeneration({ skillId: "sb_asset_extraction", inputText: script.slice(0, 500), outputText: raw.slice(0, 1000), model: config.model });
        return result;
    });
}

// ─── Skill: 场景拆分 ─────────────────────────────────────────────

const SCENE_SPLITTER_SYSTEM = `你是一位专业的影视分镜师。用户会给你一段剧本/故事文本，你需要将其拆分为独立的场景。

要求：
1. 每个场景代表一个连续的时空单元（同一地点、同一时间段）
2. 场景标题格式："第N场：地点/时间"（如"第1场：教室-白天"）
3. summary 用1-2句话概括该场景的核心内容
4. scriptExcerpt 必须包含该场景对应的原始剧本文本（完整复制，不要改写），包括所有对白和动作描写
5. 合理拆分，不要过细（一般3-15个场景）

严格以 JSON 数组格式输出，不要输出任何其他文字：
[{"title": "第1场：教室-白天", "summary": "老师宣布考试成绩，主角紧张地等待", "scriptExcerpt": "老师站在讲台上...小明紧张地低下头..."}]`;

export async function aiSplitScenes(config: AiConfig, script: string, onDelta?: (text: string) => void): Promise<AiSceneResult[]> {
    return withRetry(async () => {
        const systemPrompt = (await getSkillPrompt("sb_scene_split")) ?? SCENE_SPLITTER_SYSTEM;
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `请将以下剧本拆分为场景：\n\n${script}` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        return parseJsonArray<AiSceneResult>(raw);
    });
}

// ─── Skill: 镜头生成 ─────────────────────────────────────────────

const SHOT_GENERATOR_SYSTEM = `你是一位专业的分镜师。用户会给你一个场景的描述和相关资产信息，你需要为该场景设计具体的镜头列表。

每个镜头包含：
- shotType: 景别（远景/全景/中景/近景/特写/大特写）
- angle: 角度（平视/俯视/仰视/斜角/鸟瞰/低角度）
- action: 画面中的动作描述（具体、可视化）
- dialogue: 该镜头中角色说的台词（必须从剧本原文中提取，保留原始措辞，格式为"角色名：台词内容"。如果该镜头时间范围内有角色说话，必须填写，不可省略。没有对白则为空字符串）
- duration: 预估时长（如"3s"、"5s"）
- mood: 情绪氛围（如"紧张"、"温馨"、"压抑"）

要求：
1. 每个场景一般3-8个镜头
2. 注意景别和角度的变化节奏（不要全是中景平视）
3. action 描述要具体可视化，像在给摄影师下指令
4. 结合角色资产信息，确保动作描述与角色外貌/性格一致
5. 【重要】剧本中的每一句对白都必须被分配到某个镜头的 dialogue 字段中，绝对不能遗漏任何台词

严格以 JSON 数组格式输出，不要输出任何其他文字：
[{"shotType":"中景","angle":"平视","action":"主角推开门走进教室","dialogue":"老师：这次考试成绩出来了","duration":"3s","mood":"紧张"}]`;

export async function aiGenerateShots(config: AiConfig, sceneTitle: string, sceneSummary: string, script: string, assetsContext?: string, onDelta?: (text: string) => void): Promise<AiShotResult[]> {
    return withRetry(async () => {
        const systemPrompt = (await getSkillPrompt("sb_shot_generation")) ?? SHOT_GENERATOR_SYSTEM;
        const userContent = [
            `场景：${sceneTitle}`,
            `概要：${sceneSummary}`,
            assetsContext ? `\n相关资产：\n${assetsContext}` : "",
            `\n相关剧本片段：\n${script}`,
            "\n请为该场景设计镜头列表：",
        ].join("\n");
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        return parseJsonArray<AiShotResult>(raw);
    });
}

// ─── Skill: 画面描述生成 ─────────────────────────────────────────

const VISUAL_DESCRIPTOR_SYSTEM = `你是一位视觉描述专家。用户会给你一个镜头的基本信息（景别、角度、动作、氛围）以及该项目的角色/场景/道具资产描述，你需要生成一段详细的画面视觉描述。

要求：
1. 描述要像一段画面说明，涵盖：主体、环境、光线、色彩、构图、材质
2. 必须结合资产信息中的角色外貌、场景环境、道具外观来描述，确保视觉一致性
3. 语言精炼但信息密度高，适合作为 AI 生图的输入
4. 80-150字为佳
5. 直接输出描述文本，不要加引号或前缀`;

export async function aiGenerateVisualDescription(config: AiConfig, shot: { shotType: string; angle: string; action: string; mood?: string; dialogue?: string }, sceneContext: string, assetsContext?: string, onDelta?: (text: string) => void): Promise<string> {
    const systemPrompt = (await getSkillPrompt("sb_visual_description")) ?? VISUAL_DESCRIPTOR_SYSTEM;
    const userContent = [
        `场景背景：${sceneContext}`,
        assetsContext ? `\n项目资产（角色/场景/道具）：\n${assetsContext}` : "",
        `\n镜头信息：景别=${shot.shotType}，角度=${shot.angle}，动作=${shot.action}${shot.mood ? `，氛围=${shot.mood}` : ""}${shot.dialogue ? `，对白="${shot.dialogue}"` : ""}`,
        "\n请生成画面视觉描述：",
    ].join("\n");
    const messages: AiTextMessage[] = [
        { role: "system", content: systemPrompt },
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

转场类型可选：
- cut（硬切）：节奏快、同场景内
- dissolve（叠化）：时间流逝、情绪过渡
- fade_to_black（淡入黑）：章节结束、重大转折
- fade_from_black（黑淡入）：新章节开始
- wipe（划像）：场景大跳转
- match_cut（匹配剪辑）：视觉/动作衔接
- jump_cut（跳切）：同角度时间压缩
- l_cut / j_cut（声音先行/画面先行）：对白衔接

严格以 JSON 格式输出，不要输出任何其他文字。`;

export interface TransitionSuggestion {
    transition: string;
    reason: string;
    duration: string;
}

export async function aiSuggestTransition(config: AiConfig, sceneA: { title: string; summary: string; mood?: string }, sceneB: { title: string; summary: string; mood?: string }, onDelta?: (text: string) => void): Promise<TransitionSuggestion> {
    return withRetry(async () => {
        const systemPrompt = (await getSkillPrompt("sb_transition_advisor")) ?? TRANSITION_ADVISOR_SYSTEM;
        const userContent = `场景A：${sceneA.title}\n概要：${sceneA.summary}${sceneA.mood ? `\n氛围：${sceneA.mood}` : ""}\n\n场景B：${sceneB.title}\n概要：${sceneB.summary}${sceneB.mood ? `\n氛围：${sceneB.mood}` : ""}\n\n请推荐转场方式：`;
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
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
    const parts: string[] = [];
    if (assets.characters.length) {
        parts.push("【角色】");
        assets.characters.forEach((c) => {
            parts.push(`- ${c.name}：${c.appearance}${c.costume ? `，服装：${c.costume}` : ""}${c.keywords ? ` [关键词: ${c.keywords}]` : ""}`);
        });
    }
    if (assets.locations.length) {
        parts.push("【场景】");
        assets.locations.forEach((l) => {
            parts.push(`- ${l.name}：${l.description}${l.timeOfDay ? `，时间：${l.timeOfDay}` : ""}${l.lighting ? `，光线：${l.lighting}` : ""}${l.keywords ? ` [关键词: ${l.keywords}]` : ""}`);
        });
    }
    if (assets.props.length) {
        parts.push("【道具】");
        assets.props.forEach((p) => {
            parts.push(`- ${p.name}：${p.description}${p.significance ? `（${p.significance}）` : ""}${p.keywords ? ` [关键词: ${p.keywords}]` : ""}`);
        });
    }
    return parts.join("\n");
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
