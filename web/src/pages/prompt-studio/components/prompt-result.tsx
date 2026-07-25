import { Copy, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { App, Button, Card, Empty, Input, Popconfirm, Tag } from "antd";

import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { aiGeneratePrompt } from "@/services/prompt-studio-ai";
import { useCopyText } from "@/hooks/use-copy-text";
import type { AiConfig } from "@/stores/use-config-store";
import { PLATFORM_LIST, PROMPT_CATEGORIES, type PromptCategory } from "@/types/prompt-studio";
import { cn } from "@/lib/utils";

export function PromptResult({ config, onError }: { config: AiConfig; onError: (msg: string) => void }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const { current, updateEntry, removeEntry } = usePromptStudioStore();
    const [filterCategory, setFilterCategory] = useState<PromptCategory | "all">("all");
    const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

    if (!current || current.entries.length === 0) {
        return (
            <section>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="生成的提示词将显示在这里" className="py-8" />
            </section>
        );
    }

    const filteredEntries = filterCategory === "all" ? current.entries : current.entries.filter((e) => e.category === filterCategory);
    const usedCategories = Array.from(new Set(current.entries.map((e) => e.category)));

    const handleRegenerate = async (entryId: string, input: string, platform: string, style?: string) => {
        setRegeneratingId(entryId);
        try {
            const result = await aiGeneratePrompt(config, { input, platform: platform as never, style: style || undefined });
            updateEntry(entryId, { prompt: result.prompt, negativePrompt: result.negativePrompt });
            message.success("已重新生成");
        } catch (error) {
            onError(error instanceof Error ? error.message : "重新生成失败");
        } finally {
            setRegeneratingId(null);
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
                            <div className="mb-2 flex items-center gap-2">
                                {categoryMeta && <Tag color={categoryMeta.color}>{categoryMeta.label}</Tag>}
                                <Tag color={platformMeta?.category === "video" ? "purple" : "blue"}>{platformMeta?.label || entry.platform}</Tag>
                                {entry.style && <Tag>{entry.style}</Tag>}
                                <span className="min-w-0 flex-1 truncate text-xs text-stone-400">{entry.input}</span>
                                <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                                    <Button type="text" size="small" icon={regeneratingId === entry.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} disabled={regeneratingId === entry.id} onClick={() => handleRegenerate(entry.id, entry.input, entry.platform, entry.style)} title="重新生成" />
                                    <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(entry.prompt, "提示词已复制")} />
                                    <Popconfirm title="删除此条目？" onConfirm={() => removeEntry(entry.id)} okText="删除" cancelText="取消">
                                        <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} />
                                    </Popconfirm>
                                </div>
                            </div>
                            <Input.TextArea
                                value={entry.prompt}
                                onChange={(e) => updateEntry(entry.id, { prompt: e.target.value })}
                                rows={3}
                                className="font-mono text-xs"
                            />
                            {entry.negativePrompt && (
                                <div className="mt-2">
                                    <span className="text-xs text-red-400">Negative:</span>
                                    <Input.TextArea
                                        value={entry.negativePrompt}
                                        onChange={(e) => updateEntry(entry.id, { negativePrompt: e.target.value })}
                                        rows={2}
                                        className="mt-1 font-mono text-xs text-red-300"
                                    />
                                </div>
                            )}
                        </Card>
                    );
                })}
            </div>
        </section>
    );
}
