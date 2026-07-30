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
            { value: "黑色电影", label: "黑色电影", en: "Film Noir" },
            { value: "音乐MV", label: "音乐MV", en: "Music Video" },
            { value: "时尚大片", label: "时尚大片", en: "Fashion Editorial" },
        ],
    },
    {
        group: "3D / CG",
        items: [
            { value: "3DCG", label: "3DCG（三维渲染）", en: "3D CG" },
            { value: "写实CG", label: "写实CG（游戏过场）", en: "Realistic CG" },
            { value: "皮克斯风格", label: "皮克斯风格", en: "Pixar Style" },
            { value: "卡通渲染", label: "卡通渲染（Toon Shading）", en: "Toon Shading" },
            { value: "低多边形", label: "低多边形", en: "Low Poly" },
            { value: "等距视角", label: "等距视角", en: "Isometric" },
        ],
    },
    {
        group: "二维动画",
        items: [
            { value: "日系动画", label: "日系动画", en: "Anime" },
            { value: "吉卜力风格", label: "吉卜力风格", en: "Ghibli Style" },
            { value: "美漫", label: "美漫", en: "Western Comics" },
            { value: "二维手绘", label: "二维手绘", en: "2D Hand-drawn" },
            { value: "定格动画", label: "定格动画", en: "Stop Motion" },
            { value: "国风水墨", label: "国风水墨", en: "Chinese Ink" },
            { value: "像素风", label: "像素风", en: "Pixel Art" },
            { value: "动态图形", label: "动态图形", en: "Motion Graphics" },
        ],
    },
    {
        group: "艺术画风",
        items: [
            { value: "水彩", label: "水彩", en: "Watercolor" },
            { value: "油画", label: "油画", en: "Oil Painting" },
            { value: "素描", label: "素描", en: "Sketch" },
            { value: "浮世绘", label: "浮世绘", en: "Ukiyo-e" },
            { value: "插画风", label: "插画风", en: "Illustration" },
            { value: "漫画风", label: "漫画风", en: "Comic" },
            { value: "涂鸦街头", label: "涂鸦/街头艺术", en: "Graffiti / Street Art" },
            { value: "扁平设计", label: "扁平设计", en: "Flat Design" },
            { value: "线条画", label: "线条画", en: "Line Art" },
            { value: "粉彩", label: "粉彩", en: "Pastel" },
            { value: "拼贴艺术", label: "拼贴艺术", en: "Collage" },
            { value: "点彩", label: "点彩", en: "Pointillism" },
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
            { value: "机甲", label: "机甲", en: "Mecha" },
            { value: "仙侠", label: "仙侠", en: "Xianxia" },
            { value: "克苏鲁", label: "克苏鲁", en: "Lovecraftian" },
            { value: "太空歌剧", label: "太空歌剧", en: "Space Opera" },
            { value: "太阳朋克", label: "太阳朋克", en: "Solarpunk" },
        ],
    },
    {
        group: "现代设计 / 潮流",
        items: [
            { value: "极简主义", label: "极简主义", en: "Minimalism" },
            { value: "蒸汽波", label: "蒸汽波", en: "Vaporwave" },
            { value: "Y2K", label: "Y2K", en: "Y2K" },
            { value: "酸性设计", label: "酸性设计", en: "Acid Graphics" },
            { value: "故障艺术", label: "故障艺术", en: "Glitch Art" },
            { value: "霓虹", label: "霓虹", en: "Neon" },
            { value: "包豪斯", label: "包豪斯", en: "Bauhaus" },
            { value: "复古海报", label: "复古海报", en: "Retro Poster" },
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
