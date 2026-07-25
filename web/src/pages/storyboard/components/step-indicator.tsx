import { Check } from "lucide-react";

import { STORYBOARD_STEPS, type StoryboardStep } from "@/types/storyboard";
import { cn } from "@/lib/utils";

/** 紧凑横向步骤指示器（用于分镜工作区顶栏） */
export function StepIndicator({ current, onStepClick }: { current: StoryboardStep; onStepClick: (target: StoryboardStep) => void }) {
    return (
        <nav className="flex items-center justify-center gap-1 px-4 py-2">
            {STORYBOARD_STEPS.map((s, i) => {
                const isDone = s.step < current;
                const isActive = s.step === current;
                return (
                    <div key={s.step} className="flex items-center">
                        {i > 0 && (
                            <div className={cn("mx-1.5 h-px w-6 sm:w-10", isDone || isActive ? "bg-blue-400" : "bg-stone-200 dark:bg-stone-700")} />
                        )}
                        <button
                            type="button"
                            onClick={() => onStepClick(s.step)}
                            title={s.description}
                            className={cn(
                                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-all",
                                isActive
                                    ? "bg-blue-500 font-medium text-white shadow-sm shadow-blue-500/30"
                                    : isDone
                                      ? "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-900/50"
                                      : "text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800",
                            )}
                        >
                            <span
                                className={cn(
                                    "flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold",
                                    isActive
                                        ? "bg-white/25"
                                        : isDone
                                          ? "bg-blue-100 dark:bg-blue-900"
                                          : "bg-stone-100 dark:bg-stone-800",
                                )}
                            >
                                {isDone ? <Check className="size-3" /> : s.step}
                            </span>
                            <span className="hidden sm:inline">{s.label}</span>
                        </button>
                    </div>
                );
            })}
        </nav>
    );
}
