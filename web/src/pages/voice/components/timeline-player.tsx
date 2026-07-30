import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Slider } from "antd";

import { useVoiceStore } from "../store/use-voice-store";
import { cn } from "@/lib/utils";

export function TimelinePlayer({ onEditLine }: { onEditLine?: (lineId: string) => void }) {
    const { current } = useVoiceStore();
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [totalProgress, setTotalProgress] = useState(0); // 全局进度

    const doneLines = current?.lines.filter((l) => l.status === "done" && l.audioUrl) ?? [];
    const totalDuration = doneLines.reduce((acc, l) => acc + (l.duration ?? 0), 0);

    // 播放当前片段
    const playAt = useCallback((idx: number) => {
        if (idx < 0 || idx >= doneLines.length) {
            setPlaying(false);
            return;
        }
        setCurrentIdx(idx);
        const line = doneLines[idx];
        if (!line.audioUrl) return;

        if (audioRef.current) {
            audioRef.current.pause();
        }
        const audio = new Audio(line.audioUrl);
        audioRef.current = audio;

        audio.ontimeupdate = () => {
            if (audio.duration) {
                // 全局进度
                const elapsed = doneLines.slice(0, idx).reduce((a, l) => a + (l.duration ?? 0), 0) + audio.currentTime;
                setTotalProgress(totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0);
            }
        };
        audio.onended = () => {
            playAt(idx + 1);
        };
        void audio.play();
        setPlaying(true);
    }, [doneLines, totalDuration]);

    const togglePlay = () => {
        if (playing) {
            audioRef.current?.pause();
            setPlaying(false);
        } else {
            playAt(currentIdx >= doneLines.length ? 0 : currentIdx);
        }
    };

    useEffect(() => {
        return () => { audioRef.current?.pause(); };
    }, []);

    if (!current || doneLines.length === 0) return null;

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    };

    const elapsed = doneLines.slice(0, currentIdx).reduce((a, l) => a + (l.duration ?? 0), 0)
        + (audioRef.current?.currentTime ?? 0);

    return (
        <footer className="border-t border-stone-200 bg-stone-50/80 px-4 py-2.5 dark:border-stone-800 dark:bg-stone-900/40">
            {/* 片段指示器 */}
            <div className="mb-2 flex items-center gap-1 overflow-x-auto">
                {doneLines.map((line, idx) => {
                    const char = current.characters.find((c) => c.id === line.characterId);
                    return (
                        <button
                            key={line.id}
                            className={cn(
                                "h-6 shrink-0 rounded px-2 text-[10px] transition-all",
                                idx === currentIdx && playing
                                    ? "bg-violet-500 text-white shadow-sm"
                                    : "bg-stone-200 text-stone-500 hover:bg-stone-300 dark:bg-stone-700 dark:text-stone-300",
                            )}
                            style={{ minWidth: `${Math.max(24, (line.duration ?? 1) * 12)}px` }}
                            onClick={() => playAt(idx)}
                            onDoubleClick={() => onEditLine?.(line.id)}
                            title={`${char?.name ?? ""} - 双击裁剪`}
                        >
                            {idx + 1}
                        </button>
                    );
                })}
            </div>

            {/* 控制栏 */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                    <Button type="text" size="small" icon={<SkipBack className="size-3.5" />} onClick={() => playAt(currentIdx - 1)} />
                    <Button
                        type="primary"
                        size="small"
                        shape="circle"
                        icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                        onClick={togglePlay}
                    />
                    <Button type="text" size="small" icon={<SkipForward className="size-3.5" />} onClick={() => playAt(currentIdx + 1)} />
                </div>

                {/* 全局进度条 */}
                <Slider
                    className="flex-1"
                    min={0}
                    max={100}
                    value={totalProgress}
                    onChange={(v) => {
                        // 跳转到对应位置
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

                <span className="shrink-0 text-[10px] tabular-nums text-stone-400">
                    {formatTime(elapsed)} / {formatTime(totalDuration)}
                </span>
            </div>
        </footer>
    );
}
