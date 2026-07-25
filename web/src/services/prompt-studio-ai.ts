/**
 * 提示词工作台 AI 服务 - 内置 Skills
 * 按平台定制 system prompt，将画面描述转化为平台专属高质量提示词
 */
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";
import type { PromptGenerateRequest, PromptPlatform } from "@/types/prompt-studio";
import { PLATFORM_LIST, STYLE_PRESETS } from "@/types/prompt-studio";

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
    const platformSkill = PLATFORM_SKILLS[request.platform];
    const platformMeta = PLATFORM_LIST.find((p) => p.id === request.platform);

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
        { role: "system", content: platformSkill },
        { role: "user", content: userContent },
    ];

    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    return parsePromptResult(raw, request.platform);
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
    const results: PromptGenerateResult[] = [];
    for (let i = 0; i < inputs.length; i++) {
        onProgress?.(i, inputs.length);
        const result = await aiGeneratePrompt(config, { input: inputs[i], platform, style, aspectRatio });
        results.push(result);
    }
    onProgress?.(inputs.length, inputs.length);
    return results;
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
