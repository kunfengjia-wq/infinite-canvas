/**
 * 提示词工作台 AI 服务 - 内置 Skills
 * 按平台定制 system prompt，将画面描述转化为平台专属高质量提示词
 */
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";
import type { PromptGenerateRequest, PromptPlatform } from "@/types/prompt-studio";
import { PLATFORM_LIST, STYLE_PRESETS } from "@/types/prompt-studio";
import { supabase } from "@/services/db/supabase-client";
import { getSkillPrompt } from "@/services/db/skills-repo";
import { recordGeneration } from "@/services/db/history-repo";

// ─── Few-shot 示例（从 Supabase 数据集获取）─────────────────────

/** 将提示词平台映射到数据集 platform 标识 */
function mapPlatformToDataset(platform: PromptPlatform): string {
    const map: Record<string, string> = {
        midjourney: "midjourney",
        "stable-diffusion": "sd",
        comfyui: "sd",
        flux: "sd",
        kling: "kling",
        hailuo: "kling",
        vidu: "kling",
        runway: "runway",
        pika: "runway",
        sora: "runway",
        veo: "runway",
        luma: "runway",
        seedance: "runway",
    };
    return map[platform] || "general";
}

/** 缓存已获取的示例，避免重复请求 */
const fewShotCache = new Map<string, string>();

async function getFewShotExamples(platform: PromptPlatform): Promise<string> {
    const datasetPlatform = mapPlatformToDataset(platform);
    const cached = fewShotCache.get(datasetPlatform);
    if (cached !== undefined) return cached;

    try {
        const { data } = await supabase
            .from("dataset_items")
            .select("title, prompt, negative_prompt")
            .eq("platform", datasetPlatform)
            .order("quality_score", { ascending: false })
            .limit(3);

        if (!data || data.length === 0) {
            fewShotCache.set(datasetPlatform, "");
            return "";
        }

        const examples = data
            .map((item: { title: string; prompt: string; negative_prompt?: string }, i: number) => {
                let text = `示例${i + 1}（${item.title}）：\n${item.prompt}`;
                if (item.negative_prompt) text += `\nNegative: ${item.negative_prompt}`;
                return text;
            })
            .join("\n\n");

        const result = `\n\n以下是高质量参考示例，请模仿其风格和结构：\n\n${examples}`;
        fewShotCache.set(datasetPlatform, result);
        return result;
    } catch {
        fewShotCache.set(datasetPlatform, "");
        return "";
    }
}

// ─── 平台专属 System Prompts ─────────────────────────────────────

