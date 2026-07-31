import { useState } from "react";
import { App, Button, Tag, Upload as AntUpload } from "antd";
import { Info, LoaderCircle, Play, Upload } from "lucide-react";

import { useVoiceStore } from "../../store/use-voice-store";
import { MultiDimPanel } from "../multi-dim-panel";
import { ENGINE_META, type TTSModelInfo } from "../../types";

interface Props {
    modelInfo?: TTSModelInfo;
}

/**
 * XTTS-v2 克隆面板
 * - 场景说明
 * - 每个角色上传参考音频（6秒）即可克隆
 * - 语速调节
 */
export function XttsPanel({ modelInfo }: Props) {
    const { message } = App.useApp();
    const { current, updateCharacter, previewVoice } = useVoiceStore();
    const [previewingId, setPreviewingId] = useState<string | null>(null);

    const meta = ENGINE_META.find((m) => m.id === "xtts-v2")!;
    const available = modelInfo?.available ?? false;

    if (!current) return null;

    const handleUploadRef = (charId: string, file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = (reader.result as string).split(",")[1];
            updateCharacter(charId, { referenceAudio: base64, isCloned: true });
            message.success("参考音频已上传，生成时将使用该音色");
        };
        reader.readAsDataURL(file);
        return false;
    };

    const handlePreview = async (charId: string) => {
        setPreviewingId(charId);
        try {
            await previewVoice("xtts-v2", "clone");
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
                        引擎未就绪。XTTS-v2 需要 Python &lt; 3.12 环境及 Coqui TTS 包。
                    </p>
                </div>
            )}

            {/* 角色参考音频上传 */}
            <div>
                <p className="mb-2 text-[11px] font-medium text-stone-500">角色音色（上传参考音频克隆）</p>
                <div className="space-y-2">
                    {current.characters.map((char) => (
                        <div key={char.id} className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2.5 dark:border-stone-700">
                            <span
                                className="flex size-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                style={{ backgroundColor: char.color }}
                            >
                                {char.name.charAt(0)}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{char.name}</p>
                                <p className="text-[9px] text-stone-400">
                                    {char.referenceAudio ? "已上传参考音频 ✓" : "未上传（将使用默认音色）"}
                                </p>
                            </div>
                            <AntUpload accept="audio/*" showUploadList={false} beforeUpload={(f) => handleUploadRef(char.id, f)}>
                                <Button size="small" icon={<Upload className="size-3" />}>
                                    {char.referenceAudio ? "更换" : "上传"}
                                </Button>
                            </AntUpload>
                            {char.referenceAudio && (
                                <Button
                                    type="text"
                                    size="small"
                                    icon={previewingId === char.id ? <LoaderCircle className="size-3 animate-spin" /> : <Play className="size-3" />}
                                    onClick={() => void handlePreview(char.id)}
                                />
                            )}
                        </div>
                    ))}
                </div>
                {current.characters.length === 0 && (
                    <p className="rounded-lg border border-stone-200 py-4 text-center text-[11px] text-stone-400 dark:border-stone-700">
                        先在左栏添加角色
                    </p>
                )}
            </div>

            {/* 参数调节 */}
            <div className="border-t border-stone-200 pt-4 dark:border-stone-700">
                <p className="mb-3 text-[11px] font-medium text-stone-500">参数调节</p>
                <MultiDimPanel features={meta.features} />
            </div>
        </div>
    );
}
