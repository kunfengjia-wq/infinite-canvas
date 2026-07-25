/**
 * 分镜工作台 AI 服务 - 内置 Skills
 * 每个步骤对应一个专用 system prompt，调用 requestImageQuestion 流式接口
 */
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";
import type { AiSceneResult, AiShotResult, StoryAssets } from "@/types/storyboard";

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
    const messages: AiTextMessage[] = [
        { role: "system", content: ASSET_EXTRACTOR_SYSTEM },
        { role: "user", content: `请从以下剧本中提取视觉资产：\n\n${script}` },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    return parseJsonObject<StoryAssets>(raw);
}

// ─── Skill: 场景拆分 ─────────────────────────────────────────────

const SCENE_SPLITTER_SYSTEM = `你是一位专业的影视分镜师。用户会给你一段剧本/故事文本，你需要将其拆分为独立的场景。

要求：
1. 每个场景代表一个连续的时空单元（同一地点、同一时间段）
2. 场景标题格式："第N场：地点/时间"（如"第1场：教室-白天"）
3. summary 用1-2句话概括该场景的核心内容
4. 合理拆分，不要过细（一般3-15个场景）

严格以 JSON 数组格式输出，不要输出任何其他文字：
[{"title": "第1场：教室-白天", "summary": "老师宣布考试成绩，主角紧张地等待"}]`;

export async function aiSplitScenes(config: AiConfig, script: string, onDelta?: (text: string) => void): Promise<AiSceneResult[]> {
    const messages: AiTextMessage[] = [
        { role: "system", content: SCENE_SPLITTER_SYSTEM },
        { role: "user", content: `请将以下剧本拆分为场景：\n\n${script}` },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    return parseJsonArray<AiSceneResult>(raw);
}

// ─── Skill: 镜头生成 ─────────────────────────────────────────────

const SHOT_GENERATOR_SYSTEM = `你是一位专业的分镜师。用户会给你一个场景的描述和相关资产信息，你需要为该场景设计具体的镜头列表。

每个镜头包含：
- shotType: 景别（远景/全景/中景/近景/特写/大特写）
- angle: 角度（平视/俯视/仰视/斜角/鸟瞰/低角度）
- action: 画面中的动作描述（具体、可视化）
- dialogue: 对白（可选，没有则为空字符串）
- duration: 预估时长（如"3s"、"5s"）
- mood: 情绪氛围（如"紧张"、"温馨"、"压抑"）

要求：
1. 每个场景一般3-8个镜头
2. 注意景别和角度的变化节奏（不要全是中景平视）
3. action 描述要具体可视化，像在给摄影师下指令
4. 结合角色资产信息，确保动作描述与角色外貌/性格一致

严格以 JSON 数组格式输出，不要输出任何其他文字：
[{"shotType":"中景","angle":"平视","action":"主角推开门走进教室","dialogue":"","duration":"3s","mood":"紧张"}]`;

export async function aiGenerateShots(config: AiConfig, sceneTitle: string, sceneSummary: string, script: string, assetsContext?: string, onDelta?: (text: string) => void): Promise<AiShotResult[]> {
    const userContent = [
        `场景：${sceneTitle}`,
        `概要：${sceneSummary}`,
        assetsContext ? `\n相关资产：\n${assetsContext}` : "",
        `\n相关剧本片段：\n${script}`,
        "\n请为该场景设计镜头列表：",
    ].join("\n");
    const messages: AiTextMessage[] = [
        { role: "system", content: SHOT_GENERATOR_SYSTEM },
        { role: "user", content: userContent },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    return parseJsonArray<AiShotResult>(raw);
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
    const userContent = [
        `场景背景：${sceneContext}`,
        assetsContext ? `\n项目资产（角色/场景/道具）：\n${assetsContext}` : "",
        `\n镜头信息：景别=${shot.shotType}，角度=${shot.angle}，动作=${shot.action}${shot.mood ? `，氛围=${shot.mood}` : ""}${shot.dialogue ? `，对白="${shot.dialogue}"` : ""}`,
        "\n请生成画面视觉描述：",
    ].join("\n");
    const messages: AiTextMessage[] = [
        { role: "system", content: VISUAL_DESCRIPTOR_SYSTEM },
        { role: "user", content: userContent },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    return raw.trim();
}

// ─── 工具函数 ────────────────────────────────────────────────────

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
