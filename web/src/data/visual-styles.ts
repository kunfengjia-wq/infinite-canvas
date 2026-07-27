/**
 * 视觉风格数据库 —— 项目配置阶段的视觉风格（visualStyle）下拉选项
 *
 * 以分组（optgroup）形式组织；组件通过 styleOptionsWithCustom()
 * 兼容用户输入数据库之外的自定义风格。
 */

export type StyleItem = {
    value: string;
    label: string;
    en?: string;
};

export type StyleGroup = {
    /** 分组名称 */
    group: string;
    items: StyleItem[];
};

export type SelectOption = { label: string; value: string };
export type GroupedSelectOption = { label: string; options: SelectOption[] };

/** 视觉风格分组数据 */
export const VISUAL_STYLE_GROUPS: StyleGroup[] = [
    {
        group: "影视写实",
        items: [
            { value: "电影写实", label: "电影写实", en: "Cinematic Realism" },
            { value: "纪录片写实", label: "纪录片写实", en: "Documentary" },
            { value: "广告大片", label: "广告大片", en: "Commercial Blockbuster" },
            { value: "胶片质感", label: "胶片质感", en: "Film Grain" },
            { value: "黑白影像", label: "黑白影像", en: "Black & White" },
            { value: "复古胶片", label: "复古胶片", en: "Vintage Film" },
        ],
    },
    {
        group: "动画 / CG",
        items: [
            { value: "3DCG", label: "3DCG", en: "3D CG" },
            { value: "皮克斯风格", label: "皮克斯风格", en: "Pixar Style" },
            { value: "日系动画", label: "日系动画", en: "Anime" },
            { value: "二维手绘", label: "二维手绘", en: "2D Hand-drawn" },
            { value: "定格动画", label: "定格动画", en: "Stop Motion" },
            { value: "国风水墨", label: "国风水墨", en: "Chinese Ink" },
        ],
    },
    {
        group: "艺术画风",
        items: [
            { value: "水彩", label: "水彩", en: "Watercolor" },
            { value: "油画", label: "油画", en: "Oil Painting" },
            { value: "素描", label: "素描", en: "Sketch" },
            { value: "低多边形", label: "低多边形", en: "Low Poly" },
            { value: "像素风", label: "像素风", en: "Pixel Art" },
            { value: "浮世绘", label: "浮世绘", en: "Ukiyo-e" },
            { value: "插画风", label: "插画风", en: "Illustration" },
            { value: "漫画风", label: "漫画风", en: "Comic" },
        ],
    },
    {
        group: "科幻 / 奇幻",
        items: [
            { value: "赛博朋克", label: "赛博朋克", en: "Cyberpunk" },
            { value: "蒸汽朋克", label: "蒸汽朋克", en: "Steampunk" },
            { value: "科幻未来", label: "科幻未来", en: "Sci-Fi Future" },
            { value: "奇幻史诗", label: "奇幻史诗", en: "Fantasy Epic" },
            { value: "末日废土", label: "末日废土", en: "Post-Apocalyptic" },
            { value: "哥特暗黑", label: "哥特暗黑", en: "Gothic Dark" },
            { value: "梦幻童话", label: "梦幻童话", en: "Fairy Tale" },
        ],
    },
];

/** 转换为 antd Select 分组选项（optgroup） */
export function toGroupedSelectOptions(): GroupedSelectOption[] {
    return VISUAL_STYLE_GROUPS.map((group) => ({
        label: group.group,
        options: group.items.map((item) => ({ label: item.label, value: item.value })),
    }));
}
