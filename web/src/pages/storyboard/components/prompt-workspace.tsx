import { FolderPlus, PanelLeftClose, PanelLeftOpen, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Popconfirm, Select } from "antd";

import type { AiConfig } from "@/stores/use-config-store";
import { getStoryboardRepo } from "@/services/db";
import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { useShallow } from "zustand/react/shallow";
import { InputPanel } from "@/pages/prompt-studio/components/input-panel";
import { PlatformSelector } from "@/pages/prompt-studio/components/platform-selector";
import { PromptResult } from "@/pages/prompt-studio/components/prompt-result";
import { StoryboardSourcePanel } from "@/pages/prompt-studio/components/storyboard-source-panel";
import { StylePresets } from "@/pages/prompt-studio/components/style-presets";
import { GenerationStatus } from "@/pages/prompt-studio/components/generation-status";
import { ExportBar } from "@/pages/prompt-studio/components/export-bar";

const PANEL_MIN = 300;
const PANEL_DEFAULT = 380;

/** 左栏最大宽度：视口 70%，至少 680px */
function getPanelMax(): number {
    return Math.max(680, Math.floor(window.innerWidth * 0.7));
}

/**
 * 提示词工作台（双栏布局）
 * 有分镜数据时：左栏分镜素材面板 + 右栏手动输入与结果；否则单列模式
 * sourceStoryboardId 由分镜流程导出时传入，实时关联对应分镜项目
 */
