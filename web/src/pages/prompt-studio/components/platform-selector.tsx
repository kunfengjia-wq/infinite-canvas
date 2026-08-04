import { Check } from "lucide-react";
import { useCallback } from "react";

import { cn } from "@/lib/utils";
import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { PLATFORM_LIST, type PlatformMeta } from "@/types/prompt-studio";

const RECENT_KEY = "prompt-studio:recent-platforms";
const MAX_RECENT_PLATFORMS = 10;

function getRecentPlatforms(): string[] {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}

function pushRecentPlatform(id: string) {
    const list = getRecentPlatforms().filter((p) => p !== id);
    list.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT_PLATFORMS)));
}

/** 按最近使用排序 */
function sortByRecent(platforms: PlatformMeta[]): PlatformMeta[] {
    const recent = getRecentPlatforms();
    return [...platforms].sort((a, b) => {
        const ai = recent.indexOf(a.id);
        const bi = recent.indexOf(b.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
    });
}

/**
 * 目标平台多选切换按钮（图片/视频分组，带勾选角标）
 * compact 用于双栏工作台顶部紧凑工具条
 */
export function PlatformSelector({ compact = false }: { compact?: boolean }) {
    const selectedPlatforms = usePromptStudioStore((s) => s.selectedPlatforms);
    const togglePlatform = usePromptStudioStore((s) => s.togglePlatform);

    const imagePlatforms = sortByRecent(PLATFORM_LIST.filter((p) => p.category === "image"));
    const videoPlatforms = sortByRecent(PLATFORM_LIST.filter((p) => p.category === "video"));

    const handleToggle = useCallback((id: string) => {
        togglePlatform(id);
        if (!selectedPlatforms.includes(id)) pushRecentPlatform(id);
    }, [togglePlatform, selectedPlatforms]);

    const renderPlatformButton = (p: PlatformMeta) => {
        const isSelected = selectedPlatforms.includes(p.id);
        const colorClass =
            p.category === "video"
                ? isSelected
                  ? "border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950 dark:text-purple-300"
                  : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900"
                : isSelected
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-300"
                  : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900";

        return (
            <button
                key={p.id}
                type="button"
                onClick={() => handleToggle(p.id)}
                className={cn("relative rounded-md border transition", compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm", colorClass)}
            >
                {isSelected && <Check className={cn("absolute rounded-full bg-current p-0.5 text-white dark:text-stone-900", compact ? "-left-1 -top-1 size-3" : "-left-1 -top-1 size-3.5")} />}
                {p.label}
            </button>
        );
    };

    if (compact) {
        return (
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-stone-400">平台</span>
                {imagePlatforms.map(renderPlatformButton)}
                <span className="mx-1 h-3 w-px bg-stone-200 dark:bg-stone-700" />
                {videoPlatforms.map(renderPlatformButton)}
            </div>
        );
    }

    return (
        <section>
            <h3 className="mb-1 text-sm font-medium text-stone-600 dark:text-stone-300">目标平台</h3>
            <p className="mb-3 text-xs text-stone-400">可多选，批量生成时将为每个选中平台分别生成</p>
            <div className="space-y-3">
                <div>
                    <span className="mb-1.5 block text-xs text-stone-400">图片平台</span>
                    <div className="flex flex-wrap gap-2">{imagePlatforms.map(renderPlatformButton)}</div>
                </div>
                <div>
                    <span className="mb-1.5 block text-xs text-stone-400">视频平台</span>
                    <div className="flex flex-wrap gap-2">{videoPlatforms.map(renderPlatformButton)}</div>
                </div>
            </div>
            {selectedPlatforms.length > 0 && (
                <p className="mt-2 text-xs text-stone-400">已选 {selectedPlatforms.length} 个平台：{selectedPlatforms.map((id) => PLATFORM_LIST.find((p) => p.id === id)?.label || id).join("、")}</p>
            )}
        </section>
    );
}
