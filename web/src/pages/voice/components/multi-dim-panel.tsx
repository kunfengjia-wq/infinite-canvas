import { useState } from "react";
import { Button, Slider } from "antd";
import { LoaderCircle, Play } from "lucide-react";

import { EMOTION_OPTIONS, STYLE_OPTIONS, type EmotionType, type SpeakingStyle } from "../types";
import { useVoiceStore } from "../store/use-voice-store";
import { cn } from "@/lib/utils";

interface Props {
    /** 引擎支持的能力列表 */
    features: string[];
}

/**
 * 多维度调节面板：情绪 + 语速 + 音调 + 音量 + 风格
 * 根据引擎 features 动态显示可用控件
 */
export function MultiDimPanel({ features }: Props) {
    const { current, batchSetEmotion, previewVoice, updateLine } = useVoiceStore();
    const [emotion, setEmotion] = useState<EmotionType>("neutral");
    const [intensity, setIntensity] = useState(50);
    const [speed, setSpeed] = useState(100); // 50-200 => 0.5x-2.0x
    const [pitch, setPitch] = useState(0);   // -6 ~ +6
    const [volume, setVolume] = useState(100);
    const [style, setStyle] = useState<SpeakingStyle>("dialogue");
    const [previewing, setPreviewing] = useState(false);

    if (!current) return null;

    const hasEmotion = features.includes("emotion");
    const hasSpeed = features.includes("speed");
    const hasStyle = features.includes("style");

    const allLineIds = current.lines.map((l) => l.id);

    /** 批量应用所有维度到全部台词 */
    const handleApplyAll = () => {
        const patch: Record<string, unknown> = {
            speed: speed / 100,
            pitch,
            volume,
        };
        if (hasEmotion) {
            patch.emotion = emotion;
            patch.emotionIntensity = intensity / 100;
        }
        if (hasStyle) {
            patch.style = style;
        }
        // 批量更新
        for (const id of allLineIds) {
            updateLine(id, patch);
        }
        if (hasEmotion) {
            batchSetEmotion(allLineIds, emotion, intensity / 100);
        }
        void useVoiceStore.getState().saveCurrent();
    };

    const handlePreview = async () => {
        setPreviewing(true);
        try {
            const firstChar = current.characters[0];
            const voice = firstChar?.voice ?? "Vivian";
            const engine = voice.startsWith("clone_") ? "qwen3-tts-clone" : current.engine;
            await previewVoice(engine, voice, hasEmotion ? emotion : undefined, intensity / 100);
        } catch { /* ignore */ }
        setPreviewing(false);
    };

    return (
        <div className="space-y-4">
            {/* 情绪选择 */}
            {hasEmotion && (
                <div>
                    <p className="mb-2 text-[11px] font-medium text-stone-500">情绪</p>
                    <div className="grid grid-cols-7 gap-1">
                        {EMOTION_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                className={cn(
                                    "flex flex-col items-center gap-0.5 rounded-lg border p-1.5 text-[10px] transition-colors",
                                    emotion === opt.value
                                        ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                                        : "border-stone-200 hover:border-stone-300 dark:border-stone-700",
                                )}
                                onClick={() => setEmotion(opt.value)}
                            >
                                <span className="text-base">{opt.icon}</span>
                                <span>{opt.label}</span>
                            </button>
                        ))}
                    </div>
                    <div className="mt-2">
                        <div className="flex items-center justify-between text-[10px] text-stone-400">
                            <span>强度</span>
                            <span>{intensity}%</span>
                        </div>
                        <Slider min={0} max={100} value={intensity} onChange={setIntensity} className="!my-1" />
                    </div>
                </div>
            )}

            {/* 语速 */}
            {hasSpeed && (
                <div>
                    <div className="flex items-center justify-between text-[10px] text-stone-400">
                        <span>语速</span>
                        <span>{(speed / 100).toFixed(1)}x</span>
                    </div>
                    <Slider min={50} max={200} value={speed} onChange={setSpeed} className="!my-1" />
                </div>
            )}

            {/* 音调 */}
            <div>
                <div className="flex items-center justify-between text-[10px] text-stone-400">
                    <span>音调</span>
                    <span>{pitch > 0 ? `+${pitch}` : pitch} 半音</span>
                </div>
                <Slider min={-6} max={6} value={pitch} onChange={setPitch} className="!my-1" />
            </div>

            {/* 音量 */}
            <div>
                <div className="flex items-center justify-between text-[10px] text-stone-400">
                    <span>音量</span>
                    <span>{volume}%</span>
                </div>
                <Slider min={0} max={100} value={volume} onChange={setVolume} className="!my-1" />
            </div>

            {/* 风格 */}
            {hasStyle && (
                <div>
                    <p className="mb-1.5 text-[11px] font-medium text-stone-500">说话风格</p>
                    <div className="grid grid-cols-4 gap-1.5">
                        {STYLE_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                className={cn(
                                    "rounded-lg border px-2 py-1.5 text-[11px] transition-colors",
                                    style === opt.value
                                        ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                                        : "border-stone-200 hover:border-stone-300 dark:border-stone-700",
                                )}
                                onClick={() => setStyle(opt.value)}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 操作 */}
            <div className="flex gap-2 pt-1">
                <Button
                    type="primary"
                    size="small"
                    className="flex-1"
                    disabled={allLineIds.length === 0}
                    onClick={handleApplyAll}
                >
                    应用到全部台词
                </Button>
                <Button
                    size="small"
                    icon={previewing ? <LoaderCircle className="size-3 animate-spin" /> : <Play className="size-3" />}
                    disabled={previewing}
                    onClick={() => void handlePreview()}
                    title="试听效果"
                />
            </div>
        </div>
    );
}
