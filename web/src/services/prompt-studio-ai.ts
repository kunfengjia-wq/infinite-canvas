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
    // 直连各平台专属数据集（seed-datasets-v2.mjs / seed-prompt-examples.mjs 已灌入专属示例），
    // 避免不同平台共用同一桶示例导致输出同质化（如 Seedance 误用 Runway 电影示例）。
    const map: Record<string, string> = {
        midjourney: "midjourney",
        "stable-diffusion": "sd",
        comfyui: "sd",
        flux: "flux",
        leonardo: "leonardo",
        "dall-e": "dall-e",
        "gpt-image": "gpt-image",
        ideogram: "ideogram",
        wanx: "wanx",
        kling: "kling",
        hailuo: "hailuo",
        vidu: "vidu",
        runway: "runway",
        pika: "pika",
        sora: "sora",
        veo: "veo",
        luma: "luma",
        seedance: "seedance",
        grok: "grok",
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

// ─── 后端状态查询（供 UI 展示当前生成配置）─────────────────────

/** 查询某平台当前使用的 skill 来源：远程（Supabase）或本地内置 */
export async function getSkillSource(platform: PromptPlatform): Promise<"remote" | "local"> {
    const skillId = `pt_${platform.replace(/-/g, "_")}`;
    const remote = await getSkillPrompt(skillId);
    return remote ? "remote" : "local";
}

/** 查询某平台 few-shot 示例的数据集归属与是否命中 */
export async function getFewShotStatus(platform: PromptPlatform): Promise<{ dataset: string; available: boolean }> {
    const dataset = mapPlatformToDataset(platform);
    try {
        const { count } = await supabase.from("dataset_items").select("*", { count: "exact", head: true }).eq("platform", dataset);
        return { dataset, available: (count ?? 0) > 0 };
    } catch {
        return { dataset, available: false };
    }
}

// ─── 平台专属 System Prompts ─────────────────────────────────────

const PLATFORM_SKILLS: Record<PromptPlatform, string> = {
    midjourney: `你是 Midjourney 提示词专家。将用户描述转化为 Midjourney v6.1 格式的高质量提示词。

规则：
1. 使用自然语言英文描述，像一段画面说明，不用逗号堆标签
2. 结构：主体 → 环境 → 光线 → 风格 → 参数
3. 关键元素可用 ::权重 语法（如 subject::2 background::1）
4. 末尾附加参数：--ar {比例} --v 6.1 --style raw --s {风格化强度，默认 100，风格强烈可提至 250-500}
5. 输出纯提示词文本，不要解释`,

    "stable-diffusion": `你是 Stable Diffusion 提示词专家。将用户描述转化为 SD/SDXL 格式的高质量提示词。

规则：
1. 使用逗号分隔的英文标签
2. 重要元素用权重语法：(tag:1.2) 或 (tag:1.4)
3. 结构：质量标签 → 主体 → 细节 → 环境 → 光线 → 风格
4. 开头加质量标签：masterpiece, best quality, ultra detailed
5. 同时输出高质量负面提示词，覆盖常见缺陷：lowres, bad anatomy, bad hands, extra fingers, missing limbs, blurry, jpeg artifacts, watermark, text, deformed
6. 格式：第一行是正面提示词，第二行以 "Negative:" 开头是负面提示词`,

    comfyui: `你是 ComfyUI 提示词专家。将用户描述转化为兼容 SD 的 ComfyUI 工作流提示词。

规则：
1. 格式与 Stable Diffusion 相同（逗号分隔标签 + 权重）
2. 注意 CLIP 编码兼容性，避免特殊字符
3. 结构：质量标签 → 主体 → 细节 → 环境 → 光线 → 风格
4. 同时输出负面提示词（lowres, bad anatomy, bad hands, extra fingers, blurry, watermark, text 等）
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
5. 聚焦单一连续动态，简洁有力，50-120 words
6. 输出纯提示词文本，不要解释`,

    seedance: `你是 Seedance 视频提示词专家。将用户描述转化为 Seedance 格式的视频提示词。Seedance 的核心是单一动态 + 强烈节奏感，舞蹈、动作、运动或任何具节奏感的动态皆可。

规则：
1. 使用英文描述
2. 重点：动作节奏、身体动态、音乐感、流畅性
3. 描述动作的起止和过渡（starting from..., transitions into..., ending with...）
4. 包含风格关键词：smooth, energetic, graceful, powerful
5. 聚焦一个核心动态，50-100 words
6. 输出纯提示词文本，不要解释`,

    pika: `你是 Pika 视频提示词专家。将用户描述转化为 Pika 格式的视频提示词。

规则：
1. 使用英文简洁描述
2. 结构：主体 + 动作 + 环境 + 风格
3. 可附加参数：-motion {1-4} -ar {比例}
4. 聚焦单一动态，简洁直接，30-80 words
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
3. 结尾加画质词：高清、细腻、精致、电影质感、超高清细节
4. 同时输出中文负面提示词，以 "负面提示词：" 开头另起一行（如：低质量、模糊、变形、卡通、水印、文字）
5. 80-200字
6. 输出纯提示词文本，不要解释`,

    flux: `你是 Flux 提示词专家。将用户描述转化为 Flux 格式的高质量提示词。

规则：
1. 使用英文，以流畅自然语言为主、少量标签点缀，不堆砌质量词
2. Flux 对自然语言理解强，用描述性句子刻画主体、细节、环境、光线
3. 重要元素可用权重语法：(tag:1.2)
4. 结构：主体描述 → 细节 → 环境 → 光线 → 风格
5. 同时输出负面提示词（Negative Prompt）
6. 格式：第一行是正面提示词，第二行以 "Negative:" 开头是负面提示词
7. 输出纯提示词文本，不要解释`,

    ideogram: `你是 Ideogram 提示词专家。将用户描述转化为 Ideogram 格式的高质量提示词。

规则：
1. 使用英文自然语言描述
2. Ideogram 擅长文字渲染：如需包含文字，必须用英文引号明确标注（如 a logo with the text "BREW"），并说明字体风格与排版位置
3. 结构：主体 → 文字（如有）→ 风格 → 构图 → 色彩
4. 强调设计感和排版美学
5. 50-150 words
6. 输出纯提示词文本，不要解释`,

    leonardo: `你是 Leonardo AI 提示词专家。将用户描述转化为 Leonardo AI 格式的高质量提示词。

规则：
1. 使用英文，标签 + 自然语言混合
2. 重要元素用权重语法：(tag:1.2)
3. 结构：质量标签 → 主体 → 细节 → 环境 → 风格
4. 适合游戏资产、概念艺术、角色设计，可注明 concept art, game asset, multiple views
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
5. 聚焦单一连续镜头的核心动态，描述时间维度上的动态变化，避免多事件流水账
6. 80-200 words
7. 输出纯提示词文本，不要解释`,

    veo: `你是 Google Veo 视频提示词专家。将用户描述转化为 Veo 格式的视频提示词。

规则：
1. 使用英文自然语言描述
2. 强调物理真实感：真实的光影、材质、运动物理
3. 结构：场景 → 主体 → 动作 → 镜头 → 光线 → 氛围
4. 包含镜头运动：tracking, dolly, pan, tilt, crane
5. 描述材质和光线交互：reflections, shadows, volumetric light
6. 聚焦单一动态，80-180 words
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
5. 聚焦单一动态，50-150 words
6. 输出纯提示词文本，不要解释`,

    grok: `你是 Grok Imagine（xAI）视频提示词专家。将用户描述转化为 Grok Imagine 视频生成的高质量提示词。

规则：
1. 使用英文自然语言描述
2. 结构：Subject → Action → Environment → Camera movement → Lighting/Mood
3. 强调动态与镜头运动：tracking shot, dolly in, pan, tilt, slow motion
4. 描述时间维度上的变化（开始→过程→结束）
5. 电影感关键词：cinematic, realistic, high detail
6. 聚焦单一连续动态，50-150 words
7. 输出纯提示词文本，不要解释`,
};

// ─── 生成提示词 ──────────────────────────────────────────────────

export type PromptGenerateResult = {
    prompt: string;
    negativePrompt?: string;
    /** 中文对照：提示词正文的通俗中文翻译 */
    translation?: string;
};

// ─── 跨平台通用铁律（所有平台 skill 之外统一注入）────────────────

/**
 * 通用铁律：纠正各平台共性问题——角色名无视觉意义、抽象情绪无法渲染、超长、多元素堆砌。
 * 在 aiGeneratePrompt 调用处拼接，不依赖 skill 内容，远程/本地 skill 均生效。
 */
const UNIVERSAL_RULES_COMMON = `

【通用铁律（所有平台必须遵守，优先级高于参考示例）】
1. 角色/产品的专有名字（如“林悦”“陈朗”）对生成模型没有任何视觉意义，必须替换为具体外观描述（性别、发色发型、服装、体型、配饰等）。
2. 抽象情绪与叙事意图（嘲讽、悬念、张力、悲伤、对峙）无法被直接渲染，必须转化为可见的肢体动作、面部表情或具体视觉元素。
3. 严格遵守本平台的字数/长度上限，宁短勿长，超出一律精简。
4. 只表现一个主体明确的画面，不要罗列多个互不相关的元素。`;

const UNIVERSAL_RULES_VIDEO = `
5. 视频模型一次只生成几秒钟的单一连续镜头。必须从输入中提炼出「一个核心动态」，把多个连续事件压缩为最具代表性的那一个动作过程；严禁把整场戏的多个阶段（如闯入→追逐→掏物→反转）全部塞进一条提示词。
6. 描述动作的起止与过渡（开始→过程→结束），而非静态画面罗列。`;

function getUniversalRules(category: "image" | "video"): string {
    return category === "video" ? UNIVERSAL_RULES_COMMON + UNIVERSAL_RULES_VIDEO : UNIVERSAL_RULES_COMMON;
}

/** 置于 few-shot 示例之后，声明规则优先于示例（利用近因效应强化约束） */
const PRIORITY_OVER_FEWSHOT = `

【重要】以上参考示例仅供风格借鉴；若示例与本平台的格式规则或通用铁律冲突，一律以规则为准，不要模仿示例的长度、叙事方式或结构。`;

/**
 * 中文对照输出格式补充指令。
 * 追加到所有生成类 system prompt 末尾（本地与远程 skill 均生效），
 * 优先级最高，覆盖各平台「不要解释/纯提示词」限制，要求额外输出 [中文对照] 块。
 */
const CHINESE_CONTRAST_SUFFIX = `

【输出格式补充要求（优先级最高，覆盖上文“不要解释”等限制）】
请先输出符合上述平台规则的提示词正文（含负面提示词，如有）；
然后另起一行单独写 [中文对照]，再换行用通俗流畅的中文完整翻译这段提示词所描述的画面内容，方便不懂英文的用户理解与核对。
中文对照只描述画面，不要包含英文标签或平台参数。`;

export async function aiGeneratePrompt(config: AiConfig, request: PromptGenerateRequest, onDelta?: (text: string) => void): Promise<PromptGenerateResult> {
    // 数据驱动：优先从 Supabase skills 表加载，本地硬编码作 fallback
    const skillId = `pt_${request.platform.replace(/-/g, "_")}`;
    const platformSkill = (await getSkillPrompt(skillId)) ?? PLATFORM_SKILLS[request.platform];
    const platformMeta = PLATFORM_LIST.find((p) => p.id === request.platform);

    // 从数据集获取 few-shot 示例，增强生成质量
    const fewShot = await getFewShotExamples(request.platform);
    // 通用铁律按图片/视频区分注入，置于平台 skill 之后、示例之前；优先级声明置于示例之后
    const universal = getUniversalRules(platformMeta?.category ?? "image");
    const systemContent = platformSkill + universal + fewShot + PRIORITY_OVER_FEWSHOT + CHINESE_CONTRAST_SUFFIX;

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
随后另起一行写 [中文对照]，再换行用通俗中文翻译优化后提示词的画面内容
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
    let text = raw.trim();
    let translation: string | undefined;

    // 1. 先分离中文对照块（[中文对照] 之后的内容为通俗中文翻译）
    const contrastMatch = text.match(/\[中文对照\][：:]?\s*/);
    if (contrastMatch && contrastMatch.index !== undefined) {
        translation = text.slice(contrastMatch.index + contrastMatch[0].length).trim() || undefined;
        text = text.slice(0, contrastMatch.index).trim();
    }

    const platformMeta = PLATFORM_LIST.find((p) => p.id === platform);

    // 2. 再在提示词正文内分离负面提示词
    if (platformMeta?.supportsNegative) {
        const negativePatterns = [/Negative:\s*/i, /负面提示词[：:]\s*/, /Negative Prompt:\s*/i];
        for (const pattern of negativePatterns) {
            const match = text.match(pattern);
            if (match && match.index !== undefined) {
                const prompt = text.slice(0, match.index).trim();
                const negativePrompt = text.slice(match.index + match[0].length).trim();
                return { prompt, negativePrompt: negativePrompt || undefined, translation };
            }
        }
    }

    return { prompt: text, translation };
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
