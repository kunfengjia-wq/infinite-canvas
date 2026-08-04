import { AudioLines, Download, LoaderCircle, Plus, Volume2, WifiOff, Settings2, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { App, Button, Empty, Select, Tooltip, Dropdown } from "antd";
import type { MenuProps } from "antd";

import { useVoiceStore } from "./store/use-voice-store";
import { useShallow } from "zustand/react/shallow";
import { useConfigStore } from "@/stores/use-config-store";
import { VoiceProjectSidebar } from "./components/voice-project-sidebar";
import { CharacterPanel } from "./components/character-panel";
import { ScriptEditor } from "./components/script-editor";
import { VoiceConfigPanel } from "./components/voice-config-panel";
import { TimelinePlayer } from "./components/timeline-player";
import { EmotionBatchPanel } from "./components/emotion-selector";
import { VoiceClonePanel } from "./components/voice-clone-panel";
import { EffectsPanel } from "./components/effects-panel";
import { AudioTrimmer } from "./components/audio-trimmer";
import type { TTSEngineId } from "./types";
import { cn } from "@/lib/utils";

export default function VoicePage() {
    const { message } = App.useApp();
    const { current, models, ttsOnline, loadProjects, loadModels, generateAll, startPolling, stopPolling } = useVoiceStore(
        useShallow((s) => ({ current: s.current, models: s.models, ttsOnline: s.ttsOnline, loadProjects: s.loadProjects, loadModels: s.loadModels, generateAll: s.generateAll, startPolling: s.startPolling, stopPolling: s.stopPolling })),
    );
    const ttsBaseUrl = useConfigStore((s) => s.config.ttsBaseUrl);
    const [generatingAll, setGeneratingAll] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [trimLineId, setTrimLineId] = useState<string | null>(null);
    const [rightPanelTab, setRightPanelTab] = useState<"voice" | "emotion" | "effects">("voice");

    useEffect(() => {
        void loadProjects();
        void loadModels();
        startPolling();
        return () => stopPolling();
    }, [loadProjects, loadModels, startPolling, stopPolling]);

    const handleGenerateAll = async () => {
        if (!ttsOnline) return;
        setGeneratingAll(true);
        try {
            await generateAll();
        } catch { /* store 内部已处理 */ }
        setGeneratingAll(false);
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            await useVoiceStore.getState().exportAll("wav", 500);
            message.success("导出成功");
        } catch (e) {
            message.error(e instanceof Error ? e.message : "导出失败");
        } finally {
            setExporting(false);
        }
    };

    const doneCount = current?.lines.filter((l) => l.status === "done").length ?? 0;
    const totalCount = current?.lines.length ?? 0;
    const trimLine = current?.lines.find((l) => l.id === trimLineId && l.audioUrl);

    const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    const engineMenuItems: MenuProps["items"] = models.map((m) => ({
        key: m.id,
        label: m.display_name,
        disabled: !m.available,
        title: m.install_hint ?? undefined,
    }));

    return (
        <div className="flex h-full overflow-hidden bg-[#0f0f14] text-stone-200">
            <VoiceProjectSidebar />

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* ── Header ── */}
                <header className="flex items-center gap-3 border-b border-white/[0.06] bg-[#16161d] px-5 py-2.5">
                    <div className="flex items-center gap-2.5">
                        <div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/15">
                            <AudioLines className="size-4 text-violet-400" />
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-sm font-semibold leading-tight text-stone-100">语音工作台</h1>
                            {current && <span className="text-[11px] leading-tight text-stone-500">{current.title}</span>}
                        </div>
                    </div>

                    <div className="mx-3 h-5 w-px bg-white/[0.06]" />

                    {/* TTS Status */}
                    <div className={cn(
                        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                        ttsOnline
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400",
                    )}>
                        <span className={cn(
                            "size-1.5 rounded-full",
                            ttsOnline ? "bg-emerald-400" : "bg-red-400 animate-pulse",
                        )} />
                        {ttsOnline ? "TTS 已连接" : "TTS 离线"}
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                        {current && (
                            <Dropdown
                                menu={{
                                    items: engineMenuItems,
                                    selectedKeys: [current.engine],
                                    onClick: ({ key }) => {
                                        const engineId = key as TTSEngineId;
                                        const targetModel = models.find((m) => m.id === engineId);
                                        const validVoiceIds = new Set(targetModel?.voices.map((vv) => vv.id) ?? []);
                                        const updatedCharacters = current.characters.map((c) => {
                                            if (c.isCloned) return c;
                                            if (validVoiceIds.size > 0 && !validVoiceIds.has(c.voice)) {
                                                return { ...c, voice: targetModel!.voices[0].id };
                                            }
                                            return c;
                                        });
                                        const updated = { ...current, engine: engineId, characters: updatedCharacters };
                                        useVoiceStore.setState({ current: updated });
                                        void useVoiceStore.getState().saveCurrent();
                                    },
                                }}
                                trigger={["click"]}
                            >
                                <button className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-stone-300 transition-colors hover:border-white/[0.12] hover:bg-white/[0.06]">
                                    <Settings2 className="size-3 text-stone-500" />
                                    {models.find((m) => m.id === current.engine)?.display_name ?? "选择引擎"}
                                    <ChevronDown className="size-3 text-stone-500" />
                                </button>
                            </Dropdown>
                        )}

                        {current && totalCount > 0 && (
                            <Tooltip title={`生成全部台词的语音 (${doneCount}/${totalCount})`}>
                                <Button
                                    size="small"
                                    className="!border-none !bg-violet-500/90 !text-white hover:!bg-violet-500"
                                    icon={generatingAll ? <LoaderCircle className="size-3.5 animate-spin" /> : <Volume2 className="size-3.5" />}
                                    onClick={handleGenerateAll}
                                    disabled={generatingAll}
                                >
                                    <span className="flex items-center gap-2">
                                        {generatingAll ? "生成中" : "全部生成"}
                                        <span className="flex items-center gap-1">
                                            <span className="h-1 w-12 overflow-hidden rounded-full bg-white/20">
                                                <span
                                                    className="block h-full rounded-full bg-white transition-all duration-300"
                                                    style={{ width: `${progressPercent}%` }}
                                                />
                                            </span>
                                            <span className="text-[10px] tabular-nums opacity-80">{doneCount}/{totalCount}</span>
                                        </span>
                                    </span>
                                </Button>
                            </Tooltip>
                        )}

                        {current && doneCount > 0 && (
                            <Button
                                size="small"
                                className="!border-white/[0.08] !bg-white/[0.04] !text-stone-300 hover:!bg-white/[0.08]"
                                icon={exporting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                                onClick={handleExport}
                                disabled={exporting}
                            >
                                导出
                            </Button>
                        )}
                    </div>
                </header>

                {/* ── Content ── */}
                {!current ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4">
                        <div className="flex size-16 items-center justify-center rounded-2xl bg-violet-500/10">
                            <AudioLines className="size-8 text-violet-400/60" />
                        </div>
                        <Empty
                            description={<span className="text-stone-500">选择或新建一个配音项目</span>}
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                        />
                        <Button
                            type="primary"
                            className="!bg-violet-500 hover:!bg-violet-400"
                            icon={<Plus className="size-4" />}
                            onClick={() => void useVoiceStore.getState().createProject("新配音项目")}
                        >
                            新建项目
                        </Button>
                    </div>
                ) : !ttsOnline ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
                        <div className="flex size-16 items-center justify-center rounded-2xl bg-red-500/10">
                            <WifiOff className="size-8 text-red-400/60" />
                        </div>
                        <h2 className="text-base font-medium text-stone-300">TTS 服务未连接</h2>
                        <p className="max-w-sm text-center text-sm text-stone-500">
                            语音合成、音色克隆、音频效果等功能需要本地 TTS 服务支持。
                        </p>
                        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-3.5 font-mono text-xs text-stone-400">
                            <p>cd infinite-canvas/tts-server</p>
                            <p>pip install -r requirements.txt</p>
                            <p>python main.py</p>
                        </div>
                        <p className="text-xs text-stone-500">
                            服务地址：<span className="font-mono text-stone-400">{ttsBaseUrl || "http://localhost:8880"}</span>
                            <span className="text-stone-600">（可在设置 → 音频 中修改）</span>
                        </p>
                        <Button
                            size="small"
                            className="!border-white/[0.08] !bg-white/[0.04] !text-stone-300"
                            onClick={() => void loadModels()}
                        >
                            重新检测
                        </Button>
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1">
                        {/* ── Left: Character Panel ── */}
                        <CharacterPanel />

                        {/* ── Center: Script Editor ── */}
                        <ScriptEditor />

                        {/* ── Right: Config Panel ── */}
                        <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-white/[0.06] bg-[#13131a]">
                            {/* Tab bar */}
                            <div className="flex border-b border-white/[0.06]">
                                {([
                                    { key: "voice" as const, label: "音色" },
                                    { key: "emotion" as const, label: "情绪" },
                                    { key: "effects" as const, label: "效果" },
                                ]).map((tab) => (
                                    <button
                                        key={tab.key}
                                        className={cn(
                                            "flex-1 py-2.5 text-xs font-medium transition-colors",
                                            rightPanelTab === tab.key
                                                ? "border-b-2 border-violet-400 text-violet-300"
                                                : "text-stone-500 hover:text-stone-300",
                                        )}
                                        onClick={() => setRightPanelTab(tab.key)}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Tab content */}
                            <div className="flex-1 overflow-y-auto">
                                {rightPanelTab === "voice" && (
                                    <div className="space-y-0">
                                        <VoiceConfigPanel models={models} />
                                        <div className="mx-3 border-t border-white/[0.06]" />
                                        <VoiceClonePanel />
                                    </div>
                                )}
                                {rightPanelTab === "emotion" && <EmotionBatchPanel />}
                                {rightPanelTab === "effects" && <EffectsPanel />}
                            </div>
                        </aside>
                    </div>
                )}

                {/* ── Bottom: Timeline ── */}
                {current && current.lines.length > 0 && (
                    <div className="shrink-0">
                        {trimLine && trimLine.audioUrl && (
                            <div className="border-t border-white/[0.06] bg-[#13131a]">
                                <div className="flex items-center justify-between px-4 pt-2">
                                    <span className="text-[11px] font-medium text-stone-400">音频裁剪</span>
                                    <Button
                                        type="text"
                                        size="small"
                                        className="!text-stone-500 hover:!text-stone-300"
                                        onClick={() => setTrimLineId(null)}
                                    >
                                        收起
                                    </Button>
                                </div>
                                <AudioTrimmer lineId={trimLine.id} audioUrl={trimLine.audioUrl} duration={trimLine.duration ?? 0} />
                            </div>
                        )}
                        <TimelinePlayer onEditLine={setTrimLineId} />
                    </div>
                )}
            </main>
        </div>
    );
}
