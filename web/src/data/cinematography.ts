/**
 * 影视专业数据库 —— 分镜下拉选项数据源
 *
 * 术语与 storyboard-ai.ts 中 AI 输出的参考值保持一致；
 * 各组件通过 withCurrent() 兼容 AI 输出数据库之外的自定义值。
 */

export type CinematographyItem = {
    /** 实际取值（与 AI 输出一致，用于回写 Shot 字段） */
    value: string;
    /** 下拉显示文本 */
    label: string;
    /** 英文专业术语（参考） */
    en?: string;
};

export type SelectOption = { label: string; value: string };

/** 将专业数据转换为 antd Select 选项 */
export function toSelectOptions(items: CinematographyItem[]): SelectOption[] {
    return items.map((item) => ({ label: item.label, value: item.value }));
}

/** 景别（shotType） */
export const SHOT_TYPES: CinematographyItem[] = [
    { value: "大远景", label: "大远景", en: "Extreme Long Shot" },
    { value: "远景", label: "远景", en: "Long Shot" },
    { value: "全景", label: "全景", en: "Full Shot" },
    { value: "中全景", label: "中全景", en: "Medium Long Shot" },
    { value: "中景", label: "中景", en: "Medium Shot" },
    { value: "中近景", label: "中近景", en: "Medium Close-Up" },
    { value: "近景", label: "近景", en: "Close Shot" },
    { value: "特写", label: "特写", en: "Close-Up" },
    { value: "大特写", label: "大特写", en: "Extreme Close-Up" },
    { value: "过肩", label: "过肩", en: "Over-the-Shoulder" },
    { value: "主观视角", label: "主观视角", en: "POV" },
    { value: "双人镜头", label: "双人镜头", en: "Two Shot" },
];

/** 角度（angle） */
export const CAMERA_ANGLES: CinematographyItem[] = [
    { value: "平视", label: "平视", en: "Eye Level" },
    { value: "俯视", label: "俯视", en: "High Angle" },
    { value: "仰视", label: "仰视", en: "Low Angle" },
    { value: "鸟瞰", label: "鸟瞰", en: "Bird's Eye" },
    { value: "蛙眼视角", label: "蛙眼视角", en: "Worm's Eye" },
    { value: "荷兰角", label: "荷兰角", en: "Dutch Angle" },
    { value: "过肩角", label: "过肩角", en: "Over-the-Shoulder Angle" },
    { value: "主观", label: "主观", en: "Subjective" },
    { value: "客观", label: "客观", en: "Objective" },
    { value: "倾斜", label: "倾斜", en: "Canted" },
];

/** 运镜（cameraMovement） */
export const CAMERA_MOVEMENTS: CinematographyItem[] = [
    { value: "固定", label: "固定", en: "Static" },
    { value: "推", label: "推", en: "Push In / Dolly In" },
    { value: "拉", label: "拉", en: "Pull Out / Dolly Out" },
    { value: "摇", label: "摇", en: "Pan" },
    { value: "移", label: "移", en: "Truck" },
    { value: "跟", label: "跟", en: "Follow" },
    { value: "升", label: "升", en: "Pedestal Up" },
    { value: "降", label: "降", en: "Pedestal Down" },
    { value: "环绕", label: "环绕", en: "Arc / Orbit" },
    { value: "一镜到底", label: "一镜到底", en: "Long Take" },
    { value: "航拍", label: "航拍", en: "Aerial" },
    { value: "斯坦尼康", label: "斯坦尼康", en: "Steadicam" },
    { value: "手持", label: "手持", en: "Handheld" },
    { value: "轨道", label: "轨道", en: "Dolly Track" },
    { value: "摇臂", label: "摇臂", en: "Crane" },
    { value: "甩镜", label: "甩镜", en: "Whip Pan" },
    { value: "变焦推拉", label: "变焦推拉", en: "Zoom" },
];

