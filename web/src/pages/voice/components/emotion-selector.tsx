import { useState } from "react";
import { Button, Slider, Tooltip } from "antd";
import { Play, LoaderCircle } from "lucide-react";

import { EMOTION_OPTIONS, type EmotionType } from "../types";
import { useVoiceStore } from "../store/use-voice-store";
import { cn } from "@/lib/utils";

/** 单段情绪选择器（内联在台词行中） */
export function EmotionBadge({ lineId, emotion, intensity }: { lineId: string; emotion: EmotionType; intensity: number }) {
    const setLineEmotion = useVoiceStore((s) => s.setLineEmotion);
    const [open, setOpen] = useState(false);
    const current = EMOTION_OPTIONS.find((e) => e.value === emotion) ?? EMOTION_OPTIONS[0];

    return (
        <div className="relative inline-flex">
            <Tooltip title={`${current.label} ${Math.round(intensity * 100)}%`}>
                <button
                    type="button"
                    className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] transition-colors hover:bg-stone-100 dark:hover:bg-stone-700"
                    onClick={() => setOpen(!open)}
                >
                    <span>{current.icon}</span>
                </button>
            </Tooltip>

            {open && (
                <>
                    {/* 点击外部关闭 */}
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute bottom-full left-0 z-50 mb-1 w-44 rounded-lg border border-stone-200 bg-white p-2 shadow-lg dark:border-stone-700 dark:bg-stone-800">
                        <div className="grid grid-cols-4 gap-1">
                            {EMOTION_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    className={cn(
                                        "flex flex-col items-center gap-0.5 rounded-md p-1.5 text-[10px] transition-colors",
                                        emotion === opt.value ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" : "hover:bg-stone-100 dark:hover:bg-stone-700",
                                    )}
                                    onClick={() => { setLineEmotion(lineId, opt.value, intensity); setOpen(false); }}
                                >
                                    <span className="text-sm">{opt.icon}</span>
                                    <span>{opt.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="mt-2 px-1">
                            <span className="text-[10px] text-stone-400">强度</span>
                            <Slider
                                min={0}
                                max={100}
                                value={Math.round(intensity * 100)}
                                onChange={(v) => setLineEmotion(lineId, emotion, v / 100)}
                                className="!my-1"
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

/** 批量情绪设置面板（右栏 Tab 中使用） */
export function EmotionBatchPanel() {
    const current = useVoiceStore((s) => s.current);
    const batchSetEmotion = useVoiceStore((s) => s.batchSetEmotion);
    const previewVoice = useVoiceStore((s) => s.previewVoice);
    const [emotion, setEmotion] = useState<EmotionType>("neutral");
    const [intensity, setIntensity] = useState(50);
    const [previewing, setPreviewing] = useState(false);

    if (!current) return null;

    const allLineIds = current.lines.map((l) => l.id);
    const doneCount = current.lines.filter((l) => l.status === "done").length;

    const handlePreviewEmotion = async () => {
        setPreviewing(true);
        try {
            const firstChar = current.characters[0];
            const voice = firstChar?.voice ?? "Vivian";
            await previewVoice(current.engine, voice, emotion, intensity / 100);
        } catch { /* ignore */ }
        setPreviewing(false);
    };

    return (
        <div className="space-y-4 p-3">
            <p className="text-xs text-stone-400">批量设置所有台词的情绪（{current.lines.length} 段）</p>

            {/* 情绪选择 */}
            <div className="grid grid-cols-4 gap-1.5">
                {EMOTION_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        className={cn(
                            "flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors",
                            emotion === opt.value
                                ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                                : "border-stone-200 hover:border-stone-300 dark:border-stone-700",
                        )}
                        onClick={() => setEmotion(opt.value)}
                    >
                        <span className="text-lg">{opt.icon}</span>
                        <span>{opt.label}</span>
                    </button>
                ))}
            </div>

            {/* 强度 */}
            <div>
                <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
                    <span>情绪强度</span>
                    <span>{intensity}%</span>
                </div>
                <Slider min={0} max={100} value={intensity} onChange={setIntensity} />
            </div>

            {/* 应用 */}
            <div className="flex gap-2">
                <Button
                    type="primary"
                    block
                    size="small"
                    disabled={allLineIds.length === 0}
                    onClick={() => batchSetEmotion(allLineIds, emotion, intensity / 100)}
                >
                    应用到全部台词
                </Button>
                <Button
                    size="small"
                    icon={previewing ? <LoaderCircle className="size-3 animate-spin" /> : <Play className="size-3" />}
                    disabled={previewing}
                    onClick={() => void handlePreviewEmotion()}
                    title="试听情绪效果"
                />
            </div>
        </div>
    );
}
