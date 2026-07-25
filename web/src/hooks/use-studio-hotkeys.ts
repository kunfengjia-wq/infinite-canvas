import { useEffect } from "react";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { useUndoStore } from "@/stores/use-undo-store";

type HotkeyOptions = {
    /** 是否启用（仅在 studio 页面激活） */
    enabled?: boolean;
};

/** 判断事件目标是否在输入框内（避免干扰正常文本编辑的浏览器原生撤销） */
function isEditableTarget(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || el.isContentEditable;
}

/**
 * 创作工作台全局快捷键
 * - Ctrl/Cmd + S：保存当前项目
 * - Ctrl/Cmd + Z：撤销（非输入框内）
 * - Ctrl/Cmd + Shift + Z：重做（非输入框内）
 */
export function useStudioHotkeys({ enabled = true }: HotkeyOptions = {}) {
    useEffect(() => {
        if (!enabled) return;

        const handler = (e: KeyboardEvent) => {
            const isMod = e.ctrlKey || e.metaKey;
            if (!isMod) return;

            // Ctrl/Cmd + S → 保存
            if (e.key === "s" || e.key === "S") {
                e.preventDefault();
                const { current, saveCurrent } = useStoryboardStore.getState();
                if (current) {
                    void saveCurrent();
                }
                return;
            }

            // Ctrl/Cmd + Z → 撤销 / Ctrl/Cmd + Shift + Z → 重做
            if ((e.key === "z" || e.key === "Z") && !isEditableTarget(e)) {
                e.preventDefault();
                const { current } = useStoryboardStore.getState();
                if (!current) return;

                if (e.shiftKey) {
                    // 重做
                    const restored = useUndoStore.getState().redo(current);
                    if (restored) {
                        useStoryboardStore.setState({ current: restored });
                    }
                } else {
                    // 撤销
                    const restored = useUndoStore.getState().undo(current);
                    if (restored) {
                        useStoryboardStore.setState({ current: restored });
                    }
                }
            }
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [enabled]);
}
