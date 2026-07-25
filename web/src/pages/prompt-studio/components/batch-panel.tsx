import { Clapperboard, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { App, Button, Card, Progress, Select } from "antd";

import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { aiBatchGeneratePrompts } from "@/services/prompt-studio-ai";
import { getStoryboardRepo } from "@/services/db";
import type { AiConfig } from "@/stores/use-config-store";
import type { StoryboardProject } from "@/types/storyboard";

export function BatchPanel({ config, onError }: { config: AiConfig; onError: (msg: string) => void }) {
    const { message } = App.useApp();
    const { selectedPlatform, selectedStyle, generating, setGenerating, addEntry, current, createProject } = usePromptStudioStore();
    const [storyboardProjects, setStoryboardProjects] = useState<StoryboardProject[]>([]);
    const [selectedStoryboard, setSelectedStoryboard] = useState<string>("");
    const [progress, setProgress] = useState({ done: 0, total: 0 });

    useEffect(() => {
        void getStoryboardRepo().list().then((projects) => {
            setStoryboardProjects(projects.filter((p) => p.status === "descriptions_confirmed" || p.scenes.some((s) => s.shots.some((sh) => sh.visualDescription.trim()))));
        });
    }, []);

    const handleBatchGenerate = async () => {
        const project = storyboardProjects.find((p) => p.id === selectedStoryboard);
        if (!project) {
            message.warning("请选择分镜项目");
            return;
        }
        const shots = project.scenes.flatMap((s) => s.shots.filter((sh) => sh.visualDescription.trim()));
        if (shots.length === 0) {
            message.warning("该分镜项目没有已生成画面描述的镜头");
            return;
        }
        if (!current) {
            await createProject(`批量-${project.title}`, "storyboard", project.id);
        }
        setGenerating(true);
        setProgress({ done: 0, total: shots.length });
        try {
            const inputs = shots.map((sh) => sh.visualDescription);
            const results = await aiBatchGeneratePrompts(config, inputs, selectedPlatform, selectedStyle || undefined, undefined, (index, total) => setProgress({ done: index, total }));
            results.forEach((result, i) => {
                addEntry({ input: inputs[i], platform: selectedPlatform, prompt: result.prompt, negativePrompt: result.negativePrompt, style: selectedStyle || undefined, category: "general" });
            });
            await usePromptStudioStore.getState().saveCurrent();
            message.success(`已批量生成 ${results.length} 条提示词`);
        } catch (error) {
            onError(error instanceof Error ? error.message : "批量生成失败");
        } finally {
            setGenerating(false);
        }
    };

    if (storyboardProjects.length === 0) return null;

    return (
        <section className="rounded-lg border border-dashed border-stone-300 p-4 dark:border-stone-700">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-600 dark:text-stone-300">
                <Clapperboard className="size-4" />
                从分镜项目批量导入
            </h3>
            <div className="flex items-center gap-3">
                <Select
                    className="min-w-48 flex-1"
                    placeholder="选择已完成的分镜项目"
                    value={selectedStoryboard || undefined}
                    onChange={setSelectedStoryboard}
                    options={storyboardProjects.map((p) => ({ label: `${p.title}（${p.scenes.reduce((s, sc) => s + sc.shots.length, 0)} 镜头）`, value: p.id }))}
                />
                <Button icon={generating ? <LoaderCircle className="size-4 animate-spin" /> : undefined} loading={generating} disabled={!selectedStoryboard} onClick={handleBatchGenerate}>
                    批量生成
                </Button>
            </div>
            {generating && progress.total > 0 && <Progress percent={Math.round((progress.done / progress.total) * 100)} className="mt-3" size="small" format={() => `${progress.done}/${progress.total}`} />}
        </section>
    );
}
