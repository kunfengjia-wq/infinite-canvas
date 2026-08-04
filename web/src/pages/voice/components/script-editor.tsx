import {
    LoaderCircle, Pause, Play, Plus, RefreshCw, Trash2, Volume2,
    FileText, GripVertical, CheckCircle2, AlertCircle, Clock,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { App, Button, Input, Select, Tooltip } from "antd";

import { useVoiceStore } from "../store/use-voice-store";
import { useShallow } from "zustand/react/shallow";
import { EmotionBadge } from "./emotion-selector";
import { cn } from "@/lib/utils";
import type { VoiceLineStatus } from "../types";

const STATUS_CONFIG: Record<VoiceLineStatus, { icon: React.ReactNode; label: string; color: string }> = {
    pending: { icon: <Clock className="size-3" />, label: "待生成", color: "text-stone-500" },
    generating: { icon: <LoaderCircle className="size-3 animate-spin" />, label: "生成中", color: "text-violet-400" },
    done: { icon: <CheckCircle2 className="size-3" />, label: "已完成", color: "text-emerald-400" },
    error: { icon: <AlertCircle className="size-3" />, label: "错误", color: "text-red-400" },
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

    // Stats
    const statusCounts = current.lines.reduce(
        (acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; },
        {} as Record<string, number>,
    );

    return (
        <section className="flex min-w-0 flex-1 flex-col bg-[#111118]">
            {/* ── Toolbar ── */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#16161d] px-4 py-2">
                <div className="flex items-center gap-2">
                    <FileText className="size-3.5 text-stone-500" />
                    <span className="text-xs font-medium text-stone-300">剧本编辑</span>
                </div>

                {/* Status summary */}
                <div className="flex items-center gap-2.5 text-[10px]">
                    <span className="flex items-center gap-1 text-stone-500">
                        <span className="size-1.5 rounded-full bg-stone-500" />
                        {statusCounts.pending ?? 0} 待生成
                    </span>
                    <span className="flex items-center gap-1 text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        {statusCounts.done ?? 0} 已完成
                    </span>
                    {(statusCounts.error ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-red-400">
                            <span className="size-1.5 rounded-full bg-red-400" />
                            {statusCounts.error} 错误
                        </span>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <Button
                        size="small"
                        className={cn(
                            "!border-white/[0.08] !text-xs",
                            showImport
                                ? "!bg-violet-500/20 !text-violet-300 !border-violet-500/30"
                                : "!bg-white/[0.04] !text-stone-400 hover:!text-stone-200",
                        )}
                        icon={<FileText className="size-3" />}
                        onClick={() => setShowImport(!showImport)}
                    >
                        导入剧本
                    </Button>
                </div>
            </div>

            {/* ── Import Area ── */}
            {showImport && (
                <div className="border-b border-white/[0.06] bg-[#13131a] p-4">
                    <Input.TextArea
                        rows={4}
                        placeholder={"粘贴剧本文本，支持格式：\n角色名：台词内容\n【角色名】台词内容\n无标记的行将归为旁白"}
                        value={importText}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setImportText(e.target.value)}
                        className="!border-white/[0.08] !bg-white/[0.04] !text-stone-200 placeholder:!text-stone-600"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                        <Button
                            size="small"
                            className="!border-white/[0.08] !bg-white/[0.04] !text-stone-400"
                            onClick={() => setShowImport(false)}
                        >
                            取消
                        </Button>
                        <Button
                            size="small"
                            className="!bg-violet-500 !border-none hover:!bg-violet-400"
                            type="primary"
                            onClick={handleImport}
                        >
                            解析导入
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Script Lines ── */}
            <div className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
                {current.lines.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-3 py-16">
                        <div className="flex size-12 items-center justify-center rounded-xl bg-white/[0.03]">
                            <FileText className="size-5 text-stone-600" />
                        </div>
                        <p className="text-sm text-stone-500">暂无台词</p>
                        <p className="text-xs text-stone-600">点击下方添加或导入剧本</p>
                    </div>
                )}

                {current.lines.map((line, idx) => {
                    const charColor = getCharColor(line.characterId);
                    const statusCfg = STATUS_CONFIG[line.status];
                    const isGenerating = generatingLineId === line.id;

                    return (
                        <div
                            key={line.id}
                            className={cn(
                                "group relative flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-all",
                                isGenerating
                                    ? "border-violet-500/30 bg-violet-500/[0.06]"
                                    : line.status === "error"
                                        ? "border-red-500/20 bg-red-500/[0.04] hover:border-red-500/30"
                                        : "border-white/[0.04] bg-white/[0.02] hover:border-white/[0.08] hover:bg-white/[0.03]",
                            )}
                        >
                            {/* Left: index + status */}
                            <div className="flex flex-col items-center gap-1.5 pt-0.5">
                                <span className="flex size-5 items-center justify-center rounded text-[10px] font-medium text-stone-500 tabular-nums">
                                    {idx + 1}
                                </span>
                                <Tooltip title={statusCfg.label}>
                                    <span className={cn("flex items-center", statusCfg.color)}>
                                        {statusCfg.icon}
                                    </span>
                                </Tooltip>
                            </div>

                            {/* Character color bar */}
                            <div
                                className="mt-1 h-[calc(100%-8px)] w-[3px] shrink-0 rounded-full opacity-80"
                                style={{ backgroundColor: charColor }}
                            />

                            {/* Main content */}
                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                {/* Character name + emotion row */}
                                <div className="flex items-center gap-1.5">
                                    <span
                                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                                        style={{ backgroundColor: charColor }}
                                    >
                                        {getCharName(line.characterId)}
                                    </span>
                                    <EmotionBadge lineId={line.id} emotion={line.emotion} intensity={line.emotionIntensity} />
                                </div>

                                {/* Text area */}
                                <Input.TextArea
                                    autoSize={{ minRows: 1, maxRows: 4 }}
                                    className="min-w-0 flex-1 !border-none !bg-transparent !p-0 !shadow-none !text-sm !text-stone-200 leading-relaxed placeholder:!text-stone-600"
                                    value={line.text}
                                    onChange={(e) => updateLine(line.id, { text: e.target.value })}
                                />
                            </div>

                            {/* Right: duration + actions */}
                            <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                                {line.duration != null && (
                                    <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] tabular-nums text-stone-500">
                                        {line.duration.toFixed(1)}s
                                    </span>
                                )}

                                {/* Action buttons */}
                                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                    {line.status === "done" && line.audioUrl && (
                                        <Tooltip title={playingId === line.id ? "停止" : "试听"}>
                                            <Button
                                                type="text"
                                                size="small"
                                                className="!text-stone-400 hover:!text-violet-400 hover:!bg-violet-500/10"
                                                icon={playingId === line.id
                                                    ? <Pause className="size-3" />
                                                    : <Play className="size-3" />
                                                }
                                                onClick={() => handlePlayLine(line.id, line.audioUrl!)}
                                            />
                                        </Tooltip>
                                    )}
                                    <Tooltip title="生成语音">
                                        <Button
                                            type="text"
                                            size="small"
                                            className="!text-stone-400 hover:!text-violet-400 hover:!bg-violet-500/10"
                                            icon={line.status === "generating"
                                                ? <LoaderCircle className="size-3 animate-spin" />
                                                : <Volume2 className="size-3" />
                                            }
                                            disabled={line.status === "generating"}
                                            onClick={() => void handleGenerate(line.id)}
                                        />
                                    </Tooltip>
                                    {line.status === "error" && (
                                        <Tooltip title="重试">
                                            <Button
                                                type="text"
                                                size="small"
                                                className="!text-stone-400 hover:!text-amber-400 hover:!bg-amber-500/10"
                                                icon={<RefreshCw className="size-3" />}
                                                onClick={() => void handleGenerate(line.id)}
                                            />
                                        </Tooltip>
                                    )}
                                    <Tooltip title="删除">
                                        <Button
                                            type="text"
                                            size="small"
                                            className="!text-stone-400 hover:!text-red-400 hover:!bg-red-500/10"
                                            icon={<Trash2 className="size-3" />}
                                            onClick={() => removeLine(line.id)}
                                        />
                                    </Tooltip>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Add Line Input ── */}
            <div className="border-t border-white/[0.06] bg-[#16161d] p-3">
                <div className="flex items-center gap-2">
                    <Select
                        size="small"
                        className="w-24 shrink-0 [&_.ant-select-selector]:!bg-white/[0.04] [&_.ant-select-selector]:!border-white/[0.08] [&_.ant-select-selection-item]:!text-stone-300"
                        value={defaultChar}
                        onChange={setNewCharId}
                        options={charOptions}
                        placeholder="角色"
                    />
                    <Input
                        size="small"
                        placeholder="输入台词，按 Enter 添加"
                        className="!border-white/[0.08] !bg-white/[0.04] !text-stone-200 placeholder:!text-stone-600"
                        value={newText}
                        onChange={(e) => setNewText(e.target.value)}
                        onPressEnter={handleAddLine}
                    />
                    <Tooltip title="添加台词">
                        <Button
                            type="primary"
                            size="small"
                            className="!bg-violet-500 !border-none hover:!bg-violet-400"
                            icon={<Plus className="size-3.5" />}
                            onClick={handleAddLine}
                        />
                    </Tooltip>
                </div>
            </div>
        </section>
    );
}