const PLATFORM_SKILLS: Record<PromptPlatform, string> = {
    midjourney: `你是 Midjourney 提示词专家。将用户描述转化为 Midjourney v6 格式的高质量提示词。

规则：
1. 使用自然语言英文描述，像一段画面说明
2. 结构：主体 → 环境 → 光线 → 风格 → 参数
3. 末尾附加参数：--ar {比例} --v 6 --style raw（如适用）
4. 不使用逗号分隔标签，用流畅的英文句子
5. 关键元素可用 ::权重 语法（如 subject::2 background::1）
6. 输出纯提示词文本，不要解释`,

    "stable-diffusion": `你是 Stable Diffusion 提示词专家。将用户描述转化为 SD/SDXL 格式的高质量提示词。

规则：
1. 使用逗号分隔的英文标签
2. 重要元素用权重语法：(tag:1.2) 或 (tag:1.4)
3. 结构：质量标签 → 主体 → 细节 → 环境 → 光线 → 风格
4. 开头加质量标签：masterpiece, best quality, ultra detailed
5. 同时输出负面提示词（Negative Prompt）
6. 格式：第一行是正面提示词，第二行以 "Negative:" 开头是负面提示词`,

    comfyui: `你是 ComfyUI 提示词专家。将用户描述转化为兼容 SD 的 ComfyUI 工作流提示词。

规则：
1. 格式与 Stable Diffusion 相同（逗号分隔标签 + 权重）
2. 注意 CLIP 编码兼容性，避免特殊字符
3. 结构：质量标签 → 主体 → 细节 → 环境 → 光线 → 风格
4. 同时输出负面提示词
5. 格式：第一行是正面提示词，第二行以 "Negative:" 开头是负面提示词`,

    kling: `你是可灵(Kling)视频提示词专家。将用户描述转化为可灵视频生成的高质量提示词。

规则：
1. 使用中文或英文自然语言描述
2. 重点描述：运动轨迹、镜头运动、主体动作、场景变化
3. 包含镜头语言：推/拉/摇/移/跟/升/降
4. 描述时间维度上的变化（开始→过程→结束）
5. 80-200字为佳
6. 输出纯提示词文本，不要解释`,

    runway: `你是 Runway Gen-3 视频提示词专家。将用户描述转化为 Runway 格式的视频提示词。

规则：
1. 使用英文自然语言描述
2. 结构：Camera movement → Subject action → Environment → Mood/Lighting
3. 强调动态：motion, movement, transition
4. 包含镜头运动描述：tracking shot, dolly in, pan left, tilt up
5. 简洁有力，50-120 words
6. 输出纯提示词文本，不要解释`,

    seedance: `你是 Seedance 视频提示词专家。将用户描述转化为 Seedance 格式的视频/舞蹈提示词。

规则：
1. 使用英文描述
2. 重点：动作节奏、身体动态、音乐感、流畅性
3. 描述动作的起止和过渡
4. 包含风格关键词：smooth, energetic, graceful, powerful
5. 50-100 words
6. 输出纯提示词文本，不要解释`,

    pika: `你是 Pika 视频提示词专家。将用户描述转化为 Pika 格式的视频提示词。

规则：
1. 使用英文简洁描述
2. 结构：主体 + 动作 + 环境 + 风格
3. 可附加参数：-motion {1-4} -ar {比例}
4. 简洁直接，30-80 words
5. 如需负面提示词，以 "Negative:" 开头另起一行
6. 输出纯提示词文本，不要解释`,

    "dall-e": `你是 DALL-E 3 提示词专家。将用户描述转化为 DALL-E 3 格式的高质量提示词。

规则：
1. 使用英文自然语言段落描述
2. 像在给一位画家描述想要的画面
3. 涵盖：主体、动作、环境、光线、色彩、风格、构图
4. 不使用标签或参数语法
5. 100-200 words
6. 输出纯提示词文本，不要解释`,

    wanx: `你是通义万相提示词专家。将用户描述转化为通义万相格式的高质量中文提示词。

规则：
1. 使用中文自然语言描述
2. 结构：主体 → 动作 → 环境 → 光线 → 风格 → 画质
3. 可包含画质词：高清、细腻、精致、电影质感
4. 如需负面提示词，以 "负面提示词：" 开头另起一行
5. 80-200字
6. 输出纯提示词文本，不要解释`,

    flux: `你是 Flux 提示词专家。将用户描述转化为 Flux 2 格式的高质量提示词。

规则：
1. 使用英文，自然语言与标签混合
2. 重要元素可用权重语法：(tag:1.2)
3. 结构：主体描述 → 细节 → 环境 → 光线 → 风格
4. 同时输出负面提示词（Negative Prompt）
5. 格式：第一行是正面提示词，第二行以 "Negative:" 开头是负面提示词
6. 输出纯提示词文本，不要解释`,

    ideogram: `你是 Ideogram 提示词专家。将用户描述转化为 Ideogram 格式的高质量提示词。

规则：
1. 使用英文自然语言描述
2. 擅长文字渲染，如需包含文字请明确标注
3. 结构：主体 → 风格 → 构图 → 色彩
4. 强调设计感和排版美学
5. 50-150 words
6. 输出纯提示词文本，不要解释`,

    leonardo: `你是 Leonardo AI 提示词专家。将用户描述转化为 Leonardo AI 格式的高质量提示词。

规则：
1. 使用英文，标签 + 自然语言混合
2. 重要元素用权重语法：(tag:1.2)
3. 结构：质量标签 → 主体 → 细节 → 环境 → 风格
4. 适合游戏资产、概念艺术、角色设计
5. 同时输出负面提示词
6. 格式：第一行是正面提示词，第二行以 "Negative:" 开头是负面提示词`,

    "gpt-image": `你是 GPT Image 提示词专家。将用户描述转化为 OpenAI GPT Image 格式的高质量提示词。

规则：
1. 使用英文自然语言段落描述
2. 像在给一位画家详细描述想要的画面
3. 涵盖：主体、动作、环境、光线、色彩、风格、构图
4. 不使用标签或参数语法，纯自然语言
5. 100-250 words
6. 输出纯提示词文本，不要解释`,

    sora: `你是 Sora 视频提示词专家。将用户描述转化为 OpenAI Sora 格式的电影级视频提示词。

规则：
1. 使用英文自然语言描述
2. 像写一段电影场景说明
3. 结构：场景设定 → 主体动作 → 镜头运动 → 光线氛围 → 时间变化
4. 强调电影感：cinematic, film quality, dramatic lighting
5. 描述时间维度上的动态变化
6. 80-200 words
7. 输出纯提示词文本，不要解释`,

    veo: `你是 Google Veo 视频提示词专家。将用户描述转化为 Veo 格式的视频提示词。

规则：
1. 使用英文自然语言描述
2. 强调物理真实感：真实的光影、材质、运动物理
3. 结构：场景 → 主体 → 动作 → 镜头 → 光线 → 氛围
4. 包含镜头运动：tracking, dolly, pan, tilt, crane
5. 描述材质和光线交互：reflections, shadows, volumetric light
6. 80-180 words
7. 输出纯提示词文本，不要解释`,

    hailuo: `你是海螺(Hailuo/MiniMax)视频提示词专家。将用户描述转化为海螺视频生成的高质量提示词。

规则：
1. 可使用中文或英文自然语言描述
2. 重点描述：运动轨迹、主体动作、场景变化
3. 包含镜头语言：推/拉/摇/移/跟/升/降
4. 描述时间维度上的变化（开始→过程→结束）
5. 80-200字为佳
6. 输出纯提示词文本，不要解释`,

    vidu: `你是 Vidu 视频提示词专家。将用户描述转化为 Vidu 格式的视频提示词。

规则：
1. 使用中文或英文简洁描述
2. 结构：主体 + 动作 + 环境 + 风格
3. 简洁直接，突出核心动态
4. 40-120字/words
5. 输出纯提示词文本，不要解释`,

    luma: `你是 Luma Dream Machine 视频提示词专家。将用户描述转化为 Luma 格式的视频提示词。

规则：
1. 使用英文自然语言描述
2. 结构：Subject → Action → Environment → Camera movement → Style
3. 强调运动流畅性和风格化
4. 包含镜头运动描述
5. 50-150 words
6. 输出纯提示词文本，不要解释`,
};

