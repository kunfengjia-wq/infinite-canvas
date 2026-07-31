import { create } from "zustand";
import { nanoid } from "nanoid";
import localforage from "localforage";

import type { SoundClip, SoundCategory } from "../types";

const db = localforage.createInstance({ name: "sound-library", storeName: "clips" });

interface SoundLibraryStore {
    clips: SoundClip[];
    loading: boolean;
    searchQuery: string;
    activeCategory: SoundCategory | "all";

    loadClips: () => Promise<void>;
    addClip: (clip: Omit<SoundClip, "id" | "createdAt">) => Promise<void>;
    removeClip: (id: string) => Promise<void>;
    setSearch: (q: string) => void;
    setCategory: (cat: SoundCategory | "all") => void;
    playClip: (clip: SoundClip) => void;
}

let currentAudio: HTMLAudioElement | null = null;

export const useSoundLibrary = create<SoundLibraryStore>()((set) => ({
    clips: [],
    loading: false,
    searchQuery: "",
    activeCategory: "all",

    loadClips: async () => {
        set({ loading: true });
        const keys = await db.keys();
        const clips: SoundClip[] = [];
        for (const key of keys) {
            const clip = await db.getItem<SoundClip>(key);
            if (clip) clips.push(clip);
        }
        clips.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        set({ clips, loading: false });
    },

    addClip: async (clipData) => {
        const clip: SoundClip = {
            ...clipData,
            id: nanoid(),
            createdAt: new Date().toISOString(),
        };
        await db.setItem(clip.id, clip);
        set((s) => ({ clips: [clip, ...s.clips] }));
    },

    removeClip: async (id) => {
        await db.removeItem(id);
        set((s) => ({ clips: s.clips.filter((c) => c.id !== id) }));
    },

    setSearch: (q) => set({ searchQuery: q }),
    setCategory: (cat) => set({ activeCategory: cat }),

    playClip: (clip) => {
        currentAudio?.pause();
        const audio = new Audio(`data:audio/wav;base64,${clip.audioB64}`);
        audio.onended = () => { currentAudio = null; };
        void audio.play();
        currentAudio = audio;
    },
}));

/** 过滤后的 clips（供组件使用） */
export function useFilteredClips(): SoundClip[] {
    const { clips, searchQuery, activeCategory } = useSoundLibrary();
    return clips.filter((c) => {
        if (activeCategory !== "all" && c.category !== activeCategory) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return c.name.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q));
        }
        return true;
    });
}
