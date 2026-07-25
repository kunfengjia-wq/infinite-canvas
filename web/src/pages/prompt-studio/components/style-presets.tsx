import { cn } from "@/lib/utils";
import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { PLATFORM_LIST, STYLE_PRESETS } from "@/types/prompt-studio";

export function StylePresets({ compact = false }: { compact?: boolean }) {
    const { selectedPlatform, selectedStyle, setStyle } = usePromptStudioStore();
    const platformMeta = PLATFORM_LIST.find((p) => p.id === selectedPlatform);
    const category = platformMeta?.category || "image";

    // 根据平台类型过滤风格
    const availableStyles = STYLE_PRESETS.filter((s) => s.category === "both" || s.category === category);

    const renderButton = (id: string, label: string, isNone = false) => {
        const isActive = isNone ? !selectedStyle : selectedStyle === id;
        return (
            <button
                key={id}
                type="button"
                onClick={() => setStyle(isNone ? "" : id)}
                className={cn(
                    "rounded-md border transition",
                    compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
                    isActive
                        ? isNone
                            ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                            : "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300"
                        : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900",
                )}
            >
                {label}
            </button>
        );
    };

    if (compact) {
        return (
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-stone-400">风格</span>
                {renderButton("", "不限", true)}
                {availableStyles.map((style) => renderButton(style.id, style.label))}
            </div>
        );
    }

    return (
        <section>
            <h3 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-300">
                风格预设 <span className="font-normal text-stone-400">（可选）</span>
            </h3>
            <div className="flex flex-wrap gap-2">
                {renderButton("", "不限", true)}
                {availableStyles.map((style) => renderButton(style.id, style.label))}
            </div>
        </section>
    );
}
