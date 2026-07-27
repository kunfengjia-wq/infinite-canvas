import { Check, LoaderCircle, PenLine, RefreshCw } from "lucide-react";
import { useState } from "react";
import { App, Button, Input } from "antd";

import { useScriptCreationStore } from "@/stores/use-script-creation-store";
import { aiGenerateSegment, aiRewriteSegment, aiSummarizeContext } from "@/services/script-creation-ai";
import type { AiConfig } from "@/stores/use-config-store";
import { cn } from "@/lib/utils";

export function DraftWriter({ config }: { config: AiConfig }) {
    const { message } = App.useApp();
    const { current, processing, setProcessing, updateSegment, setContextSummary, completeProject, saveCurrent } = useScriptCreationStore();
    const [generatingId, setGeneratingId] = useState<string | null>(null);
    const [rewriteInstruction, setRewriteInstruction] = useState("");
    const [rewritingId, setRewritingId] = useState<string | null>(null);

    if (!current || !current.finalSetting || !current.finalStructure) return null;

    const segments = current.segments;
    const confirmedCount = segments.filter((s) => s.status === "confirmed").length;
    const allDone = confirmedCount === segments.length && segments.length > 0;

    /** 生成某段内容 */
    const handleGenerateSegment = async (segmentId: string) => {
        const segment = segments.find((s) => s.id === segmentId);
        if (!segment) return;
        const beat = current.finalStructure!.beats.find((b) => b.id === segment.beatId);
        if (!beat) return;

        setGeneratingId(segmentId);
        setProcessing(true);
        updateSegment(segmentId, { status: "generating" });
        try {
            // 获取前一段内容作为上下文
            const prevSegment = segments[segment.index - 1];
            const previousContent = prevSegment?.content ?? "";
            const content = await aiGenerateSegment(config, current.finalSetting!, current.finalStructure!, beat, previousContent, current.contextSummary);
            updateSegment(segmentId, { content, status: "draft" });
            message.success(`「${segment.title}」已生成`);
        } catch (error) {
            updateSegment(segmentId, { status: "pending" });
            message.error(error instanceof Error ? error.message : "生成失败");
        } finally {
            setGeneratingId(null);
            setProcessing(false);
            void saveCurrent();
        }
    };

    /** 重写段落 */
    const handleRewrite = async (segmentId: string) => {
        const segment = segments.find((s) => s.id === segmentId);
        if (!segment || !rewriteInstruction.trim()) return;
        const beat = current.finalStructure!.beats.find((b) => b.id === segment.beatId);
        if (!beat) return;

        setRewritingId(segmentId);
        setProcessing(true);
        try {
            const content = await aiRewriteSegment(config, beat, segment.content, rewriteInstruction.trim());
            updateSegment(segmentId, { content, status: "draft", rewriteCount: segment.rewriteCount + 1 });
            setRewriteInstruction("");
            message.success("已重写");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "重写失败");
        } finally {
            setRewritingId(null);
            setProcessing(false);
            void saveCurrent();
        }
    };

    /** 确认段落 */
    const handleConfirmSegment = (segmentId: string) => {
        updateSegment(segmentId, { status: "confirmed" });
        void saveCurrent();
    };

    /** 生成所有段落（一键） */
    const handleGenerateAll = async () => {
        for (const segment of segments) {
            if (segment.status === "confirmed" || segment.status === "draft") continue;
            await handleGenerateSegment(segment.id);
        }
        // 长篇自动生成摘要
        const allContent = useScriptCreationStore.getState().current?.segments.map((s) => s.content).join("\n\n") ?? "";
        if (allContent.length > 3000) {
            try {
                const summary = await aiSummarizeContext(config, allContent);
                setContextSummary(summary);
            } catch { /* 静默 */ }
        }
    };

    /** 完稿 */
    const handleFinish = () => {
        const fullScript = segments.map((s) => `## ${s.title}\n\n${s.content}`).join("\n\n---\n\n");
        useScriptCreationStore.getState().setFullScript(fullScript);
        completeProject();
        message.success("剧本已完成，进入完稿输出！");
    };

    return (
        <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-medium">
                        <PenLine className="size-5 text-stone-400" />
                        逐段创作
                    </h2>
                    <p className="mt-1 text-sm text-stone-500">按结构逐段生成，每段确认后再继续（{confirmedCount}/{segments.length} 已确认）</p>
                </div>
                <Button icon={<RefreshCw className="size-4" />} onClick={handleGenerateAll} disabled={processing}>
                    一键生成全部
                </Button>
            </div>

            {/* 段落列表 */}
            <div className="space-y-4">
                {segments.map((segment) => {
                    const isGenerating = generatingId === segment.id;
                    const isRewriting = rewritingId === segment.id;
                    return (
                        <div
                            key={segment.id}
                            className={cn(
                                "rounded-xl border transition-all",
                                segment.status === "confirmed" && "border-emerald-200 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20",
                                segment.status === "draft" && "border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20",
                                segment.status === "pending" && "border-stone-200 dark:border-stone-700",
                                segment.status === "generating" && "border-blue-300 dark:border-blue-700",
                            )}
                        >
                            {/* 段落头部 */}
                            <div className="flex items-center gap-3 px-4 py-3">
                                <span
                                    className={cn(
                                        "flex size-6 items-center justify-center rounded-full text-xs font-medium",
                                        segment.status === "confirmed" && "bg-emerald-500 text-white",
                                        segment.status === "draft" && "bg-blue-500 text-white",
                                        segment.status === "generating" && "bg-blue-400 text-white",
                                        segment.status === "pending" && "bg-stone-200 text-stone-500 dark:bg-stone-700",
                                    )}
                                >
                                    {segment.status === "confirmed" ? <Check className="size-3.5" /> : segment.index + 1}
                                </span>
                                <span className="text-sm font-medium">{segment.title}</span>
                                {segment.rewriteCount > 0 && <span className="text-xs text-stone-400">已重写 {segment.rewriteCount} 次</span>}
                                <div className="ml-auto flex gap-2">
                                    {segment.status === "pending" && (
                                        <Button size="small" type="primary" icon={isGenerating ? <LoaderCircle className="size-3 animate-spin" /> : <PenLine className="size-3" />} onClick={() => void handleGenerateSegment(segment.id)} disabled={processing}>
                                            生成
                                        </Button>
                                    )}
                                    {segment.status === "draft" && (
                                        <>
                                            <Button size="small" onClick={() => void handleGenerateSegment(segment.id)} disabled={processing}>
                                                重新生成
                                            </Button>
                                            <Button size="small" type="primary" icon={<Check className="size-3" />} onClick={() => handleConfirmSegment(segment.id)}>
                                                确认
                                            </Button>
                                        </>
                                    )}
                                    {segment.status === "confirmed" && (
                                        <Button size="small" onClick={() => updateSegment(segment.id, { status: "draft" })}>
                                            重新编辑
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* 内容区 */}
                            {segment.content && (
                                <div className="border-t border-stone-100 px-4 py-3 dark:border-stone-800">
                                    <div className="max-h-60 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-stone-700 dark:text-stone-300">
                                        {segment.content}
                                    </div>

                                    {/* 重写指令 */}
                                    {segment.status === "draft" && (
                                        <div className="mt-3 flex gap-2">
                                            <Input
                                                size="small"
                                                placeholder="输入修改意见（如：对白更犀利、节奏加快、增加环境描写...）"
                                                value={rewritingId === segment.id ? rewriteInstruction : rewriteInstruction}
                                                onChange={(e) => setRewriteInstruction(e.target.value)}
                                                onPressEnter={() => void handleRewrite(segment.id)}
                                            />
                                            <Button size="small" icon={isRewriting ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} onClick={() => void handleRewrite(segment.id)} disabled={!rewriteInstruction.trim() || processing}>
                                                重写
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 生成中占位 */}
                            {segment.status === "generating" && (
                                <div className="flex items-center gap-2 border-t border-stone-100 px-4 py-4 dark:border-stone-800">
                                    <LoaderCircle className="size-4 animate-spin text-blue-500" />
                                    <span className="text-sm text-stone-500">AI 正在创作...</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 完稿按钮 */}
            {allDone && (
                <div className="sticky bottom-4 mt-6 flex justify-center rounded-xl border border-emerald-200 bg-emerald-50/90 px-5 py-3 shadow-lg backdrop-blur dark:border-emerald-800 dark:bg-emerald-950/90">
                    <Button type="primary" size="large" onClick={handleFinish}>
                        全部完成，进入完稿输出 →
                    </Button>
                </div>
            )}
        </div>
    );
}
