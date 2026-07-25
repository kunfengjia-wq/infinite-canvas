/**
 * 提示词工作台 - 数据模型
 * 功能：将画面描述/概念转化为多平台高质量提示词
 */

/** 支持的提示词目标平台 */
export type PromptPlatform =
    | "midjourney"
    | "stable-diffusion"
    | "comfyui"
    | "kling"
    | "runway"
    | "seedance"
    | "pika"
    | "dall-e"
    | "wanx";

/** 平台元信息 */
export type PlatformMeta = {
    id: PromptPlatform;
    label: string;
    category: "image" | "video";
    description: string;
    supportsNegative: boolean;
    supportsWeight: boolean;
    parameterHints: string[];
};

/** 所有平台元信息 */
export const PLATFORM_LIST: PlatformMeta[] = [
    { id: "midjourney", label: "Midjourney", category: "image", description: "自然语言描述 + 参数后缀", supportsNegative: false, supportsWeight: true, parameterHints: ["--ar 16:9", "--v 6", "--style raw", "--s 250"] },
    { id: "stable-diffusion", label: "Stable Diffusion", category: "image", description: "逗号分隔标签 + 权重语法", supportsNegative: true, supportsWeight: true, parameterHints: ["(tag:1.2)", "Steps: 30", "CFG: 7"] },
    { id: "comfyui", label: "ComfyUI", category: "image", description: "SD 兼容 + 工作流节点", supportsNegative: true, supportsWeight: true, parameterHints: ["(tag:1.2)", "CLIP skip: 2"] },
    { id: "kling", label: "可灵 Kling", category: "video", description: "视频提示词，强调运动与镜头", supportsNegative: false, supportsWeight: false, parameterHints: ["时长 5s/10s", "运动幅度"] },
    { id: "runway", label: "Runway", category: "video", description: "视频生成，自然语言 + 镜头语言", supportsNegative: false, supportsWeight: false, parameterHints: ["duration", "motion"] },
    { id: "seedance", label: "Seedance", category: "video", description: "舞蹈/动作视频，强调节奏与动态", supportsNegative: false, supportsWeight: false, parameterHints: ["时长", "风格"] },
    { id: "pika", label: "Pika", category: "video", description: "短视频生成，简洁描述", supportsNegative: true, supportsWeight: false, parameterHints: ["-motion 2", "-ar 16:9"] },
    { id: "dall-e", label: "DALL-E", category: "image", description: "自然语言段落，简洁直接", supportsNegative: false, supportsWeight: false, parameterHints: ["size: 1024x1024"] },
    { id: "wanx", label: "通义万相", category: "image", description: "中文自然语言描述", supportsNegative: true, supportsWeight: false, parameterHints: ["尺寸", "风格"] },
];

/** 风格预设 */
export type StylePreset = {
    id: string;
    label: string;
    keywords: string;
    category: "image" | "video" | "both";
};

/** 内置风格预设 */
export const STYLE_PRESETS: StylePreset[] = [
    { id: "cinematic", label: "电影感", keywords: "cinematic lighting, film grain, anamorphic lens, dramatic composition", category: "both" },
    { id: "anime", label: "动漫", keywords: "anime style, cel shading, vibrant colors, detailed eyes", category: "image" },
    { id: "realistic", label: "写实", keywords: "photorealistic, 8k, ultra detailed, natural lighting", category: "image" },
    { id: "watercolor", label: "水彩", keywords: "watercolor painting, soft edges, pastel colors, artistic", category: "image" },
    { id: "scifi", label: "科幻", keywords: "sci-fi, futuristic, neon lights, cyberpunk, high tech", category: "both" },
    { id: "fantasy", label: "奇幻", keywords: "fantasy art, magical, ethereal glow, epic scene", category: "both" },
    { id: "minimalist", label: "极简", keywords: "minimalist, clean composition, negative space, simple", category: "image" },
    { id: "documentary", label: "纪录片", keywords: "documentary style, handheld camera, natural light, raw footage", category: "video" },
    { id: "commercial", label: "商业广告", keywords: "commercial quality, product shot, studio lighting, premium", category: "both" },
    { id: "vintage", label: "复古", keywords: "vintage, retro, film photography, warm tones, nostalgic", category: "both" },
];

/** 提示词分类 */
export type PromptCategory = "character" | "scene" | "prop" | "action" | "mood" | "camera" | "general";

/** 分类元信息 */
export const PROMPT_CATEGORIES: { id: PromptCategory; label: string; color: string }[] = [
    { id: "character", label: "人物", color: "magenta" },
    { id: "scene", label: "场景", color: "blue" },
    { id: "prop", label: "道具", color: "orange" },
    { id: "action", label: "动作", color: "green" },
    { id: "mood", label: "氛围", color: "purple" },
    { id: "camera", label: "镜头", color: "cyan" },
    { id: "general", label: "通用", color: "default" },
];

/** 单条提示词条目 */
export type PromptEntry = {
    id: string;
    input: string;
    platform: PromptPlatform;
    prompt: string;
    negativePrompt?: string;
    parameters?: Record<string, string>;
    style?: string;
    category: PromptCategory;
    createdAt: string;
};

/** 提示词项目（一次批量任务） */
export type PromptProject = {
    id: string;
    title: string;
    sourceType: "manual" | "storyboard" | "asset";
    sourceId?: string;
    entries: PromptEntry[];
    createdAt: string;
    updatedAt: string;
};

/** 提示词生成请求 */
export type PromptGenerateRequest = {
    input: string;
    platform: PromptPlatform;
    style?: string;
    aspectRatio?: string;
    extraInstructions?: string;
};
