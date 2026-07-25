import { cn } from "@/lib/utils";
import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { PLATFORM_LIST } from "@/types/prompt-studio";

export function PlatformSelector() {
    const { selectedPlatform, setPlatform } = usePromptStudioStore();

    const imagePlatforms = PLATFORM_LIST.filter((p) => p.category === "image");
    const videoPlatforms = PLATFORM_LIST.filter((p) => p.category === "video");

    return (
        <section>
            <h3 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-300">目标平台</h3>
            <div className="space-y-3">
                <div>
                    <span className="mb-1.5 block text-xs text-stone-400">图片平台</span>
                    <div className="flex flex-wrap gap-2">
                        {imagePlatforms.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => setPlatform(p.id)}
                                className={cn(
                                    "rounded-md border px-3 py-1.5 text-sm transition",
                                    selectedPlatform === p.id
                                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-300"
                                        : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900",
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <span className="mb-1.5 block text-xs text-stone-400">视频平台</span>
                    <div className="flex flex-wrap gap-2">
                        {videoPlatforms.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => setPlatform(p.id)}
                                className={cn(
                                    "rounded-md border px-3 py-1.5 text-sm transition",
                                    selectedPlatform === p.id
                                        ? "border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-400 dark:bg-purple-950 dark:text-purple-300"
                                        : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900",
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            {(() => {
                const meta = PLATFORM_LIST.find((p) => p.id === selectedPlatform);
                if (!meta) return null;
                return (
                    <p className="mt-2 text-xs text-stone-400">
                        {meta.description}
                        {meta.parameterHints.length > 0 && <span className="ml-2 text-stone-300 dark:text-stone-600">| {meta.parameterHints.join("  ")}</span>}
                    </p>
                );
            })()}
        </section>
    );
}
