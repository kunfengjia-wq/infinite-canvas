import { AudioLines, LoaderCircle, Mic, MicOff, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { App, Button, Input, Upload as AntUpload } from "antd";

import { useVoiceStore } from "../store/use-voice-store";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";

export function VoiceClonePanel() {
    const { message } = App.useApp();
    const { clonedVoices, loadVoices, cloneVoice, deleteClonedVoice } = useVoiceStore(
        useShallow((s) => ({
            clonedVoices: s.clonedVoices,
            loadVoices: s.loadVoices,
            cloneVoice: s.cloneVoice,
            deleteClonedVoice: s.deleteClonedVoice,
        })),
    );
    const [name, setName] = useState("");
    const [refText, setRefText] = useState("");
    const [samples, setSamples] = useState<Blob[]>([]);
    const [cloning, setCloning] = useState(false);
    const [recording, setRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        void loadVoices();
    }, [loadVoices]);

    useEffect(() => {
        return () => {
            mediaRecorderRef.current?.stop();
            streamRef.current?.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        };
    }, []);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
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

    const handleUpload = (file: File) => {
        setSamples((prev) => [...prev, file]);
        return false;
    };

    const handleClone = async () => {
        if (!name.trim()) { message.warning("请输入音色名称"); return; }
        if (samples.length === 0) { message.warning("请至少添加一段参考音频（3-10秒）"); return; }
        setCloning(true);
        try {
            await cloneVoice(name.trim(), samples, refText.trim() || undefined);
            message.success("音色克隆成功！在角色面板中选择该音色即可使用");
            setName("");
            setRefText("");
            setSamples([]);
        } catch (e) {
            message.error(e instanceof Error ? e.message : "克隆失败");
        } finally {
            setCloning(false);
        }
    };

    return (
        <div className="space-y-4 p-3">
            {/* Clone creation */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <p className="mb-3 text-[11px] font-medium text-stone-500 uppercase tracking-wider">创建克隆音色</p>
                <Input
                    size="small"
                    placeholder="音色名称（如：角色A）"
                    prefix={<AudioLines className="size-3 text-stone-600" />}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mb-2 !border-white/[0.08] !bg-white/[0.04] !text-stone-200 placeholder:!text-stone-600"
                />

                <Input.TextArea
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    placeholder="参考音频对应文本（可选，提升克隆质量）"
                    value={refText}
                    onChange={(e) => setRefText(e.target.value)}
                    className="mb-2 !border-white/[0.08] !bg-white/[0.04] !text-xs !text-stone-200 placeholder:!text-stone-600"
                />

                <p className="mb-2 text-[10px] text-stone-600">提示：上传 3-10 秒清晰人声效果最佳</p>

                {samples.length > 0 && (
                    <div className="mb-2 space-y-1">
                        {samples.map((_, i) => (
                            <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[10px]">
                                <span className="text-stone-500">样本 {i + 1}</span>
                                <Button
                                    type="text"
                                    size="small"
                                    className="!text-stone-500 hover:!text-red-400"
                                    icon={<Trash2 className="size-2.5" />}
                                    onClick={() => setSamples((p) => p.filter((_, idx) => idx !== i))}
                                />
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-2">
                    <AntUpload accept="audio/*" showUploadList={false} beforeUpload={handleUpload} multiple>
                        <Button
                            size="small"
                            className="!border-white/[0.08] !bg-white/[0.04] !text-stone-400 hover:!text-stone-200"
                            icon={<Upload className="size-3" />}
                        >
                            上传音频
                        </Button>
                    </AntUpload>
                    <Button
                        size="small"
                        className={cn(
                            "!border-white/[0.08] !bg-white/[0.04]",
                            recording
                                ? "!text-red-400 !border-red-500/30 !bg-red-500/10"
                                : "!text-stone-400 hover:!text-stone-200",
                        )}
                        icon={recording ? <MicOff className="size-3" /> : <Mic className="size-3" />}
                        onClick={recording ? stopRecording : startRecording}
                    >
                        {recording ? "停止" : "录音"}
                    </Button>
                </div>

                <Button
                    type="primary"
                    block
                    size="small"
                    className="mt-3 !bg-violet-500 !border-none hover:!bg-violet-400"
                    icon={cloning ? <LoaderCircle className="size-3 animate-spin" /> : undefined}
                    disabled={cloning}
                    onClick={handleClone}
                >
                    {cloning ? "克隆中…" : "开始克隆"}
                </Button>
            </div>

            {/* Existing cloned voices */}
            <div>
                <p className="mb-2 text-[11px] font-medium text-stone-500 uppercase tracking-wider">
                    音色库 ({clonedVoices.length})
                </p>
                {clonedVoices.length === 0 && <p className="text-[10px] text-stone-600">暂无克隆音色</p>}
                <div className="space-y-1.5">
                    {clonedVoices.map((v) => (
                        <div key={v.id} className="group flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2 hover:border-white/[0.08]">
                            <AudioLines className="size-3.5 text-violet-400" />
                            <span className="flex-1 truncate text-xs text-stone-300">{v.name}</span>
                            <span className="text-[10px] text-stone-600">{v.samples_count} 样本</span>
                            <Button
                                type="text"
                                size="small"
                                className="!text-stone-500 hover:!text-red-400 hover:!bg-red-500/10 opacity-0 group-hover:opacity-100"
                                icon={<Trash2 className="size-3" />}
                                onClick={() => void deleteClonedVoice(v.id)}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
