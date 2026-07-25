import { create } from "zustand";

import type { StoryboardProject } from "@/types/storyboard";

const MAX_HISTORY = 50;
/** 同一 opKey 在此时间窗口内的连续操作合并为一次快照（避免逐字输入刷屏） */
const COALESCE_MS = 800;

type UndoStore = {
    past: StoryboardProject[];
    future: StoryboardProject[];
    /** 推入快照（带合并窗口） */
    push: (snapshot: StoryboardProject, opKey?: string) => void;
    /** 撤销：返回要恢复的快照，同时将当前状态推入 future */
    undo: (currentSnapshot: StoryboardProject) => StoryboardProject | null;
    /** 重做：返回要恢复的快照，同时将当前状态推入 past */
    redo: (currentSnapshot: StoryboardProject) => StoryboardProject | null;
    /** 切换项目时清空历史 */
    clear: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
};

let lastOpKey = "";
let lastPushTime = 0;

export const useUndoStore = create<UndoStore>()((set, get) => ({
    past: [],
    future: [],

    push: (snapshot, opKey) => {
        const nowTs = Date.now();
        // 合并窗口：相同 opKey 且时间间隔内不重复推入
        if (opKey && opKey === lastOpKey && nowTs - lastPushTime < COALESCE_MS) {
            lastPushTime = nowTs;
            return;
        }
        lastOpKey = opKey || "";
        lastPushTime = nowTs;

        set((state) => ({
            past: [...state.past.slice(-(MAX_HISTORY - 1)), structuredClone(snapshot)],
            future: [], // 新操作清空 redo 栈
        }));
    },

    undo: (currentSnapshot) => {
        const { past } = get();
        if (past.length === 0) return null;
        const restored = past[past.length - 1];
        set((state) => ({
            past: state.past.slice(0, -1),
            future: [...state.future, structuredClone(currentSnapshot)],
        }));
        lastOpKey = "";
        return restored;
    },

    redo: (currentSnapshot) => {
        const { future } = get();
        if (future.length === 0) return null;
        const restored = future[future.length - 1];
        set((state) => ({
            future: state.future.slice(0, -1),
            past: [...state.past, structuredClone(currentSnapshot)],
        }));
        lastOpKey = "";
        return restored;
    },

    clear: () => {
        lastOpKey = "";
        lastPushTime = 0;
        set({ past: [], future: [] });
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
}));
