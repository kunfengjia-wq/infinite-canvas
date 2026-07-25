import { Clapperboard, LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { App, Button, Checkbox, Collapse, Input, Progress, Select, Tag } from "antd";

import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { aiBatchGeneratePrompts } from "@/services/prompt-studio-ai";
import { getStoryboardRepo } from "@/services/db";
import type { AiConfig } from "@/stores/use-config-store";
import type { Shot, StoryboardProject } from "@/types/storyboard";

type Props = {
    config: AiConfig;
    onError: (msg: string) => void;
    sourceStoryboardId?: string | null;
};

type FlatShot = Shot & { sceneId: string; sceneTitle: string };

export function StoryboardSourcePanel({ config, onError, sourceStoryboardId }: Props) {
    const { message } = App.useApp();
    const { selectedPlatforms, selectedStyle, generating, setGenerating, addEntry, current, createProject } = usePromptStudioStore();

    const [projects, setProjects] = useState<StoryboardProject[]>([]);
    const [selectedId, setSelectedId] = useState<string>("");
    const [checkedShots, setCheckedShots] = useState<Set<string>>(new Set());
    const [editedDescriptions, setEditedDescriptions] = useState<Map<string, string>>(new Map());
    const [progress, setProgress] = useState({ done: 0, total: 0 });

    // 加载分镜项目列表
    useEffect(() => {
        void getStoryboardRepo().list().then((list) => {
            const eligible = list.filter((p) => p.scenes.some((s) => s.shots.some((sh) => sh.visualDescription.trim())));
            setProjects(eligible);
            if (sourceStoryboardId && eligible.some((p) => p.id === sourceStoryboardId)) {
                setSelectedId(sourceStoryboardId);
            } else if (eligible.length > 0 && !selectedId) {
                setSelectedId(eligible[0].id);
            }
        });
    }, [sourceStoryboardId]);

    const project = useMemo(() => projects.find((p) => p.id === selectedId) || null, [projects, selectedId]);

    // 按场景分组的镜头
    const sceneGroups = useMemo(() => {
        if (!project) return [];
        return project.scenes
            .map((scene) => ({
                sceneId: scene.id,
                sceneTitle: scene.title,
                shots: scene.shots.filter((sh) => sh.visualDescription.trim()) as FlatShot[],
            }))
            .filter((g) => g.shots.length > 0)
            .map((g) => ({ ...g, shots: g.shots.map((sh) => ({ ...sh, sceneId: g.sceneId, sceneTitle: g.sceneTitle })) }));
    }, [project]);

    // 项目切换时默认全选
    useEffect(() => {
        if (!project) return;
        const allIds = project.scenes.flatMap((s) => s.shots.filter((sh) => sh.visualDescription.trim()).map((sh) => sh.id));
        setCheckedShots(new Set(allIds));
        setEditedDescriptions(new Map());
    }, [selectedId, project]);

    const toggleShot = (shotId: string) => {
        setCheckedShots((prev) => {
            const next = new Set(prev);
            if (next.has(shotId)) next.delete(shotId);
            else next.add(shotId);
            return next;
        });
    };

    const toggleScene = (sceneId: string) => {
        const group = sceneGroups.find((g) => g.sceneId === sceneId);
        if (!group) return;
        setCheckedShots((prev) => {
            const next = new Set(prev);
            const allChecked = group.shots.every((sh) => next.has(sh.id));
            group.shots.forEach((sh) => {
                if (allChecked) next.delete(sh.id);
                else next.add(sh.id);
            });
            return next;
        });
    };

    const handleGenerate = async () => {
        if (!project) return;
        const allShots = sceneGroups.flatMap((g) => g.shots);
        const selected = allShots.filter((sh) => checkedShots.has(sh.id));
        if (selected.length === 0) {
            message.warning("请至少勾选一个镜头");
            return;
        }
        if (!current) {
            await createProject(`提示词-${project.title}`, "storyboard", project.id);
        }
        const inputs = selected.map((sh) => editedDescriptions.get(sh.id) ?? sh.visualDescription);
        const totalTasks = inputs.length * selectedPlatforms.length;
        setGenerating(true);
        setProgress({ done: 0, total: totalTasks });
        try {
            let done = 0;
            for (const platform of selectedPlatforms) {
                const results = await aiBatchGeneratePrompts(config, inputs, platform, selectedStyle || undefined, undefined, () => {});
                results.forEach((result, i) => {
                    addEntry({ input: inputs[i], platform, prompt: result.prompt, negativePrompt: result.negativePrompt, style: selectedStyle || undefined, category: "general" });
                });
                done += results.length;
                setProgress({ done, total: totalTasks });
            }
            await usePromptStudioStore.getState().saveCurrent();
            message.success(`已为 ${selectedPlatforms.length} 个平台生成 ${done} 条提示词`);
        } catch (error) {
            onError(error instanceof Error ? error.message : "批量生成失败");
        } finally {
            setGenerating(false);
        }
    };

    if (projects.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-stone-400">
                <Clapperboard className="size-10 text-stone-300 dark:text-stone-700" />
                <p className="text-sm">暂无可用分镜项目</p>
                <p className="text-xs">请先在分镜工作台完成画面描述生成</p>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* 项目选择 */}
            <div className="mb-3">
                <Select
                    className="w-full"
                    placeholder="选择分镜项目"
                    value={selectedId || undefined}
                    onChange={setSelectedId}
                    options={projects.map((p) => ({
                        label: `${p.title}（${p.scenes.reduce((s, sc) => s + sc.shots.filter((sh) => sh.visualDescription.trim()).length, 0)} 镜头）`,
                        value: p.id,
                    }))}
                />
            </div>

            {/* 镜头列表（可滚动） */}
            <div className="min-h-0 flex-1 overflow-y-auto">
                {sceneGroups.length > 0 && (
                    <Collapse
                        defaultActiveKey={sceneGroups.map((g) => g.sceneId)}
                        size="small"
                        items={sceneGroups.map((group) => ({
                            key: group.sceneId,
                            label: (
                                <span className="text-xs font-medium">
                                    {group.sceneTitle}
                                    <Tag className="ml-2 scale-90">{group.shots.length} 镜头</Tag>
                                </span>
                            ),
                            extra: (
                                <Button
                                    type="link"
                                    size="small"
                                    className="!text-xs"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleScene(group.sceneId);
                                    }}
                                >
                                    {group.shots.every((sh) => checkedShots.has(sh.id)) ? "取消全选" : "全选"}
                                </Button>
                            ),
                            children: (
                                <div className="space-y-2.5">
                                    {group.shots.map((shot, idx) => (
                                        <div key={shot.id} className="rounded-md border border-stone-100 p-2 dark:border-stone-800">
                                            <div className="mb-1.5 flex items-center gap-2">
                                                <Checkbox checked={checkedShots.has(shot.id)} onChange={() => toggleShot(shot.id)} />
                                                <span className="text-[10px] font-bold text-stone-400">#{idx + 1}</span>
                                                <Tag className="m-0 scale-75">{shot.shotType}</Tag>
                                                <Tag className="m-0 scale-75" color="geekblue">{shot.angle}</Tag>
                                                <span className="min-w-0 flex-1 truncate text-xs text-stone-500">{shot.action}</span>
                                            </div>
                                            <Input.TextArea
                                                value={editedDescriptions.get(shot.id) ?? shot.visualDescription}
                                                onChange={(e) => {
                                                    setEditedDescriptions((prev) => new Map(prev).set(shot.id, e.target.value));
                                                }}
                                                autoSize={{ minRows: 1, maxRows: 4 }}
                                                className="!text-xs"
                                                placeholder="画面描述"
                                            />
                                        </div>
                                    ))}
                                </div>
                            ),
                        }))}
                    />
                )}

                {/* 资产参考 */}
                {project && (project.assets.characters.length > 0 || project.assets.locations.length > 0 || project.assets.props.length > 0) && (
                    <Collapse
                        className="mt-3"
                        size="small"
                        items={[{
                            key: "assets",
                            label: <span className="text-xs font-medium text-stone-500">资产参考</span>,
                            children: (
                                <div className="space-y-2 text-xs text-stone-500">
                                    {project.assets.characters.map((c) => (
                                        <div key={c.id}>
                                            <span className="font-medium text-stone-600 dark:text-stone-300">角色 | {c.name}</span>
                                            <span className="ml-2 text-stone-400">{c.appearance}{c.costume ? `，${c.costume}` : ""}</span>
                                        </div>
                                    ))}
                                    {project.assets.locations.map((l) => (
                                        <div key={l.id}>
                                            <span className="font-medium text-stone-600 dark:text-stone-300">场景 | {l.name}</span>
                                            <span className="ml-2 text-stone-400">{l.description}</span>
                                        </div>
                                    ))}
                                    {project.assets.props.map((p) => (
                                        <div key={p.id}>
                                            <span className="font-medium text-stone-600 dark:text-stone-300">道具 | {p.name}</span>
                                            <span className="ml-2 text-stone-400">{p.description}</span>
                                        </div>
                                    ))}
                                </div>
                            ),
                        }]}
                    />
                )}
            </div>

            {/* 底部生成操作栏 */}
            <div className="shrink-0 border-t border-stone-100 pt-3 dark:border-stone-800">
                <Button
                    type="primary"
                    block
                    icon={generating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    loading={generating}
                    disabled={checkedShots.size === 0}
                    onClick={handleGenerate}
                >
                    生成选中（{checkedShots.size} 镜头 x {selectedPlatforms.length} 平台）
                </Button>
                {generating && progress.total > 0 && (
                    <Progress percent={Math.round((progress.done / progress.total) * 100)} className="mt-2" size="small" format={() => `${progress.done}/${progress.total}`} />
                )}
            </div>
        </div>
    );
}
