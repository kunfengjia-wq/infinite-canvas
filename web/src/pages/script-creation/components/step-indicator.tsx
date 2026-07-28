import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CreationPhase } from "@/types/script-creation";

type PhaseMeta = { phase: CreationPhase; label: string; description: string };

export function StepIndicator({ phases, current, maxReached, onNavigate }: { phases: PhaseMeta[]; current: number; maxReached?: number; onNavigate?: (phase: number) => void }) {
    const max = maxReached ?? current;
    return (
        <div className="flex items-center gap-2">
            {phases.map((p, i) => {
                const isDone = current > p.phase;
                const isActive = current === p.phase;
                const isReachable = p.phase <= max && !isActive;
                return (
                    <div key={p.phase} className="flex items-center gap-2">
                        {i > 0 && <div className={cn("h-px w-6", isDone || isActive ? "bg-blue-400" : "bg-stone-200 dark:bg-stone-700")} />}
                        <div
                            className={cn(
                                "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                                isActive && "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-800",
                                isDone && "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
                                !isActive && !isDone && p.phase <= max && "bg-stone-50 text-stone-500 dark:bg-stone-800/50 dark:text-stone-400",
                                !isActive && !isDone && p.phase > max && "text-stone-400",
                                isReachable && "cursor-pointer hover:ring-1 hover:ring-blue-300 dark:hover:ring-blue-700",
                            )}
                            title={isReachable ? `点击前往「${p.label}」` : p.description}
                            onClick={isReachable ? () => onNavigate?.(p.phase) : undefined}
                        >
                            <span
                                className={cn(
                                    "flex size-4 items-center justify-center rounded-full text-[10px]",
                                    isActive && "bg-blue-600 text-white",
                                    isDone && "bg-emerald-500 text-white",
                                    !isActive && !isDone && "bg-stone-200 text-stone-500 dark:bg-stone-700",
                                )}
                            >
                                {isDone ? <Check className="size-2.5" /> : p.phase}
                            </span>
                            {p.label}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
