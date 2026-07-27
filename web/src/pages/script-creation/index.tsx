import { PenLine } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Empty } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { useScriptCreationStore } from "@/stores/use-script-creation-store";
import { useEffectiveConfig, useConfigStore } from "@/stores/use-config-store";
import { CREATION_PHASES } from "@/types/script-creation";
import { ScriptProjectSidebar } from "./components/project-sidebar";
import { InspirationCards } from "./components/inspiration-cards";
import { SettingBuilder } from "./components/setting-builder";
import { StructureBuilder } from "./components/structure-builder";
import { DraftWriter } from "./components/draft-writer";
import { FinalOutput } from "./components/final-output";
import { StepIndicator } from "./components/step-indicator";

export default function ScriptCreationPage() {
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const { current, loadProjects } = useScriptCreationStore();
    const [selectedModel, setSelectedModel] = useState("");
    const aiConfig = useMemo(() => (selectedModel ? { ...effectiveConfig, model: selectedModel } : effectiveConfig), [effectiveConfig, selectedModel]);

    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);

    const phase = current?.phase ?? 1;

    return (
        <div className="flex h-full overflow-hidden bg-background text-stone-800 dark:text-stone-100">
            <ScriptProjectSidebar />

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* 顶部标题 */}
                <header className="border-b border-stone-200 px-6 py-4 dark:border-stone-800">
                    <div className="flex items-center gap-3">
                        <PenLine className="size-6 text-stone-500" />
                        <h1 className="text-xl font-semibold">剧本创作工作台</h1>
                        {current && <span className="ml-2 text-sm text-stone-400">{current.title}</span>}
                        <div className="ml-auto flex items-center gap-3">
                            <ModelPicker config={effectiveConfig} value={selectedModel} onChange={setSelectedModel} capability="text" placeholder="选择文本模型" onMissingConfig={() => openConfigDialog()} />
                        </div>
                    </div>
                </header>

                {/* 步骤指示器 */}
                {current && (
                    <div className="border-b border-stone-100 px-6 py-3 dark:border-stone-800/50">
                        <StepIndicator phases={CREATION_PHASES} current={phase} />
                    </div>
                )}

                {/* 内容区 */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                    {!isAiConfigReady ? (
                        <div className="flex h-full flex-col items-center justify-center gap-4">
                            <Empty description="请先配置 AI 服务" />
                            <Button type="primary" onClick={() => openConfigDialog()}>
                                打开配置
                            </Button>
                        </div>
                    ) : !current ? (
                        <div className="flex h-full flex-col items-center justify-center gap-4">
                            <Empty description="选择或新建一个剧本项目开始创作" />
                        </div>
                    ) : (
                        <div className="p-6">
                            {phase === 1 && <InspirationCards config={aiConfig} />}
                            {phase === 2 && <SettingBuilder config={aiConfig} />}
                            {phase === 3 && <StructureBuilder config={aiConfig} />}
                            {phase === 4 && <DraftWriter config={aiConfig} />}
                            {phase === 5 && <FinalOutput config={aiConfig} />}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
