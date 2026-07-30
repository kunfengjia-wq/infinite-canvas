import { LoaderCircle, RefreshCw, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { App, Button, Card, Tag, Tooltip } from "antd";

import { useScriptCreationStore } from "@/stores/use-script-creation-store";
import { aiGenerateSettings, aiRegenerateCharacter } from "@/services/script-creation-ai";
import type { SettingProposal } from "@/types/script-creation";
import type { AiConfig } from "@/stores/use-config-store";
import { cn } from "@/lib/utils";

const ROLE_COLORS: Record<string, string> = {
    "主角": "blue",
    "对手": "red",
    "配角": "default",
    "导师": "purple",
    "盟友": "green",
};

export function SettingBuilder({ config }: { config: AiConfig }) {
    const { message } = App.useApp();
    const { current, processing, setProcessing, setSettingProposals, updateCharacterInProposal, confirmSetting, saveCurrent } = useScriptCreationStore();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [regenCharId, setRegenCharId] = useState<string | null>(null);

    if (!current) return null;

    const proposals = current.settingProposals;

    const handleGenerate = async () => {
        setProcessing(true);
        try {
            const selectedCards = current.cards.filter((c) => c.selected);
            const result = await aiGenerateSettings(config, current.seed, selectedCards);
            setSettingProposals(result);
            message.success(`已生成 ${result.length} 套设定方案`);
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
            message.warning("请选择一套方案");
            return;
        }
        confirmSetting(proposal);
        message.success("设定已确认，进入结构搭建！");
    };

    const handleRegenCharacter = async (proposal: SettingProposal, characterId: string) => {
        setRegenCharId(characterId);
        try {
            const newChar = await aiRegenerateCharacter(config, proposal, characterId);
            updateCharacterInProposal(proposal.id, characterId, newChar);
            message.success(`角色已重新生成：${newChar.name}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "角色重生成失败");
        } finally {
            setRegenCharId(null);
        }
    };

    return (
        <div className="mx-auto max-w-5xl">
            <div className="mb-6">
                <h2 className="flex items-center gap-2 text-lg font-medium">
                    <Users className="size-5 text-stone-400" />
                    设定构建
                </h2>
                <p className="mt-1 text-sm text-stone-500">AI 整合你选择的灵感元素，生成完整的故事设定方案</p>
            </div>

            {proposals.length === 0 && !processing && (
                <div className="flex flex-col items-center gap-4 py-12">
                    <Sparkles className="size-10 text-stone-300 dark:text-stone-600" />
                    <Button type="primary" size="large" icon={<Sparkles className="size-4" />} onClick={handleGenerate}>
                        生成设定方案
                    </Button>
                </div>
            )}

            {processing && (
                <div className="flex flex-col items-center gap-3 py-12">
                    <LoaderCircle className="size-10 animate-spin text-blue-500" />
                    <p className="text-sm text-stone-500">AI 正在构建角色、世界观与矛盾体系...</p>
                </div>
            )}

            {proposals.length > 0 && !processing && (
                <>
                    <div className="space-y-4">
                        {proposals.map((p) => (
                            <ProposalCard key={p.id} proposal={p} selected={selectedId === p.id} onSelect={() => setSelectedId(p.id)} regenCharId={regenCharId} onRegenChar={handleRegenCharacter} />
                        ))}
                    </div>

                    <div className="sticky bottom-4 mt-6 flex items-center justify-between rounded-xl border border-stone-200 bg-white/90 px-5 py-3 shadow-lg backdrop-blur dark:border-stone-700 dark:bg-stone-900/90">
                        <Button icon={<Sparkles className="size-4" />} onClick={handleGenerate}>
                            重新生成
                        </Button>
                        <Button type="primary" onClick={handleConfirm} disabled={!selectedId}>
                            确认设定，搭建结构 →
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}

function ProposalCard({ proposal, selected, onSelect, regenCharId, onRegenChar }: { proposal: SettingProposal; selected: boolean; onSelect: () => void; regenCharId: string | null; onRegenChar: (p: SettingProposal, charId: string) => void }) {
    return (
        <div
            onClick={onSelect}
            className={cn(
                "cursor-pointer rounded-xl border p-5 transition-all",
                selected ? "border-blue-400 bg-blue-50/50 shadow-md ring-1 ring-blue-300 dark:border-blue-600 dark:bg-blue-950/30 dark:ring-blue-700" : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm dark:border-stone-700 dark:bg-stone-800/60",
            )}
        >
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-semibold">{proposal.title}</h3>
                    <p className="mt-1 text-sm text-stone-500">{proposal.summary}</p>
                </div>
                <span className={cn("mt-1 size-4 rounded-full border-2", selected ? "border-blue-500 bg-blue-500" : "border-stone-300 dark:border-stone-600")} />
            </div>

            {/* 角色 */}
            <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-stone-400">角色</p>
                <div className="grid gap-2 sm:grid-cols-2">
                    {proposal.characters.map((c) => (
                        <div key={c.id} className="rounded-lg bg-stone-50 p-3 dark:bg-stone-900/50">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{c.name}</span>
                                <Tag color={ROLE_COLORS[c.role] ?? "default"} className="m-0 text-[10px]">{c.role}</Tag>
                                <Tooltip title="重新生成此角色">
                                    <Button
                                        type="text"
                                        size="small"
                                        className="ml-auto h-5 w-5 p-0"
                                        icon={regenCharId === c.id ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                                        disabled={regenCharId !== null}
                                        onClick={(e) => { e.stopPropagation(); onRegenChar(proposal, c.id); }}
                                    />
                                </Tooltip>
                            </div>
                            <p className="mt-1 text-xs text-stone-500">{c.personality}</p>
                            <p className="mt-0.5 text-xs text-stone-400">动机：{c.motivation}</p>
                            <p className="mt-0.5 text-xs text-stone-400">弧光：{c.arc}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* 世界观 + 矛盾 */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-900/50">
                    <p className="text-xs font-medium text-stone-400">世界观</p>
                    <p className="mt-1 text-xs text-stone-600 dark:text-stone-300">{proposal.world.environment}</p>
                    <p className="mt-1 text-xs text-stone-400">规则：{proposal.world.rules}</p>
                    {proposal.world.specialElement && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">金手指：{proposal.world.specialElement}</p>}
                </div>
                <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-900/50">
                    <p className="text-xs font-medium text-stone-400">核心矛盾</p>
                    <p className="mt-1 text-xs text-stone-600 dark:text-stone-300">{proposal.conflict.mainConflict}</p>
                    <p className="mt-1 text-xs text-stone-400">主题：{proposal.conflict.theme}</p>
                </div>
            </div>
        </div>
    );
}
