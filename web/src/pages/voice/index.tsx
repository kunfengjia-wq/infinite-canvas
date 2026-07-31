import { AudioLines, Download, LoaderCircle, PanelRightClose, PanelRightOpen, Plus, Settings2, Volume2, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { App, Button, Empty, Popover, Switch, Tabs } from "antd";

import { useVoiceStore } from "./store/use-voice-store";
import { useConfigStore } from "@/stores/use-config-store";
import { VoiceProjectSidebar } from "./components/voice-project-sidebar";
import { CharacterPanel } from "./components/character-panel";
import { ScriptEditor } from "./components/script-editor";
import { TimelinePlayer } from "./components/timeline-player";
import { AudioTrimmer } from "./components/audio-trimmer";
import { EffectsPanel } from "./components/effects-panel";
import { SoundLibraryPanel } from "./components/sound-library-panel";
import { QwenPresetPanel } from "./components/engine-panels/qwen-preset-panel";
import { QwenClonePanel } from "./components/engine-panels/qwen-clone-panel";
import { KokoroPanel } from "./components/engine-panels/kokoro-panel";
import { XttsPanel } from "./components/engine-panels/xtts-panel";
import { ENGINE_META, type TTSEngineId } from "./types";

export default function VoicePage() {
    const { message } = App.useApp();
    const { current, models, ttsOnline, loadProjects, loadModels, generateAll, startPolling, stopPolling } = useVoiceStore();
    const ttsBaseUrl = useConfigStore((s) => s.config.ttsBaseUrl);
    const [generatingAll, setGeneratingAll] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [trimLineId, setTrimLineId] = useState<string | null>(null);
    const [activeEngine, setActiveEngine] = useState<TTSEngineId>("qwen3-tts");
    const [showRightPanel, setShowRightPanel] = useState(true);

    useEffect(() => {
        void loadProjects();
        void loadModels();
        startPolling();
        return () => stopPolling();
    }, [loadProjects, loadModels, startPolling, stopPolling]);

    // 同步项目引擎到 tab
    useEffect(() => {
        if (current?.engine) setActiveEngine(current.engine);
    }, [current?.engine]);

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

    const handleEngineTabChange = (key: string) => {
        const engineId = key as TTSEngineId;
        setActiveEngine(engineId);
        if (current) {
            const updated = { ...current, engine: engineId };
            useVoiceStore.setState({ current: updated });
            void useVoiceStore.getState().saveCurrent();
        }
    };

    const doneCount = current?.lines.filter((l) => l.status === "done").length ?? 0;
    const totalCount = current?.lines.length ?? 0;
    const trimLine = current?.lines.find((l) => l.id === trimLineId && l.audioUrl);

    // 引擎面板渲染
    const renderEnginePanel = (engineId: TTSEngineId) => {
        const modelInfo = models.find((m) => m.id === engineId);
        switch (engineId) {
            case "qwen3-tts":
                return <QwenPresetPanel modelInfo={modelInfo} />;
            case "qwen3-tts-clone":
                return <QwenClonePanel />;
            case "kokoro-82m":
                return <KokoroPanel modelInfo={modelInfo} />;
            case "xtts-v2":
                return <XttsPanel modelInfo={modelInfo} />;
            default:
                return <QwenPresetPanel modelInfo={modelInfo} />;
        }
    };

    // 构建引擎 Tab items（只显示已启用的引擎；模型列表未加载时全部显示）
    const engineTabItems = ENGINE_META
        .filter((meta) => {
            if (models.length === 0) return true;
            return models.find((m) => m.id === meta.id)?.enabled ?? false;
        })
        .map((meta) => {
            const modelInfo = models.find((m) => m.id === meta.id);
            const available = modelInfo?.available ?? false;
            return {
                key: meta.id,
                label: (
                    <span className="flex items-center gap-1.5">
                        {meta.name}
                        {!available && <span className="size-1.5 rounded-full bg-stone-300" title="未安装" />}
                        {available && <span className="size-1.5 rounded-full bg-emerald-400" />}
                    </span>
                ),
            };
        });

    // 当前引擎被禁用时自动回退到第一个已启用引擎
    useEffect(() => {
        if (engineTabItems.length > 0 && !engineTabItems.some((t) => t.key === activeEngine)) {
            setActiveEngine(engineTabItems[0].key as TTSEngineId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [models, activeEngine]);

    return (
        <div className="flex h-full overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <VoiceProjectSidebar />

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* 顶部标题栏 */}
                <header className="flex items-center gap-3 border-b border-stone-200 px-6 py-2.5 dark:border-stone-800">
                    <AudioLines className="size-5 text-violet-500" />
                    <h1 className="text-base font-semibold">语音工作台</h1>
                    {current && <span className="text-sm text-stone-400">{current.title}</span>}

                    <div className="ml-auto flex items-center gap-3">
                        {/* 引擎管理 */}
                        <Popover
                            trigger="click"
                            placement="bottomRight"
                            title="引擎管理（按需开启）"
                            content={
                                <div className="w-56 space-y-2">
                                    {models.map((m) => (
                                        <div key={m.id} className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-medium">{m.display_name}</p>
                                                <p className="text-[10px] text-stone-400">{m.available ? "已安装" : "未安装"}</p>
                                            </div>
                                            <Switch
                                                size="small"
                                                checked={m.enabled}
                                                disabled={!m.available}
                                                onChange={() => void useVoiceStore.getState().toggleEngine(m.id)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            }
                        >
                            <Button type="text" size="small" icon={<Settings2 className="size-4" />} title="引擎管理" />
                        </Popover>

                        <span className={`flex items-center gap-1.5 text-xs ${ttsOnline ? "text-emerald-500" : "text-red-400"}`}>
                            <span className={`size-2 rounded-full ${ttsOnline ? "bg-emerald-500" : "bg-red-400 animate-pulse"}`} />
                            {ttsOnline ? "TTS 已连接" : "TTS 离线"}
                        </span>

                        {current && totalCount > 0 && (
                            <Button
                                type="primary"
                                size="small"
                                icon={generatingAll ? <LoaderCircle className="size-3.5 animate-spin" /> : <Volume2 className="size-3.5" />}
                                onClick={() => void handleGenerateAll()}
                                disabled={generatingAll}
                            >
                                {generatingAll ? `生成中 ${doneCount}/${totalCount}` : `全部生成 (${doneCount}/${totalCount})`}
                            </Button>
                        )}

                        {current && doneCount > 0 && (
                            <Button
                                size="small"
                                icon={exporting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                                onClick={() => void handleExport()}
                                disabled={exporting}
                            >
                                导出
                            </Button>
                        )}

                        <Button
                            type="text"
                            size="small"
                            icon={showRightPanel ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
                            onClick={() => setShowRightPanel(!showRightPanel)}
                            title={showRightPanel ? "收起侧栏" : "展开侧栏"}
                        />
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
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                        {/* 断连警告条（不遮挡工作区） */}
                        {!ttsOnline && (
                            <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-800 dark:bg-amber-950/40">
                                <WifiOff className="size-3.5 text-amber-500" />
                                <span className="text-xs text-amber-700 dark:text-amber-300">
                                    TTS 服务连接中断，正在自动重试…（生成功能暂停）
                                </span>
                                <Button size="small" type="link" className="!h-auto !p-0 text-xs" onClick={() => void loadModels()}>手动重连</Button>
                            </div>
                        )}

                        <div className="flex min-h-0 flex-1">
                        {/* 左栏：角色管理 */}
                        <CharacterPanel />

                        {/* 中栏：模型Tab + 台词编辑 + 时间线 */}
                        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                            {/* 模型 Tab 切换 */}
                            <div className="border-b border-stone-200 dark:border-stone-800">
                                <Tabs
                                    type="card"
                                    size="small"
                                    activeKey={activeEngine}
                                    onChange={handleEngineTabChange}
                                    items={engineTabItems}
                                    className="[&_.ant-tabs-nav]:!mb-0 [&_.ant-tabs-nav]:px-4 [&_.ant-tabs-tab]:!rounded-t-lg"
                                />
                            </div>

                            {/* 模型配置面板（可折叠） */}
                            <EngineConfigDrawer engineId={activeEngine} renderPanel={renderEnginePanel} />

                            {/* 台词编辑器 */}
                            <ScriptEditor />

                            {/* 底部时间线 */}
                            {current.lines.length > 0 && (
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
                        </div>

                        {/* 右栏：音效库 + 效果 */}
                        {showRightPanel && (
                            <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-l border-stone-200 dark:border-stone-800">
                                <div className="min-h-0 flex-1 overflow-hidden">
                                    <SoundLibraryPanel />
                                </div>
                                <div className="max-h-[40%] shrink-0 overflow-y-auto border-t border-stone-200 dark:border-stone-800">
                                    <div className="px-3 pt-2">
                                        <p className="text-xs font-medium text-stone-500">后处理效果</p>
                                    </div>
                                    <EffectsPanel />
                                </div>
                            </aside>
                        )}
                    </div>
                    </div>
                )}
            </main>
        </div>
    );
}

/** 引擎配置区域（可展开/收起） */
function EngineConfigDrawer({ engineId, renderPanel }: { engineId: TTSEngineId; renderPanel: (id: TTSEngineId) => React.ReactNode }) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className="shrink-0 border-b border-stone-200 dark:border-stone-800">
            <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-1.5 text-[11px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                onClick={() => setExpanded(!expanded)}
            >
                <span>模型配置</span>
                <span className="text-[10px]">{expanded ? "▲ 收起" : "▼ 展开"}</span>
            </button>
            {expanded && (
                <div className="max-h-[320px] overflow-y-auto px-4 pb-4">
                    {renderPanel(engineId)}
                </div>
            )}
        </div>
    );
}
