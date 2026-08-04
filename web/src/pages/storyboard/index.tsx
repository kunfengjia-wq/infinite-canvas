import { Clapperboard, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Empty, Segmented } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { useEffectiveConfig, useConfigStore } from "@/stores/use-config-store";
import { StoryboardWorkspace } from "./components/storyboard-workspace";
import { PromptWorkspace } from "./components/prompt-workspace";
import { ProjectSidebar } from "./components/project-sidebar";

type WorkbenchView = "storyboard" | "prompt";

export default function StoryboardPage() {
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const current = useStoryboardStore((s) => s.current);
    const loadProjects = useStoryboardStore((s) => s.loadProjects);
    const [selectedModel, setSelectedModel] = useState("");
    const aiConfig = useMemo(() => (selectedModel ? { ...effectiveConfig, model: selectedModel } : effectiveConfig), [effectiveConfig, selectedModel]);

    const [view, setView] = useState<WorkbenchView>("storyboard");
    const [sourceStoryboardId, setSourceStoryboardId] = useState<string | null>(null);
    const [sourceTab, setSourceTab] = useState<"visual" | "storyboard" | "asset" | undefined>(undefined);

    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);

    /** 导出到提示词工作台：指定来源分类 */
    const handleExportToPrompt = (storyboardId: string, tab?: "visual" | "storyboard" | "asset") => {
        setSourceStoryboardId(storyboardId);
        setSourceTab(tab);
        setView("prompt");
    };

    return (
        <div className="flex h-full overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <ProjectSidebar />

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* 顶部标题 + 视图切换 */}
                <header className="border-b border-stone-200 px-6 py-4 dark:border-stone-800">
                    <div className="flex items-center gap-3">
                        <Clapperboard className="size-6 text-stone-500" />
                        <h1 className="text-xl font-semibold">分镜工作台</h1>
                        {current && <span className="ml-2 text-sm text-stone-400">{current.title}</span>}
                        <div className="ml-auto flex items-center gap-3">
                            <Segmented
                                value={view}
                                onChange={(v) => setView(v as WorkbenchView)}
                                options={[
                                    { value: "storyboard", label: "分镜流程", icon: <Clapperboard className="size-4" /> },
                                    { value: "prompt", label: "提示词工作台", icon: <Wand2 className="size-4" /> },
                                ]}
                            />
                            <ModelPicker config={effectiveConfig} value={selectedModel} onChange={setSelectedModel} capability="text" placeholder="选择文本模型" onMissingConfig={() => openConfigDialog()} />
                        </div>
                    </div>
                </header>

                {/* 内容区 */}
                <div className="min-h-0 flex-1 overflow-hidden">
                    {!isAiConfigReady ? (
                        <div className="flex h-full flex-col items-center justify-center gap-4">
                            <Empty description="请先配置 AI 服务" />
                            <Button type="primary" onClick={() => openConfigDialog()}>
                                打开配置
                            </Button>
                        </div>
                    ) : view === "prompt" ? (
                        <PromptWorkspace config={aiConfig} sourceStoryboardId={sourceStoryboardId} sourceTab={sourceTab} />
                    ) : (
                        <StoryboardWorkspace config={aiConfig} onExportToPrompt={handleExportToPrompt} />
                    )}
                </div>
            </main>
        </div>
    );
}
