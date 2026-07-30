import { Play, Upload } from "lucide-react";
import { useState } from "react";
import { App, Button, Select, Upload as AntUpload } from "antd";

import { useVoiceStore } from "../store/use-voice-store";
import type { TTSModelInfo } from "../types";

interface Props {
    models: TTSModelInfo[];
}

export function VoiceConfigPanel({ models }: Props) {
    const { message } = App.useApp();
    const { current, updateCharacter, previewVoice } = useVoiceStore();
    const [previewingId, setPreviewingId] = useState<string | null>(null);

    if (!current) return null;

    // 当前引擎的可用音色
    const engineModel = models.find((m) => m.id === current.engine);
    const voiceOptions = (engineModel?.voices ?? []).map((v) => ({
        value: v.id,
        label: `${v.label} (${v.gender === "female" ? "女" : "男"})`,
    }));

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
            <p className="text-xs font-medium text-stone-500">音色配置</p>

            {current.characters.map((char) => (
                <div key={char.id} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                    {/* 角色名 */}
                    <div className="mb-2 flex items-center gap-2">
                        <span
                            className="size-3 rounded-full"
                            style={{ backgroundColor: char.color }}
                        />
                        <span className="text-sm font-medium">{char.name}</span>
                    </div>

                    {/* 音色选择 */}
                    <div className="mb-2">
                        <label className="mb-1 block text-[10px] text-stone-400">音色</label>
                        <div className="flex items-center gap-1.5">
                            <Select
                                size="small"
                                className="min-w-0 flex-1"
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
                                icon={<Play className="size-3" />}
                                loading={previewingId === char.id}
                                onClick={() => void handlePreview(char.id, char.voice)}
                                title="试听"
                            />
                        </div>
                    </div>

                    {/* 参考音频上传（支持多引擎） */}
                    {(current.engine === "xtts-v2" || current.engine === "gpt-sovits" || current.engine === "indextts-2") && (
                        <div className="mb-1">
                            <label className="mb-1 block text-[10px] text-stone-400">参考音频（克隆用）</label>
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
                                <Button size="small" icon={<Upload className="size-3" />} block>
                                    {char.referenceAudio ? "已上传 ✓" : "上传参考音频"}
                                </Button>
                            </AntUpload>
                        </div>
                    )}
                </div>
            ))}

            {current.characters.length === 0 && (
                <p className="mt-4 text-center text-xs text-stone-400">先在左栏添加角色</p>
            )}
        </div>
    );
}
