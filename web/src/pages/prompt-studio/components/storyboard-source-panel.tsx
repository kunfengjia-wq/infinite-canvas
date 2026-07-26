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

type FlatAsset = { id: string; type: "character" | "scene" | "prop" | "product"; label: string; input: string };

const ASSET_TYPE_LABEL: Record<FlatAsset["type"], string> = { character: "角色", scene: "场景", prop: "道具", product: "产品" };

/** 将资产组装为自然语言描述（含视图格式意图），作为提示词生成的输入 */
function composeAssetInput(a: FlatAsset & { raw: Record<string, unknown> }): string {
    const r = a.raw;
    const name = (r.name as string) || "";
    if (a.type === "character") {
        return `角色「${name}」：${r.appearance || ""}${r.costume ? `，服装：${r.costume}` : ""}。需要角色设定图（四宫格：正脸/侧脸特写 + 正面/背面全身），纯白背景，无道具无场景。`;
    }
    if (a.type === "scene") {
        return `场景「${name}」：${r.description || ""}${r.timeOfDay ? `，时间：${r.timeOfDay}` : ""}${r.lighting ? `，光线：${r.lighting}` : ""}。全景建立镜头。`;
    }
    if (a.type === "prop") {
        return `道具「${name}」：${r.description || ""}。孤立物体，纯白背景，影棚布光，产品摄影特写。`;
    }
    return `产品「${name}」：${r.appearance || ""}${r.packaging ? `，包装：${r.packaging}` : ""}。商业产品主图，纯白背景，三点布光。`;
}

/** 项目是否含可用素材（画面描述或资产） */
function hasSourceMaterial(p: StoryboardProject): boolean {
    const hasShots = (p.scenes ?? []).some((s) => (s.shots ?? []).some((sh) => (sh.visualDescription ?? "").trim()));
    const a = p.assets;
    const assetCount = (a?.characters?.length ?? 0) + (a?.locations?.length ?? 0) + (a?.props?.length ?? 0) + (a?.products?.length ?? 0);
    return hasShots || assetCount > 0;
}

/**
 * 分镜素材面板（双栏工作台左栏）
 * 实时读取分镜项目的画面描述，按场景分组、可勾选/编辑，批量生成多平台提示词
 */
