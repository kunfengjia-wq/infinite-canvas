/** 语音工作台数据模型 */

export type TTSEngineId = "kokoro-82m" | "xtts-v2" | "qwen3-tts" | "gpt-sovits" | "indextts-2";

export type EmotionType = "neutral" | "happy" | "sad" | "angry" | "surprise" | "fear" | "gentle";

export const EMOTION_OPTIONS: { value: EmotionType; label: string; icon: string }[] = [
    { value: "neutral", label: "平静", icon: "😐" },
    { value: "happy", label: "开心", icon: "😊" },
    { value: "sad", label: "悲伤", icon: "😢" },
    { value: "angry", label: "愤怒", icon: "😠" },
    { value: "surprise", label: "惊讶", icon: "😲" },
    { value: "fear", label: "恐惧", icon: "😨" },
    { value: "gentle", label: "温柔", icon: "🥰" },
];

export interface AudioEffects {
    pitchShift: number;   // -12 ~ +12 半音
    reverb: number;       // 0-1
    gain: number;         // -40 ~ +40 dB
    highPass: number;     // Hz, 0=关闭
    lowPass: number;      // Hz, 0=关闭
}

export const DEFAULT_EFFECTS: AudioEffects = {
    pitchShift: 0,
    reverb: 0,
    gain: 0,
    highPass: 0,
    lowPass: 0,
};

export const EFFECTS_PRESETS: { name: string; effects: AudioEffects }[] = [
    { name: "机器人", effects: { pitchShift: -3, reverb: 0.2, gain: 2, highPass: 300, lowPass: 3000 } },
    { name: "收音机", effects: { pitchShift: 0, reverb: 0.1, gain: -2, highPass: 500, lowPass: 4000 } },
    { name: "回声室", effects: { pitchShift: 0, reverb: 0.8, gain: 0, highPass: 0, lowPass: 0 } },
    { name: "低沉", effects: { pitchShift: -5, reverb: 0.3, gain: 4, highPass: 0, lowPass: 2000 } },
];

export interface VoiceCharacter {
    id: string;
    name: string;
    voice: string;
    color: string;
    referenceAudio?: string; // base64
    isCloned: boolean;       // 是否克隆音色
    samples: string[];       // 参考音频样本 URL 列表
}

export type VoiceLineStatus = "pending" | "generating" | "done" | "error";

export interface VoiceLine {
    id: string;
    characterId: string;
    text: string;
    audioUrl?: string;
    duration?: number;
    status: VoiceLineStatus;
    emotion: EmotionType;
    emotionIntensity: number; // 0-1
    engineOverride?: string;  // 独立引擎覆盖（空=跟随项目）
}

export interface VoiceProject {
    id: string;
    title: string;
    engine: TTSEngineId;
    characters: VoiceCharacter[];
    lines: VoiceLine[];
    effects: AudioEffects;  // 全局默认效果
    createdAt: string;
    updatedAt: string;
}

export interface TTSModelInfo {
    id: string;
    display_name: string;
    available: boolean;
    voices: { id: string; label: string; language: string; gender: string }[];
}

// 角色颜色池
export const CHARACTER_COLORS = [
    "#6366f1", // indigo
    "#f59e0b", // amber
    "#10b981", // emerald
    "#ef4444", // red
    "#8b5cf6", // violet
    "#06b6d4", // cyan
    "#ec4899", // pink
    "#84cc16", // lime
];
