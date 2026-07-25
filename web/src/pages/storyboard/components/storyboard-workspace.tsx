import { Clapperboard, PanelRightClose, PanelRightOpen, Plus } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { App, Button } from "antd";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import type { AiConfig } from "@/stores/use-config-store";
import type { StoryboardStep } from "@/types/storyboard";
import { StepIndicator } from "./step-indicator";
import { StoryboardTable } from "./storyboard-table";
import { ScriptInput } from "./script-input";
import { AssetExtraction } from "./asset-extraction";
import { SceneList } from "./scene-list";
import { ShotEditor } from "./shot-editor";
import { DescriptionReview } from "./description-review";

const PANEL_MIN = 380;
const PANEL_DEFAULT = 640;

/** 动态计算最大宽度：视口的 85%，至少 860px */
function getPanelMax(): number {
    return Math.max(860, Math.floor(window.innerWidth * 0.85));
}

export function StoryboardWorkspace({ config, onExportToPrompt }: { config: AiConfig; onExportToPrompt?: (storyboardId: string) => void }) {
    const { message } = App.useApp();
    const { current, step, setStep } = useStoryboardStore();
    const [tableOpen, setTableOpen] = useState(true);
    const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT);
    const [maximized, setMaximized] = useState(false);
    const [dragging, setDragging] = useState(false);
    const dragRef = useRef<{ startX: number; startW: number } | null>(null);

    const handleStepClick = (target: StoryboardStep) => {
        if (!current) return;
        if (target <= step || current.status !== "draft") setStep(target);
    };

    // ─── 拖拽调整面板宽度 ───
    const startResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setDragging(true);
        setMaximized(false);
        dragRef.current = { startX: e.clientX, startW: panelWidth };

        const onMove = (ev: MouseEvent) => {
            const ref = dragRef.current;
            if (!ref) return;
            const delta = ref.startX - ev.clientX;
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

    // ─── 双击手柄：最大化/还原 ───
    const handleDoubleClick = useCallback(() => {
        setMaximized((prev) => !prev);
    }, []);

    if (!current && step !== 1) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4">
                <Clapperboard className="size-14 text-stone-300 dark:text-stone-700" />
                <p className="text-sm text-stone-500">选择左侧项目或创建新的分镜项目</p>
                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setStep(1)}>
                    新建项目
                </Button>
            </div>
        );
    }

    const renderEditPanel = () => {
        switch (step) {
            case 1: return <ScriptInput config={config} />;
            case 2: return <AssetExtraction config={config} onError={(msg) => message.error(msg)} />;
            case 3: return <SceneList config={config} onError={(msg) => message.error(msg)} />;
            case 4: return <ShotEditor config={config} onError={(msg) => message.error(msg)} />;
            case 5: return <DescriptionReview config={config} onError={(msg) => message.error(msg)} onExportToPrompt={onExportToPrompt} />;
            default: return null;
        }
    };

    const hasShots = current ? current.scenes.some((s) => s.shots.length > 0) : false;
    const wide = maximized || panelWidth >= 600;

    return (
        <div className="flex h-full flex-col overflow-hidden">
            {/* 紧凑步骤指示器 */}
            <div className="shrink-0 border-b border-stone-100 dark:border-stone-800">
                <StepIndicator current={step} onStepClick={handleStepClick} />
            </div>

            {/* 主内容区：编辑面板 + 右侧分镜表 */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
                {/* 左侧编辑区 */}
                <div className={`min-w-0 flex-1 overflow-y-auto p-4 ${maximized ? "hidden lg:block lg:max-w-[30%]" : ""}`}>
                    {renderEditPanel()}
                </div>

                {/* 右侧全局分镜表面板 */}
                {hasShots && (
                    <div
                        className={`relative shrink-0 border-l border-stone-200 dark:border-stone-800 ${tableOpen ? "" : "w-10"} ${dragging ? "" : "transition-[width] duration-200"}`}
                        style={tableOpen ? { width: maximized ? "85%" : panelWidth } : undefined}
                    >
                        {/* 拖拽调整宽度手柄（双击最大化/还原） */}
                        {tableOpen && (
                            <div
                                onMouseDown={startResize}
                                onDoubleClick={handleDoubleClick}
                                className={`group absolute -left-[3px] top-0 z-20 h-full w-[6px] cursor-col-resize ${dragging ? "bg-blue-400/60" : ""}`}
                                title="拖拽调整宽度，双击最大化/还原"
                            >
                                <div className={`absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all ${dragging ? "h-16 bg-blue-500" : "bg-stone-200 group-hover:h-14 group-hover:bg-blue-400 dark:bg-stone-700"}`} />
                            </div>
                        )}

                        {/* 折叠/展开按钮 */}
                        <button
                            type="button"
                            onClick={() => setTableOpen(!tableOpen)}
                            className="absolute -left-3 top-3 z-30 flex size-6 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:bg-stone-50 hover:text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:hover:bg-stone-800"
                            title={tableOpen ? "收起分镜表" : "展开分镜表"}
                        >
                            {tableOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
                        </button>

                        {tableOpen ? (
                            <div className="flex h-full flex-col overflow-hidden">
                                <StoryboardTable
                                    variant="panel"
                                    wide={wide}
                                    maximized={maximized}
                                    onToggleMaximize={() => setMaximized(!maximized)}
                                />
                            </div>
                        ) : (
                            <div className="flex h-full items-center justify-center">
                                <span className="rotate-90 whitespace-nowrap text-xs text-stone-400">分镜表</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
