import { Copy, History, LoaderCircle, RefreshCw, Sparkles, Star, ThumbsDown, ThumbsUp, Trash2, Wand2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { App, Button, Card, Empty, Input, Popconfirm, Popover, Tag, Tooltip } from "antd";

import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { aiGeneratePrompt, aiOptimizePrompt, aiScorePrompt, type QualityScoreResult } from "@/services/prompt-studio-ai";
import { submitFeedback, revokeFeedback } from "@/services/db/feedback-repo";
import { useCopyText } from "@/hooks/use-copy-text";
import type { AiConfig } from "@/stores/use-config-store";
import { PLATFORM_LIST, PROMPT_CATEGORIES, STYLE_PRESETS, type PromptCategory, type PromptPlatform } from "@/types/prompt-studio";
import { cn } from "@/lib/utils";

export function PromptResult({ config, onError }: { config: AiConfig; onError: (msg: string) => void }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const current = usePromptStudioStore((s) => s.current);
    const updateEntry = usePromptStudioStore((s) => s.updateEntry);
    const removeEntry = usePromptStudioStore((s) => s.removeEntry);
    const [filterCategory, setFilterCategory] = useState<PromptCategory | "all">("all");
    const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
    const [streamingText, setStreamingText] = useState<Record<string, string>>({});
    const [optimizingId, setOptimizingId] = useState<string | null>(null);
    const [scoringId, setScoringId] = useState<string | null>(null);
    const [scoreResults, setScoreResults] = useState<Record<string, QualityScoreResult>>({});
    const [batchOptimizing, setBatchOptimizing] = useState(false);
    const [batchScoring, setBatchScoring] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
    const [failedOptimizeIds, setFailedOptimizeIds] = useState<string[]>([]);
    const [failedScoreIds, setFailedScoreIds] = useState<string[]>([]);
    const [versionHistory, setVersionHistory] = useState<Record<string, { prompt: string; negativePrompt?: string; time: number }[]>>({});

    /** 保存版本历史（最多保留 3 版） */
    const pushHistory = (entryId: string, prompt: string, negativePrompt?: string) => {
        setVersionHistory((prev) => {
            const list = prev[entryId] ?? [];
            return { ...prev, [entryId]: [{ prompt, negativePrompt, time: Date.now() }, ...list].slice(0, 3) };
        });
    };

    /** 删除条目并同步清理关联状态 */
    const handleRemoveEntry = (entryId: string) => {
        removeEntry(entryId);
        setVersionHistory((prev) => { const n = { ...prev }; delete n[entryId]; return n; });
        setScoreResults((prev) => { const n = { ...prev }; delete n[entryId]; return n; });
        setStreamingText((prev) => { const n = { ...prev }; delete n[entryId]; return n; });
        setFailedOptimizeIds((prev) => prev.filter((id) => id !== entryId));
        setFailedScoreIds((prev) => prev.filter((id) => id !== entryId));
    };

    if (!current || current.entries.length === 0) {
        return (
            <section>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="生成的提示词将显示在这里" className="py-8" />
            </section>
        );
    }

    const filteredEntries = filterCategory === "all" ? current.entries : current.entries.filter((e) => e.category === filterCategory);
    const usedCategories = Array.from(new Set(current.entries.map((e) => e.category)));

    const handleRegenerate = async (entryId: string, input: string, platform: PromptPlatform, styles?: { id: string; weight: number }[], customStyle?: string) => {
        setRegeneratingId(entryId);
        setStreamingText((prev) => ({ ...prev, [entryId]: "" }));
        try {
            const entry = current?.entries.find((e) => e.id === entryId);
            if (entry) pushHistory(entryId, entry.prompt, entry.negativePrompt);
            const result = await aiGeneratePrompt(config, { input, platform, styles, customStyle }, (delta) => {
                setStreamingText((prev) => ({ ...prev, [entryId]: (prev[entryId] ?? "") + delta }));
            });
            updateEntry(entryId, { prompt: result.prompt, negativePrompt: result.negativePrompt, translation: result.translation, characterMapping: result.characterMapping });
            message.success("已重新生成");
        } catch (error) {
            onError(error instanceof Error ? error.message : "重新生成失败");
        } finally {
            setRegeneratingId(null);
            setStreamingText((prev) => { const n = { ...prev }; delete n[entryId]; return n; });
        }
    };

    const handleOptimize = async (entryId: string, prompt: string, platform: PromptPlatform) => {
        setOptimizingId(entryId);
        try {
            pushHistory(entryId, prompt, current?.entries.find((e) => e.id === entryId)?.negativePrompt);
            const result = await aiOptimizePrompt(config, prompt, platform);
            updateEntry(entryId, { prompt: result.prompt, negativePrompt: result.negativePrompt, translation: result.translation, characterMapping: result.characterMapping });
            message.success(result.note ? `已优化：${result.note}` : "已优化");
        } catch (error) {
            onError(error instanceof Error ? error.message : "优化失败");
        } finally {
            setOptimizingId(null);
        }
    };

    const handleScore = async (entryId: string, prompt: string, platform: PromptPlatform) => {
        setScoringId(entryId);
        try {
            const result = await aiScorePrompt(config, prompt, platform);
            setScoreResults((prev) => ({ ...prev, [entryId]: result }));
            message.success(`评分：${result.overall.toFixed(1)}/10`);
        } catch (error) {
            onError(error instanceof Error ? error.message : "评分失败");
        } finally {
            setScoringId(null);
        }
    };

    /** 批量优化所有条目 */
    const handleBatchOptimize = async () => {
        setBatchOptimizing(true);
        setFailedOptimizeIds([]);
        const entries = filteredEntries;
        setBatchProgress({ done: 0, total: entries.length });
        const failures: string[] = [];
        const CONCURRENCY = 3;

        for (let i = 0; i < entries.length; i += CONCURRENCY) {
            const batch = entries.slice(i, i + CONCURRENCY);
            const results = await Promise.allSettled(
                batch.map((entry) => aiOptimizePrompt(config, entry.prompt, entry.platform)),
            );
            results.forEach((result, j) => {
                const entry = batch[j];
                if (result.status === "fulfilled") {
                    updateEntry(entry.id, { prompt: result.value.prompt, negativePrompt: result.value.negativePrompt, translation: result.value.translation, characterMapping: result.value.characterMapping });
                } else {
                    failures.push(entry.id);
                }
            });
            setBatchProgress({ done: Math.min(i + CONCURRENCY, entries.length), total: entries.length });
        }

        setBatchOptimizing(false);
        setFailedOptimizeIds(failures);
        message.success(failures.length === 0 ? `已优化 ${entries.length} 条` : `优化完成，${failures.length} 条失败`);
    };

    /** 批量评分所有条目 */
    const handleBatchScore = async () => {
        setBatchScoring(true);
        setFailedScoreIds([]);
        const entries = filteredEntries;
        setBatchProgress({ done: 0, total: entries.length });
        const failures: string[] = [];
        const CONCURRENCY = 3;

        for (let i = 0; i < entries.length; i += CONCURRENCY) {
            const batch = entries.slice(i, i + CONCURRENCY);
            const results = await Promise.allSettled(
                batch.map((entry) => aiScorePrompt(config, entry.prompt, entry.platform)),
            );
            results.forEach((result, j) => {
                const entry = batch[j];
                if (result.status === "fulfilled") {
                    setScoreResults((prev) => ({ ...prev, [entry.id]: result.value }));
                } else {
                    failures.push(entry.id);
                }
            });
            setBatchProgress({ done: Math.min(i + CONCURRENCY, entries.length), total: entries.length });
        }

        setBatchScoring(false);
        setFailedScoreIds(failures);
        message.success(failures.length === 0 ? `已评分 ${entries.length} 条` : `评分完成，${failures.length} 条失败`);
    };

    /** 重试失败条目（优化和评分分别处理） */
    const handleRetryFailed = async () => {
        const allFailed = [...failedOptimizeIds, ...failedScoreIds];
        if (allFailed.length === 0) return;
        setBatchOptimizing(true);
        const stillFailedOptimize: string[] = [];
        const stillFailedScore: string[] = [];

        // 重试优化失败
        if (failedOptimizeIds.length > 0) {
            const toRetry = current!.entries.filter((e) => failedOptimizeIds.includes(e.id));
            for (const entry of toRetry) {
                try {
                    const result = await aiOptimizePrompt(config, entry.prompt, entry.platform);
                    updateEntry(entry.id, { prompt: result.prompt, negativePrompt: result.negativePrompt, translation: result.translation, characterMapping: result.characterMapping });
                } catch {
                    stillFailedOptimize.push(entry.id);
                }
            }
        }

        // 重试评分失败
        if (failedScoreIds.length > 0) {
            const toRetry = current!.entries.filter((e) => failedScoreIds.includes(e.id));
            for (const entry of toRetry) {
                try {
                    const result = await aiScorePrompt(config, entry.prompt, entry.platform);
                    setScoreResults((prev) => ({ ...prev, [entry.id]: result }));
                } catch {
                    stillFailedScore.push(entry.id);
                }
            }
        }

        setBatchOptimizing(false);
        setFailedOptimizeIds(stillFailedOptimize);
        setFailedScoreIds(stillFailedScore);
        const totalStillFailed = stillFailedOptimize.length + stillFailedScore.length;
        message.success(totalStillFailed === 0 ? "重试全部成功" : `仍有 ${totalStillFailed} 条失败`);
    };

    const handleFeedback = (entryId: string, prompt: string, negativePrompt: string | undefined, platform: string, input: string, styles: { id: string; weight: number }[] | undefined, rating: 1 | -1) => {
        const entry = current?.entries.find((e) => e.id === entryId);
        const currentRating = entry?.rating ?? null;

        if (currentRating === rating) {
            // 取消评价
            updateEntry(entryId, { rating: null });
            revokeFeedback(prompt, platform);
            message.info("已取消评价");
        } else {
            // 设置/切换评价
            updateEntry(entryId, { rating });
            submitFeedback({ prompt, negativePrompt, platform, inputText: input, styles, rating });
            message.success(rating === 1 ? "已点赞，将作为正面参考" : "已标记，将参考调整方向");
        }
    };

    return (
        <section>
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-stone-600 dark:text-stone-300">
                    生成结果 <span className="text-stone-400">（{filteredEntries.length}/{current.entries.length} 条）</span>
                </h3>
                <div className="flex flex-wrap items-center gap-1">
                    <Button size="small" icon={batchOptimizing ? <LoaderCircle className="size-3 animate-spin" /> : <Wand2 className="size-3" />} disabled={batchOptimizing || batchScoring} onClick={handleBatchOptimize}>
                        {batchOptimizing ? `优化中 ${batchProgress.done}/${batchProgress.total}` : "批量优化"}
                    </Button>
                    <Button size="small" icon={batchScoring ? <LoaderCircle className="size-3 animate-spin" /> : <Star className="size-3" />} disabled={batchOptimizing || batchScoring} onClick={handleBatchScore}>
                        {batchScoring ? `评分中 ${batchProgress.done}/${batchProgress.total}` : "批量评分"}
                    </Button>
                    {(failedOptimizeIds.length > 0 || failedScoreIds.length > 0) && (
                        <Button size="small" danger icon={<RotateCcw className="size-3" />} disabled={batchOptimizing || batchScoring} onClick={handleRetryFailed}>
                            重试失败（{failedOptimizeIds.length + failedScoreIds.length}）
                        </Button>
                    )}
                </div>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
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
                                    <Tooltip title="点赞：加入正面提示词库">
                                        <Button type="text" size="small" icon={<ThumbsUp className={cn("size-3.5", entry.rating === 1 && "fill-green-500 text-green-500")} />} onClick={() => handleFeedback(entry.id, entry.prompt, entry.negativePrompt, entry.platform, entry.input, entry.styles, 1)} />
                                    </Tooltip>
                                    <Tooltip title="劣质：加入负面规避库">
                                        <Button type="text" size="small" icon={<ThumbsDown className={cn("size-3.5", entry.rating === -1 && "fill-red-500 text-red-500")} />} onClick={() => handleFeedback(entry.id, entry.prompt, entry.negativePrompt, entry.platform, entry.input, entry.styles, -1)} />
                                    </Tooltip>
                                    <Button type="text" size="small" icon={regeneratingId === entry.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} disabled={regeneratingId === entry.id} onClick={() => handleRegenerate(entry.id, entry.input, entry.platform, entry.styles, entry.customStyle)} title="重新生成" />
                                    <Tooltip title="AI 优化提示词">
                                        <Button type="text" size="small" icon={optimizingId === entry.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} disabled={optimizingId === entry.id} onClick={() => handleOptimize(entry.id, entry.prompt, entry.platform)} />
                                    </Tooltip>
                                    <Tooltip title="质量评分">
                                        <Button type="text" size="small" icon={scoringId === entry.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Star className="size-3.5" />} disabled={scoringId === entry.id} onClick={() => handleScore(entry.id, entry.prompt, entry.platform)} />
                                    </Tooltip>
                                    <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(entry.prompt, "提示词已复制")} />
                                    {(versionHistory[entry.id]?.length ?? 0) > 0 && (
                                        <Popover
                                            title="历史版本"
                                            trigger="click"
                                            content={
                                                <div className="max-h-60 w-72 space-y-2 overflow-y-auto">
                                                    {versionHistory[entry.id].map((v, i) => (
                                                        <div key={i} className="rounded border border-stone-200 p-2 dark:border-stone-700">
                                                            <div className="mb-1 flex items-center justify-between">
                                                                <span className="text-[10px] text-stone-400">{new Date(v.time).toLocaleTimeString()}</span>
                                                                <Button type="link" size="small" className="h-auto p-0 text-xs" onClick={() => { updateEntry(entry.id, { prompt: v.prompt, negativePrompt: v.negativePrompt }); message.success("已恢复历史版本"); }}>恢复</Button>
                                                            </div>
                                                            <p className="line-clamp-2 text-xs text-stone-500">{v.prompt}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            }
                                        >
                                            <Button type="text" size="small" icon={<History className="size-3.5" />} />
                                        </Popover>
                                    )}
                                    <Popconfirm title="删除此条目？" onConfirm={() => handleRemoveEntry(entry.id)} okText="删除" cancelText="取消">
                                        <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} />
                                    </Popconfirm>
                                </div>
                            </div>
                            <Input.TextArea
                                value={streamingText[entry.id] !== undefined ? streamingText[entry.id] : entry.prompt}
                                onChange={(e) => updateEntry(entry.id, { prompt: e.target.value })}
                                autoSize={{ minRows: 2, maxRows: 12 }}
                                className={cn("font-mono text-xs leading-relaxed", streamingText[entry.id] !== undefined && "text-blue-600 dark:text-blue-400")}
                                readOnly={streamingText[entry.id] !== undefined}
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
                            {entry.characterMapping && (
                                <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 dark:border-blue-900 dark:bg-blue-950/40">
                                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">🎭 角色映射（方便识别角色去 @资产）</span>
                                    <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-stone-600 dark:text-stone-300">{entry.characterMapping}</p>
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
