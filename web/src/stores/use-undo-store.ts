/**
 * 撤销栈 Store - 分镜项目编辑快照管理
 * 支持 opKey 合并：连续相同操作只保留最早快照
 */
import { create } from "zustand";

import type { StoryboardProject } from "@/types/storyboard";

type UndoEntry = {
    snapshot: StoryboardProject;
    opKey?: string;
};

const MAX_STACK = 50;

type UndoStore = {
    stack: UndoEntry[];
    /** 推入快照（相同 opKey 连续调用时合并，只保留最早快照） */
    push: (snapshot: StoryboardProject, opKey?: string) => void;
    /** 弹出最近快照 */
    pop: () => StoryboardProject | null;
    /** 是否可撤销 */
    canUndo: () => boolean;
    /** 清空撤销栈 */
    clear: () => void;
};

export const useUndoStore = create<UndoStore>()((set, get) => ({
    stack: [],

    push: (snapshot, opKey) =>
        set((state) => {
            const top = state.stack[state.stack.length - 1];
            // 连续相同 opKey 合并：保留最早快照
            if (opKey && top?.opKey === opKey) return state;
            const stack = [...state.stack, { snapshot, opKey }];
            if (stack.length > MAX_STACK) stack.shift();
            return { stack };
        }),

    pop: () => {
        const { stack } = get();
        if (stack.length === 0) return null;
        const entry = stack[stack.length - 1];
        set({ stack: stack.slice(0, -1) });
        return entry.snapshot;
    },

    canUndo: () => get().stack.length > 0,

    clear: () => set({ stack: [] }),
}));
