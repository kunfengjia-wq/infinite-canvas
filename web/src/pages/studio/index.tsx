import { Clapperboard, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Empty, Tabs } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { useEffectiveConfig, useConfigStore } from "@/stores/use-config-store";
import { useStudioHotkeys } from "@/hooks/use-studio-hotkeys";
import { StoryboardWorkspace } from "./storyboard-workspace";
import { PromptWorkspace } from "./prompt-workspace";
import { StudioSidebar } from "./components/studio-sidebar";

export default function StudioPage() {
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [selectedModel, setSelectedModel] = useState("");
    const [activeTab, setActiveTab] = useState<"storyboard" | "prompt">("storyboard");
    const [promptSource, setPromptSource] = useState<string | null>(null);
    const aiConfig = useMemo(() => (selectedModel ? { ...effectiveConfig, model: selectedModel } : effectiveConfig), [effectiveConfig, selectedModel]);

    // 注册全局快捷键
    useStudioHotkeys();

    const { loadProjects: loadStoryboardProjects, current: storyboardCurrent } = useStoryboardStore();
    const { loadProjects: loadPromptProjects } = usePromptStudioStore();

    useEffect(() => {
        void loadStoryboardProjects();
        void loadPromptProjects();
    }, [loadStoryboardProjects, loadPromptProjects]);

    const handleExportToPrompt = useCallback((storyboardId: string) => {
        setPromptSource(storyboardId);
        setActiveTab("prompt");
    }, []);

    return (
        <div className="flex h-full overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <StudioSidebar activeTab={activeTab} />

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* 顶部栏 */}
                <header className="flex items-center gap-3 border-b border-stone-200 px-4 py-2.5 dark:border-stone-800">
                    <Tabs
                        activeKey={activeTab}
                        onChange={(key) => setActiveTab(key as "storyboard" | "prompt")}
                        size="small"
                        className="[&_.ant-tabs-nav]:!mb-0"
                        items={[
                            { key: "storyboard", label: <span className="flex items-center gap-1.5"><Clapperboard className="size-3.5" />分镜</span> },
                            { key: "prompt", label: <span className="flex items-center gap-1.5"><Wand2 className="size-3.5" />提示词</span> },
                        ]}
                    />
                    {storyboardCurrent && activeTab === "storyboard" && (
                        <span className="text-sm text-stone-400">{storyboardCurrent.title}</span>
                    )}
                    <div className="ml-auto">
                        <ModelPicker config={effectiveConfig} value={selectedModel} onChange={setSelectedModel} capability="text" placeholder="选择模型" onMissingConfig={() => openConfigDialog()} />
                    </div>
                </header>

                {/* 内容区 */}
                <div className="min-h-0 flex-1 overflow-hidden">
                    {!isAiConfigReady ? (
                        <div className="flex h-full flex-col items-center justify-center gap-4">
                            <Empty description="请先配置 AI 服务" />
                            <Button type="primary" onClick={() => openConfigDialog()}>打开配置</Button>
                        </div>
                    ) : activeTab === "storyboard" ? (
                        <StoryboardWorkspace config={aiConfig} onExportToPrompt={handleExportToPrompt} />
                    ) : (
                        <PromptWorkspace config={aiConfig} sourceStoryboardId={promptSource} />
                    )}
                </div>
            </main>
        </div>
    );
}
