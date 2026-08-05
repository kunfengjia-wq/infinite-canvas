import { useState } from "react";
import { App, Button, Tag } from "antd";
import { Info, LoaderCircle, Play } from "lucide-react";

import { useVoiceStore } from "../../store/use-voice-store";
import { MultiDimPanel } from "../multi-dim-panel";
import { ENGINE_META, type TTSModelInfo } from "../../types";
import { cn } from "@/lib/utils";

interface Props {
    modelInfo?: TTSModelInfo;
}

/**
 * Kokoro 轻量引擎面板
 * - 场景说明
 * - 音色列表（英文为主）
 * - 仅语速调节（无情绪/风格）
 */
export function KokoroPanel({ modelInfo }: Props) {
    const { message } = App.useApp();
    const { current, models, updateCharacter, previewVoice } = useVoiceStore();
    const [previewingId, setPreviewingId] = useState<string | null>(null);

    const meta = ENGINE_META.find((m) => m.id === "kokoro-82m")!;
    const voices = modelInfo?.voices ?? models.find((m) => m.id === "kokoro-82m")?.voices ?? [];
    const available = modelInfo?.available ?? models.find((m) => m.id === "kokoro-82m")?.available ?? false;

    if (!current) return null;

    const handlePreview = async (voiceId: string) => {
        setPreviewingId(voiceId);
        try {
            await previewVoice("kokoro-82m", voiceId);
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

            {/* 未安装提示 */}
            {!available && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                        模型未安装。需要下载 kokoro-v1_0.onnx 和 voices.bin 到 tts-server/models/kokoro/ 目录。
                    </p>
                </div>
            )}

            {/* 音色列表 */}
            <div>
                <p className="mb-2 text-[11px] font-medium text-stone-500">音色 ({voices.length})</p>
                <div className="grid grid-cols-2 gap-2">
                    {voices.map((v) => {
                        const usedBy = current.characters.find((c) => c.voice === v.id);
                        return (
                            <div
                                key={v.id}
                                className={cn(
                                    "group flex items-center gap-2 rounded-lg border px-3 py-2 transition-all",
                                    usedBy
                                        ? "border-violet-300 bg-violet-50/60 dark:border-violet-700 dark:bg-violet-900/20"
                                        : "border-stone-200 hover:border-violet-200 dark:border-stone-700",
                                )}
                            >
                                <span className={cn(
                                    "flex size-6 items-center justify-center rounded-full text-[10px] font-bold text-white",
                                    v.gender === "female" ? "bg-pink-400" : "bg-sky-500",
                                )}>
                                    {v.gender === "female" ? "♀" : "♂"}
                                </span>
                                <span className="flex-1 truncate text-[11px]">{v.label}</span>
                                <Button
                                    type="text"
                                    size="small"
                                    className="opacity-0 group-hover:opacity-100"
                                    icon={previewingId === v.id ? <LoaderCircle className="size-3 animate-spin" /> : <Play className="size-3" />}
                                    onClick={() => void handlePreview(v.id)}
                                    disabled={!available}
                                />
                            </div>
                        );
                    })}
                </div>
                {voices.length === 0 && (
                    <p className="rounded-lg border border-stone-200 py-4 text-center text-[11px] text-stone-400 dark:border-stone-700">
                        {available ? "无可用音色" : "安装模型后显示音色列表"}
                    </p>
                )}
            </div>

            {/* 角色分配 */}
            {voices.length > 0 && (
                <div>
                    <p className="mb-2 text-[11px] font-medium text-stone-500">角色音色分配</p>
                    <div className="space-y-1.5">
                        {current.characters.map((char) => (
                            <div key={char.id} className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
                                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: char.color }} />
                                <span className="w-16 truncate text-xs font-medium">{char.name}</span>
                                <div className="flex flex-1 flex-wrap gap-1">
                                    {voices.slice(0, 6).map((v) => (
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
                                            {v.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 参数调节（仅语速 + 音调 + 音量） */}
            <div className="border-t border-stone-200 pt-4 dark:border-stone-700">
                <p className="mb-3 text-[11px] font-medium text-stone-500">参数调节</p>
                <MultiDimPanel features={meta.features} />
            </div>
        </div>
    );
}