/** 焦距（lens） */
export const LENS_TYPES: CinematographyItem[] = [
    { value: "鱼眼", label: "鱼眼", en: "Fisheye" },
    { value: "超广角", label: "超广角", en: "Ultra Wide" },
    { value: "广角", label: "广角", en: "Wide Angle" },
    { value: "标准", label: "标准", en: "Standard" },
    { value: "中长焦", label: "中长焦", en: "Medium Telephoto" },
    { value: "长焦", label: "长焦", en: "Telephoto" },
    { value: "微距", label: "微距", en: "Macro" },
];

/** 光线（lighting） */
export const LIGHTING_TYPES: CinematographyItem[] = [
    { value: "自然光", label: "自然光", en: "Natural Light" },
    { value: "伦勃朗光", label: "伦勃朗光", en: "Rembrandt Lighting" },
    { value: "蝴蝶光", label: "蝴蝶光", en: "Butterfly Lighting" },
    { value: "轮廓光", label: "轮廓光", en: "Rim Light" },
    { value: "逆光", label: "逆光", en: "Backlight" },
    { value: "顶光", label: "顶光", en: "Top Light" },
    { value: "底光", label: "底光", en: "Under Light" },
    { value: "侧光", label: "侧光", en: "Side Light" },
    { value: "霓虹光", label: "霓虹光", en: "Neon Light" },
    { value: "体积光", label: "体积光", en: "Volumetric Light" },
    { value: "实景光源", label: "实景光源", en: "Practical Light" },
];

/** 构图（composition） */
export const COMPOSITION_TYPES: CinematographyItem[] = [
    { value: "中心构图", label: "中心构图", en: "Center Composition" },
    { value: "三分法", label: "三分法", en: "Rule of Thirds" },
    { value: "对称", label: "对称", en: "Symmetry" },
    { value: "引导线", label: "引导线", en: "Leading Lines" },
    { value: "框中框", label: "框中框", en: "Frame within Frame" },
    { value: "负空间", label: "负空间", en: "Negative Space" },
    { value: "对角线", label: "对角线", en: "Diagonal" },
    { value: "前景遮挡", label: "前景遮挡", en: "Foreground Occlusion" },
    { value: "填满画面", label: "填满画面", en: "Fill the Frame" },
    { value: "留头空间", label: "留头空间", en: "Headroom" },
    { value: "低地平线", label: "低地平线", en: "Low Horizon" },
    { value: "高地平线", label: "高地平线", en: "High Horizon" },
    { value: "黄金螺旋", label: "黄金螺旋", en: "Golden Spiral" },
    { value: "多层纵深", label: "多层纵深", en: "Multi-layer Depth" },
];

/** 转场（transition，到下一镜头） */
export const TRANSITION_TYPES: CinematographyItem[] = [
    { value: "硬切", label: "硬切", en: "Hard Cut" },
    { value: "叠化", label: "叠化", en: "Dissolve" },
    { value: "淡入黑", label: "淡入黑", en: "Fade to Black" },
    { value: "黑淡入", label: "黑淡入", en: "Fade from Black" },
    { value: "划像", label: "划像", en: "Wipe" },
    { value: "匹配剪辑", label: "匹配剪辑", en: "Match Cut" },
    { value: "跳切", label: "跳切", en: "Jump Cut" },
    { value: "L-Cut", label: "L-Cut", en: "L-Cut" },
    { value: "J-Cut", label: "J-Cut", en: "J-Cut" },
    { value: "闪白", label: "闪白", en: "Flash White" },
    { value: "模糊转场", label: "模糊转场", en: "Blur Transition" },
    { value: "遮罩转场", label: "遮罩转场", en: "Mask Transition" },
];

/** 项目类型（projectType） */
export const PROJECT_TYPES: CinematographyItem[] = [
    { value: "广告宣传片", label: "广告宣传片" },
    { value: "产品广告", label: "产品广告" },
    { value: "品牌故事", label: "品牌故事" },
    { value: "微电影", label: "微电影" },
    { value: "剧情片", label: "剧情片" },
    { value: "纪录片", label: "纪录片" },
    { value: "MV", label: "MV" },
    { value: "动画", label: "动画" },
    { value: "预告片", label: "预告片" },
    { value: "Vlog", label: "Vlog" },
    { value: "教程", label: "教程" },
];
