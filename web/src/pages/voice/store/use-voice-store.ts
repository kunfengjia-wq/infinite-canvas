import { create } from "zustand";
import { nanoid } from "nanoid";

import type { VoiceProject, VoiceCharacter, VoiceLine, TTSEngineId, TTSModelInfo, EmotionType, AudioEffects } from "../types";
import { CHARACTER_COLORS, DEFAULT_EFFECTS } from "../types";
import { useConfigStore } from "@/stores/use-config-store";

// ─── 本地持久化（localforage）────────────────────────────────────
import localforage from "localforage";

const repo = localforage.createInstance({ name: "voice-projects", storeName: "projects" });

async function loadAll(): Promise<VoiceProject[]> {
    const keys = await repo.keys();
    const projects: VoiceProject[] = [];
    for (const key of keys) {
        const p = await repo.getItem<VoiceProject>(key);
        if (p) projects.push(p);
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function save(project: VoiceProject) {
    await repo.setItem(project.id, project);
}

async function remove(id: string) {
    await repo.removeItem(id);
}

// ─── TTS API ────────────────────────────────────────────────────

function getTtsBase(): string {
    return useConfigStore.getState().config.ttsBaseUrl || "http://localhost:8880";
}

/** 检查 TTS 服务是否在线（抛出明确错误） */
function assertOnline(get: () => VoiceStore) {
    if (!get().ttsOnline) {
        throw new Error("TTS 服务未连接。请先启动本地 TTS 服务：python main.py（端口 8880）");
    }
}

async function fetchModels(): Promise<TTSModelInfo[]> {
    try {
        const res = await fetch(`${getTtsBase()}/v1/models`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return [];
        const json = await res.json();
        return (json.data ?? []) as TTSModelInfo[];
    } catch {
        return [];
    }
}

interface SynthParams {
    engine: string;
    text: string;
    voice: string;
    speed: number;
    referenceAudio?: string;
    emotion?: string;
    emotionIntensity?: number;
    pitchShift?: number;
    reverb?: number;
    gain?: number;
}

async function synthesize(params: SynthParams): Promise<Blob> {
    const body: Record<string, unknown> = {
        model: params.engine,
        input: params.text,
        voice: params.voice,
        response_format: "mp3",
        speed: params.speed,
        emotion: params.emotion ?? "neutral",
        emotion_intensity: params.emotionIntensity ?? 0.5,
    };
    if (params.referenceAudio) body.reference_audio = params.referenceAudio;
    if (params.pitchShift) body.pitch_shift = params.pitchShift;
    if (params.reverb) body.reverb = params.reverb;
    if (params.gain) body.gain = params.gain;

    const res = await fetch(`${getTtsBase()}/v1/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "合成失败" }));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.blob();
}

// ─── 克隆音色 API ───────────────────────────────────────────────

export interface ClonedVoice {
    id: string;
    name: string;
    samples_count: number;
}

async function fetchClonedVoices(): Promise<ClonedVoice[]> {
    try {
        const res = await fetch(`${getTtsBase()}/v1/voices`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return [];
        const json = await res.json();
        return (json.voices ?? []) as ClonedVoice[];
    } catch {
        return [];
    }
}

async function apiCloneVoice(name: string, samples: string[]): Promise<string> {
    const res = await fetch(`${getTtsBase()}/v1/voices/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, samples }),
    });
    if (!res.ok) throw new Error("克隆失败");
    const json = await res.json();
    return json.id as string;
}

async function apiDeleteVoice(voiceId: string): Promise<void> {
    await fetch(`${getTtsBase()}/v1/voices/${voiceId}`, { method: "DELETE" });
}

// ─── 音频编辑 API ───────────────────────────────────────────────

