/**
 * 分镜工作台 - 数据模型
 * 流程：剧本输入 → 资产提取 → 场景拆分 → 镜头细化 → 画面描述 → 导出到提示词工作台
 */

/** 分镜项目状态（逐步确认） */
export type StoryboardStatus = "draft" | "assets_confirmed" | "scenes_confirmed" | "shots_confirmed" | "descriptions_confirmed";

/** 分镜步骤 */
export type StoryboardStep = 1 | 2 | 3 | 4 | 5;

/** 单个镜头 */
export type Shot = {
    id: string;
    index: number;
    shotType: string;
    angle: string;
    action: string;
    dialogue?: string;
    visualDescription: string;
    duration?: string;
    mood?: string;
    /** 运镜方式（推/拉/摇/移/跟/航拍/一镜到底等） */
    cameraMovement?: string;
    /** 镜头焦距（广角/标准/长焦/微距等） */
    lens?: string;
    /** 光线类型（自然光/伦勃朗光/逆光/霓虹光等） */
    lighting?: string;
    /** 构图/取景（中心构图/三分法/对称/引导线/框中框/负空间等） */
    composition?: string;
    /** 转场到下一镜头（硬切/叠化/淡入黑等） */
    transition?: string;
    confirmed: boolean;
};

/** 场景 */
export type Scene = {
    id: string;
    index: number;
    title: string;
    summary: string;
    scriptExcerpt?: string;
    /** 时间范围（如 "00:00-00:25"） */
    timeRange?: string;
    /** 场景氛围 */
    mood?: string;
    /** 色调（如 "暖金色调"、"冷蓝调"） */
    colorTone?: string;
    shots: Shot[];
    confirmed: boolean;
};

/** 角色资产 */
export type CharacterAsset = {
    id: string;
    name: string;
    appearance: string;
    personality?: string;
    costume?: string;
    keywords: string;
};

/** 场景/地点资产 */
export type LocationAsset = {
    id: string;
    name: string;
    description: string;
    timeOfDay?: string;
    lighting?: string;
    keywords: string;
};

/** 道具资产 */
export type PropAsset = {
    id: string;
    name: string;
    description: string;
    significance?: string;
    keywords: string;
};

/** 产品/品牌资产（广告片核心） */
export type ProductAsset = {
    id: string;
    name: string;
    brand?: string;
    appearance: string;
    packaging?: string;
    significance: string;
    keywords: string;
};

/** 资产提取结果 */
export type StoryAssets = {
    characters: CharacterAsset[];
    locations: LocationAsset[];
    props: PropAsset[];
    products: ProductAsset[];
};

/** 分镜项目 */
export type StoryboardProject = {
    id: string;
    title: string;
    script: string;
    assets: StoryAssets;
    scenes: Scene[];
    status: StoryboardStatus;
    createdAt: string;
    updatedAt: string;
    /** 项目类型（广告宣传片/微电影/MV/纪录片/动画等） */
    projectType?: string;
    /** 目标时长（秒） */
    targetDuration?: number;
    /** 视觉风格偏好 */
    visualStyle?: string;
    /** 目标生成平台 */
    targetPlatform?: string;
};

/** AI 场景拆分结果 */
export type AiSceneResult = {
    title: string;
    summary: string;
    scriptExcerpt: string;
    timeRange?: string;
    mood?: string;
    colorTone?: string;
};

/** AI 镜头生成结果 */
export type AiShotResult = {
    shotType: string;
    angle: string;
    action: string;
    dialogue?: string;
    duration?: string;
    mood?: string;
    cameraMovement?: string;
    lens?: string;
    lighting?: string;
    composition?: string;
    transition?: string;
};

/** 步骤定义 */
export const STORYBOARD_STEPS: { step: StoryboardStep; label: string; description: string }[] = [
    { step: 1, label: "剧本输入", description: "粘贴或导入剧本，设置项目类型和风格" },
    { step: 2, label: "资产提取", description: "AI 提取角色、场景、道具、产品资产" },
    { step: 3, label: "场景拆分", description: "AI 拆分场景，标注时间/氛围/色调" },
    { step: 4, label: "镜头细化", description: "AI 生成分镜，含运镜/焦距/光线/转场" },
    { step: 5, label: "画面描述", description: "AI 生成视觉描述，导出到提示词工作台" },
];