// ─── 生成提示词 ──────────────────────────────────────────────────

export type PromptGenerateResult = {
    prompt: string;
    negativePrompt?: string;
};

export async function aiGeneratePrompt(config: AiConfig, request: PromptGenerateRequest, onDelta?: (text: string) => void): Promise<PromptGenerateResult> {
    // 数据驱动：优先从 Supabase skills 表加载，本地硬编码作 fallback
    const skillId = `pt_${request.platform.replace(/-/g, "_")}`;
    const platformSkill = (await getSkillPrompt(skillId)) ?? PLATFORM_SKILLS[request.platform];
    const platformMeta = PLATFORM_LIST.find((p) => p.id === request.platform);

    // 从数据集获取 few-shot 示例，增强生成质量
    const fewShot = await getFewShotExamples(request.platform);
    const systemContent = platformSkill + fewShot;

    // 构建用户消息
    let userContent = `原始描述：${request.input}`;
    if (request.style) {
        const stylePreset = STYLE_PRESETS.find((s) => s.id === request.style);
        if (stylePreset) userContent += `\n风格要求：${stylePreset.label}（${stylePreset.keywords}）`;
    }
    if (request.aspectRatio) userContent += `\n画面比例：${request.aspectRatio}`;
    if (request.extraInstructions) userContent += `\n额外要求：${request.extraInstructions}`;
    if (platformMeta) userContent += `\n目标平台：${platformMeta.label}（${platformMeta.description}）`;

    const messages: AiTextMessage[] = [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
    ];

    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    const result = parsePromptResult(raw, request.platform);

    // 自动记录生成历史（fire-and-forget）
    recordGeneration({
        skillId,
        inputText: request.input,
        outputText: result.prompt,
        platform: request.platform,
        model: config.model,
    });

    return result;
}