async function apiTrimAudio(audioB64: string, startMs: number, endMs: number): Promise<string> {
    const res = await fetch(`${getTtsBase()}/v1/audio/trim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: audioB64, start_ms: startMs, end_ms: endMs }),
    });
    if (!res.ok) throw new Error("裁剪失败");
    const json = await res.json();
    return json.audio as string;
}

async function apiApplyEffects(audioB64: string, effects: AudioEffects): Promise<string> {
    const res = await fetch(`${getTtsBase()}/v1/audio/effects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            audio: audioB64,
            pitch_shift: effects.pitchShift,
            reverb: effects.reverb,
            gain: effects.gain,
            high_pass: effects.highPass,
            low_pass: effects.lowPass,
        }),
    });
    if (!res.ok) throw new Error("效果处理失败");
    const json = await res.json();
    return json.audio as string;
}

/** 试听音色：用短文本合成并播放 */
async function previewVoice(engine: string, voice: string): Promise<void> {
    const blob = await synthesize({ engine, text: "你好，这是音色预览。", voice, speed: 1.0 });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
}

// ─── Store ──────────────────────────────────────────────────────

interface VoiceStore {
    projects: VoiceProject[];
    current: VoiceProject | null;
    loading: boolean;
    models: TTSModelInfo[];
    ttsOnline: boolean;
    clonedVoices: ClonedVoice[];

    loadProjects: () => Promise<void>;
    loadModels: () => Promise<void>;
    loadVoices: () => Promise<void>;
    startPolling: () => void;
    stopPolling: () => void;
    createProject: (title: string, engine?: TTSEngineId) => Promise<string>;
    openProject: (id: string) => void;
    deleteProject: (id: string) => Promise<void>;
    saveCurrent: () => Promise<void>;

    addCharacter: (name: string) => void;
    removeCharacter: (id: string) => void;
    updateCharacter: (id: string, patch: Partial<VoiceCharacter>) => void;

    addLine: (characterId: string, text: string) => void;
    updateLine: (id: string, patch: Partial<VoiceLine>) => void;
    removeLine: (id: string) => void;
    parseScript: (text: string) => void;

    generateLine: (lineId: string) => Promise<void>;
    generateAll: () => Promise<void>;
    previewVoice: (engine: string, voice: string) => Promise<void>;

    // 情绪
    setLineEmotion: (lineId: string, emotion: EmotionType, intensity: number) => void;
    batchSetEmotion: (lineIds: string[], emotion: EmotionType, intensity: number) => void;

    // 克隆
    cloneVoice: (name: string, samples: Blob[]) => Promise<string>;
    deleteClonedVoice: (voiceId: string) => Promise<void>;

    // 音频编辑
    trimAudio: (lineId: string, startMs: number, endMs: number) => Promise<void>;
    applyEffects: (lineId: string | "all", effects: AudioEffects) => Promise<void>;
}

function now() {
    return new Date().toISOString();
}

async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(blob);
    });
}

