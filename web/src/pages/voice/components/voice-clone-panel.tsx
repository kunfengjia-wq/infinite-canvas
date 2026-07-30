import { AudioLines, LoaderCircle, Mic, MicOff, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { App, Button, Input, Upload as AntUpload } from "antd";

import { useVoiceStore } from "../store/use-voice-store";

export function VoiceClonePanel() {
    const { message } = App.useApp();
    const { clonedVoices, loadVoices, cloneVoice, deleteClonedVoice } = useVoiceStore();
    const [name, setName] = useState("");
    const [refText, setRefText] = useState("");
    const [samples, setSamples] = useState<Blob[]>([]);
    const [cloning, setCloning] = useState(false);
    const [recording, setRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    useEffect(() => {
        void loadVoices();
    }, [loadVoices]);

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

    // 上传文件
    const handleUpload = (file: File) => {
        setSamples((prev) => [...prev, file]);
        return false;
    };

    // 克隆
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
            {/* 克隆创建区 */}
            <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                <p className="mb-2 text-xs font-medium text-stone-500">创建克隆音色</p>
                <Input
                    size="small"
                    placeholder="音色名称（如：角色A）"
                    prefix={<AudioLines className="size-3 text-stone-400" />}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mb-2"
                />

                {/* 参考文本（可选，提升克隆质量） */}
                <Input.TextArea
                    autoSize={{ minRows: 1, maxRows: 3 }}
                    placeholder="参考音频对应文本（可选，提升克隆质量）"
                    value={refText}
                    onChange={(e) => setRefText(e.target.value)}
                    className="mb-2 !text-xs"
                />

                <p className="mb-2 text-[10px] text-stone-400">提示：上传 3-10 秒清晰人声效果最佳</p>

                {/* 样本列表 */}
                {samples.length > 0 && (
                    <div className="mb-2 space-y-1">
                        {samples.map((_, i) => (
                            <div key={i} className="flex items-center gap-2 rounded bg-stone-100 px-2 py-1 text-[10px] dark:bg-stone-800">
                                <span className="text-stone-500">样本 {i + 1}</span>
                                <Button type="text" size="small" danger icon={<Trash2 className="size-2.5" />} onClick={() => setSamples((p) => p.filter((_, idx) => idx !== i))} />
                            </div>
                        ))}
                    </div>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-2">
                    <AntUpload accept="audio/*" showUploadList={false} beforeUpload={handleUpload} multiple>
                        <Button size="small" icon={<Upload className="size-3" />}>上传音频</Button>
                    </AntUpload>
                    <Button
                        size="small"
                        danger={recording}
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
                    className="mt-2"
                    icon={cloning ? <LoaderCircle className="size-3 animate-spin" /> : undefined}
                    disabled={cloning}
                    onClick={handleClone}
                >
                    {cloning ? "克隆中…" : "开始克隆"}
                </Button>
            </div>

            {/* 已有克隆音色 */}
            <div>
                <p className="mb-2 text-xs font-medium text-stone-500">音色库 ({clonedVoices.length})</p>
                {clonedVoices.length === 0 && <p className="text-[10px] text-stone-400">暂无克隆音色</p>}
                <div className="space-y-1.5">
                    {clonedVoices.map((v) => (
                        <div key={v.id} className="group flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-700">
                            <AudioLines className="size-3.5 text-violet-500" />
                            <span className="flex-1 truncate text-xs">{v.name}</span>
                            <span className="text-[10px] text-stone-400">{v.samples_count} 样本</span>
                            <Button
                                type="text"
                                size="small"
                                danger
                                icon={<Trash2 className="size-3" />}
                                className="opacity-0 group-hover:opacity-100"
                                onClick={() => void deleteClonedVoice(v.id)}
                            />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
