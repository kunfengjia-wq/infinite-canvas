/**
 * 提示词工作台 Store - 项目/条目管理
 */
import { create } from "zustand";
import { nanoid } from "nanoid";

import { now } from "@/lib/utils";
import { getPromptProjectRepo } from "@/services/db";
import type { PromptEntry, PromptPlatform, PromptProject } from "@/types/prompt-studio";

type PromptStudioStore = {
    /** 所有项目列表 */
    projects: PromptProject[];
    /** 当前项目 */
    current: PromptProject | null;
    loading: boolean;
    /** AI 生成中 */
    generating: boolean;
    /** 当前选中的平台（单选，用于单条生成） */
    selectedPlatform: PromptPlatform;
    /** 多选平台列表（用于批量生成） */
    selectedPlatforms: PromptPlatform[];
    /** 多选风格（含权重） */
    selectedStyles: { id: string; weight: number }[];
    /** 自定义风格关键词（自由文本） */
    customStyle: string;

    loadProjects: () => Promise<void>;
    createProject: (title: string) => Promise<string>;
    openProject: (id: string) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
    saveCurrent: () => Promise<void>;

    /** 添加单条条目（手动/单平台生成） */
    addEntry: (entry: Omit<PromptEntry, "id">) => void;
    /** 批量添加条目（AI 生成后） */
    addEntries: (entries: Omit<PromptEntry, "id">[]) => void;
    /** 更新单条 */
    updateEntry: (entryId: string, patch: Partial<Pick<PromptEntry, "prompt" | "negativePrompt" | "category" | "styles" | "customStyle" | "translation" | "characterMapping" | "assetRef" | "rating">>) => void;
    /** 删除单条 */
    removeEntry: (entryId: string) => void;
    /** 清空当前项目条目 */
    clearEntries: () => void;

    // ─── 面板状态 ───
    setPlatform: (platform: PromptPlatform) => void;
    togglePlatform: (platform: PromptPlatform) => void;
    toggleStyle: (id: string) => void;
    setStyleWeight: (id: string, weight: number) => void;
    setCustomStyle: (text: string) => void;
    clearStyles: () => void;
    setGenerating: (v: boolean) => void;
};

export const usePromptStudioStore = create<PromptStudioStore>()((set, get) => ({
    projects: [],
    current: null,
    loading: false,
    generating: false,
    selectedPlatform: "midjourney",
    selectedPlatforms: ["midjourney"],
    selectedStyles: [],
    customStyle: "",

    loadProjects: async () => {
        set({ loading: true });
        const projects = await getPromptProjectRepo().list();
        set({ projects, loading: false });
    },

    createProject: async (title) => {
        const project: PromptProject = { id: nanoid(), title, entries: [], createdAt: now(), updatedAt: now() };
        await getPromptProjectRepo().save(project);
        set((state) => ({ projects: [project, ...state.projects], current: project }));
        return project.id;
    },

    openProject: async (id) => {
        const project = await getPromptProjectRepo().get(id);
        if (project) set({ current: project });
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

    addEntry: (entry) =>
        set((state) => {
            if (!state.current) return state;
            const newEntry: PromptEntry = { ...entry, id: nanoid() };
            return { current: { ...state.current, entries: [...state.current.entries, newEntry] } };
        }),

    addEntries: (entries) =>
        set((state) => {
            if (!state.current) return state;
            const newEntries: PromptEntry[] = entries.map((e) => ({ ...e, id: nanoid() }));
            return { current: { ...state.current, entries: [...state.current.entries, ...newEntries] } };
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

    // ─── 面板状态 ───
    setPlatform: (platform) => set({ selectedPlatform: platform, selectedPlatforms: [platform] }),
    togglePlatform: (platform) =>
        set((state) => {
            const exists = state.selectedPlatforms.includes(platform);
            const next = exists ? state.selectedPlatforms.filter((p) => p !== platform) : [...state.selectedPlatforms, platform];
            // 确保至少选中一个
            if (next.length === 0) return state;
            return { selectedPlatforms: next, selectedPlatform: next[next.length - 1] };
        }),
    toggleStyle: (id) =>
        set((state) => {
            const exists = state.selectedStyles.some((s) => s.id === id);
            if (exists) return { selectedStyles: state.selectedStyles.filter((s) => s.id !== id) };
            return { selectedStyles: [...state.selectedStyles, { id, weight: 1.0 }] };
        }),
    setStyleWeight: (id, weight) =>
        set((state) => ({
            selectedStyles: state.selectedStyles.map((s) => (s.id === id ? { ...s, weight } : s)),
        })),
    setCustomStyle: (text) => set({ customStyle: text }),
    clearStyles: () => set({ selectedStyles: [], customStyle: "" }),
    setGenerating: (v) => set({ generating: v }),
}));
