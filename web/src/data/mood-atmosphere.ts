/**
 * 场景氛围数据库 —— 场景拆分阶段的氛围（mood）下拉选项
 *
 * 组件通过 withMood() 兼容 AI 输出数据库之外的自定义氛围。
 */

export type MoodItem = {
    value: string;
    label: string;
    en?: string;
};

export type SelectOption = { label: string; value: string };

/** 常用场景氛围 */
export const MOODS: MoodItem[] = [
    { value: "紧张", label: "紧张", en: "Tense" },
    { value: "舒缓", label: "舒缓", en: "Calm" },
    { value: "温馨", label: "温馨", en: "Warm" },
    { value: "悲伤", label: "悲伤", en: "Sad" },
    { value: "欢快", label: "欢快", en: "Joyful" },
    { value: "悬疑", label: "悬疑", en: "Suspenseful" },
    { value: "惊悚", label: "惊悚", en: "Thrilling" },
    { value: "浪漫", label: "浪漫", en: "Romantic" },
    { value: "史诗", label: "史诗", en: "Epic" },
    { value: "压抑", label: "压抑", en: "Oppressive" },
    { value: "宁静", label: "宁静", en: "Serene" },
    { value: "热血", label: "热血", en: "Passionate" },
    { value: "恐怖", label: "恐怖", en: "Horror" },
    { value: "幽默", label: "幽默", en: "Humorous" },
    { value: "梦幻", label: "梦幻", en: "Dreamy" },
    { value: "孤独", label: "孤独", en: "Lonely" },
    { value: "神秘", label: "神秘", en: "Mysterious" },
    { value: "庄严", label: "庄严", en: "Solemn" },
    { value: "轻快", label: "轻快", en: "Light" },
    { value: "愤怒", label: "愤怒", en: "Angry" },
];

/** 转换为 antd Select 选项 */
export function toMoodSelectOptions(): SelectOption[] {
    return MOODS.map((mood) => ({ label: mood.label, value: mood.value }));
}
