import { GitBranch, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { App, Button, Tag } from "antd";

import { useScriptCreationStore } from "@/stores/use-script-creation-store";
import { aiGenerateStructures } from "@/services/script-creation-ai";
import type { StructureProposal } from "@/types/script-creation";
import type { AiConfig } from "@/stores/use-config-store";
import { cn } from "@/lib/utils";

const STRUCTURE_COLORS: Record<string, string> = {
    "三幕式": "blue",
    "五段式": "orange",
    "Save the Cat 节拍": "purple",
    "网文卷纲式": "red",
    "单元剧式": "green",
};

export function StructureBuilder({ config }: { config: AiConfig }) {
    const { message } = App.useApp();
    const { current, processing, setProcessing, setStructureProposals, confirmStructure, saveCurrent } = useScriptCreationStore();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    if (!current) return null;

    const proposals = current.structureProposals;

    const handleGenerate = async () => {
        if (!current.finalSetting) {
            message.warning("请先确认设定");
            return;
        }
        setProcessing(true);
        try {
            const result = await aiGenerateStructures(config, current.finalSetting);
            setStructureProposals(result);
            message.success(`已生成 ${result.length} 种结构方案`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "生成失败");
        } finally {
            setProcessing(false);
            void saveCurrent();
        }
    };

    const handleConfirm = () => {
        const proposal = proposals.find((p) => p.id === selectedId);
        if (!proposal) {
            message.warning("请选择一种结构");
            return;
        }
        confirmStructure(proposal);
        message.success("结构已确认，开始逐段创作！");
    };

    return (
        <div className="mx-auto max-w-5xl">
            <div className="mb-6">
                <h2 className="flex items-center gap-2 text-lg font-medium">
                    <GitBranch className="size-5 text-stone-400" />
                    结构搭建
                </h2>
                <p className="mt-1 text-sm text-stone-500">AI 基于设定生成故事结构框架，选择你的叙事骨架</p>
            </div>

            {proposals.length === 0 && !processing && (
                <div className="flex flex-col items-center gap-4 py-12">
                    <Sparkles className="size-10 text-stone-300 dark:text-stone-600" />
                    <Button type="primary" size="large" icon={<Sparkles className="size-4" />} onClick={handleGenerate}>
                        生成结构方案
                    </Button>
                </div>
            )}

            {processing && (
                <div className="flex flex-col items-center gap-3 py-12">
                    <LoaderCircle className="size-10 animate-spin text-blue-500" />
                    <p className="text-sm text-stone-500">AI 正在设计故事结构...</p>
                </div>
            )}

            {proposals.length > 0 && !processing && (
                <>
                    <div className="space-y-4">
                        {proposals.map((p) => (
                            <StructureCard key={p.id} proposal={p} selected={selectedId === p.id} onSelect={() => setSelectedId(p.id)} />
                        ))}
                    </div>

                    <div className="sticky bottom-4 mt-6 flex items-center justify-between rounded-xl border border-stone-200 bg-white/90 px-5 py-3 shadow-lg backdrop-blur dark:border-stone-700 dark:bg-stone-900/90">
                        <Button icon={<Sparkles className="size-4" />} onClick={handleGenerate}>
                            重新生成
                        </Button>
                        <Button type="primary" onClick={handleConfirm} disabled={!selectedId}>
                            确认结构，开始写作 →
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}

function StructureCard({ proposal, selected, onSelect }: { proposal: StructureProposal; selected: boolean; onSelect: () => void }) {
    const maxIntensity = Math.max(...proposal.beats.map((b) => b.intensity), 1);
    return (
        <div
            onClick={onSelect}
            className={cn(
                "cursor-pointer rounded-xl border p-5 transition-all",
                selected ? "border-blue-400 bg-blue-50/50 shadow-md ring-1 ring-blue-300 dark:border-blue-600 dark:bg-blue-950/30 dark:ring-blue-700" : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm dark:border-stone-700 dark:bg-stone-800/60",
            )}
        >
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{proposal.title}</h3>
                    <Tag color={STRUCTURE_COLORS[proposal.structureType] ?? "default"} className="m-0">{proposal.structureType}</Tag>
                </div>
                <span className={cn("mt-1 size-4 rounded-full border-2", selected ? "border-blue-500 bg-blue-500" : "border-stone-300 dark:border-stone-600")} />
            </div>
            <p className="mt-1 text-sm text-stone-500">{proposal.overview}</p>

            {/* 情绪曲线 */}
            <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-stone-400">情绪曲线</p>
                <div className="flex h-16 items-end gap-1">
                    {proposal.beats.map((beat) => (
                        <div key={beat.id} className="group relative flex-1">
                            <div
                                className={cn("w-full rounded-t transition-colors", selected ? "bg-blue-400" : "bg-stone-300 dark:bg-stone-600")}
                                style={{ height: `${(beat.intensity / maxIntensity) * 56 + 8}px` }}
                            />
                            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-40 -translate-x-1/2 rounded-lg bg-stone-900 p-2 text-xs text-white shadow-lg group-hover:block dark:bg-stone-700">
                                <p className="font-medium">{beat.label}</p>
                                <p className="mt-0.5 text-stone-300">{beat.summary}</p>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-1 flex gap-1">
                    {proposal.beats.map((beat) => (
                        <span key={beat.id} className="flex-1 truncate text-center text-[10px] text-stone-400">
                            {beat.index + 1}
                        </span>
                    ))}
                </div>
            </div>

            {/* 节拍列表 */}
            <div className="mt-3 space-y-1.5">
                {proposal.beats.map((beat) => (
                    <div key={beat.id} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[10px] text-stone-500 dark:bg-stone-700">{beat.index + 1}</span>
                        <span className="font-medium">{beat.label}</span>
                        <span className="text-stone-500">{beat.summary}</span>
                        {beat.proportion && <span className="ml-auto shrink-0 text-stone-400">{beat.proportion}</span>}
                    </div>
                ))}
            </div>

            <div className="mt-3 flex gap-4 text-xs text-stone-400">
                {proposal.estimatedLength && <span>预估篇幅：{proposal.estimatedLength}</span>}
                {proposal.emotionArc && <span>情绪走向：{proposal.emotionArc}</span>}
            </div>
        </div>
    );
}
