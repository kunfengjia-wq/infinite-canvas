import { ArrowRight, CheckCircle2, ClipboardCopy, FileText, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { App, Button } from "antd";
import { useNavigate } from "react-router-dom";

import { useScriptCreationStore } from "@/stores/use-script-creation-store";
import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { aiConsistencyCheck } from "@/services/script-creation-ai";
import type { AiConfig } from "@/stores/use-config-store";

export function FinalOutput({ config }: { config: AiConfig }) {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { current, setConsistencyReport, saveCurrent } = useScriptCreationStore();
    const [checking, setChecking] = useState(false);
    const [transferring, setTransferring] = useState(false);

    if (!current) return null;

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

    /** 复制到剪贴板 */
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(current.fullScript);
            message.success("已复制到剪贴板");
        } catch {
            message.error("复制失败");
        }
    };

    /** 发送到分镜工作台 */
    const handleTransfer = async () => {
        setTransferring(true);
        try {
            const id = await useStoryboardStore.getState().createProject(current.title, current.fullScript);
            message.success("已发送到分镜工作台！");
            navigate("/storyboard");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "发送失败");
        } finally {
            setTransferring(false);
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
                        剧本已完成，共 {wordCount} 字
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button icon={<ClipboardCopy className="size-4" />} onClick={handleCopy}>
                        复制全文
                    </Button>
                    <Button icon={checking ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} onClick={handleCheck} disabled={checking}>
                        一致性检查
                    </Button>
                    <Button type="primary" icon={transferring ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} onClick={handleTransfer} disabled={transferring}>
                        发送到分镜工作台
                    </Button>
                </div>
            </div>

            {/* 一致性检查报告 */}
            {current.consistencyReport && (
                <div className="mb-6 rounded-xl border border-stone-200 bg-stone-50/50 p-4 dark:border-stone-700 dark:bg-stone-900/30">
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                        <CheckCircle2 className="size-4 text-emerald-500" />
                        一致性检查报告
                    </p>
                    <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-stone-600 dark:text-stone-300">
                        {current.consistencyReport}
                    </div>
                </div>
            )}

            {/* 完整剧本 */}
            <div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-800/40">
                <div className="whitespace-pre-wrap text-sm leading-8 text-stone-700 dark:text-stone-300">
                    {current.fullScript}
                </div>
            </div>
        </div>
    );
}
