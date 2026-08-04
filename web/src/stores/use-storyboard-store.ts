import { create } from "zustand";
import { nanoid } from "nanoid";

import { getStoryboardRepo } from "@/services/db";
import { useUndoStore } from "@/stores/use-undo-store";
import type { Scene, Shot, StoryAssets, StoryboardProject, StoryboardStatus, StoryboardStep } from "@/types/storyboard";

type StoryboardStore = {
    /** 所有项目列表（侧边栏） */
    projects: StoryboardProject[];
    /** 当前正在编辑的项目 */
    current: StoryboardProject | null;
    /** 当前步骤 */
    step: StoryboardStep;
    /** 已到达的最远步骤（允许回退后再前进） */
    maxStep: StoryboardStep;
    /** AI 处理中 */
    processing: boolean;
    /** 加载状态 */
    loading: boolean;
    /** 新建项目计数器（递增强制 ScriptInput 重挂载） */
    formResetKey: number;

    // ─── 项目操作 ───
    loadProjects: () => Promise<void>;
    createProject: (title: string, script: string) => Promise<string>;
    openProject: (id: string) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
    saveCurrent: () => Promise<void>;

    // ─── 步骤流转 ───
    setStep: (step: StoryboardStep) => void;
    setProcessing: (v: boolean) => void;

    // ─── 资产操作（步骤2）───
    setAssets: (assets: StoryAssets) => void;
    confirmAssets: () => void;

    // ─── 场景操作（步骤3）───
    setScenes: (scenes: Scene[]) => void;
    updateScene: (sceneId: string, patch: Partial<Pick<Scene, "title" | "summary">>) => void;
    removeScene: (sceneId: string) => void;
    addScene: () => void;
    confirmScenes: () => void;

    // ─── 镜头操作（步骤4）───
    setSceneShots: (sceneId: string, shots: Shot[]) => void;
    updateShot: (sceneId: string, shotId: string, patch: Partial<Shot>) => void;
    removeShot: (sceneId: string, shotId: string) => void;
    addShot: (sceneId: string) => void;
    reorderShots: (sceneId: string, fromIndex: number, toIndex: number) => void;
    confirmShots: () => void;

    // ─── 画面描述（步骤5）───
    updateShotDescription: (sceneId: string, shotId: string, description: string) => void;
    confirmDescriptions: () => void;
};

function now() {
    return new Date().toISOString();
}

function createEmptyProject(title: string, script: string): StoryboardProject {
    return { id: nanoid(), title, script, assets: { characters: [], locations: [], props: [], products: [] }, scenes: [], status: "draft", createdAt: now(), updatedAt: now() };
}

/** 在变更前推入快照（带 opKey 合并） */
function pushUndo(current: StoryboardProject | null, opKey?: string) {
    if (current) useUndoStore.getState().push(current, opKey);
}

