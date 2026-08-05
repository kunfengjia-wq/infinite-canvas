import { useState } from "react";
import { App, Button, Tag } from "antd";
import { Info, LoaderCircle, Play, User } from "lucide-react";

import { useVoiceStore } from "../../store/use-voice-store";
import { MultiDimPanel } from "../multi-dim-panel";
import { ENGINE_META, type TTSModelInfo } from "../../types";
import { cn } from "@/lib/utils";

interface Props {
    modelInfo?: TTSModelInfo;
}

/**
 * Qwen3 预设音色面板
 * - 场景说明
 * - 音色卡片网格（带试听）
 * - 角色-音色绑定
 * - 多维调节
 */
export function QwenPresetPanel({ modelInfo }: Props) {
    const { message } = App.useApp();
    const { current, models, updateCharacter, previewVoice } = useVoiceStore();
    const [previewingId, setPreviewingId] = useState<string | null>(null);

    const meta = ENGINE_META.find((m) => m.id === "qwen3-tts")!;
    const voices = modelInfo?.voices ?? models.find((m) => m.id === "qwen3-tts")?.voices ?? [];

    if (!current) return null;

    const handlePreview = async (voiceId: string) => {
        setPreviewingId(voiceId);
        try {
            await previewVoice("qwen3-tts", voiceId);
        } catch (e) {
            message.error(e instanceof Error ? e.message : "试听失败");
        } finally {
            setPreviewingId(null);
        }
    };

    return (
        <div className="space-y-5">
            {/* 场景说明 */}
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2.5 dark:bg-blue-950/30">
                <Info className="mt-0.5 size-3.5 shrink-0 text-blue-500" />
                <div>
                    <p className="text-xs text-blue-700 dark:text-blue-300">{meta.description}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                        {meta.tags.map((t) => (
                            <Tag key={t} className="!m-0 !text-[10px]" color="blue">{t}</Tag>
                        ))}
                    </div>
                </div>
            </div>

            {/* 音色卡片网格 */}
            <div>
                <p className="mb-2 text-[11px] font-medium text-stone-500">音色库 ({voices.length})</p>
                <div className="grid grid-cols-3 gap-2">
                    {voices.map((v) => {
                        const usedBy = current.characters.find((c) => c.voice === v.id);
                        return (
                            <div
                                key={v.id}
                                className={cn(
                                    "group relative flex flex-col items-center gap-1 rounded-xl border p-3 transition-all",
                                    usedBy
                                        ? "border-violet-300 bg-violet-50/60 dark:border-violet-700 dark:bg-violet-900/20"
                                        : "border-stone-200 hover:border-violet-200 hover:shadow-sm dark:border-stone-700",
                                )}
                            >
                                <span className={cn(
                                    "flex size-8 items-center justify-center rounded-full text-xs font-bold text-white",
                                    v.gender === "female" ? "bg-pink-400" : "bg-sky-500",
                                )}>
                                    {v.gender === "female" ? "♀" : "♂"}
                                </span>
                                <span className="text-[11px] font-medium leading-tight">{v.label.split("（")[0]}</span>
                                <span className="text-[9px] text-stone-400">{v.language.toUpperCase()}</span>
                                {usedBy && (
                                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-violet-500 text-[8px] text-white">
                                        <User className="size-2.5" />
                                    </span>
                                )}
                                <Button
                                    type="text"
                                    size="small"
                                    className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100"
                                    icon={previewingId === v.id ? <LoaderCircle className="size-3 animate-spin" /> : <Play className="size-3" />}
                                    onClick={() => void handlePreview(v.id)}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 角色-音色绑定 */}
            <div>
                <p className="mb-2 text-[11px] font-medium text-stone-500">角色音色分配</p>
                <div className="space-y-1.5">
                    {current.characters.map((char) => (
                        <div key={char.id} className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
                            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: char.color }} />
                            <span className="w-16 truncate text-xs font-medium">{char.name}</span>
                            <div className="flex flex-1 flex-wrap gap-1">
                                {voices.slice(0, 5).map((v) => (
                                    <button
                                        key={v.id}
                                        type="button"
                                        className={cn(
                                            "rounded-md border px-1.5 py-0.5 text-[10px] transition-colors",
                                            char.voice === v.id
                                                ? "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-600 dark:bg-violet-900/40 dark:text-violet-300"
                                                : "border-stone-200 text-stone-500 hover:border-stone-300 dark:border-stone-600",
                                        )}
                                        onClick={() => updateCharacter(char.id, { voice: v.id })}
                                    >
                                        {v.label.split("（")[0]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 多维调节 */}
            <div className="border-t border-stone-200 pt-4 dark:border-stone-700">
                <p className="mb-3 text-[11px] font-medium text-stone-500">参数调节</p>
                <MultiDimPanel features={meta.features} />
            </div>
        </div>
    );
}