// ─── 批量生成 ────────────────────────────────────────────────────

export async function aiBatchGeneratePrompts(
    config: AiConfig,
    inputs: string[],
    platform: PromptPlatform,
    style?: string,
    aspectRatio?: string,
    onProgress?: (index: number, total: number) => void,
): Promise<PromptGenerateResult[]> {
    const results: PromptGenerateResult[] = new Array(inputs.length);
    const CONCURRENCY = 3;
    let completed = 0;

    // 分批并发，每批最多 CONCURRENCY 个
    for (let i = 0; i < inputs.length; i += CONCURRENCY) {
        const batch = inputs.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(
            batch.map((input) => aiGeneratePrompt(config, { input, platform, style, aspectRatio })),
        );
        batchResults.forEach((result, j) => {
            const idx = i + j;
            if (result.status === "fulfilled") {
                results[idx] = result.value;
            } else {
                results[idx] = { prompt: `[生成失败] ${result.reason?.message || "未知错误"}` };
            }
            completed++;
            onProgress?.(completed, inputs.length);
        });
    }

    return results;
}

// ─── Skill: 提示词优化/改写 ───────────────────────────────────────

const PROMPT_OPTIMIZER_SYSTEM = `你是 AI 提示词优化专家。对用户提供的提示词进行质量优化和改写。

优化方向：
1. 补充缺失的细节（光线、材质、构图、氛围）
2. 调整结构使其更符合目标平台的最佳实践
3. 增强关键词的精确性和信息密度
4. 去除冗余或矛盾的表述
5. 保持原始创意意图不变

输出格式：
第一行：优化后的提示词
第二行（如有负面提示词）：Negative: ...
最后一行：[优化说明] 简要说明做了哪些改进（一句话）`;

export async function aiOptimizePrompt(config: AiConfig, prompt: string, platform: PromptPlatform, onDelta?: (text: string) => void): Promise<PromptGenerateResult & { note?: string }> {
    const skillId = "pt_prompt_optimizer";
    const systemPrompt = (await getSkillPrompt(skillId)) ?? PROMPT_OPTIMIZER_SYSTEM;
    const platformMeta = PLATFORM_LIST.find((p) => p.id === platform);
    const userContent = `目标平台：${platformMeta?.label ?? platform}\n\n待优化提示词：\n${prompt}\n\n请优化这段提示词：`;
    const messages: AiTextMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    return parseOptimizeResult(raw, platform);
}

// ─── Skill: 质量评分 ─────────────────────────────────────────────

const QUALITY_SCORER_SYSTEM = `你是 AI 提示词质量评审专家。对给定的提示词进行多维度评分并给出改进建议。

评分维度（每项 1-10 分）：
1. clarity（清晰度）：描述是否明确无歧义
2. detail（细节丰富度）：是否包含足够的视觉信息
3. structure（结构性）：是否符合目标平台的最佳格式
4. creativity（创意性）：是否有独特的视觉想象
5. feasibility（可行性）：AI 是否能准确理解和执行

输出严格 JSON 格式：
{"scores":{"clarity":8,"detail":7,"structure":9,"creativity":6,"feasibility":8},"overall":7.6,"suggestions":["建议1","建议2","建议3"]}

不要输出任何其他文字。`;

