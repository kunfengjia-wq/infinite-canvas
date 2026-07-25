/**
 * 分镜工作台 - 数据模型
 * 流程：剧本输入 → 场景拆分 → 镜头细化 → 画面描述 → 导出到提示词工作台
 */

/** 分镜项目状态（逐步确认） */
export type StoryboardStatus = "draft" | "assets_confirmed" | "scenes_confirmed" | "shots_confirmed" | "descriptions_confirmed";

/** 景别选项 */
export type ShotType = "远景" | "全景" | "中景" | "近景" | "特写" | "大特写";

/** 镜头角度 */
export type ShotAngle = "平视" | "俯视" | "仰视" | "斜角" | "鸟瞰" | "低角度";

/** 单个镜头 */
export type Shot = {
    id: string;
    index: number;
    shotType: ShotType | string;
    angle: ShotAngle | string;
    action: string;
    dialogue?: string;
    visualDescription: string;
    duration?: string;
    mood?: string;
    confirmed: boolean;
};

/** 场景 */
export type Scene = {
    id: string;
    index: number;
    title: string;
    summary: string;
    scriptExcerpt?: string;
    shots: Shot[];
    confirmed: boolean;
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
    metadata?: Record<string, unknown>;
};

/** 资产提取结果 */
export type StoryAssets = {
    characters: CharacterAsset[];
    locations: LocationAsset[];
    props: PropAsset[];
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

/** AI 场景拆分结果（JSON 输出格式） */
export type AiSceneResult = {
    title: string;
    summary: string;
    scriptExcerpt: string;
};

/** AI 镜头生成结果 */
export type AiShotResult = {
    shotType: string;
    angle: string;
    action: string;
    dialogue?: string;
    duration?: string;
    mood?: string;
};

/** AI 画面描述结果 */
export type AiVisualDescriptionResult = {
    shotId: string;
    visualDescription: string;
};

/** 分镜步骤 */
export type StoryboardStep = 1 | 2 | 3 | 4 | 5;

export const STORYBOARD_STEPS: { step: StoryboardStep; label: string; description: string }[] = [
    { step: 1, label: "输入剧本", description: "粘贴或上传剧本文本" },
    { step: 2, label: "资产提取", description: "AI 提取角色、场景、道具" },
    { step: 3, label: "场景拆分", description: "AI 识别场景边界，审核确认" },
    { step: 4, label: "镜头细化", description: "AI 生成分镜，逐镜头调整" },
    { step: 5, label: "画面描述", description: "AI 生成视觉描述，确认后导出" },
];