export function PromptWorkspace({ config, sourceStoryboardId, sourceTab }: { config: AiConfig; sourceStoryboardId?: string | null; sourceTab?: "visual" | "storyboard" | "asset" }) {
    const { message } = App.useApp();
    const { projects, current, loading, loadProjects, createProject, openProject, deleteProject } = usePromptStudioStore(
        useShallow((s) => ({ projects: s.projects, current: s.current, loading: s.loading, loadProjects: s.loadProjects, createProject: s.createProject, openProject: s.openProject, deleteProject: s.deleteProject })),
    );
    const [hasStoryboard, setHasStoryboard] = useState(Boolean(sourceStoryboardId));

    // ─── 左栏宽度拖拽 + 折叠（活动页） ───
    const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [dragging, setDragging] = useState(false);
    const dragRef = useRef<{ startX: number; startW: number } | null>(null);

    const startResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setDragging(true);
        dragRef.current = { startX: e.clientX, startW: panelWidth };
        const onMove = (ev: MouseEvent) => {
            const ref = dragRef.current;
            if (!ref) return;
            const delta = ev.clientX - ref.startX;
            setPanelWidth(Math.min(getPanelMax(), Math.max(PANEL_MIN, ref.startW + delta)));
        };
        const onUp = () => {
            setDragging(false);
            dragRef.current = null;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, [panelWidth]);

    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);

    // 检测是否有可用分镜项目（含已生成画面描述）
    useEffect(() => {
        if (sourceStoryboardId) {
            setHasStoryboard(true);
            return;
        }
        void getStoryboardRepo()
            .list()
            .then((list) => {
                setHasStoryboard(
                    list.some((p) => {
                        const hasShots = (p.scenes ?? []).some((s) =>
                            (s.shots ?? []).some((sh) => (sh.visualDescription ?? "").trim() || (sh.action ?? "").trim() || (sh.dialogue ?? "").trim())
                        );
                        const a = p.assets;
                        const assetCount = (a?.characters?.length ?? 0) + (a?.locations?.length ?? 0) + (a?.props?.length ?? 0) + (a?.products?.length ?? 0);
                        return hasShots || assetCount > 0;
                    })
                );
            });
    }, [sourceStoryboardId]);

    const handleCreateProject = async () => {
        await createProject(`提示词项目 ${new Date().toLocaleDateString("zh-CN")}`);
        message.success("已创建新项目");
    };

    /** 项目管理条 */
    const projectBar = (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-stone-500">项目</span>
            <Select
                value={current?.id}
                onChange={(id) => void openProject(id)}
                placeholder="选择提示词项目"
                className="min-w-52 max-w-xs"
                loading={loading}
                options={projects.map((p) => ({ value: p.id, label: `${p.title}（${p.entries.length} 条）` }))}
                notFoundContent="暂无项目"
            />
            <Button icon={<FolderPlus className="size-4" />} onClick={() => void handleCreateProject()}>
                新建
            </Button>
            {current && (
                <Popconfirm title="删除此项目及其所有提示词？" onConfirm={() => void deleteProject(current.id)} okText="删除" cancelText="取消">
                    <Button danger icon={<Trash2 className="size-4" />}>
                        删除
                    </Button>
                </Popconfirm>
            )}
        </div>
    );

    // ─── 双栏模式：有分镜数据 ───
    if (hasStoryboard) {
        return (
            <div className="flex h-full flex-col overflow-hidden">
                {/* 顶部紧凑工具条 */}
                <div className="shrink-0 space-y-1.5 border-b border-stone-100 px-4 py-2.5 dark:border-stone-800">
                    {projectBar}
                    <PlatformSelector compact />
                    <StylePresets compact />
                    <GenerationStatus config={config} />
                </div>

                {/* 双栏主体：左栏可拖拽调宽、可折叠 */}
                <div className="flex min-h-0 flex-1 overflow-hidden">
                    {leftCollapsed ? (
                        <button
                            type="button"
                            onClick={() => setLeftCollapsed(false)}
                            className="flex w-8 shrink-0 flex-col items-center justify-center gap-2 border-r border-stone-100 text-stone-400 transition hover:bg-stone-50 hover:text-stone-600 dark:border-stone-800 dark:hover:bg-stone-800/50"
                            title="展开分镜素材"
                        >
                            <PanelLeftOpen className="size-4" />
                            <span className="text-[10px] tracking-widest" style={{ writingMode: "vertical-rl" }}>分镜素材</span>
                        </button>
                    ) : (
                        <div
                            className={`relative shrink-0 overflow-hidden border-r border-stone-100 dark:border-stone-800 ${dragging ? "" : "transition-[width] duration-150"}`}
                            style={{ width: panelWidth }}
                        >
                            <div className="h-full overflow-hidden p-3">
                                <StoryboardSourcePanel config={config} onError={(msg) => message.error(msg)} sourceStoryboardId={sourceStoryboardId} sourceTab={sourceTab} />
                            </div>
                            {/* 折叠按钮（跨在分隔条上，垂直居中） */}
                            <button
                                type="button"
                                onClick={() => setLeftCollapsed(true)}
                                className="absolute -right-3 top-1/2 z-30 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-400 shadow-sm transition hover:text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:hover:text-stone-300"
                                title="折叠分镜素材"
                            >
                                <PanelLeftClose className="size-3.5" />
                            </button>
                            {/* 拖拽调宽手柄 */}
                            <div
                                onMouseDown={startResize}
                                className={`absolute right-0 top-0 z-20 h-full w-[6px] cursor-col-resize ${dragging ? "bg-blue-400/60" : "transition-colors hover:bg-blue-300/50"}`}
                                title="拖拽调整宽度"
                            />
                        </div>
                    )}
                    {/* 右栏：提示词工作区 */}
                    <div className="flex-1 space-y-5 overflow-y-auto p-4">
                        <InputPanel config={config} onError={(msg) => message.error(msg)} collapsible />
                        <PromptResult config={config} onError={(msg) => message.error(msg)} />
                    </div>
                </div>

                {/* 底部导出栏 */}
                <div className="shrink-0 border-t border-stone-100 px-4 py-2 dark:border-stone-800">
                    <ExportBar />
                </div>
            </div>
        );
    }

    // ─── 单列模式：无分镜数据 ───
    return (
        <div className="h-full overflow-y-auto p-4">
            <div className="mx-auto max-w-5xl space-y-5">
                {projectBar}
                <PlatformSelector />
                <StylePresets />
                <GenerationStatus config={config} />
                <InputPanel config={config} onError={(msg) => message.error(msg)} />
                <PromptResult config={config} onError={(msg) => message.error(msg)} />
                <ExportBar />
            </div>
        </div>
    );
}