export interface QualityScoreResult {
    scores: {
        clarity: number;
        detail: number;
        structure: number;
        creativity: number;
        feasibility: number;
    };
    overall: number;
    suggestions: string[];
}

export async function aiScorePrompt(config: AiConfig, prompt: string, platform: PromptPlatform, onDelta?: (text: string) => void): Promise<QualityScoreResult> {
    const skillId = "pt_quality_scorer";
    const systemPrompt = (await getSkillPrompt(skillId)) ?? QUALITY_SCORER_SYSTEM;
    const platformMeta = PLATFORM_LIST.find((p) => p.id === platform);
    const userContent = `目标平台：${platformMeta?.label ?? platform}\n\n待评分提示词：\n${prompt}\n\n请进行质量评分：`;
    const messages: AiTextMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    return parseJsonResult<QualityScoreResult>(raw);
}

// ─── Skill: 风格迁移（跨平台转换）─────────────────────────────────

const STYLE_TRANSFER_SYSTEM = `你是跨平台提示词转换专家。将一个平台的提示词转换为目标平台的格式和风格。

转换规则：
1. 保留原始创意和视觉意图
2. 调整格式以符合目标平台规范（如 Midjourney 用自然语言，SD 用标签+权重）
3. 添加目标平台特有的参数或语法
4. 如目标平台支持负面提示词，生成合适的负面提示词
5. 调整描述长度以匹配目标平台的最佳实践

输出格式：
第一行：转换后的提示词
第二行（如适用）：Negative: ...`;

export async function aiTransferStyle(config: AiConfig, prompt: string, sourcePlatform: PromptPlatform, targetPlatform: PromptPlatform, onDelta?: (text: string) => void): Promise<PromptGenerateResult> {
    const skillId = "pt_style_transfer";
    const systemPrompt = (await getSkillPrompt(skillId)) ?? STYLE_TRANSFER_SYSTEM;
    const sourceMeta = PLATFORM_LIST.find((p) => p.id === sourcePlatform);
    const targetMeta = PLATFORM_LIST.find((p) => p.id === targetPlatform);
    const userContent = `源平台：${sourceMeta?.label ?? sourcePlatform}\n目标平台：${targetMeta?.label ?? targetPlatform}\n\n原始提示词：\n${prompt}\n\n请转换为目标平台格式：`;
    const messages: AiTextMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    return parsePromptResult(raw, targetPlatform);
}

// ─── 工具函数 ────────────────────────────────────────────────────

function parsePromptResult(raw: string, platform: PromptPlatform): PromptGenerateResult {
    const text = raw.trim();
    const platformMeta = PLATFORM_LIST.find((p) => p.id === platform);

    // 尝试分离负面提示词
    if (platformMeta?.supportsNegative) {
        const negativePatterns = [/Negative:\s*/i, /负面提示词[：:]\s*/, /Negative Prompt:\s*/i];
        for (const pattern of negativePatterns) {
            const match = text.match(pattern);
            if (match && match.index !== undefined) {
                const prompt = text.slice(0, match.index).trim();
                const negativePrompt = text.slice(match.index + match[0].length).trim();
                return { prompt, negativePrompt: negativePrompt || undefined };
            }
        }
    }

    return { prompt: text };
}

function parseOptimizeResult(raw: string, platform: PromptPlatform): PromptGenerateResult & { note?: string } {
    const text = raw.trim();
    // 提取优化说明（最后一行 [优化说明] ...）
    const noteMatch = text.match(/\[优化说明\]\s*(.+)$/m);
    const note = noteMatch?.[1]?.trim();
    const contentWithoutNote = noteMatch ? text.slice(0, noteMatch.index).trim() : text;
    const result = parsePromptResult(contentWithoutNote, platform);
    return { ...result, note };
}

function parseJsonResult<T>(raw: string): T {
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
