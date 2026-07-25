import { cn } from "@/lib/utils";
import { STORYBOARD_STEPS, type StoryboardStep } from "@/types/storyboard";

export function StepIndicator({ current, onStepClick }: { current: StoryboardStep; onStepClick: (step: StoryboardStep) => void }) {
    return (
        <div className="flex items-center gap-1 px-4 py-2">
            {STORYBOARD_STEPS.map((s, i) => (
                <div key={s.step} className="flex items-center">
                    {i > 0 && <div className={cn("mx-1 h-px w-4", s.step <= current ? "bg-blue-400" : "bg-stone-300 dark:bg-stone-700")} />}
                    <button
                        type="button"
                        onClick={() => onStepClick(s.step)}
                        className={cn(
                            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition",
                            s.step === current
                                ? "bg-blue-500 font-medium text-white shadow-sm"
                                : s.step < current
                                  ? "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400"
                                  : "text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800",
                        )}
                    >
                        <span className={cn(
                            "flex size-4 items-center justify-center rounded-full text-[10px] font-bold",
                            s.step === current ? "bg-white/20" : s.step < current ? "bg-blue-200 dark:bg-blue-800" : "bg-stone-200 dark:bg-stone-700",
                        )}>
                            {s.step < current ? "✓" : s.step}
                        </span>
                        {s.label}
                    </button>
                </div>
            ))}
        </div>
    );
}