export function StoryboardSourcePanel({ config, onError, sourceStoryboardId }: Props) {
    const { message } = App.useApp();
    const { selectedPlatforms, selectedStyle, generating, setGenerating, addEntry, current, createProject } = usePromptStudioStore();

    const [projects, setProjects] = useState<StoryboardProject[]>([]);
    const [selectedId, setSelectedId] = useState<string>("");
    const [checkedShots, setCheckedShots] = useState<Set<string>>(new Set());
    const [editedDescriptions, setEditedDescriptions] = useState<Map<string, string>>(new Map());
    const [checkedAssets, setCheckedAssets] = useState<Set<string>>(new Set());
    const [editedAssetInputs, setEditedAssetInputs] = useState<Map<string, string>>(new Map());
    const [progress, setProgress] = useState({ done: 0, total: 0 });

    // 加载分镜项目列表（仅含已生成画面描述的项目）
    useEffect(() => {
        void getStoryboardRepo()
            .list()
            .then((list) => {
                const eligible = list.filter(hasSourceMaterial);
                setProjects(eligible);
                if (sourceStoryboardId && eligible.some((p) => p.id === sourceStoryboardId)) {
                    setSelectedId(sourceStoryboardId);
                } else if (eligible.length > 0 && !selectedId) {
                    setSelectedId(eligible[0].id);
                }
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceStoryboardId]);

    const project = useMemo(() => projects.find((p) => p.id === selectedId) || null, [projects, selectedId]);

    // 按场景分组的镜头
    const sceneGroups = useMemo(() => {
        if (!project) return [];
        return (project.scenes ?? [])
            .map((scene) => ({
                sceneId: scene.id,
                sceneTitle: scene.title,
                shots: (scene.shots ?? []).filter((sh) => (sh.visualDescription ?? "").trim()) as FlatShot[],
            }))
            .filter((g) => g.shots.length > 0)
            .map((g) => ({ ...g, shots: g.shots.map((sh) => ({ ...sh, sceneId: g.sceneId, sceneTitle: g.sceneTitle })) }));
    }, [project]);

    // 项目切换时默认全选
    useEffect(() => {
        if (!project) return;
        const allIds = (project.scenes ?? []).flatMap((s) => (s.shots ?? []).filter((sh) => (sh.visualDescription ?? "").trim()).map((sh) => sh.id));
        setCheckedShots(new Set(allIds));
        setEditedDescriptions(new Map());
    }, [selectedId, project]);

    // 扁平化资产（可勾选素材）
    const assetItems = useMemo<FlatAsset[]>(() => {
        const a = project?.assets;
        if (!a) return [];
        const build = (list: Record<string, unknown>[] | undefined, type: FlatAsset["type"]): FlatAsset[] =>
            (list ?? []).map((raw) => {
                const item = { id: (raw.id as string) || "", type, label: (raw.name as string) || "", input: "", raw };
                return { id: item.id, type, label: item.label, input: composeAssetInput(item) };
            });
        return [
            ...build(a.characters as Record<string, unknown>[], "character"),
            ...build(a.locations as Record<string, unknown>[], "scene"),
            ...build(a.props as Record<string, unknown>[], "prop"),
            ...build(a.products as Record<string, unknown>[], "product"),
        ];
    }, [project]);

    // 项目切换时资产默认全选
    useEffect(() => {
        setCheckedAssets(new Set(assetItems.map((it) => it.id)));
        setEditedAssetInputs(new Map());
    }, [assetItems]);

    const toggleAsset = (id: string) => {
        setCheckedAssets((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

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
        const selectedShots = allShots.filter((sh) => checkedShots.has(sh.id));
        const selectedAssets = assetItems.filter((it) => checkedAssets.has(it.id));
        const shotInputs = selectedShots.map((sh) => editedDescriptions.get(sh.id) ?? sh.visualDescription);
        const assetInputs = selectedAssets.map((it) => editedAssetInputs.get(it.id) ?? it.input);
        const inputs = [...shotInputs, ...assetInputs];
        if (inputs.length === 0) {
            message.warning("请至少勾选一个镜头或资产");
            return;
        }
        if (selectedPlatforms.length === 0) {
            message.warning("请至少选择一个目标平台");
            return;
        }
        if (!current) {
            await createProject(`提示词-${project.title}`);
        }
        const totalTasks = inputs.length * selectedPlatforms.length;
        setGenerating(true);
        setProgress({ done: 0, total: totalTasks });
        try {
            let done = 0;
            for (const platform of selectedPlatforms) {
                const results = await aiBatchGeneratePrompts(config, inputs, platform, selectedStyle || undefined, undefined, () => {});
                results.forEach((result, i) => {
                    const isAsset = i >= shotInputs.length;
                    const category = isAsset ? selectedAssets[i - shotInputs.length].type : "general";
                    addEntry({ input: inputs[i], platform, prompt: result.prompt, negativePrompt: result.negativePrompt, style: selectedStyle || undefined, category });
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
                <p className="text-xs">请先在分镜流程提取资产或完成画面描述生成</p>
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
                    options={projects.map((p) => {
                        const shotCount = (p.scenes ?? []).reduce((s, sc) => s + (sc.shots ?? []).filter((sh) => (sh.visualDescription ?? "").trim()).length, 0);
                        const a = p.assets;
                        const assetCount = (a?.characters?.length ?? 0) + (a?.locations?.length ?? 0) + (a?.props?.length ?? 0) + (a?.products?.length ?? 0);
                        return { label: `${p.title}（${shotCount} 镜头 · ${assetCount} 资产）`, value: p.id };
                    })}
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

                {/* 资产素材（可勾选/编辑，参与生成） */}
                {assetItems.length > 0 && (
                    <Collapse
                        className="mt-3"
                        size="small"
                        defaultActiveKey={["assets"]}
                        items={[
                            {
                                key: "assets",
                                label: <span className="text-xs font-medium text-stone-500">资产素材（{assetItems.length}）</span>,
                                extra: (
                                    <Button
                                        type="link"
                                        size="small"
                                        className="!text-xs"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCheckedAssets((prev) => (prev.size === assetItems.length ? new Set() : new Set(assetItems.map((it) => it.id))));
                                        }}
                                    >
                                        {checkedAssets.size === assetItems.length ? "取消全选" : "全选"}
                                    </Button>
                                ),
                                children: (
                                    <div className="space-y-2.5">
                                        {assetItems.map((it) => (
                                            <div key={it.id} className="rounded-md border border-stone-100 p-2 dark:border-stone-800">
                                                <div className="mb-1.5 flex items-center gap-2">
                                                    <Checkbox checked={checkedAssets.has(it.id)} onChange={() => toggleAsset(it.id)} />
                                                    <Tag className="m-0 scale-75" color="purple">{ASSET_TYPE_LABEL[it.type]}</Tag>
                                                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-600 dark:text-stone-300">{it.label}</span>
                                                </div>
                                                <Input.TextArea
                                                    value={editedAssetInputs.get(it.id) ?? it.input}
                                                    onChange={(e) => setEditedAssetInputs((prev) => new Map(prev).set(it.id, e.target.value))}
                                                    autoSize={{ minRows: 1, maxRows: 4 }}
                                                    className="!text-xs"
                                                    placeholder="资产描述（用于生成提示词）"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ),
                            },
                        ]}
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
                    disabled={checkedShots.size + checkedAssets.size === 0}
                    onClick={handleGenerate}
                >
                    生成选中（{checkedShots.size} 镜头 + {checkedAssets.size} 资产 × {selectedPlatforms.length} 平台）
                </Button>
                {generating && progress.total > 0 && <Progress percent={Math.round((progress.done / progress.total) * 100)} className="mt-2" size="small" format={() => `${progress.done}/${progress.total}`} />}
            </div>
        </div>
    );
}
