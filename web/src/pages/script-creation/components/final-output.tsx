import { ArrowRight, AudioLines, CheckCircle2, ClipboardCopy, FileText, LoaderCircle, ShieldCheck, Wrench } from "lucide-react";
import { useState } from "react";
import { App, Button, Checkbox, Divider } from "antd";
import { useNavigate } from "react-router-dom";

import { useScriptCreationStore } from "@/stores/use-script-creation-store";
import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { useVoiceStore } from "@/pages/voice/store/use-voice-store";
import { aiConsistencyCheck, aiFixConsistencyIssues } from "@/services/script-creation-ai";
import type { AiConfig } from "@/stores/use-config-store";

export function FinalOutput({ config }: { config: AiConfig }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { current, setConsistencyReport, setFullScript, saveCurrent } = useScriptCreationStore();
    const [checking, setChecking] = useState(false);
    const [fixing, setFixing] = useState(false);
    const [transferring, setTransferring] = useState(false);
    const [toVoice, setToVoice] = useState(false);
    const [selectedSegments, setSelectedSegments] = useState<Set<string>>(new Set());
    const [showChapterSelect, setShowChapterSelect] = useState(false);

    if (!current) return null;

    const segments = current.segments ?? [];
    const hasIssues = current.consistencyReport?.includes("⚠️");

    /** 一致性检查 */
    const handleCheck = async () => {
        if (!current.finalSetting) return;
        setChecking(true);
        try {
            const report = await aiConsistencyCheck(config, current.finalSetting, current.fullScript);
            setConsistencyReport(report);
            message.success("一致性检查完成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "检查失败");
        } finally {
            setChecking(false);
            void saveCurrent();
        }
    };

    /** AI 一键修复 */
    const handleFix = async () => {
        if (!current.finalSetting || !current.consistencyReport) return;
        setFixing(true);
        try {
            const fixed = await aiFixConsistencyIssues(config, current.finalSetting, current.fullScript, current.consistencyReport);
            setFullScript(fixed);
            setConsistencyReport("");
            message.success("剧本已修复！建议重新运行一致性检查确认");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "修复失败");
        } finally {
            setFixing(false);
            void saveCurrent();
        }
    };

    /** 复制到剪贴板 */
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(current.fullScript);
            message.success("已复制到剪贴板");
        } catch {
            message.error("复制失败");
        }
    };

    /** 切换章节选择 */
    const toggleSegment = (id: string) => {
        setSelectedSegments((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedSegments.size === segments.length) {
            setSelectedSegments(new Set());
        } else {
            setSelectedSegments(new Set(segments.map((s) => s.id)));
        }
    };

    /** 发送选中章节到分镜工作台 */
    const handleTransfer = async () => {
        setTransferring(true);
        try {
            let scriptToSend: string;
            if (selectedSegments.size > 0 && selectedSegments.size < segments.length) {
                // 只发送选中章节
                const selected = segments.filter((s) => selectedSegments.has(s.id));
                scriptToSend = selected.map((s) => `【${s.title}】\n${s.content}`).join("\n\n");
            } else {
                scriptToSend = current.fullScript;
            }
            const title = selectedSegments.size > 0 && selectedSegments.size < segments.length
                ? `${current.title}（${selectedSegments.size}章）`
                : current.title;
            await useStoryboardStore.getState().createProject(title, scriptToSend);
            message.success(`已发送${selectedSegments.size > 0 && selectedSegments.size < segments.length ? ` ${selectedSegments.size} 个章节` : "全文"}到分镜工作台！`);
            navigate("/storyboard");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "发送失败");
        } finally {
            setTransferring(false);
        }
    };

    /** 配音朗读：导入剧本到语音工作台 */
    const handleToVoice = async () => {
        setToVoice(true);
        try {
            const voiceStore = useVoiceStore.getState();
            await voiceStore.createProject(`${current.title} - 配音`, "kokoro-82m");
            voiceStore.parseScript(current.fullScript);
            message.success("已导入到语音工作台");
            navigate("/voice");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "导入失败");
        } finally {
            setToVoice(false);
        }
    };

    const wordCount = current.fullScript.length;

    return (
        <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-medium">
                        <FileText className="size-5 text-stone-400" />
                        完稿输出
                    </h2>
                    <p className="mt-1 text-sm text-stone-500">
                        剧本已完成，共 {wordCount} 字 · {segments.length} 个章节
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button icon={<AudioLines className="size-4" />} onClick={handleToVoice} disabled={toVoice}>
                        {toVoice ? "导入中…" : "配音朗读"}
                    </Button>
                    <Button icon={<ClipboardCopy className="size-4" />} onClick={handleCopy}>
                        复制全文
                    </Button>
                    <Button icon={checking ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} onClick={handleCheck} disabled={checking}>
                        一致性检查
                    </Button>
                </div>
            </div>

            {/* 一致性检查报告 + 修复 */}
            {current.consistencyReport && (
                <div className="mb-6 rounded-xl border border-stone-200 bg-stone-50/50 p-4 dark:border-stone-700 dark:bg-stone-900/30">
                    <div className="mb-2 flex items-center justify-between">
                        <p className="flex items-center gap-2 text-sm font-medium">
                            <CheckCircle2 className={`size-4 ${hasIssues ? "text-amber-500" : "text-emerald-500"}`} />
                            一致性检查报告
                            {hasIssues && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">发现问题</span>}
                        </p>
                        {hasIssues && (
                            <Button
                                type="primary"
                                size="small"
                                danger
                                icon={fixing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Wrench className="size-3.5" />}
                                onClick={handleFix}
                                disabled={fixing}
                            >
                                {fixing ? "修复中…" : "AI 一键修复"}
                            </Button>
                        )}
                    </div>
                    <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-stone-600 dark:text-stone-300">
                        {current.consistencyReport}
                    </div>
                </div>
            )}

            {/* 分章节发送到分镜工作台 */}
            <div className="mb-6 rounded-xl border border-stone-200 p-4 dark:border-stone-700">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-stone-700 dark:text-stone-200">发送到分镜工作台</p>
                    <div className="flex gap-2">
                        <Button size="small" onClick={() => setShowChapterSelect(!showChapterSelect)}>
                            {showChapterSelect ? "收起选择" : "按章节选择"}
                        </Button>
                        <Button
                            type="primary"
                            size="small"
                            icon={transferring ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
                            onClick={handleTransfer}
                            disabled={transferring || (showChapterSelect && selectedSegments.size === 0)}
                        >
                            {transferring ? "发送中…" : selectedSegments.size > 0 && selectedSegments.size < segments.length ? `发送 ${selectedSegments.size} 章` : "发送全文"}
                        </Button>
                    </div>
                </div>

                {showChapterSelect && segments.length > 0 && (
                    <>
                        <Divider className="!my-3" />
                        <div className="mb-2 flex items-center gap-2">
                            <Checkbox checked={selectedSegments.size === segments.length} indeterminate={selectedSegments.size > 0 && selectedSegments.size < segments.length} onChange={toggleAll}>
                                全选
                            </Checkbox>
                            <span className="text-xs text-stone-400">已选 {selectedSegments.size}/{segments.length} 章</span>
                        </div>
                        <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto">
                            {segments.map((seg) => (
                                <label
                                    key={seg.id}
                                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${selectedSegments.has(seg.id) ? "border-blue-300 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30" : "border-stone-200 hover:border-stone-300 dark:border-stone-700"}`}
                                >
                                    <Checkbox checked={selectedSegments.has(seg.id)} onChange={() => toggleSegment(seg.id)} />
                                    <span className="truncate">{seg.title || `第 ${seg.index + 1} 章`}</span>
                                    <span className="ml-auto shrink-0 text-[10px] text-stone-400">{seg.content.length} 字</span>
                                </label>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* 完整剧本 */}
            <div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-800/40">
                <div className="whitespace-pre-wrap text-sm leading-8 text-stone-700 dark:text-stone-300">
                    {current.fullScript}
                </div>
            </div>
        </div>
    );
}
