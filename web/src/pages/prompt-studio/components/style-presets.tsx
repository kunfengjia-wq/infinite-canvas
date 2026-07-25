import { cn } from "@/lib/utils";
import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { STYLE_PRESETS } from "@/types/prompt-studio";

/** 风格分类顺序 */
const styleCategories = Array.from(new Set(STYLE_PRESETS.map((s) => s.category)));

/**
 * 风格预设按钮组（按分类分组）
 * compact 用于双栏工作台顶部紧凑工具条
 */
export function StylePresets({ compact = false }: { compact?: boolean }) {
    const { selectedStyle, setStyle } = usePromptStudioStore();

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
                {STYLE_PRESETS.map((style) => renderButton(style.id, style.label))}
            </div>
        );
    }

    return (
        <section>
            <h3 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-300">
                风格预设 <span className="font-normal text-stone-400">（可选）</span>
            </h3>
            <div className="space-y-2.5">
                <div className="flex flex-wrap gap-2">{renderButton("", "不限", true)}</div>
                {styleCategories.map((cat) => (
                    <div key={cat}>
                        <span className="mb-1.5 block text-xs text-stone-400">{cat}</span>
                        <div className="flex flex-wrap gap-2">{STYLE_PRESETS.filter((s) => s.category === cat).map((style) => renderButton(style.id, style.label))}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}
