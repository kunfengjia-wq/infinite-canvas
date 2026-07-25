import { Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty } from "antd";
import { useSearchParams } from "react-router-dom";

import { ModelPicker } from "@/components/model-picker";
import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { useEffectiveConfig, useConfigStore } from "@/stores/use-config-store";
import { InputPanel } from "./components/input-panel";
import { PlatformSelector } from "./components/platform-selector";
import { PromptResult } from "./components/prompt-result";
import { StoryboardSourcePanel } from "./components/storyboard-source-panel";
import { StylePresets } from "./components/style-presets";
import { ExportBar } from "./components/export-bar";
import { PromptProjectSidebar } from "./components/project-sidebar";

export default function PromptStudioPage() {
    const { message } = App.useApp();
    const [searchParams] = useSearchParams();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const { current, loadProjects, createProject } = usePromptStudioStore();
    const [selectedModel, setSelectedModel] = useState("");
    const aiConfig = useMemo(() => (selectedModel ? { ...effectiveConfig, model: selectedModel } : effectiveConfig), [effectiveConfig, selectedModel]);

    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);

    // 从分镜工作台跳转过来时，自动创建关联项目
    useEffect(() => {
        const storyboardId = searchParams.get("storyboard");
        if (storyboardId && !current) {
            void createProject(`分镜导出 ${new Date().toLocaleDateString()}`, "storyboard", storyboardId);
        }
    }, [searchParams, current, createProject]);

    return (
        <div className="flex h-full overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <PromptProjectSidebar />

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <header className="border-b border-stone-200 px-6 py-4 dark:border-stone-800">
                    <div className="flex items-center gap-3">
                        <Wand2 className="size-6 text-stone-500" />
                        <h1 className="text-xl font-semibold">提示词工作台</h1>
                        {current && <span className="ml-2 text-sm text-stone-400">{current.title}</span>}
                        <div className="ml-auto">
                            <ModelPicker config={effectiveConfig} value={selectedModel} onChange={setSelectedModel} capability="text" placeholder="选择文本模型" onMissingConfig={() => openConfigDialog()} />
                        </div>
                    </div>
                    <p className="mt-1 text-sm text-stone-500">将画面描述转化为多平台高质量提示词</p>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                    {!isAiConfigReady ? (
                        <div className="flex h-full flex-col items-center justify-center gap-4">
                            <Empty description="请先配置 AI 服务" />
                            <Button type="primary" onClick={() => openConfigDialog()}>打开配置</Button>
                        </div>
                    ) : (
                        <div className="mx-auto max-w-5xl space-y-6">
                            {/* 平台选择 */}
                            <PlatformSelector />

                            {/* 风格预设 */}
                            <StylePresets />

                            {/* 输入区 */}
                            <InputPanel config={aiConfig} onError={(msg) => message.error(msg)} />

                            {/* 分镜素材浏览器 */}
                            <div className="h-[480px] rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                                <StoryboardSourcePanel config={aiConfig} onError={(msg) => message.error(msg)} />
                            </div>

                            {/* 生成结果 */}
                            <PromptResult config={aiConfig} onError={(msg) => message.error(msg)} />

                            {/* 导出栏 */}
                            <ExportBar />
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
