import { Play, Upload, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { App, Button, Select, Upload as AntUpload } from "antd";

import { useVoiceStore } from "../store/use-voice-store";
import { useShallow } from "zustand/react/shallow";
import type { TTSModelInfo } from "../types";

interface Props {
    models: TTSModelInfo[];
}

export function VoiceConfigPanel({ models }: Props) {
    const { message } = App.useApp();
    const { current, updateCharacter, previewVoice, clonedVoices } = useVoiceStore(
        useShallow((s) => ({
            current: s.current,
            updateCharacter: s.updateCharacter,
            previewVoice: s.previewVoice,
            clonedVoices: s.clonedVoices,
        })),
    );
    const [previewingId, setPreviewingId] = useState<string | null>(null);

    if (!current) return null;

    const engineModel = models.find((m) => m.id === current.engine);
    const voiceOptions = [
        ...(engineModel?.voices ?? []).map((v) => ({
            value: v.id,
            label: `${v.label} (${v.gender === "female" ? "女" : "男"})`,
        })),
        ...clonedVoices.map((v) => ({
            value: v.id,
            label: `${v.name} (克隆)`,
        })),
    ];

    const handlePreview = async (charId: string, voice: string) => {
        setPreviewingId(charId);
        try {
            await previewVoice(current.engine, voice);
        } catch (e) {
            message.error(e instanceof Error ? e.message : "试听失败");
        } finally {
            setPreviewingId(null);
        }
    };

    return (
        <div className="space-y-3 p-3">
            <p className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">音色配置</p>

            {current.characters.map((char) => (
                <div key={char.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="mb-2.5 flex items-center gap-2">
                        <div
                            className="size-3 rounded-full shadow-sm"
                            style={{ backgroundColor: char.color }}
                        />
                        <span className="text-sm font-medium text-stone-200">{char.name}</span>
                    </div>

                    <div className="mb-2">
                        <label className="mb-1 block text-[10px] text-stone-500">音色</label>
                        <div className="flex items-center gap-1.5">
                            <Select
                                size="small"
                                className="min-w-0 flex-1 [&_.ant-select-selector]:!bg-white/[0.04] [&_.ant-select-selector]:!border-white/[0.08] [&_.ant-select-selection-item]:!text-stone-300"
                                value={char.voice}
                                onChange={(v) => updateCharacter(char.id, { voice: v })}
                                options={voiceOptions}
                                placeholder="选择音色"
                                showSearch
                                optionFilterProp="label"
                            />
                            <Button
                                type="text"
                                size="small"
                                className="!text-stone-400 hover:!text-violet-400 hover:!bg-violet-500/10"
                                icon={previewingId === char.id
                                    ? <LoaderCircle className="size-3 animate-spin" />
                                    : <Play className="size-3" />
                                }
                                disabled={previewingId === char.id}
                                onClick={() => void handlePreview(char.id, char.voice)}
                                title="试听"
                            />
                        </div>
                    </div>

                    {(current.engine === "xtts-v2" || current.engine === "gpt-sovits" || current.engine === "indextts-2") && (
                        <div>
                            <label className="mb-1 block text-[10px] text-stone-500">参考音频（克隆用）</label>
                            <AntUpload
                                accept="audio/*"
                                showUploadList={false}
                                beforeUpload={(file) => {
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                        const base64 = (reader.result as string).split(",")[1];
                                        updateCharacter(char.id, { referenceAudio: base64, isCloned: true });
                                    };
                                    reader.readAsDataURL(file);
                                    return false;
                                }}
                            >
                                <Button
                                    size="small"
                                    block
                                    className="!border-white/[0.08] !bg-white/[0.04] !text-stone-400 hover:!text-stone-200"
                                    icon={<Upload className="size-3" />}
                                >
                                    {char.referenceAudio ? "已上传 ✓" : "上传参考音频"}
                                </Button>
                            </AntUpload>
                        </div>
                    )}
                </div>
            ))}

            {current.characters.length === 0 && (
                <p className="py-4 text-center text-xs text-stone-600">先在左栏添加角色</p>
            )}
        </div>
    );
}