async function urlToBase64(url: string): Promise<string> {
    const res = await fetch(url);
    const blob = await res.blob();
    return blobToBase64(blob);
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export const useVoiceStore = create<VoiceStore>()((set, get) => ({
    projects: [],
    current: null,
    loading: false,
    models: [],
    ttsOnline: false,
    clonedVoices: [],

    loadProjects: async () => {
        set({ loading: true });
        const projects = await loadAll();
        set({ projects, loading: false });
    },

    loadModels: async () => {
        const models = await fetchModels();
        set({ models, ttsOnline: models.length > 0 });
    },

    loadVoices: async () => {
        const clonedVoices = await fetchClonedVoices();
        set({ clonedVoices });
    },

    startPolling: () => {
        if (pollTimer) return;
        pollTimer = setInterval(() => { void get().loadModels(); }, 8000);
    },

    stopPolling: () => {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    },

    createProject: async (title, engine = "kokoro-82m") => {
        const project: VoiceProject = {
            id: nanoid(),
            title: title || "未命名配音项目",
            engine,
            characters: [
                { id: nanoid(), name: "旁白", voice: "zm_yunjian", color: "#6b7280", isCloned: false, samples: [] },
            ],
            lines: [],
            effects: { ...DEFAULT_EFFECTS },
            createdAt: now(),
            updatedAt: now(),
        };
        await save(project);
        set((s) => ({ projects: [project, ...s.projects], current: project }));
        return project.id;
    },

    openProject: (id) => {
        const project = get().projects.find((p) => p.id === id) ?? null;
        set({ current: project });
    },

    deleteProject: async (id) => {
        await remove(id);
        set((s) => ({
            projects: s.projects.filter((p) => p.id !== id),
            current: s.current?.id === id ? null : s.current,
        }));
    },

    saveCurrent: async () => {
        const { current } = get();
        if (!current) return;
        const updated = { ...current, updatedAt: now() };
        await save(updated);
        set((s) => ({
            current: updated,
            projects: s.projects.map((p) => (p.id === updated.id ? updated : p)),
        }));
    },

    addCharacter: (name) => {
        const { current } = get();
        if (!current) return;
        const color = CHARACTER_COLORS[current.characters.length % CHARACTER_COLORS.length];
        const char: VoiceCharacter = { id: nanoid(), name, voice: "zf_xiaobei", color, isCloned: false, samples: [] };
        const updated = { ...current, characters: [...current.characters, char] };
        set({ current: updated });
        void get().saveCurrent();
    },

    removeCharacter: (id) => {
        const { current } = get();
        if (!current) return;
        const updated = {
            ...current,
            characters: current.characters.filter((c) => c.id !== id),
            lines: current.lines.filter((l) => l.characterId !== id),
        };
        set({ current: updated });
        void get().saveCurrent();
    },

    updateCharacter: (id, patch) => {
        const { current } = get();
        if (!current) return;
        const updated = {
            ...current,
            characters: current.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        };
        set({ current: updated });
        void get().saveCurrent();
    },

    addLine: (characterId, text) => {
        const { current } = get();
        if (!current) return;
        const line: VoiceLine = { id: nanoid(), characterId, text, status: "pending", emotion: "neutral", emotionIntensity: 0.5 };
        const updated = { ...current, lines: [...current.lines, line] };
        set({ current: updated });
        void get().saveCurrent();
    },

    updateLine: (id, patch) => {
        const { current } = get();
        if (!current) return;
        const updated = {
            ...current,
            lines: current.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        };
        set({ current: updated });
    },

    removeLine: (id) => {
        const { current } = get();
        if (!current) return;
        const updated = { ...current, lines: current.lines.filter((l) => l.id !== id) };
        set({ current: updated });
        void get().saveCurrent();
    },

    parseScript: (text) => {
        const { current } = get();
        if (!current) return;
        const lines: VoiceLine[] = [];
        const paragraphs = text.split(/\n+/).filter((p) => p.trim());

        for (const para of paragraphs) {
            const match = para.match(/^[【\[]?(.+?)[】\]]?\s*[:：]\s*(.+)$/s);
            if (match) {
                const charName = match[1].trim();
                const content = match[2].trim();
                let char = current.characters.find((c) => c.name === charName);
                if (!char) {
                    const color = CHARACTER_COLORS[current.characters.length % CHARACTER_COLORS.length];
                    char = { id: nanoid(), name: charName, voice: "zf_xiaobei", color, isCloned: false, samples: [] };
                    current.characters.push(char);
                }
                lines.push({ id: nanoid(), characterId: char.id, text: content, status: "pending", emotion: "neutral", emotionIntensity: 0.5 });
            } else {
                const narrator = current.characters.find((c) => c.name === "旁白");
                const charId = narrator?.id ?? current.characters[0]?.id ?? "narrator";
                lines.push({ id: nanoid(), characterId: charId, text: para.trim(), status: "pending", emotion: "neutral", emotionIntensity: 0.5 });
            }
        }

        const updated = { ...current, lines: [...current.lines, ...lines] };
        set({ current: updated });
        void get().saveCurrent();
    },

    generateLine: async (lineId) => {
        const { current } = get();
        if (!current) return;
        assertOnline(get);
        const line = current.lines.find((l) => l.id === lineId);
        if (!line) return;

        const char = current.characters.find((c) => c.id === line.characterId);
        const voice = char?.voice ?? "zf_xiaobei";
        const refAudio = char?.referenceAudio;
        const engine = line.engineOverride || current.engine;

        get().updateLine(lineId, { status: "generating" });
        try {
            const blob = await synthesize({
                engine,
                text: line.text,
                voice,
                speed: 1.0,
                referenceAudio: refAudio,
                emotion: line.emotion,
                emotionIntensity: line.emotionIntensity,
                pitchShift: current.effects.pitchShift || undefined,
                reverb: current.effects.reverb || undefined,
                gain: current.effects.gain || undefined,
            });
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            await new Promise<void>((resolve) => { audio.onloadedmetadata = () => resolve(); });
            get().updateLine(lineId, { status: "done", audioUrl: url, duration: audio.duration });
        } catch (e) {
            get().updateLine(lineId, { status: "error" });
            throw e;
        }
        void get().saveCurrent();
    },

    generateAll: async () => {
        const { current } = get();
        if (!current) return;
        assertOnline(get);
        const pending = current.lines.filter((l) => l.status === "pending" || l.status === "error");
        for (const line of pending) {
            try {
                await get().generateLine(line.id);
            } catch { /* 单段失败继续 */ }
        }
    },

    previewVoice: async (engine, voice) => {
        assertOnline(get);
        await previewVoice(engine, voice);
    },

    // ─── 情绪 ────────────────────────────────────────────────────

    setLineEmotion: (lineId, emotion, intensity) => {
        get().updateLine(lineId, { emotion, emotionIntensity: intensity });
        void get().saveCurrent();
    },

    batchSetEmotion: (lineIds, emotion, intensity) => {
        const { current } = get();
        if (!current) return;
        const updated = {
            ...current,
            lines: current.lines.map((l) => (lineIds.includes(l.id) ? { ...l, emotion, emotionIntensity: intensity } : l)),
        };
        set({ current: updated });
        void get().saveCurrent();
    },

    // ─── 克隆 ────────────────────────────────────────────────────

    cloneVoice: async (name, samples) => {
        assertOnline(get);
        const samplesB64 = await Promise.all(samples.map(blobToBase64));
        const voiceId = await apiCloneVoice(name, samplesB64);
        await get().loadVoices();
        return voiceId;
    },

    deleteClonedVoice: async (voiceId) => {
        assertOnline(get);
        await apiDeleteVoice(voiceId);
        await get().loadVoices();
    },

    // ─── 音频编辑 ────────────────────────────────────────────────

    trimAudio: async (lineId, startMs, endMs) => {
        const { current } = get();
        if (!current) return;
        assertOnline(get);
        const line = current.lines.find((l) => l.id === lineId);
        if (!line?.audioUrl) return;

        const audioB64 = await urlToBase64(line.audioUrl);
        const resultB64 = await apiTrimAudio(audioB64, startMs, endMs);
        const blob = await (await fetch(`data:audio/wav;base64,${resultB64}`)).blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await new Promise<void>((resolve) => { audio.onloadedmetadata = () => resolve(); });
        get().updateLine(lineId, { audioUrl: url, duration: audio.duration });
        void get().saveCurrent();
    },

    applyEffects: async (lineId, effects) => {
        const { current } = get();
        if (!current) return;
        assertOnline(get);

        const targetLines = lineId === "all"
            ? current.lines.filter((l) => l.status === "done" && l.audioUrl)
            : current.lines.filter((l) => l.id === lineId && l.audioUrl);

        for (const line of targetLines) {
            if (!line.audioUrl) continue;
            try {
                const audioB64 = await urlToBase64(line.audioUrl);
                const resultB64 = await apiApplyEffects(audioB64, effects);
                const blob = await (await fetch(`data:audio/wav;base64,${resultB64}`)).blob();
                const url = URL.createObjectURL(blob);
                get().updateLine(line.id, { audioUrl: url });
            } catch {
                // 单段失败不阻断
            }
        }
        void get().saveCurrent();
    },
}));
