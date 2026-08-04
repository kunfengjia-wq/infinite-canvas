import { useMemo, useState } from "react";
import { Popover, Slider } from "antd";
import { Edit3, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { useShallow } from "zustand/react/shallow";
import { PLATFORM_LIST, STYLE_PRESETS } from "@/types/prompt-studio";

/**
 * 风格预设按钮组（按分类分组）
 * 支持多选 + 权重调节 + 自定义风格输入
 * compact 用于双栏工作台顶部紧凑工具条
 */
export function StylePresets({ compact = false }: { compact?: boolean }) {
    const { selectedStyles, customStyle, toggleStyle, setStyleWeight, setCustomStyle, clearStyles, selectedPlatforms } = usePromptStudioStore(
        useShallow((s) => ({ selectedStyles: s.selectedStyles, customStyle: s.customStyle, toggleStyle: s.toggleStyle, setStyleWeight: s.setStyleWeight, setCustomStyle: s.setCustomStyle, clearStyles: s.clearStyles, selectedPlatforms: s.selectedPlatforms })),
    );
    const [showCustom, setShowCustom] = useState(false);

    // 依据所选平台类型计算媒体过滤
    const mediaFilter = useMemo<"image" | "video" | null>(() => {
        if (selectedPlatforms.length === 0) return null;
        const cats = new Set(selectedPlatforms.map((id) => PLATFORM_LIST.find((p) => p.id === id)?.category));
        if (cats.size === 1 && cats.has("video")) return "video";
        if (cats.size === 1 && cats.has("image")) return "image";
        return null;
    }, [selectedPlatforms]);

    const visibleStyles = useMemo(() => STYLE_PRESETS.filter((s) => !mediaFilter || s.mediaType === mediaFilter || s.mediaType === "both"), [mediaFilter]);
    const visibleCategories = useMemo(() => Array.from(new Set(visibleStyles.map((s) => s.category))), [visibleStyles]);

    const getWeight = (id: string) => selectedStyles.find((s) => s.id === id)?.weight ?? 1.0;
    const isSelected = (id: string) => selectedStyles.some((s) => s.id === id);

    // compact 模式：选中风格以 Tag 形式展示
    if (compact) {
        return (
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-stone-400">风格</span>
                <button
                    type="button"
                    onClick={clearStyles}
                    className={cn(
                        "rounded-md border px-2 py-1 text-xs transition",
                        selectedStyles.length === 0 && !customStyle
                            ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                            : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900",
                    )}
                >
                    不限
                </button>
                {selectedStyles.map((s) => {
                    const preset = STYLE_PRESETS.find((p) => p.id === s.id);
                    return (
                        <Popover
                            key={s.id}
                            trigger="click"
                            content={
                                <div className="w-32">
                                    <div className="mb-1 text-xs text-stone-500">权重: {s.weight.toFixed(1)}</div>
                                    <Slider min={0.1} max={2.0} step={0.1} value={s.weight} onChange={(v) => setStyleWeight(s.id, v)} />
                                    <button type="button" className="mt-1 text-xs text-red-400 hover:text-red-500" onClick={() => toggleStyle(s.id)}>移除</button>
                                </div>
                            }
                        >
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-300">
                                {preset?.label ?? s.id}
                                {s.weight !== 1.0 && <span className="text-[10px] opacity-70">×{s.weight}</span>}
                            </span>
                        </Popover>
                    );
                })}
                {customStyle && (
                    <span className="inline-flex items-center gap-0.5 rounded-md border border-green-400 bg-green-50 px-2 py-1 text-xs text-green-700 dark:border-green-500 dark:bg-green-950 dark:text-green-300">
                        <span className="max-w-[120px] truncate">{customStyle}</span>
                        <button type="button" onClick={() => setCustomStyle("")}><X className="size-3" /></button>
                    </span>
                )}
                <button
                    type="button"
                    onClick={() => setShowCustom(!showCustom)}
                    className="rounded-md border border-stone-200 px-1.5 py-1 text-xs text-stone-400 hover:border-stone-300 hover:text-stone-600 dark:border-stone-700 dark:hover:text-stone-300"
                    title="自定义风格"
                >
                    <Edit3 className="size-3" />
                </button>
                {showCustom && (
                    <input
                        className="w-40 rounded-md border border-stone-200 px-2 py-1 text-xs dark:border-stone-700 dark:bg-stone-900"
                        placeholder="自定义风格关键词..."
                        value={customStyle}
                        onChange={(e) => setCustomStyle(e.target.value)}
                    />
                )}
                {/* 下拉选择更多预设 */}
                <Popover
                    trigger="click"
                    content={
                        <div className="max-h-60 w-64 overflow-y-auto space-y-2">
                            {visibleCategories.map((cat) => (
                                <div key={cat}>
                                    <span className="mb-1 block text-[10px] text-stone-400">{cat}</span>
                                    <div className="flex flex-wrap gap-1">
                                        {visibleStyles.filter((s) => s.category === cat).map((style) => (
                                            <button
                                                key={style.id}
                                                type="button"
                                                onClick={() => toggleStyle(style.id)}
                                                className={cn(
                                                    "rounded border px-1.5 py-0.5 text-[11px] transition",
                                                    isSelected(style.id)
                                                        ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-300"
                                                        : "border-stone-200 text-stone-500 hover:border-stone-300 dark:border-stone-700 dark:text-stone-400",
                                                )}
                                            >
                                                {style.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    }
                >
                    <button type="button" className="rounded-md border border-stone-200 px-2 py-1 text-xs text-stone-500 hover:border-stone-300 dark:border-stone-700 dark:text-stone-400">
                        +预设
                    </button>
                </Popover>
            </div>
        );
    }

    // 完整模式
    return (
        <section>
            <h3 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-300">
                风格预设 <span className="font-normal text-stone-400">（可多选组合）</span>
            </h3>
            <div className="space-y-2.5">
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={clearStyles}
                        className={cn(
                            "rounded-md border px-3 py-1.5 text-sm transition",
                            selectedStyles.length === 0 && !customStyle
                                ? "border-stone-800 bg-stone-800 text-white dark:border-stone-200 dark:bg-stone-200 dark:text-stone-900"
                                : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900",
                        )}
                    >
                        不限
                    </button>
                </div>
                {visibleCategories.map((cat) => (
                    <div key={cat}>
                        <span className="mb-1.5 block text-xs text-stone-400">{cat}</span>
                        <div className="flex flex-wrap gap-2">
                            {visibleStyles.filter((s) => s.category === cat).map((style) => {
                                const active = isSelected(style.id);
                                const weight = getWeight(style.id);
                                return (
                                    <div key={style.id} className="relative">
                                        <button
                                            type="button"
                                            onClick={() => toggleStyle(style.id)}
                                            className={cn(
                                                "rounded-md border px-3 py-1.5 text-sm transition",
                                                active
                                                    ? "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300"
                                                    : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-900",
                                            )}
                                        >
                                            {style.label}
                                            {active && weight !== 1.0 && <span className="ml-1 text-[10px] opacity-70">×{weight}</span>}
                                        </button>
                                        {active && (
                                            <div className="absolute -bottom-5 left-0 right-0 z-10">
                                                <Slider
                                                    className="!m-0"
                                                    min={0.1}
                                                    max={2.0}
                                                    step={0.1}
                                                    value={weight}
                                                    onChange={(v) => setStyleWeight(style.id, v)}
                                                    tooltip={{ formatter: (v) => `${v?.toFixed(1)}` }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
                {/* 自定义风格输入 */}
                <div className="mt-3">
                    <span className="mb-1 block text-xs text-stone-400">自定义风格</span>
                    <textarea
                        className="w-full rounded-md border border-stone-200 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
                        rows={2}
                        placeholder="输入自定义风格关键词，如：neo-noir, rain reflections, 1940s jazz club atmosphere"
                        value={customStyle}
                        onChange={(e) => setCustomStyle(e.target.value)}
                    />
                </div>
            </div>
        </section>
    );
}
