/**
 * 提示词工作台 - 数据模型
 */

/** 提示词分类 */
export type PromptCategory = "character" | "scene" | "prop" | "product" | "action" | "mood" | "camera" | "style" | "general";

/** 分类元信息 */
export const PROMPT_CATEGORIES: { id: PromptCategory; label: string; color: string }[] = [
    { id: "character", label: "角色", color: "magenta" },
    { id: "scene", label: "场景", color: "blue" },
    { id: "prop", label: "道具", color: "orange" },
    { id: "product", label: "产品", color: "gold" },
    { id: "action", label: "动作", color: "green" },
    { id: "mood", label: "氛围", color: "purple" },
    { id: "camera", label: "镜头", color: "cyan" },
    { id: "style", label: "风格", color: "volcano" },
    { id: "general", label: "通用", color: "default" },
];

/** 平台分类 */
export type PlatformCategory = "image" | "video";

/** 平台信息 */
export type PlatformMeta = {
    id: string;
    label: string;
    category: PlatformCategory;
    description: string;
    supportsNegative?: boolean;
    maxLength?: number;
};

/** 支持的平台列表 */
export const PLATFORM_LIST: PlatformMeta[] = [
    // 图片平台
    { id: "midjourney", label: "Midjourney", category: "image", description: "艺术感强，适合概念设计和风格化图像", supportsNegative: false, maxLength: 600 },
    { id: "stable-diffusion", label: "Stable Diffusion", category: "image", description: "开源可控，支持标签式提示词和负面提示词", supportsNegative: true, maxLength: 500 },
    { id: "dall-e", label: "DALL-E 3", category: "image", description: "自然语言描述，理解力强", supportsNegative: false, maxLength: 400 },
    { id: "flux", label: "Flux", category: "image", description: "高质量开源模型，细节丰富", supportsNegative: true, maxLength: 500 },
    { id: "ideogram", label: "Ideogram", category: "image", description: "文字渲染能力强，适合海报设计", supportsNegative: false, maxLength: 400 },
    { id: "leonardo", label: "Leonardo AI", category: "image", description: "游戏资产和概念设计", supportsNegative: true, maxLength: 500 },
    { id: "gpt-image", label: "GPT Image", category: "image", description: "OpenAI 最新图像生成", supportsNegative: false, maxLength: 400 },
    { id: "gemini", label: "Google Gemini Image", category: "image", description: "Google Gemini 原生图像生成与编辑，支持多轮对话式生图", supportsNegative: false, maxLength: 500 },
    { id: "wanx", label: "通义万相", category: "image", description: "阿里通义，中文理解好", supportsNegative: true, maxLength: 500 },
    // 视频平台
    { id: "kling", label: "可灵 Kling", category: "video", description: "快手视频生成，运动控制好", supportsNegative: false, maxLength: 300 },
    { id: "runway", label: "Runway Gen-3", category: "video", description: "专业视频生成，镜头语言丰富", supportsNegative: false, maxLength: 300 },
    { id: "pika", label: "Pika", category: "video", description: "轻量视频生成，适合短片段", supportsNegative: false, maxLength: 200 },
    { id: "sora", label: "Sora", category: "video", description: "OpenAI 视频生成，电影级质量", supportsNegative: false, maxLength: 400 },
    { id: "veo", label: "Google Veo", category: "video", description: "Google 视频生成，物理真实感强", supportsNegative: false, maxLength: 300 },
    { id: "hailuo", label: "海螺 MiniMax", category: "video", description: "MiniMax海螺视频生成，支持语音合成、情感控制、多镜头", supportsNegative: false, maxLength: 300 },
    { id: "vidu", label: "Vidu", category: "video", description: "生数科技视频生成", supportsNegative: false, maxLength: 300 },
    { id: "luma", label: "Luma", category: "video", description: "3D 理解能力强", supportsNegative: false, maxLength: 300 },
    { id: "seedance", label: "Seedance 2.5", category: "video", description: "字节跳动音画联合生成v2.5，支持对白唇形同步、多镜头串联、环境音、音画节奏联动", supportsNegative: false, maxLength: 400 },
    { id: "grok", label: "Grok", category: "video", description: "xAI Grok Imagine 视频生成，写实电影感", supportsNegative: false, maxLength: 300 },
];

/** 提示词平台类型（联合类型） */
export type PromptPlatform = (typeof PLATFORM_LIST)[number]["id"];

