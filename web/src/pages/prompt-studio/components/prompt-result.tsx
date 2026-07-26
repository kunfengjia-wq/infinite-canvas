import { Copy, LoaderCircle, RefreshCw, Sparkles, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { App, Button, Card, Empty, Input, Popconfirm, Tag, Tooltip } from "antd";

import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { aiGeneratePrompt, aiOptimizePrompt, aiScorePrompt, type QualityScoreResult } from "@/services/prompt-studio-ai";
import { useCopyText } from "@/hooks/use-copy-text";
import type { AiConfig } from "@/stores/use-config-store";
import { PLATFORM_LIST, PROMPT_CATEGORIES, STYLE_PRESETS, type PromptCategory } from "@/types/prompt-studio";
import { cn } from "@/lib/utils";

export function PromptResult({ config, onError }: { config: AiConfig; onError: (msg: string) => void }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const { current, updateEntry, removeEntry } = usePromptStudioStore();
    const [filterCategory, setFilterCategory] = useState<PromptCategory | "all">("all");
    const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
    const [optimizingId, setOptimizingId] = useState<string | null>(null);
    const [scoringId, setScoringId] = useState<string | null>(null);
    const [scoreResults, setScoreResults] = useState<Record<string, QualityScoreResult>>({});

    if (!current || current.entries.length === 0) {
        return (
            <section>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="生成的提示词将显示在这里" className="py-8" />
            </section>
        );
    }

    const filteredEntries = filterCategory === "all" ? current.entries : current.entries.filter((e) => e.category === filterCategory);
    const usedCategories = Array.from(new Set(current.entries.map((e) => e.category)));

    const handleRegenerate = async (entryId: string, input: string, platform: string, styles?: { id: string; weight: number }[], customStyle?: string) => {
        setRegeneratingId(entryId);
        try {
            const result = await aiGeneratePrompt(config, { input, platform: platform as never, styles, customStyle });
            updateEntry(entryId, { prompt: result.prompt, negativePrompt: result.negativePrompt, translation: result.translation });
            message.success("已重新生成");
        } catch (error) {
            onError(error instanceof Error ? error.message : "重新生成失败");
        } finally {
            setRegeneratingId(null);
        }
    };

    const handleOptimize = async (entryId: string, prompt: string, platform: string) => {
        setOptimizingId(entryId);
        try {
            const result = await aiOptimizePrompt(config, prompt, platform as never);
            updateEntry(entryId, { prompt: result.prompt, negativePrompt: result.negativePrompt, translation: result.translation });
            message.success(result.note ? `已优化：${result.note}` : "已优化");
        } catch (error) {
            onError(error instanceof Error ? error.message : "优化失败");
        } finally {
            setOptimizingId(null);
        }
    };

    const handleScore = async (entryId: string, prompt: string, platform: string) => {
        setScoringId(entryId);
        try {
            const result = await aiScorePrompt(config, prompt, platform as never);
            setScoreResults((prev) => ({ ...prev, [entryId]: result }));
            message.success(`评分：${result.overall.toFixed(1)}/10`);
        } catch (error) {
            onError(error instanceof Error ? error.message : "评分失败");
        } finally {
            setScoringId(null);
        }
    };

    return (
        <section>
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-stone-600 dark:text-stone-300">
                    生成结果 <span className="text-stone-400">（{filteredEntries.length}/{current.entries.length} 条）</span>
                </h3>
                <div className="flex flex-wrap gap-1">
                    <button type="button" onClick={() => setFilterCategory("all")} className={cn("rounded px-2 py-0.5 text-xs transition", filterCategory === "all" ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900" : "text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800")}>
                        全部
                    </button>
                    {usedCategories.map((cat) => {
                        const meta = PROMPT_CATEGORIES.find((c) => c.id === cat);
                        return (
                            <button key={cat} type="button" onClick={() => setFilterCategory(cat)} className={cn("rounded px-2 py-0.5 text-xs transition", filterCategory === cat ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900" : "text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800")}>
                                {meta?.label || cat}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="space-y-3">
                {filteredEntries.map((entry) => {
                    const platformMeta = PLATFORM_LIST.find((p) => p.id === entry.platform);
                    const categoryMeta = PROMPT_CATEGORIES.find((c) => c.id === entry.category);
                    return (
                        <Card key={entry.id} size="small" className="group">
                            <div className="mb-2 flex items-start gap-2">
                                {categoryMeta && <Tag color={categoryMeta.color}>{categoryMeta.label}</Tag>}
                                <Tag color={platformMeta?.category === "video" ? "purple" : "blue"}>{platformMeta?.label || entry.platform}</Tag>
                                {entry.styles && entry.styles.length > 0 && entry.styles.map((s) => <Tag key={s.id}>{STYLE_PRESETS.find((p) => p.id === s.id)?.label ?? s.id}{s.weight !== 1.0 ? `×${s.weight}` : ""}</Tag>)}
                                {entry.customStyle && <Tag color="green">{entry.customStyle.slice(0, 20)}</Tag>}
                                {entry.assetRef && <Tag color="green">{entry.assetRef}</Tag>}
                                <span className="min-w-0 flex-1 whitespace-normal break-all text-xs leading-relaxed text-stone-400">{entry.input}</span>
                                <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                                    <Button type="text" size="small" icon={regeneratingId === entry.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} disabled={regeneratingId === entry.id} onClick={() => handleRegenerate(entry.id, entry.input, entry.platform, entry.styles, entry.customStyle)} title="重新生成" />
                                    <Tooltip title="AI 优化提示词">
                                        <Button type="text" size="small" icon={optimizingId === entry.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} disabled={optimizingId === entry.id} onClick={() => handleOptimize(entry.id, entry.prompt, entry.platform)} />
                                    </Tooltip>
                                    <Tooltip title="质量评分">
                                        <Button type="text" size="small" icon={scoringId === entry.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Star className="size-3.5" />} disabled={scoringId === entry.id} onClick={() => handleScore(entry.id, entry.prompt, entry.platform)} />
                                    </Tooltip>
                                    <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(entry.prompt, "提示词已复制")} />
                                    <Popconfirm title="删除此条目？" onConfirm={() => removeEntry(entry.id)} okText="删除" cancelText="取消">
                                        <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} />
                                    </Popconfirm>
                                </div>
                            </div>
                            <Input.TextArea
                                value={entry.prompt}
                                onChange={(e) => updateEntry(entry.id, { prompt: e.target.value })}
                                autoSize={{ minRows: 2, maxRows: 12 }}
                                className="font-mono text-xs leading-relaxed"
                            />
                            {entry.negativePrompt && (
                                <div className="mt-2">
                                    <span className="text-xs text-red-400">Negative:</span>
                                    <Input.TextArea
                                        value={entry.negativePrompt}
                                        onChange={(e) => updateEntry(entry.id, { negativePrompt: e.target.value })}
                                        autoSize={{ minRows: 1, maxRows: 6 }}
                                        className="mt-1 font-mono text-xs leading-relaxed text-red-300"
                                    />
                                </div>
                            )}
                            {entry.translation && (
                                <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 dark:border-emerald-900 dark:bg-emerald-950/40">
                                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">中文对照</span>
                                    <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-stone-600 dark:text-stone-300">{entry.translation}</p>
                                </div>
                            )}
                            {scoreResults[entry.id] && (
                                <div className="mt-2 rounded border border-stone-200 bg-stone-50 p-2 text-xs dark:border-stone-700 dark:bg-stone-800/50">
                                    <div className="mb-1 font-medium">
                                        综合评分：<span className="text-amber-600">{scoreResults[entry.id].overall.toFixed(1)}/10</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-stone-500">
                                        <span>清晰度 {scoreResults[entry.id].scores.clarity}</span>
                                        <span>细节 {scoreResults[entry.id].scores.detail}</span>
                                        <span>结构 {scoreResults[entry.id].scores.structure}</span>
                                        <span>创意 {scoreResults[entry.id].scores.creativity}</span>
                                        <span>可行性 {scoreResults[entry.id].scores.feasibility}</span>
                                    </div>
                                    {scoreResults[entry.id].suggestions.length > 0 && (
                                        <ul className="mt-1 list-inside list-disc text-stone-400">
                                            {scoreResults[entry.id].suggestions.map((s, i) => <li key={i}>{s}</li>)}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>
        </section>
    );
}
