import { Clapperboard, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Steps } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { useEffectiveConfig, useConfigStore } from "@/stores/use-config-store";
import { STORYBOARD_STEPS, type StoryboardStep } from "@/types/storyboard";
import { ScriptInput } from "./components/script-input";
import { AssetExtraction } from "./components/asset-extraction";
import { SceneList } from "./components/scene-list";
import { ShotEditor } from "./components/shot-editor";
import { DescriptionReview } from "./components/description-review";
import { ProjectSidebar } from "./components/project-sidebar";

export default function StoryboardPage() {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const { current, step, projects, loading, processing, loadProjects, setStep } = useStoryboardStore();
    const [selectedModel, setSelectedModel] = useState("");
    const aiConfig = useMemo(() => (selectedModel ? { ...effectiveConfig, model: selectedModel } : effectiveConfig), [effectiveConfig, selectedModel]);

    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);

    const renderStep = () => {
        if (!current) return null;
        switch (step) {
            case 1:
                return <ScriptInput />;
            case 2:
                return <AssetExtraction config={aiConfig} onError={(msg) => message.error(msg)} />;
            case 3:
                return <SceneList config={aiConfig} onError={(msg) => message.error(msg)} />;
            case 4:
                return <ShotEditor config={aiConfig} onError={(msg) => message.error(msg)} />;
            case 5:
                return <DescriptionReview config={aiConfig} onError={(msg) => message.error(msg)} />;
            default:
                return null;
        }
    };

    return (
        <div className="flex h-full overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <ProjectSidebar />

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* 顶部标题 + 步骤导航 */}
                <header className="border-b border-stone-200 px-6 py-4 dark:border-stone-800">
                    <div className="flex items-center gap-3">
                        <Clapperboard className="size-6 text-stone-500" />
                        <h1 className="text-xl font-semibold">分镜工作台</h1>
                        {current && <span className="ml-2 text-sm text-stone-400">{current.title}</span>}
                        <div className="ml-auto">
                            <ModelPicker config={effectiveConfig} value={selectedModel} onChange={setSelectedModel} capability="text" placeholder="选择文本模型" onMissingConfig={() => openConfigDialog()} />
                        </div>
                    </div>
                    {current && (
                        <Steps
                            className="mt-4 max-w-2xl"
                            size="small"
                            current={step - 1}
                            onChange={(index) => {
                                const targetStep = (index + 1) as StoryboardStep;
                                if (targetStep <= step || current.status !== "draft") setStep(targetStep);
                            }}
                            items={STORYBOARD_STEPS.map((s) => ({ title: s.label, description: s.description }))}
                        />
                    )}
                </header>

                {/* 内容区 */}
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                    {!isAiConfigReady ? (
                        <div className="flex h-full flex-col items-center justify-center gap-4">
                            <Empty description="请先配置 AI 服务" />
                            <Button type="primary" onClick={() => openConfigDialog()}>
                                打开配置
                            </Button>
                        </div>
                    ) : !current ? (
                        <div className="flex h-full flex-col items-center justify-center gap-4">
                            <Clapperboard className="size-16 text-stone-300 dark:text-stone-700" />
                            <p className="text-stone-500">选择左侧项目或创建新的分镜项目</p>
                            <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setStep(1)}>
                                新建项目
                            </Button>
                        </div>
                    ) : (
                        renderStep()
                    )}
                </div>
            </main>
        </div>
    );
}
