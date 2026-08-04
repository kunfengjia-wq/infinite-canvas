import { AudioLines, Download, LoaderCircle, Plus, Volume2, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { App, Button, Empty, Select, Tabs } from "antd";

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

export default function VoicePage() {
    const { message } = App.useApp();
    const { current, models, ttsOnline, loadProjects, loadModels, generateAll, startPolling, stopPolling } = useVoiceStore(
        useShallow((s) => ({ current: s.current, models: s.models, ttsOnline: s.ttsOnline, loadProjects: s.loadProjects, loadModels: s.loadModels, generateAll: s.generateAll, startPolling: s.startPolling, stopPolling: s.stopPolling })),
    );
    const ttsBaseUrl = useConfigStore((s) => s.config.ttsBaseUrl);
    const [generatingAll, setGeneratingAll] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [trimLineId, setTrimLineId] = useState<string | null>(null);

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

    return (
        <div className="flex h-full overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <VoiceProjectSidebar />

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* 顶部标题栏 */}
                <header className="flex items-center gap-3 border-b border-stone-200 px-6 py-3 dark:border-stone-800">
                    <AudioLines className="size-6 text-violet-500" />
                    <h1 className="text-lg font-semibold">语音工作台</h1>
                    {current && <span className="text-sm text-stone-400">{current.title}</span>}

                    <div className="ml-auto flex items-center gap-3">
                        <span className={`flex items-center gap-1.5 text-xs ${ttsOnline ? "text-emerald-500" : "text-red-400"}`}>
                            <span className={`size-2 rounded-full ${ttsOnline ? "bg-emerald-500" : "bg-red-400 animate-pulse"}`} />
                            {ttsOnline ? "TTS 已连接" : "TTS 离线"}
                        </span>

                        {current && (
                            <Select
                                size="small"
                                value={current.engine}
                                onChange={(v) => {
                                    const engineId = v as TTSEngineId;
                                    const targetModel = models.find((m) => m.id === engineId);
                                    const validVoiceIds = new Set(targetModel?.voices.map((vv) => vv.id) ?? []);
                                    // 校验角色音色是否在新引擎中可用，不可用则回退到引擎第一个音色
                                    const updatedCharacters = current.characters.map((c) => {
                                        if (c.isCloned) return c; // 克隆音色不受引擎限制
                                        if (validVoiceIds.size > 0 && !validVoiceIds.has(c.voice)) {
                                            return { ...c, voice: targetModel!.voices[0].id };
                                        }
                                        return c;
                                    });
                                    const updated = { ...current, engine: engineId, characters: updatedCharacters };
                                    useVoiceStore.setState({ current: updated });
                                    void useVoiceStore.getState().saveCurrent();
                                }}
                                className="w-40"
                                options={models.map((m) => ({
                                    value: m.id,
                                    label: m.available ? m.display_name : `${m.display_name} (未安装)`,
                                    disabled: !m.available,
                                    title: m.install_hint ?? undefined,
                                }))}
                                placeholder="选择引擎"
                            />
                        )}

                        {current && totalCount > 0 && (
                            <Button
                                type="primary"
                                size="small"
                                icon={generatingAll ? <LoaderCircle className="size-3.5 animate-spin" /> : <Volume2 className="size-3.5" />}
                                onClick={handleGenerateAll}
                                disabled={generatingAll}
                            >
                                {generatingAll ? `生成中 ${doneCount}/${totalCount}` : `全部生成 (${doneCount}/${totalCount})`}
                            </Button>
                        )}

                        {current && doneCount > 0 && (
                            <Button
                                size="small"
                                icon={exporting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                                onClick={handleExport}
                                disabled={exporting}
                            >
                                导出
                            </Button>
                        )}
                    </div>
                </header>

                {/* 内容区 */}
                {!current ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4">
                        <Empty description="选择或新建一个配音项目" />
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => void useVoiceStore.getState().createProject("新配音项目")}>
                            新建项目
                        </Button>
                    </div>
                ) : !ttsOnline ? (
                    /* 服务未连接引导页 */
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
                        <WifiOff className="size-12 text-stone-300" />
                        <h2 className="text-base font-medium text-stone-600 dark:text-stone-300">TTS 服务未连接</h2>
                        <p className="max-w-sm text-center text-sm text-stone-400">
                            语音合成、音色克隆、音频效果等功能需要本地 TTS 服务支持。
                        </p>
                        <div className="rounded-lg bg-stone-100 px-4 py-3 font-mono text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                            <p>cd infinite-canvas/tts-server</p>
                            <p>pip install -r requirements.txt</p>
                            <p>python main.py</p>
                        </div>
                        <p className="text-xs text-stone-400">
                            服务地址：<span className="font-mono">{ttsBaseUrl || "http://localhost:8880"}</span>
                            （可在设置 → 音频 中修改）
                        </p>
                        <Button size="small" onClick={() => void loadModels()}>重新检测</Button>
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1">
                        {/* 左栏：角色管理 */}
                        <CharacterPanel />

                        {/* 中栏：文本编辑 */}
                        <ScriptEditor />

                        {/* 右栏：Tab 切换 */}
                        <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-stone-200 dark:border-stone-800">
                            <Tabs
                                size="small"
                                className="h-full [&_.ant-tabs-content]:h-full [&_.ant-tabs-content]:overflow-y-auto [&_.ant-tabs-nav]:!mb-0 [&_.ant-tabs-nav]:px-3"
                                items={[
                                    {
                                        key: "voice",
                                        label: "音色",
                                        children: (
                                            <div className="space-y-0">
                                                <VoiceConfigPanel models={models} />
                                                <VoiceClonePanel />
                                            </div>
                                        ),
                                    },
                                    {
                                        key: "emotion",
                                        label: "情绪",
                                        children: <EmotionBatchPanel />,
                                    },
                                    {
                                        key: "effects",
                                        label: "效果",
                                        children: <EffectsPanel />,
                                    },
                                ]}
                            />
                        </aside>
                    </div>
                )}

                {/* 底部：时间线 + 裁剪器 */}
                {current && current.lines.length > 0 && (
                    <div className="shrink-0">
                        {trimLine && trimLine.audioUrl && (
                            <div className="border-t border-stone-200 bg-stone-50/80 dark:border-stone-800 dark:bg-stone-900/40">
                                <div className="flex items-center justify-between px-4 pt-2">
                                    <span className="text-xs font-medium text-stone-500">音频裁剪</span>
                                    <Button type="text" size="small" onClick={() => setTrimLineId(null)}>收起</Button>
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
