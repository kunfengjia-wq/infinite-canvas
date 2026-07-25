import { create } from "zustand";
import { nanoid } from "nanoid";

import { getPromptProjectRepo } from "@/services/db";
import type { PromptEntry, PromptPlatform, PromptProject } from "@/types/prompt-studio";

type PromptStudioStore = {
    /** 所有提示词项目 */
    projects: PromptProject[];
    /** 当前项目 */
    current: PromptProject | null;
    /** AI 生成中 */
    generating: boolean;
    /** 加载状态 */
    loading: boolean;
    /** 当前选中的平台 */
    selectedPlatform: PromptPlatform;
    /** 当前选中的风格 */
    selectedStyle: string;

    // ─── 项目操作 ───
    loadProjects: () => Promise<void>;
    createProject: (title: string, sourceType?: PromptProject["sourceType"], sourceId?: string) => Promise<string>;
    openProject: (id: string) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
    saveCurrent: () => Promise<void>;

    // ─── 条目操作 ───
    addEntry: (entry: Omit<PromptEntry, "id" | "createdAt">) => void;
    updateEntry: (entryId: string, patch: Partial<PromptEntry>) => void;
    removeEntry: (entryId: string) => void;
    clearEntries: () => void;

    // ─── 面板状态 ───
    setPlatform: (platform: PromptPlatform) => void;
    setStyle: (style: string) => void;
    setGenerating: (v: boolean) => void;
};

function now() {
    return new Date().toISOString();
}

export const usePromptStudioStore = create<PromptStudioStore>()((set, get) => ({
    projects: [],
    current: null,
    generating: false,
    loading: false,
    selectedPlatform: "midjourney",
    selectedStyle: "",

    loadProjects: async () => {
        set({ loading: true });
        const projects = await getPromptProjectRepo().list();
        set({ projects, loading: false });
    },

    createProject: async (title, sourceType = "manual", sourceId) => {
        const project: PromptProject = { id: nanoid(), title, sourceType, sourceId, entries: [], createdAt: now(), updatedAt: now() };
        await getPromptProjectRepo().save(project);
        set((state) => ({ projects: [project, ...state.projects], current: project }));
        return project.id;
    },

    openProject: async (id) => {
        const project = await getPromptProjectRepo().get(id);
        if (!project) return;
        set({ current: project });
    },

    deleteProject: async (id) => {
        await getPromptProjectRepo().remove(id);
        set((state) => ({
            projects: state.projects.filter((p) => p.id !== id),
            current: state.current?.id === id ? null : state.current,
        }));
    },

    saveCurrent: async () => {
        const { current } = get();
        if (!current) return;
        const updated = { ...current, updatedAt: now() };
        await getPromptProjectRepo().save(updated);
        set((state) => ({
            current: updated,
            projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
        }));
    },

    // ─── 条目 ───
    addEntry: (entry) =>
        set((state) => {
            if (!state.current) return state;
            const newEntry: PromptEntry = { ...entry, id: nanoid(), createdAt: now() };
            return { current: { ...state.current, entries: [...state.current.entries, newEntry] } };
        }),

    updateEntry: (entryId, patch) =>
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, entries: state.current.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)) } };
        }),

    removeEntry: (entryId) =>
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, entries: state.current.entries.filter((e) => e.id !== entryId) } };
        }),

    clearEntries: () =>
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, entries: [] } };
        }),

    // ─── 面板 ───
    setPlatform: (platform) => set({ selectedPlatform: platform }),
    setStyle: (style) => set({ selectedStyle: style }),
    setGenerating: (v) => set({ generating: v }),
}));
