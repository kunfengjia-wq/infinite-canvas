/** 语音工作台数据模型 */

export type TTSEngineId = "kokoro-82m" | "xtts-v2" | "qwen3-tts" | "qwen3-tts-clone" | "gpt-sovits" | "indextts-2";

export type EmotionType = "neutral" | "happy" | "sad" | "angry" | "surprise" | "fear" | "gentle";

export type SpeakingStyle = "narration" | "dialogue" | "whisper" | "broadcast";

export const STYLE_OPTIONS: { value: SpeakingStyle; label: string }[] = [
    { value: "narration", label: "旁白" },
    { value: "dialogue", label: "对话" },
    { value: "whisper", label: "耳语" },
    { value: "broadcast", label: "播报" },
];

export const EMOTION_OPTIONS: { value: EmotionType; label: string; icon: string }[] = [
    { value: "neutral", label: "平静", icon: "😐" },
    { value: "happy", label: "开心", icon: "😊" },
    { value: "sad", label: "悲伤", icon: "😢" },
    { value: "angry", label: "愤怒", icon: "😠" },
    { value: "surprise", label: "惊讶", icon: "😲" },
    { value: "fear", label: "恐惧", icon: "😨" },
    { value: "gentle", label: "温柔", icon: "🥰" },
];

// ─── 引擎元数据（场景说明 + 能力）───────────────────────────────────────

export interface EngineMeta {
    id: TTSEngineId;
    name: string;
    description: string;
    tags: string[];
    features: string[]; // "emotion" | "clone" | "speed" | "instruct" | "style"
}

export const ENGINE_META: EngineMeta[] = [
    {
        id: "qwen3-tts",
        name: "Qwen3 预设音色",
        description: "9种高品质预设音色，支持10种语言，情绪控制效果明显。适合多角色有声书、视频配音。",
        tags: ["多角色", "中文", "情绪", "多语言"],
        features: ["emotion", "speed", "instruct", "style"],
    },
    {
        id: "qwen3-tts-clone",
        name: "Qwen3 音色克隆",
        description: "上传3-10秒参考音频即可克隆任意人声。适合还原特定人物声音、IP配音。",
        tags: ["克隆", "零样本", "自定义"],
        features: ["clone", "emotion", "speed", "style"],
    },
    {
        id: "kokoro-82m",
        name: "Kokoro 轻量",
        description: "82M超小模型，CPU实时合成，无需GPU。适合快速预览、低延迟场景。",
        tags: ["轻量", "CPU", "快速", "英文"],
        features: ["speed"],
    },
    {
        id: "xtts-v2",
        name: "XTTS-v2 克隆",
        description: "Coqui 多语言克隆引擎，6秒参考音频即可克隆。支持17种语言跨语言合成。",
        tags: ["克隆", "多语言", "跨语言"],
        features: ["clone", "speed"],
    },
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
    speed?: number;           // 0.5 - 2.0
    pitch?: number;           // -6 ~ +6 半音
    volume?: number;          // 0 - 100
    style?: SpeakingStyle;    // 说话风格
    engineOverride?: string;
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
    enabled: boolean;
    install_hint?: string | null;
    voices: { id: string; label: string; language: string; gender: string; description?: string }[];
}

// ─── 音效库数据模型 ────────────────────────────────────────────────────

export type SoundCategory = "voice" | "sfx" | "bgm" | "clip";

export interface SoundClip {
    id: string;
    name: string;
    category: SoundCategory;
    tags: string[];
    audioB64: string;      // 持久化用 base64
    mime?: string;         // 音频 MIME 类型（旧数据缺省 audio/wav）
    duration: number;
    createdAt: string;
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