/** 风格预设 */
export type StylePreset = {
    id: string;
    label: string;
    keywords: string;
    category: string;
    /** 适用媒体类型：图片/视频/两者皆可，用于按所选平台过滤 */
    mediaType: "image" | "video" | "both";
};

/** 扩展风格预设（30+，覆盖写实/动画/艺术流派/文化/科幻/现代设计） */
export const STYLE_PRESETS: StylePreset[] = [
    // 写实类
    { id: "cinematic_realism", label: "电影写实", keywords: "cinematic, film grain, anamorphic lens, dramatic lighting, shallow depth of field, color graded", category: "写实类", mediaType: "both" },
    { id: "documentary_style", label: "纪录片", keywords: "documentary, handheld camera, natural light, raw footage, observational, vérité", category: "写实类", mediaType: "both" },
    { id: "commercial_photo", label: "商业广告", keywords: "commercial quality, product shot, studio lighting, premium, clean background, high-end", category: "写实类", mediaType: "both" },
    { id: "film_stock", label: "胶片质感", keywords: "film photography, 35mm, kodak portra, fujifilm, grain, warm tones, analog", category: "写实类", mediaType: "both" },
    { id: "fashion_editorial", label: "时尚大片", keywords: "fashion photography, editorial, haute couture, dramatic pose, magazine cover, high fashion", category: "写实类", mediaType: "image" },
    // 动画类
    { id: "anime", label: "日系动漫", keywords: "anime style, cel shading, vibrant colors, detailed eyes, clean lines, manga inspired", category: "动画类", mediaType: "both" },
    { id: "western_comics", label: "美漫", keywords: "comic book style, bold outlines, halftone dots, dynamic action, graphic novel", category: "动画类", mediaType: "both" },
    { id: "3dcg", label: "3DCG", keywords: "3D render, CGI, octane render, stylized 3D, clean topology, smooth geometry, digital sculpture, 3D modeling, vibrant materials, game art", category: "动画类", mediaType: "both" },
    { id: "stop_motion", label: "定格动画", keywords: "stop motion, claymation, miniature, handcrafted, tactile, laika studios", category: "动画类", mediaType: "both" },
    { id: "ink_animation", label: "水墨动画", keywords: "chinese ink animation, brush strokes, flowing ink, traditional animation, ethereal movement", category: "动画类", mediaType: "both" },
    { id: "pixel_art", label: "像素艺术", keywords: "pixel art, 8-bit, 16-bit, retro game, sprite, nostalgic gaming", category: "动画类", mediaType: "both" },
    // 艺术流派
    { id: "impressionism", label: "印象派", keywords: "impressionist painting, visible brushstrokes, light and color, monet, renoir, plein air", category: "艺术流派", mediaType: "image" },
    { id: "expressionism", label: "表现主义", keywords: "expressionist, distorted forms, bold colors, emotional intensity, edvard munch", category: "艺术流派", mediaType: "image" },
    { id: "surrealism", label: "超现实主义", keywords: "surrealist, dreamlike, impossible scenes, dali, magritte, subconscious", category: "艺术流派", mediaType: "both" },
    { id: "pop_art", label: "波普艺术", keywords: "pop art, andy warhol, bold colors, comic style, repetition, consumer culture", category: "艺术流派", mediaType: "image" },
    { id: "rococo", label: "洛可可", keywords: "rococo, ornate, pastel colors, gold leaf, decorative, 18th century, fragonard", category: "艺术流派", mediaType: "image" },
    { id: "baroque", label: "巴洛克", keywords: "baroque, dramatic lighting, rich colors, grandeur, caravaggio, chiaroscuro", category: "艺术流派", mediaType: "image" },
    { id: "art_nouveau", label: "新艺术运动", keywords: "art nouveau, organic curves, floral motifs, alphonse mucha, flowing lines", category: "艺术流派", mediaType: "image" },
    { id: "art_deco", label: "装饰艺术", keywords: "art deco, geometric patterns, gold and black, 1920s, gatsby, symmetrical, luxury", category: "艺术流派", mediaType: "image" },
    // 文化风格
    { id: "chinese_ink", label: "中国水墨", keywords: "chinese ink painting, shan shui, brush and ink, rice paper, negative space, zen minimalism", category: "文化风格", mediaType: "both" },
    { id: "gongbi", label: "工笔重彩", keywords: "gongbi painting, fine brushwork, rich colors, detailed, chinese traditional, silk painting", category: "文化风格", mediaType: "image" },
    { id: "dunhuang", label: "敦煌壁画", keywords: "dunhuang murals, buddhist art, flying apsaras, mineral pigments, ancient chinese", category: "文化风格", mediaType: "image" },
    { id: "ukiyo_e", label: "浮世绘", keywords: "ukiyo-e, japanese woodblock print, hokusai, flat colors, bold outlines", category: "文化风格", mediaType: "image" },
    { id: "persian_miniature", label: "波斯细密画", keywords: "persian miniature, intricate detail, flat perspective, gold illumination, islamic art", category: "文化风格", mediaType: "image" },
    // 科幻/奇幻
    { id: "cyberpunk", label: "赛博朋克", keywords: "cyberpunk, neon lights, rain-soaked streets, holographic, dystopian, blade runner", category: "科幻/奇幻", mediaType: "both" },
    { id: "steampunk", label: "蒸汽朋克", keywords: "steampunk, brass gears, victorian era, steam powered, mechanical, copper pipes", category: "科幻/奇幻", mediaType: "both" },
    { id: "solarpunk", label: "太阳朋克", keywords: "solarpunk, green technology, sustainable, plants and tech harmony, optimistic future", category: "科幻/奇幻", mediaType: "both" },
    { id: "gothic", label: "哥特", keywords: "gothic, dark architecture, pointed arches, stained glass, dramatic shadows, medieval", category: "科幻/奇幻", mediaType: "both" },
    { id: "dark_fantasy", label: "暗黑奇幻", keywords: "dark fantasy, eldritch, ominous atmosphere, twisted creatures, grimdark, eerie glow", category: "科幻/奇幻", mediaType: "both" },
    { id: "space_opera", label: "太空歌剧", keywords: "space opera, epic scale, starships, nebula, alien worlds, interstellar, cosmic", category: "科幻/奇幻", mediaType: "both" },
    // 现代设计
    { id: "minimalism", label: "极简主义", keywords: "minimalist, clean composition, negative space, simple geometry, monochrome", category: "现代设计", mediaType: "both" },
    { id: "memphis", label: "孟菲斯", keywords: "memphis design, bold geometric shapes, bright colors, playful, 1980s, postmodern", category: "现代设计", mediaType: "image" },
    { id: "acid_graphics", label: "酸性设计", keywords: "acid graphics, chrome text, liquid metal, distorted typography, rave culture", category: "现代设计", mediaType: "image" },
    { id: "y2k", label: "Y2K", keywords: "Y2K, 2000s aesthetic, metallic, butterfly, glossy, futuristic retro, pink chrome", category: "现代设计", mediaType: "image" },
    { id: "vaporwave", label: "蒸汽波", keywords: "vaporwave, retro futurism, greek statues, pastel gradient, glitch art, 80s 90s nostalgia", category: "现代设计", mediaType: "image" },
    // 艺术流派补充
    { id: "watercolor", label: "水彩画", keywords: "watercolor painting, soft washes, bleeding edges, transparent layers, paper texture, delicate", category: "艺术流派", mediaType: "both" },
    { id: "oil_painting", label: "油画", keywords: "oil painting, impasto, rich texture, visible brushstrokes, classical technique, canvas", category: "艺术流派", mediaType: "both" },
    // 动画类补充
    { id: "low_poly", label: "低多边形", keywords: "low poly, geometric facets, minimalist 3D, flat shading, polygon art, clean edges", category: "动画类", mediaType: "both" },
    { id: "storybook", label: "童话绘本", keywords: "children's book illustration, whimsical, soft pastel, storybook art, gentle textures, magical", category: "动画类", mediaType: "both" },
    // 现代设计补充
    { id: "isometric", label: "等距视角", keywords: "isometric view, 30 degree angle, clean vector, technical illustration, no perspective distortion", category: "现代设计", mediaType: "image" },
    { id: "retro_poster", label: "复古海报", keywords: "vintage poster, WPA style, bold typography, limited palette, propaganda art, travel poster", category: "现代设计", mediaType: "image" },
    // 科幻/奇幻补充
    { id: "horror", label: "恐怖惊悚", keywords: "horror aesthetic, unsettling, dark atmosphere, jump scare tension, eerie lighting, psychological dread", category: "科幻/奇幻", mediaType: "both" },
    { id: "mecha", label: "机甲", keywords: "mecha, mechanical armor, futuristic suit, industrial design, metal panels, hydraulic, glowing cockpit", category: "科幻/奇幻", mediaType: "both" },
    { id: "xianxia", label: "仙侠", keywords: "xianxia, flowing robes, celestial, jade ornaments, mystical aura, floating mountains, chinese mythology", category: "科幻/奇幻", mediaType: "both" },
    { id: "lovecraftian", label: "克苏鲁", keywords: "lovecraftian, eldritch, tentacles, cosmic dread, non-euclidean, ancient ones, maddening", category: "科幻/奇幻", mediaType: "both" },
    // 影视写实补充
    { id: "film_noir", label: "黑色电影", keywords: "film noir, high contrast, dramatic shadows, venetian blind lighting, 1940s, chiaroscuro, black and white", category: "写实类", mediaType: "both" },
    { id: "music_video", label: "音乐MV", keywords: "music video, dynamic lighting, stylized, performance, dramatic, high energy, concert", category: "写实类", mediaType: "video" },
    // 动画类补充
    { id: "realistic_cg", label: "写实CG", keywords: "hyper-realistic CG, unreal engine 5, metahuman, PBR materials, ray tracing, cinematic lighting, 8k", category: "动画类", mediaType: "both" },
    { id: "toon_shading", label: "卡通渲染", keywords: "toon shaded, cel shading, bold outlines, flat colors, stylized 3D, vibrant, cartoon", category: "动画类", mediaType: "both" },
    { id: "ghibli", label: "吉卜力风格", keywords: "Studio Ghibli, soft watercolor textures, gentle, warm palette, hand-painted, whimsical, lush nature", category: "动画类", mediaType: "both" },
    { id: "motion_graphics", label: "动态图形", keywords: "motion graphics, clean vector, geometric shapes, bold colors, flat design, animated, dynamic", category: "动画类", mediaType: "video" },
    // 艺术流派补充2
    { id: "graffiti", label: "涂鸦/街头", keywords: "graffiti, spray paint, bold tags, street art, urban, vibrant colors, dripping paint, wheat paste", category: "艺术流派", mediaType: "image" },
    { id: "flat_design", label: "扁平设计", keywords: "flat design, clean vector, minimal shading, geometric, bold colors, simple shapes, no gradients", category: "现代设计", mediaType: "image" },
    { id: "line_art", label: "线条画", keywords: "line art, clean ink lines, no fill, minimalist, elegant contours, black on white", category: "艺术流派", mediaType: "image" },
    { id: "pastel_art", label: "粉彩", keywords: "soft pastel colors, gentle tones, dreamy, delicate, light and airy, muted palette", category: "艺术流派", mediaType: "both" },
    { id: "collage", label: "拼贴艺术", keywords: "collage art, mixed media, cut paper, layered textures, vintage clippings, eclectic", category: "艺术流派", mediaType: "image" },
    { id: "pointillism", label: "点彩", keywords: "pointillism, tiny dots, optical color mixing, seurat style, vibrant, textured", category: "艺术流派", mediaType: "image" },
    // 现代设计补充2
    { id: "glitch_art", label: "故障艺术", keywords: "glitch art, digital distortion, RGB shift, corrupted data, pixel sorting, VHS artifacts, datamosh", category: "现代设计", mediaType: "both" },
    { id: "neon", label: "霓虹", keywords: "neon-lit, glowing tubes, vibrant colors on dark, electric, nightlife, luminous, signs", category: "现代设计", mediaType: "both" },
    { id: "bauhaus", label: "包豪斯", keywords: "bauhaus, geometric primitives, primary colors, functional design, grid, modernist", category: "现代设计", mediaType: "image" },
];

/** 提示词生成请求 */
export type PromptGenerateRequest = {
    input: string;
    platform: PromptPlatform;
    styles?: { id: string; weight: number }[];
    customStyle?: string;
    aspectRatio?: string;
    extraInstructions?: string;
};

/** 提示词条目 */
export type PromptEntry = {
    id: string;
    input: string;
    platform: PromptPlatform;
    prompt: string;
    negativePrompt?: string;
    /** 中文对照：生成提示词的通俗中文翻译，便于不懂英文的用户理解与核对 */
    translation?: string;
    /** 角色映射：中文名=英文描述片段，帮助用户识别英文提示词中的角色对应资产 */
    characterMapping?: string;
    /** 资产来源标注：如「角色：小明」「镜头」，确定性带入、不依赖 AI */
    assetRef?: string;
    styles?: { id: string; weight: number }[];
    customStyle?: string;
    category: PromptCategory;
    /** 用户反馈评分：1=点赞（正面），-1=劣质（负面），null/undefined=未评价 */
    rating?: 1 | -1 | null;
};

/** 提示词项目 */
export type PromptProject = {
    id: string;
    title: string;
    entries: PromptEntry[];
    createdAt: string;
    updatedAt: string;
};
