import { GitBranch, LoaderCircle, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Tooltip } from "antd";

import { aiDivergeFromBubble } from "@/services/script-creation-ai";
import type { AiConfig } from "@/stores/use-config-store";

// ─── 类型 ────────────────────────────────────────────────────────

interface Bubble {
    id: string;
    text: string;
    x: number;
    y: number;
    color: string;
    size: "sm" | "md" | "lg";
    vx: number;
    vy: number;
    parentId?: string; // 从哪个泡泡发散来的
    generation: number; // 第几代
}

// ─── 调色板 ──────────────────────────────────────────────────────

const BUBBLE_COLORS = [
    "from-rose-400 to-pink-500",
    "from-amber-400 to-orange-500",
    "from-emerald-400 to-teal-500",
    "from-sky-400 to-blue-500",
    "from-violet-400 to-purple-500",
    "from-fuchsia-400 to-pink-500",
    "from-lime-400 to-green-500",
    "from-cyan-400 to-sky-500",
];

const SIZE_MAP = { sm: "w-14 h-14 text-[10px]", md: "w-[72px] h-[72px] text-xs", lg: "w-20 h-20 text-sm" };
const GEN_SIZE: Record<number, "sm" | "md" | "lg"> = { 0: "lg", 1: "md", 2: "sm" };

function randomColor() {
    return BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)];
}
function genId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── 组件 ────────────────────────────────────────────────────────

interface Props {
    config: AiConfig;
    /** 左侧灵感种子的当前值 */
    seed: string;
    /** 用户双击泡泡时，将该泡泡文本填入左侧种子 */
    onFillSeed: (text: string) => void;
}

