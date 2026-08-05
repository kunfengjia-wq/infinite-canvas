import { useEffect, useRef, useState } from "react";
import { App, Button, Input, Tag, Upload as AntUpload } from "antd";
import { AudioLines, Info, LoaderCircle, Mic, MicOff, Play, Trash2, Upload } from "lucide-react";

import { useVoiceStore } from "../../store/use-voice-store";
import { MultiDimPanel } from "../multi-dim-panel";
import { ENGINE_META } from "../../types";
import { cn } from "@/lib/utils";

/**
 * Qwen3 音色克隆面板
 * - 场景说明
 * - 克隆创建区（上传/录音 + 参考文本）
 * - 已克隆音色列表（带试听、分配角色）
 * - 多维调节
 */
export function QwenClonePanel() {
    const { message } = App.useApp();
    const { current, clonedVoices, loadVoices, cloneVoice, deleteClonedVoice, previewVoice, updateCharacter } = useVoiceStore();
    const [name, setName] = useState("");
    const [refText, setRefText] = useState("");
    const [samples, setSamples] = useState<Blob[]>([]);
    const [cloning, setCloning] = useState(false);
    const [recording, setRecording] = useState(false);
    const [previewingId, setPreviewingId] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const meta = ENGINE_META.find((m) => m.id === "qwen3-tts-clone")!;

    useEffect(() => {
        void loadVoices();
    }, [loadVoices]);

    if (!current) return null;

    // 录音
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            chunksRef.current = [];
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: "audio/webm" });
                setSamples((prev) => [...prev, blob]);
                stream.getTracks().forEach((t) => t.stop());
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
            setRecording(true);
        } catch {
            message.error("无法访问麦克风");
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setRecording(false);
    };

    const handleClone = async () => {
        if (!name.trim()) { message.warning("请输入音色名称"); return; }
        if (samples.length === 0) { message.warning("请至少添加一段参考音频（3-10秒）"); return; }
        setCloning(true);
        try {
            await cloneVoice(name.trim(), samples, refText.trim() || undefined);
            message.success("音色克隆成功！");
            setName("");
            setRefText("");
            setSamples([]);
        } catch (e) {
            message.error(e instanceof Error ? e.message : "克隆失败");
        } finally {
            setCloning(false);
        }
    };

    const handlePreviewClone = async (voiceId: string) => {
        setPreviewingId(voiceId);
        try {
            await previewVoice("qwen3-tts-clone", voiceId);
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

            {/* 克隆创建区 */}
            <div className="rounded-xl border border-dashed border-violet-300 p-4 dark:border-violet-700">
                <p className="mb-3 text-[11px] font-medium text-violet-600 dark:text-violet-400">创建克隆音色</p>
                <Input
                    size="small"
                    placeholder="音色名称（如：角色A、妈妈的声音）"
                    prefix={<AudioLines className="size-3 text-stone-400" />}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mb-2"
                />
                <Input.TextArea
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    placeholder="参考音频对应文本（可选，提升克隆质量）"
                    value={refText}
                    onChange={(e) => setRefText(e.target.value)}
                    className="mb-2 !text-xs"
                />
                <p className="mb-2 text-[10px] text-stone-400">提示：上传 3-10 秒清晰人声效果最佳，避免背景噪音</p>

                {/* 样本列表 */}
                {samples.length > 0 && (
                    <div className="mb-2 space-y-1">
                        {samples.map((_, i) => (
                            <div key={i} className="flex items-center gap-2 rounded bg-stone-100 px-2 py-1 text-[10px] dark:bg-stone-800">
                                <AudioLines className="size-3 text-violet-400" />
                                <span className="text-stone-500">样本 {i + 1}</span>
                                <Button type="text" size="small" danger icon={<Trash2 className="size-2.5" />} onClick={() => setSamples((p) => p.filter((_, idx) => idx !== i))} />
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-2">
                    <AntUpload accept="audio/*" showUploadList={false} beforeUpload={(f) => { setSamples((p) => [...p, f]); return false; }} multiple>
                        <Button size="small" icon={<Upload className="size-3" />}>上传音频</Button>
                    </AntUpload>
                    <Button
                        size="small"
                        danger={recording}
                        icon={recording ? <MicOff className="size-3" /> : <Mic className="size-3" />}
                        onClick={recording ? stopRecording : () => void startRecording()}
                    >
                        {recording ? "停止" : "录音"}
                    </Button>
                </div>

                <Button
                    type="primary"
                    block
                    size="small"
                    className="mt-3"
                    icon={cloning ? <LoaderCircle className="size-3 animate-spin" /> : undefined}
                    disabled={cloning}
                    onClick={() => void handleClone()}
                >
                    {cloning ? "克隆中…" : "开始克隆"}
                </Button>
            </div>

            {/* 已克隆音色列表 */}
            <div>
                <p className="mb-2 text-[11px] font-medium text-stone-500">我的克隆音色 ({clonedVoices.length})</p>
                {clonedVoices.length === 0 && (
                    <p className="rounded-lg border border-stone-200 py-4 text-center text-[11px] text-stone-400 dark:border-stone-700">
                        暂无克隆音色，上传参考音频开始创建
                    </p>
                )}
                <div className="space-y-2">
                    {clonedVoices.map((v) => {
                        const usedBy = current.characters.find((c) => c.voice === v.id);
                        return (
                            <div
                                key={v.id}
                                className={cn(
                                    "group flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all",
                                    usedBy
                                        ? "border-violet-300 bg-violet-50/60 dark:border-violet-700 dark:bg-violet-900/20"
                                        : "border-stone-200 dark:border-stone-700",
                                )}
                            >
                                <span className="flex size-7 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40">
                                    <AudioLines className="size-3.5 text-violet-500" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium">{v.name}</p>
                                    <p className="text-[9px] text-stone-400">{v.samples_count} 样本{usedBy ? ` · ${usedBy.name} 使用中` : ""}</p>
                                </div>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={previewingId === v.id ? <LoaderCircle className="size-3 animate-spin" /> : <Play className="size-3" />}
                                    onClick={() => void handlePreviewClone(v.id)}
                                />
                                {/* 分配给第一个未使用克隆的角色 */}
                                {current.characters.length > 0 && (
                                    <Button
                                        type="text"
                                        size="small"
                                        className="text-[10px]"
                                        onClick={() => {
                                            const target = current.characters.find((c) => c.voice.startsWith("clone_")) ?? current.characters[0];
                                            updateCharacter(target.id, { voice: v.id, isCloned: true });
                                            message.success(`已分配给 ${target.name}`);
                                        }}
                                    >
                                        分配
                                    </Button>
                                )}
                                <Button
                                    type="text"
                                    size="small"
                                    danger
                                    icon={<Trash2 className="size-3" />}
                                    className="opacity-0 group-hover:opacity-100"
                                    onClick={() => void deleteClonedVoice(v.id)}
                                />
                            </div>
                        );
                    })}
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
