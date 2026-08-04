import { Pause, Play, SkipBack, SkipForward, Scissors } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Slider, Tooltip } from "antd";

import { useVoiceStore } from "../store/use-voice-store";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";

export function TimelinePlayer({ onEditLine }: { onEditLine?: (lineId: string) => void }) {
    const { current } = useVoiceStore(
        useShallow((s) => ({ current: s.current })),
    );
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [totalProgress, setTotalProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    const doneLines = current?.lines.filter((l) => l.status === "done" && l.audioUrl) ?? [];
    const totalDuration = doneLines.reduce((acc, l) => acc + (l.duration ?? 0), 0);

    const prefixDurations = useMemo(() => {
        const sums = [0];
        for (let i = 0; i < doneLines.length; i++) {
            sums.push(sums[i] + (doneLines[i].duration ?? 0));
        }
        return sums;
    }, [doneLines]);

    const doneLinesRef = useRef(doneLines);
    const totalDurationRef = useRef(totalDuration);
    const prefixDurationsRef = useRef(prefixDurations);
    doneLinesRef.current = doneLines;
    totalDurationRef.current = totalDuration;
    prefixDurationsRef.current = prefixDurations;

    const playAt = useCallback((idx: number) => {
        const lines = doneLinesRef.current;
        const total = totalDurationRef.current;
        if (idx < 0 || idx >= lines.length) {
            setPlaying(false);
            return;
        }
        setCurrentIdx(idx);
        const line = lines[idx];
        if (!line.audioUrl) return;

        if (audioRef.current) {
            audioRef.current.pause();
        }
        const audio = new Audio(line.audioUrl);
        audioRef.current = audio;

        audio.ontimeupdate = () => {
            setCurrentTime(audio.currentTime);
            if (audio.duration) {
                const prefix = prefixDurationsRef.current;
                const elapsed = (prefix[idx] ?? 0) + audio.currentTime;
                setTotalProgress(total > 0 ? (elapsed / total) * 100 : 0);
            }
        };
        audio.onended = () => {
            playAt(idx + 1);
        };
        void audio.play();
        setPlaying(true);
    }, []);

    const togglePlay = () => {
        if (playing) {
            audioRef.current?.pause();
            setPlaying(false);
        } else {
            playAt(currentIdx >= doneLines.length ? 0 : currentIdx);
        }
    };

    useEffect(() => {
        return () => {
            audioRef.current?.pause();
            audioRef.current = null;
        };
    }, []);

    if (!current || doneLines.length === 0) return null;

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    const elapsed = (prefixDurations[currentIdx] ?? 0) + currentTime;

    return (
        <footer className="border-t border-white/[0.06] bg-[#16161d] px-4 py-2.5">
            {/* ── Segment strip (visual timeline) ── */}
            <div className="mb-2.5 flex items-center gap-0.5 overflow-x-auto rounded-lg bg-white/[0.02] p-1.5">
                {doneLines.map((line, idx) => {
                    const char = current.characters.find((c) => c.id === line.characterId);
                    const charColor = char?.color ?? "#6b7280";
                    const isActive = idx === currentIdx && playing;
                    const widthPercent = totalDuration > 0 ? ((line.duration ?? 1) / totalDuration) * 100 : 100 / doneLines.length;

                    return (
                        <Tooltip
                            key={line.id}
                            title={`${char?.name ?? ""} — ${formatTime(line.duration ?? 0)}${idx === currentIdx && playing ? " ▶" : ""}`}
                        >
                            <button
                                className={cn(
                                    "group/seg relative h-8 shrink-0 rounded-md transition-all",
                                    isActive
                                        ? "ring-2 ring-white/30 shadow-sm"
                                        : "hover:brightness-125",
                                )}
                                style={{
                                    width: `${Math.max(4, widthPercent)}%`,
                                    minWidth: "28px",
                                    backgroundColor: isActive ? charColor : `${charColor}88`,
                                }}
                                onClick={() => playAt(idx)}
                                onDoubleClick={() => onEditLine?.(line.id)}
                            >
                                {/* Segment label */}
                                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white/90 drop-shadow-sm">
                                    {idx + 1}
                                </span>

                                {/* Playhead indicator */}
                                {isActive && (
                                    <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-white shadow" />
                                )}

                                {/* Scissors hint on hover */}
                                <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 opacity-0 transition-opacity group-hover/seg:opacity-100">
                                    <Scissors className="size-3 text-white/80" />
                                </span>
                            </button>
                        </Tooltip>
                    );
                })}
            </div>

            {/* ── Controls row ── */}
            <div className="flex items-center gap-3">
                {/* Transport buttons */}
                <div className="flex items-center gap-0.5">
                    <Tooltip title="上一段">
                        <Button
                            type="text"
                            size="small"
                            className="!text-stone-400 hover:!text-stone-200 hover:!bg-white/[0.06]"
                            icon={<SkipBack className="size-3.5" />}
                            onClick={() => playAt(currentIdx - 1)}
                        />
                    </Tooltip>
                    <button
                        className="flex size-8 items-center justify-center rounded-full bg-violet-500 text-white shadow-sm shadow-violet-500/20 transition-colors hover:bg-violet-400"
                        onClick={togglePlay}
                    >
                        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 ml-0.5" />}
                    </button>
                    <Tooltip title="下一段">
                        <Button
                            type="text"
                            size="small"
                            className="!text-stone-400 hover:!text-stone-200 hover:!bg-white/[0.06]"
                            icon={<SkipForward className="size-3.5" />}
                            onClick={() => playAt(currentIdx + 1)}
                        />
                    </Tooltip>
                </div>

                {/* Separator */}
                <div className="h-4 w-px bg-white/[0.06]" />

                {/* Progress bar */}
                <div className="flex flex-1 items-center gap-3">
                    <Slider
                        className="flex-1 [&_.ant-rail]:!bg-white/[0.06] [&_.ant-rail]:!h-1.5 [&_.ant-track]:!bg-violet-500 [&_.ant-track]:!h-1.5 [&_.ant-slider-handle]:!border-violet-400 [&_.ant-slider-handle]:!bg-violet-500 [&_.ant-slider-handle]:!shadow-none [&_.ant-slider-handle]:!size-3"
                        min={0}
                        max={100}
                        value={totalProgress}
                        onChange={(v) => {
                            const targetTime = (v / 100) * totalDuration;
                            let acc = 0;
                            for (let i = 0; i < doneLines.length; i++) {
                                const dur = doneLines[i].duration ?? 0;
                                if (acc + dur >= targetTime) {
                                    playAt(i);
                                    break;
                                }
                                acc += dur;
                            }
                        }}
                        tooltip={{ formatter: (v) => formatTime(((v ?? 0) / 100) * totalDuration) }}
                    />
                </div>

                {/* Time display */}
                <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 py-1">
                    <span className="text-[11px] tabular-nums text-stone-300">{formatTime(elapsed)}</span>
                    <span className="text-[11px] text-stone-600">/</span>
                    <span className="text-[11px] tabular-nums text-stone-500">{formatTime(totalDuration)}</span>
                </div>
            </div>
        </footer>
    );
}