export const useStoryboardStore = create<StoryboardStore>()((set, get) => ({
    projects: [],
    current: null,
    step: 1,
    maxStep: 1,
    processing: false,
    loading: false,
    formResetKey: 0,

    loadProjects: async () => {
        set({ loading: true });
        const projects = await getStoryboardRepo().list();
        set({ projects, loading: false });
    },

    createProject: async (title, script) => {
        const project = createEmptyProject(title, script);
        await getStoryboardRepo().save(project);
        useUndoStore.getState().clear();
        set((state) => ({ projects: [project, ...state.projects], current: project, step: 1, maxStep: 1 }));
        return project.id;
    },

    openProject: async (id) => {
        const project = await getStoryboardRepo().get(id);
        if (!project) return;
        const stepMap: Record<StoryboardStatus, StoryboardStep> = { draft: 1, assets_confirmed: 3, scenes_confirmed: 4, shots_confirmed: 5, descriptions_confirmed: 5 };
        const targetStep = stepMap[project.status] ?? 1;
        useUndoStore.getState().clear();
        set({ current: project, step: targetStep, maxStep: targetStep });
    },

    deleteProject: async (id) => {
        await getStoryboardRepo().remove(id);
        set((state) => ({
            projects: state.projects.filter((p) => p.id !== id),
            current: state.current?.id === id ? null : state.current,
        }));
    },

    saveCurrent: async () => {
        const { current } = get();
        if (!current) return;
        const updated = { ...current, updatedAt: now() };
        await getStoryboardRepo().save(updated);
        set((state) => ({
            current: updated,
            projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
        }));
    },

    setStep: (step) => set((state) => ({ step, maxStep: Math.max(state.maxStep, step) as StoryboardStep })),
    setProcessing: (v) => set({ processing: v }),

    // ─── 资产 ───
    setAssets: (assets) =>
        set((state) => {
            if (!state.current) return state;
            pushUndo(state.current, "setAssets");
            return { current: { ...state.current, assets } };
        }),

    confirmAssets: () => {
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, status: "assets_confirmed" as StoryboardStatus }, step: 3 as StoryboardStep };
        });
    },

    // ─── 场景 ───
    setScenes: (scenes) =>
        set((state) => {
            if (!state.current) return state;
            pushUndo(state.current, "setScenes");
            return { current: { ...state.current, scenes } };
        }),

    updateScene: (sceneId, patch) =>
        set((state) => {
            if (!state.current) return state;
            pushUndo(state.current, `updateScene:${sceneId}`);
            return { current: { ...state.current, scenes: state.current.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)) } };
        }),

    removeScene: (sceneId) =>
        set((state) => {
            if (!state.current) return state;
            pushUndo(state.current);
            const scenes = state.current.scenes.filter((s) => s.id !== sceneId).map((s, i) => ({ ...s, index: i }));
            return { current: { ...state.current, scenes } };
        }),

    addScene: () =>
        set((state) => {
            if (!state.current) return state;
            pushUndo(state.current);
            const newScene: Scene = { id: nanoid(), index: state.current.scenes.length, title: "新场景", summary: "", shots: [], confirmed: false };
            return { current: { ...state.current, scenes: [...state.current.scenes, newScene] } };
        }),

    confirmScenes: () => {
        set((state) => {
            if (!state.current) return state;
            const scenes = state.current.scenes.map((s) => ({ ...s, confirmed: true }));
            return { current: { ...state.current, scenes, status: "scenes_confirmed" as StoryboardStatus }, step: 4 as StoryboardStep };
        });
    },

    // ─── 镜头 ───
    setSceneShots: (sceneId, shots) =>
        set((state) => {
            if (!state.current) return state;
            pushUndo(state.current, `setSceneShots:${sceneId}`);
            return { current: { ...state.current, scenes: state.current.scenes.map((s) => (s.id === sceneId ? { ...s, shots } : s)) } };
        }),

    updateShot: (sceneId, shotId, patch) =>
        set((state) => {
            if (!state.current) return state;
            pushUndo(state.current, `updateShot:${shotId}`);
            return {
                current: {
                    ...state.current,
                    scenes: state.current.scenes.map((s) => (s.id === sceneId ? { ...s, shots: s.shots.map((sh) => (sh.id === shotId ? { ...sh, ...patch } : sh)) } : s)),
                },
            };
        }),

    removeShot: (sceneId, shotId) =>
        set((state) => {
            if (!state.current) return state;
            pushUndo(state.current);
            return {
                current: {
                    ...state.current,
                    scenes: state.current.scenes.map((s) => (s.id === sceneId ? { ...s, shots: s.shots.filter((sh) => sh.id !== shotId).map((sh, i) => ({ ...sh, index: i })) } : s)),
                },
            };
        }),

    addShot: (sceneId) =>
        set((state) => {
            if (!state.current) return state;
            pushUndo(state.current);
            const newShot: Shot = { id: nanoid(), index: 0, shotType: "中景", angle: "平视", action: "", visualDescription: "", confirmed: false };
            return {
                current: {
                    ...state.current,
                    scenes: state.current.scenes.map((s) => (s.id === sceneId ? { ...s, shots: [...s.shots, { ...newShot, index: s.shots.length }] } : s)),
                },
            };
        }),

    reorderShots: (sceneId, fromIndex, toIndex) =>
        set((state) => {
            if (!state.current) return state;
            pushUndo(state.current);
            return {
                current: {
                    ...state.current,
                    scenes: state.current.scenes.map((s) => {
                        if (s.id !== sceneId) return s;
                        const shots = [...s.shots];
                        const [moved] = shots.splice(fromIndex, 1);
                        shots.splice(toIndex, 0, moved);
                        return { ...s, shots: shots.map((sh, i) => ({ ...sh, index: i })) };
                    }),
                },
            };
        }),

    confirmShots: () => {
        set((state) => {
            if (!state.current) return state;
            const scenes = state.current.scenes.map((s) => ({ ...s, shots: s.shots.map((sh) => ({ ...sh, confirmed: true })) }));
            return { current: { ...state.current, scenes, status: "shots_confirmed" as StoryboardStatus }, step: 5 as StoryboardStep };
        });
    },

    // ─── 画面描述 ───
    updateShotDescription: (sceneId, shotId, description) =>
        set((state) => {
            if (!state.current) return state;
            return {
                current: {
                    ...state.current,
                    scenes: state.current.scenes.map((s) => (s.id === sceneId ? { ...s, shots: s.shots.map((sh) => (sh.id === shotId ? { ...sh, visualDescription: description } : sh)) } : s)),
                },
            };
        }),

    confirmDescriptions: () => {
        set((state) => {
            if (!state.current) return state;
            return { current: { ...state.current, status: "descriptions_confirmed" as StoryboardStatus } };
        });
        void get().saveCurrent();
    },
}));