export function SeedStormCanvas({ config, seed, onFillSeed }: Props) {
    const [bubbles, setBubbles] = useState<Bubble[]>([]);
    const [diverging, setDiverging] = useState<string | null>(null); // 正在发散的泡泡 id
    const [seedDiverging, setSeedDiverging] = useState(false);
    const [dragging, setDragging] = useState<string | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const animRef = useRef<number>(0);

    // ─── 漂移动画 ───
    useEffect(() => {
        const tick = () => {
            setBubbles((prev) =>
                prev.map((b) => {
                    if (b.id === dragging) return b;
                    let { x, y, vx, vy } = b;
                    x += vx;
                    y += vy;
                    if (x < 8 || x > 92) vx = -vx * 0.8;
                    if (y < 8 || y > 88) vy = -vy * 0.8;
                    x = Math.max(8, Math.min(92, x));
                    y = Math.max(8, Math.min(88, y));
                    // 轻微减速
                    vx *= 0.999;
                    vy *= 0.999;
                    return { ...b, x, y, vx, vy };
                }),
            );
            animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animRef.current);
    }, [dragging]);

    // ─── 从种子发散 ───
    const handleDivergeFromSeed = useCallback(async () => {
        if (!seed.trim()) return;
        setSeedDiverging(true);
        try {
            const existing = bubbles.map((b) => b.text);
            const results = await aiDivergeFromBubble(config, seed.trim(), seed.trim(), existing);
            const newBubbles: Bubble[] = results.map((text, i) => ({
                id: genId(),
                text: text.length > 6 ? text.slice(0, 6) : text,
                x: 20 + (i % 3) * 25 + Math.random() * 10,
                y: 20 + Math.floor(i / 3) * 30 + Math.random() * 10,
                color: randomColor(),
                size: "md" as const,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                generation: 0,
            }));
            setBubbles((prev) => [...prev, ...newBubbles].slice(-20));
        } catch { /* 静默 */ }
        finally { setSeedDiverging(false); }
    }, [config, seed, bubbles]);

    // ─── 从泡泡发散（传入种子上下文保持关联性） ───
    const handleDivergeFromBubble = useCallback(async (bubble: Bubble) => {
        setDiverging(bubble.id);
        try {
            const existing = bubbles.map((b) => b.text);
            const results = await aiDivergeFromBubble(config, bubble.text, seed.trim() || bubble.text, existing);
            const gen = Math.min(bubble.generation + 1, 2);
            const newBubbles: Bubble[] = results.map((text, i) => {
                const angle = (i / results.length) * Math.PI * 2 + Math.random() * 0.5;
                const dist = 12 + Math.random() * 8;
                return {
                    id: genId(),
                    text: text.length > 6 ? text.slice(0, 6) : text,
                    x: Math.max(8, Math.min(92, bubble.x + Math.cos(angle) * dist)),
                    y: Math.max(8, Math.min(88, bubble.y + Math.sin(angle) * dist)),
                    color: randomColor(),
                    size: GEN_SIZE[gen] ?? "sm",
                    vx: Math.cos(angle) * 0.2,
                    vy: Math.sin(angle) * 0.2,
                    parentId: bubble.id,
                    generation: gen,
                };
            });
            setBubbles((prev) => [...prev, ...newBubbles].slice(-24));
        } catch { /* 静默 */ }
        finally { setDiverging(null); }
    }, [config, seed, bubbles]);

    // ─── 拖拽 ───
    const handlePointerDown = (id: string) => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(id);
        const onMove = (ev: PointerEvent) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = ((ev.clientX - rect.left) / rect.width) * 100;
            const y = ((ev.clientY - rect.top) / rect.height) * 100;
            setBubbles((prev) => prev.map((b) => (b.id === id ? { ...b, x: Math.max(8, Math.min(92, x)), y: Math.max(8, Math.min(88, y)), vx: 0, vy: 0 } : b)));
        };
        const onUp = () => {
            setDragging(null);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    // ─── 移除泡泡 ───
    const removeBubble = (id: string) => (e: React.MouseEvent) => {
        e.stopPropagation();
        setBubbles((prev) => prev.filter((b) => b.id !== id && b.parentId !== id));
    };

    // ─── 双击空白 = 手动添加 ───
    const handleCanvasDoubleClick = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        const text = prompt("输入一个灵感关键词：");
        if (!text?.trim()) return;
        setBubbles((prev) => [
            ...prev,
            { id: genId(), text: text.trim().slice(0, 6), x, y, color: randomColor(), size: "md", vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2, generation: 0 },
        ]);
    };

    return (
        <div className="relative flex h-full flex-col overflow-hidden rounded-r-lg bg-gradient-to-br from-stone-900 via-slate-900 to-gray-900">
            {/* 环境粒子 */}
            <div className="pointer-events-none absolute inset-0 opacity-20">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="absolute size-1 animate-pulse rounded-full" style={{ left: `${15 + i * 15}%`, top: `${10 + (i % 3) * 30}%`, backgroundColor: ["#60a5fa", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#22d3ee"][i], animationDelay: `${i * 0.4}s` }} />
                ))}
            </div>

            {/* 标题栏 */}
            <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-1">
                <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-amber-400" />
                    <span className="text-sm font-semibold text-white/90">灵感风暴</span>
                    {bubbles.length > 0 && <span className="text-[10px] text-white/30">{bubbles.length} 个概念</span>}
                </div>
                <Tooltip title={seed.trim() ? `从「${seed.trim().slice(0, 10)}…」发散` : "请先在左侧输入灵感种子"}>
                    <Button
                        type="text"
                        size="small"
                        icon={seedDiverging ? <LoaderCircle className="size-3.5 animate-spin" /> : <GitBranch className="size-3.5" />}
                        onClick={handleDivergeFromSeed}
                        disabled={seedDiverging || !seed.trim()}
                        className="!text-xs !text-white/60 hover:!text-emerald-300"
                    >
                        {seedDiverging ? "发散中…" : "从种子发散"}
                    </Button>
                </Tooltip>
            </div>

            {/* 画布区 */}
            <div ref={canvasRef} className="relative flex-1 cursor-crosshair" onDoubleClick={handleCanvasDoubleClick}>
                {/* 连线（parent → child） */}
                <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 0 }}>
                    {bubbles.filter((b) => b.parentId).map((b) => {
                        const parent = bubbles.find((p) => p.id === b.parentId);
                        if (!parent) return null;
                        return <line key={`${parent.id}-${b.id}`} x1={`${parent.x}%`} y1={`${parent.y}%`} x2={`${b.x}%`} y2={`${b.y}%`} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3 3" />;
                    })}
                </svg>

                {/* 泡泡 */}
                {bubbles.map((b) => {
                    const isDiverging = diverging === b.id;
                    return (
                        <div
                            key={b.id}
                            className={`group absolute flex select-none items-center justify-center rounded-full bg-gradient-to-br ${b.color} ${SIZE_MAP[b.size]} font-medium text-white shadow-lg shadow-black/30 transition-all hover:scale-110 ${isDiverging ? "ring-2 ring-white/50 ring-offset-2 ring-offset-transparent" : ""}`}
                            style={{ left: `${b.x}%`, top: `${b.y}%`, transform: "translate(-50%, -50%)", zIndex: 1, cursor: isDiverging ? "wait" : "pointer" }}
                            onPointerDown={handlePointerDown(b.id)}
                            onClick={() => !isDiverging && handleDivergeFromBubble(b)}
                            title={`单击：发散关联概念\n拖拽：移动`}
                        >
                            {isDiverging ? <LoaderCircle className="size-4 animate-spin" /> : <span className="px-1 text-center leading-tight">{b.text}</span>}
                            {/* 快捷加入种子 */}
                            <button
                                className="absolute -bottom-1 -right-1 hidden size-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow group-hover:flex"
                                onClick={(e) => { e.stopPropagation(); onFillSeed(b.text); }}
                                title="加入灵感种子"
                            >
                                <span className="text-xs font-bold leading-none">+</span>
                            </button>
                            {/* 删除 */}
                            <button className="absolute -left-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-black/60 text-white/80 group-hover:flex" onClick={removeBubble(b.id)}>
                                <X className="size-2.5" />
                            </button>
                        </div>
                    );
                })}

                {/* 空状态 */}
                {bubbles.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/30">
                        <GitBranch className="size-10 opacity-50" />
                        <p className="text-xs">在左侧输入灵感种子后</p>
                        <p className="text-xs">点击「从种子发散」开始思维风暴</p>
                        <p className="mt-2 text-[10px] text-white/20">或双击画布手动添加泡泡</p>
                    </div>
                )}
            </div>

            {/* 底部提示 */}
            <div className="relative z-10 px-4 pb-2 pt-1">
                <p className="text-center text-[10px] text-white/25">单击泡泡 = 发散 · hover 点 + = 加入种子 · 拖拽 = 移动 · 双击空白 = 添加</p>
            </div>
        </div>
    );
}
