import { LoaderCircle, Pause, Play, Plus, RefreshCw, Trash2, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { App, Button, Input, Select, Tooltip } from "antd";

import { useVoiceStore } from "../store/use-voice-store";
import { useShallow } from "zustand/react/shallow";
import { EmotionBadge } from "./emotion-selector";
import { cn } from "@/lib/utils";
import type { VoiceLineStatus } from "../types";

const STATUS_ICON: Record<VoiceLineStatus, React.ReactNode> = {
    pending: <span className="size-2 rounded-full bg-stone-300" />,
    generating: <LoaderCircle className="size-3.5 animate-spin text-violet-500" />,
    done: <Volume2 className="size-3.5 text-emerald-500" />,
    error: <span className="size-2 rounded-full bg-red-400" />,
};

export function ScriptEditor() {
    const { message } = App.useApp();
    const { current, addLine, updateLine, removeLine, generateLine, parseScript, generatingLineId } = useVoiceStore(
        useShallow((s) => ({ current: s.current, addLine: s.addLine, updateLine: s.updateLine, removeLine: s.removeLine, generateLine: s.generateLine, parseScript: s.parseScript, generatingLineId: s.generatingLineId })),
    );
    const [newText, setNewText] = useState("");
    const [newCharId, setNewCharId] = useState<string>("");
    const [importText, setImportText] = useState("");
    const [showImport, setShowImport] = useState(false);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // 组件卸载时释放 Audio 元素并清理事件
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.onended = null;
                audioRef.current.onerror = null;
                audioRef.current = null;
            }
        };
    }, []);

    if (!current) return null;

    const charOptions = current.characters.map((c) => ({ value: c.id, label: c.name }));
    const defaultChar = newCharId || current.characters[0]?.id || "";

    const handleAddLine = () => {
        const text = newText.trim();
        if (!text || !defaultChar) return;
        addLine(defaultChar, text);
        setNewText("");
    };

    const handleImport = () => {
        if (!importText.trim()) return;
        parseScript(importText);
        setImportText("");
        setShowImport(false);
    };

    const getCharColor = (charId: string) => current.characters.find((c) => c.id === charId)?.color ?? "#6b7280";
    const getCharName = (charId: string) => current.characters.find((c) => c.id === charId)?.name ?? "未知";

    const handlePlayLine = (lineId: string, audioUrl: string) => {
        if (playingId === lineId) {
            audioRef.current?.pause();
            setPlayingId(null);
            return;
        }
        audioRef.current?.pause();
        const audio = new Audio(audioUrl);
        audio.onended = () => setPlayingId(null);
        audio.onerror = () => { message.error("播放失败"); setPlayingId(null); };
        void audio.play();
        audioRef.current = audio;
        setPlayingId(lineId);
    };

    const handleGenerate = async (lineId: string) => {
        try {
            await generateLine(lineId);
        } catch (e) {
            message.error(e instanceof Error ? e.message : "生成失败");
        }
    };

    return (
        <section className="flex min-w-0 flex-1 flex-col">
            {/* 工具栏 */}
            <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-2 dark:border-stone-800">
                <span className="text-xs font-medium text-stone-500">台词列表</span>
                <span className="text-[10px] text-stone-400">{current.lines.length} 段</span>
                <div className="ml-auto">
                    <Button size="small" type={showImport ? "primary" : "default"} onClick={() => setShowImport(!showImport)}>
                        导入剧本
                    </Button>
                </div>
            </div>

            {/* 导入区域 */}
            {showImport && (
                <div className="border-b border-stone-200 bg-stone-50/50 p-3 dark:border-stone-800 dark:bg-stone-900/30">
                    <Input.TextArea
                        rows={4}
                        placeholder={"粘贴剧本文本，支持格式：\n角色名：台词内容\n【角色名】台词内容\n无标记的行将归为旁白"}
                        value={importText}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setImportText(e.target.value)}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                        <Button size="small" onClick={() => setShowImport(false)}>取消</Button>
                        <Button size="small" type="primary" onClick={handleImport}>解析导入</Button>
                    </div>
                </div>
            )}

            {/* 台词列表 */}
            <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
                {current.lines.length === 0 && (
                    <p className="mt-12 text-center text-sm text-stone-400">
                        暂无台词，点击下方添加或导入剧本
                    </p>
                )}
                {current.lines.map((line, idx) => (
                    <div
                        key={line.id}
                        className={cn(
                            "group flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors",
                            generatingLineId === line.id
                                ? "border-violet-300 bg-violet-50/60 dark:border-violet-700 dark:bg-violet-900/20"
                                : line.status === "error"
                                    ? "border-red-200 bg-red-50/40 hover:border-red-300 dark:border-red-900/50 dark:bg-red-950/20"
                                    : "border-transparent hover:border-stone-200 hover:bg-stone-50 dark:hover:border-stone-700 dark:hover:bg-stone-800/40",
                        )}
                    >
                        {/* 序号 + 状态 */}
                        <div className="flex flex-col items-center gap-1 pt-0.5">
                            <span className="text-[10px] text-stone-400">{idx + 1}</span>
                            {STATUS_ICON[line.status]}
                        </div>

                        {/* 角色标记 */}
                        <span
                            className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                            style={{ backgroundColor: getCharColor(line.characterId) }}
                        >
                            {getCharName(line.characterId)}
                        </span>

                        {/* 情绪标签 */}
                        <EmotionBadge lineId={line.id} emotion={line.emotion} intensity={line.emotionIntensity} />

                        {/* 文本（可编辑） */}
                        <Input.TextArea
                            autoSize={{ minRows: 1, maxRows: 4 }}
                            className="min-w-0 flex-1 !border-none !bg-transparent !p-0 !shadow-none text-sm"
                            value={line.text}
                            onChange={(e) => updateLine(line.id, { text: e.target.value })}
                        />

                        {/* 时长 */}
                        {line.duration != null && (
                            <span className="mt-0.5 shrink-0 text-[10px] text-stone-400">{line.duration.toFixed(1)}s</span>
                        )}

                        {/* 操作按钮 */}
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            {line.status === "done" && line.audioUrl && (
                                <Tooltip title={playingId === line.id ? "停止" : "试听"}>
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={playingId === line.id ? <Pause className="size-3 text-violet-500" /> : <Play className="size-3" />}
                                        onClick={() => handlePlayLine(line.id, line.audioUrl!)}
                                    />
                                </Tooltip>
                            )}
                            <Tooltip title="生成语音">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={line.status === "generating" ? <LoaderCircle className="size-3 animate-spin" /> : <Volume2 className="size-3" />}
                                    disabled={line.status === "generating"}
                                    onClick={() => void handleGenerate(line.id)}
                                />
                            </Tooltip>
                            {line.status === "error" && (
                                <Tooltip title="重试">
                                    <Button type="text" size="small" icon={<RefreshCw className="size-3" />} onClick={() => void handleGenerate(line.id)} />
                                </Tooltip>
                            )}
                            <Tooltip title="删除">
                                <Button type="text" size="small" danger icon={<Trash2 className="size-3" />} onClick={() => removeLine(line.id)} />
                            </Tooltip>
                        </div>
                    </div>
                ))}
            </div>

            {/* 添加台词 */}
            <div className="border-t border-stone-200 p-3 dark:border-stone-800">
                <div className="flex items-center gap-2">
                    <Select
                        size="small"
                        className="w-24 shrink-0"
                        value={defaultChar}
                        onChange={setNewCharId}
                        options={charOptions}
                        placeholder="角色"
                    />
                    <Input
                        size="small"
                        placeholder="输入台词，按 Enter 添加"
                        value={newText}
                        onChange={(e) => setNewText(e.target.value)}
                        onPressEnter={handleAddLine}
                    />
                    <Button type="primary" size="small" icon={<Plus className="size-3.5" />} onClick={handleAddLine} />
                </div>
            </div>
        </section>
    );
}
