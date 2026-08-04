import { useEffect, useRef, useState } from "react";
import { Button, Slider, Tooltip } from "antd";
import { Play, LoaderCircle } from "lucide-react";

import { EMOTION_OPTIONS, type EmotionType } from "../types";
import { useVoiceStore } from "../store/use-voice-store";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";

/** Inline emotion badge for script lines */
export function EmotionBadge({ lineId, emotion, intensity }: { lineId: string; emotion: EmotionType; intensity: number }) {
    const setLineEmotion = useVoiceStore((s) => s.setLineEmotion);
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const current = EMOTION_OPTIONS.find((e) => e.value === emotion) ?? EMOTION_OPTIONS[0];

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div ref={containerRef} className="relative inline-flex">
            <Tooltip title={`${current.label} ${Math.round(intensity * 100)}%`}>
                <button
                    type="button"
                    className="flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[10px] transition-colors hover:bg-white/[0.06]"
                    onClick={() => setOpen(!open)}
                >
                    <span>{current.icon}</span>
                </button>
            </Tooltip>

            {open && (
                <div className="absolute bottom-full left-0 z-50 mb-1 w-48 rounded-xl border border-white/[0.08] bg-[#1e1e28] p-2.5 shadow-xl shadow-black/40">
                    <div className="grid grid-cols-4 gap-1">
                        {EMOTION_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                className={cn(
                                    "flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-[10px] transition-colors",
                                    emotion === opt.value
                                        ? "bg-violet-500/15 text-violet-300"
                                        : "text-stone-400 hover:bg-white/[0.06] hover:text-stone-200",
                                )}
                                onClick={() => { setLineEmotion(lineId, opt.value, intensity); setOpen(false); }}
                            >
                                <span className="text-sm">{opt.icon}</span>
                                <span>{opt.label}</span>
                            </button>
                        ))}
                    </div>
                    <div className="mt-2 px-1">
                        <span className="text-[10px] text-stone-500">强度</span>
                        <Slider
                            min={0}
                            max={100}
                            value={Math.round(intensity * 100)}
                            onChange={(v) => setLineEmotion(lineId, emotion, v / 100)}
                            className="!my-1 [&_.ant-rail]:!bg-white/[0.06] [&_.ant-rail]:!h-1 [&_.ant-track]:!bg-violet-500 [&_.ant-track]:!h-1 [&_.ant-slider-handle]:!border-violet-400 [&_.ant-slider-handle]:!bg-violet-500 [&_.ant-slider-handle]:!shadow-none [&_.ant-slider-handle]:!size-2.5"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

/** Batch emotion panel for right sidebar tab */
export function EmotionBatchPanel() {
    const { current, batchSetEmotion, previewVoice } = useVoiceStore(
        useShallow((s) => ({
            current: s.current,
            batchSetEmotion: s.batchSetEmotion,
            previewVoice: s.previewVoice,
        })),
    );
    const [emotion, setEmotion] = useState<EmotionType>("neutral");
    const [intensity, setIntensity] = useState(50);
    const [previewing, setPreviewing] = useState(false);

    if (!current) return null;

    const allLineIds = current.lines.map((l) => l.id);

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
            <p className="text-xs text-stone-500">批量设置所有台词的情绪（{current.lines.length} 段）</p>

            {/* Emotion grid */}
            <div className="grid grid-cols-4 gap-1.5">
                {EMOTION_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        className={cn(
                            "flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs transition-all",
                            emotion === opt.value
                                ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                                : "border-white/[0.06] bg-white/[0.02] text-stone-400 hover:border-white/[0.1] hover:text-stone-200",
                        )}
                        onClick={() => setEmotion(opt.value)}
                    >
                        <span className="text-lg">{opt.icon}</span>
                        <span className="text-[10px]">{opt.label}</span>
                    </button>
                ))}
            </div>

            {/* Intensity */}
            <div>
                <div className="mb-1 flex items-center justify-between text-[10px] text-stone-500">
                    <span>情绪强度</span>
                    <span className="tabular-nums">{intensity}%</span>
                </div>
                <Slider
                    min={0}
                    max={100}
                    value={intensity}
                    onChange={setIntensity}
                    className="[&_.ant-rail]:!bg-white/[0.06] [&_.ant-rail]:!h-1 [&_.ant-track]:!bg-violet-500 [&_.ant-track]:!h-1 [&_.ant-slider-handle]:!border-violet-400 [&_.ant-slider-handle]:!bg-violet-500 [&_.ant-slider-handle]:!shadow-none [&_.ant-slider-handle]:!size-2.5"
                />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <Button
                    type="primary"
                    block
                    size="small"
                    className="!bg-violet-500 !border-none hover:!bg-violet-400"
                    disabled={allLineIds.length === 0}
                    onClick={() => batchSetEmotion(allLineIds, emotion, intensity / 100)}
                >
                    应用到全部台词
                </Button>
                <Button
                    size="small"
                    className="!border-white/[0.08] !bg-white/[0.04] !text-stone-400 hover:!text-stone-200"
                    icon={previewing ? <LoaderCircle className="size-3 animate-spin" /> : <Play className="size-3" />}
                    disabled={previewing}
                    onClick={() => void handlePreviewEmotion()}
                    title="试听情绪效果"
                />
            </div>
        </div>
    );
}
