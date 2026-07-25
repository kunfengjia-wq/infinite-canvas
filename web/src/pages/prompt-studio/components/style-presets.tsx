import { cn } from "@/lib/utils";
import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { PLATFORM_LIST, STYLE_PRESETS } from "@/types/prompt-studio";

export function StylePresets() {
    const { selectedPlatform, selectedStyle, setStyle } = usePromptStudioStore();
    const platformMeta = PLATFORM_LIST.find((p) => p.id === selectedPlatform);
    const category = platformMeta?.category || "image";

    // 根据平台类型过滤风格
    const availableStyles = STYLE_PRESETS.filter((s) => s.category === "both" || s.category === category);

    return (
        <section>
            <h3 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-300">
                风格预设 <span className="font-normal text-stone-400">（可选）</span>
            </h3>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => setStyle("")}
                    className={cn(
                        "rounded-md border px-3 py-1.5 text-sm transition",
                        !selectedStyle
                            ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                            : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900",
                    )}
                >
                    不限
                </button>
                {availableStyles.map((style) => (
                    <button
                        key={style.id}
                        type="button"
                        onClick={() => setStyle(style.id)}
                        className={cn(
                            "rounded-md border px-3 py-1.5 text-sm transition",
                            selectedStyle === style.id
                                ? "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300"
                                : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900",
                        )}
                    >
                        {style.label}
                    </button>
                ))}
            </div>
        </section>
    );
}
