import { Pause, Play, Scissors } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Tooltip } from "antd";

import { useVoiceStore } from "../store/use-voice-store";

interface Props {
    lineId: string;
    audioUrl: string;
    duration: number;
}

export function AudioTrimmer({ lineId, audioUrl, duration }: Props) {
    const { message } = App.useApp();
    const trimAudio = useVoiceStore((s) => s.trimAudio);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const bufferRef = useRef<AudioBuffer | null>(null);
    const [selStart, setSelStart] = useState(0);
    const [selEnd, setSelEnd] = useState(1);
    const [playing, setPlaying] = useState(false);
    const [trimming, setTrimming] = useState(false);
    const [dragging, setDragging] = useState<"start" | "end" | "region" | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);

    useEffect(() => {
        return () => {
            sourceRef.current?.stop();
            sourceRef.current = null;
            audioCtxRef.current?.close();
            audioCtxRef.current = null;
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = 80 * dpr;
            const ctx = canvas.getContext("2d");
            ctx?.scale(dpr, dpr);
            if (bufferRef.current) drawWaveform(bufferRef.current);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        bufferRef.current = null;
        let cancelled = false;
        const loadAudio = async () => {
            try {
                const ctx = audioCtxRef.current ?? new AudioContext();
                audioCtxRef.current = ctx;
                const res = await fetch(audioUrl);
                const arrayBuf = await res.arrayBuffer();
                const audioBuf = await ctx.decodeAudioData(arrayBuf);
                if (cancelled) return;
                bufferRef.current = audioBuf;
                drawWaveform(audioBuf);
            } catch { /* ignore */ }
        };
        void loadAudio();
        return () => { cancelled = true; };
    }, [audioUrl]);

    const drawWaveform = useCallback((buffer: AudioBuffer) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        ctx.clearRect(0, 0, width, height);

        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const mid = height / 2;

        // Waveform bars
        ctx.fillStyle = "#7c3aed";
        for (let x = 0; x < width; x++) {
            let max = 0;
            for (let i = 0; i < step; i++) {
                const val = Math.abs(data[x * step + i] ?? 0);
                if (val > max) max = val;
            }
            const barH = max * mid * 0.9;
            ctx.fillRect(x, mid - barH, 1, barH * 2);
        }

        // Selection masks
        const startX = selStart * width;
        const endX = selEnd * width;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, startX, height);
        ctx.fillRect(endX, 0, width - endX, height);

        // Selection border
        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, 0, endX - startX, height);

        // Handles
        ctx.fillStyle = "#a78bfa";
        ctx.fillRect(startX - 3, 0, 6, height);
        ctx.fillRect(endX - 3, 0, 6, height);
    }, [selStart, selEnd]);

    useEffect(() => {
        if (bufferRef.current) drawWaveform(bufferRef.current);
    }, [selStart, selEnd, drawWaveform]);

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const startX = selStart;
        const endX = selEnd;

        if (Math.abs(x - startX) < 0.02) setDragging("start");
        else if (Math.abs(x - endX) < 0.02) setDragging("end");
        else if (x > startX && x < endX) setDragging("region");
        else {
            setSelStart(x);
            setSelEnd(Math.min(x + 0.1, 1));
            setDragging("end");
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!dragging) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

        if (dragging === "start") setSelStart(Math.min(x, selEnd - 0.01));
        else if (dragging === "end") setSelEnd(Math.max(x, selStart + 0.01));
    };

    const handleMouseUp = () => setDragging(null);

    const playSelection = () => {
        const ctx = audioCtxRef.current;
        const buffer = bufferRef.current;
        if (!ctx || !buffer) return;

        sourceRef.current?.stop();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        const startSec = selStart * buffer.duration;
        const endSec = selEnd * buffer.duration;
        source.start(0, startSec, endSec - startSec);
        source.onended = () => setPlaying(false);
        sourceRef.current = source;
        setPlaying(true);
    };

    const handleTrim = async () => {
        const buffer = bufferRef.current;
        if (!buffer) return;
        setTrimming(true);
        try {
            const startMs = Math.round(selStart * buffer.duration * 1000);
            const endMs = Math.round(selEnd * buffer.duration * 1000);
            await trimAudio(lineId, startMs, endMs);
            message.success("裁剪完成");
        } catch (e) {
            message.error(e instanceof Error ? e.message : "裁剪失败");
        } finally {
            setTrimming(false);
        }
    };

    const durationMs = duration * 1000;
    const selStartMs = Math.round(selStart * durationMs);
    const selEndMs = Math.round(selEnd * durationMs);

    return (
        <div className="space-y-2 p-3">
            <div className="flex items-center justify-between text-[10px] text-stone-500">
                <span>选区: {(selStartMs / 1000).toFixed(2)}s - {(selEndMs / 1000).toFixed(2)}s</span>
                <span>总时长: {duration.toFixed(2)}s</span>
            </div>

            <canvas
                ref={canvasRef}
                className="h-20 w-full cursor-crosshair rounded-lg border border-white/[0.06] bg-white/[0.02]"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />

            <div className="flex items-center gap-2">
                <Tooltip title="播放选区">
                    <Button
                        type="text"
                        size="small"
                        className="!text-stone-400 hover:!text-violet-400 hover:!bg-violet-500/10"
                        icon={playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                        onClick={playing ? () => { sourceRef.current?.stop(); setPlaying(false); } : playSelection}
                    />
                </Tooltip>
                <Tooltip title="裁剪（保留选区）">
                    <Button
                        size="small"
                        className="!border-white/[0.08] !bg-white/[0.04] !text-stone-400 hover:!text-stone-200"
                        icon={<Scissors className="size-3" />}
                        loading={trimming}
                        onClick={handleTrim}
                    >
                        裁剪
                    </Button>
                </Tooltip>
                <Tooltip title="全选">
                    <Button
                        size="small"
                        className="!border-white/[0.08] !bg-white/[0.04] !text-stone-400 hover:!text-stone-200"
                        onClick={() => { setSelStart(0); setSelEnd(1); }}
                    >
                        全选
                    </Button>
                </Tooltip>
            </div>
        </div>
    );
}
