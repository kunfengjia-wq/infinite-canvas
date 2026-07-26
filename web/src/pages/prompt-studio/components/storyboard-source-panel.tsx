import { Clapperboard, LoaderCircle, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { App, Button, Checkbox, Collapse, Input, Progress, Select, Tag } from "antd";

import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { aiBatchGeneratePrompts } from "@/services/prompt-studio-ai";
import { getStoryboardRepo } from "@/services/db";
import type { AiConfig } from "@/stores/use-config-store";
import type { Shot, StoryboardProject } from "@/types/storyboard";
import type { PromptCategory } from "@/types/prompt-studio";
import { PLATFORM_LIST } from "@/types/prompt-studio";

type Props = {
    config: AiConfig;
    onError: (msg: string) => void;
    sourceStoryboardId?: string | null;
    sourceTab?: "visual" | "storyboard" | "asset";
};

type FlatShot = Shot & { sceneId: string; sceneTitle: string };

type FlatAsset = { id: string; type: "character" | "scene" | "prop" | "product"; label: string; raw: Record<string, unknown> };

const ASSET_TYPE_LABEL: Record<FlatAsset["type"], string> = { character: "角色", scene: "场景", prop: "道具", product: "产品" };

/** 视图模板：每类资产可选的出图格式（intent 注入生成输入，非预生成成品） */
type AssetTemplate = { value: string; label: string; intent: string };
const ASSET_TEMPLATES: Record<FlatAsset["type"], AssetTemplate[]> = {
    character: [
        { value: "four-panel", label: "四宫格（面部+全身）", intent: "角色设定图，2x2 四宫格：左上正脸特写、右上侧脸特写、左下正面全身、右下背面全身，纯白背景，无道具无场景" },
        { value: "three-view", label: "三视图（正/侧/背）", intent: "角色三视图：正面、侧面、背面三个对齐全身视图，T-pose，纯白背景，无道具无场景" },
        { value: "four-view", label: "四视图（正/侧/3/4/背）", intent: "角色 turnaround 四视图：正面、3/4、侧面、背面对齐全身，纯白背景，无道具无场景" },
        { value: "bust", label: "半身特写", intent: "角色半身特写肖像，头肩构图，精细面部细节，干净中性背景" },
        { value: "fullbody", label: "全身单张", intent: "角色全身概念图，单一动态姿势，头到脚完整呈现，干净背景" },
    ],
    scene: [
        { value: "wide", label: "全景（建立镜头）", intent: "全景建立镜头，完整环境，电影化构图，体现纵深与规模" },
        { value: "medium", label: "中景", intent: "中景，关键环境细节聚焦，前景背景均衡，自然景深" },
        { value: "detail", label: "细节特写", intent: "细节特写，强调材质纹理，浅景深，微距感" },
    ],
    prop: [
        { value: "single", label: "单物体（白底）", intent: "孤立物体，纯白背景，柔和影棚布光，产品摄影特写，无环境" },
        { value: "multi-angle", label: "多角度展示", intent: "多角度展示：正/侧/顶视图排列于白底，一致影棚布光" },
        { value: "in-context", label: "场景搭配", intent: "置于真实场景的生活化镜头，自然光" },
    ],
    product: [
        { value: "hero", label: "主图（商业广告级）", intent: "商业产品主图，纯白背景，三点布光，主视角，广告级品质" },
        { value: "multi-angle", label: "多角度", intent: "产品多角度，360 度视图于白底，电商目录风格" },
        { value: "lifestyle", label: "场景生活化", intent: "生活化品牌摄影，真实场景，自然暖光，高级品牌感" },
    ],
};
const DEFAULT_TEMPLATE: Record<FlatAsset["type"], string> = { character: "four-panel", scene: "wide", prop: "single", product: "hero" };

/** 将资产组装为自然语言描述（按所选视图模板注入格式意图），作为提示词生成的输入 */
function composeAssetInput(type: FlatAsset["type"], raw: Record<string, unknown>, templateValue: string): string {
    const name = (raw.name as string) || "";
    const tpl = ASSET_TEMPLATES[type].find((t) => t.value === templateValue) ?? ASSET_TEMPLATES[type][0];
    if (type === "character") {
        return `角色「${name}」：${raw.appearance || ""}${raw.costume ? `，服装：${raw.costume}` : ""}。${tpl.intent}。`;
    }
    if (type === "scene") {
        return `场景「${name}」：${raw.description || ""}${raw.timeOfDay ? `，时间：${raw.timeOfDay}` : ""}${raw.lighting ? `，光线：${raw.lighting}` : ""}。${tpl.intent}。`;
    }
    if (type === "prop") {
        return `道具「${name}」：${raw.description || ""}。${tpl.intent}。`;
    }
    return `产品「${name}」：${raw.appearance || ""}${raw.packaging ? `，包装：${raw.packaging}` : ""}。${tpl.intent}。`;
}

/** 扫描镜头文本，匹配其中出现的资产名，组装「镜头 · 角色：xx · 道具：xx」标注（确定性、不依赖 AI） */
function describeShotAssets(text: string, assets: StoryboardProject["assets"]): string {
    const groups: string[] = [];
    const scan = (list: { name: string }[] | undefined, typeLabel: string) => {
        const names = (list ?? []).map((a) => a.name.trim()).filter((name) => name && text.includes(name));
        if (names.length > 0) groups.push(`${typeLabel}：${names.join("、")}`);
    };
    scan(assets?.characters, "角色");
    scan(assets?.locations, "场景");
    scan(assets?.props, "道具");
    scan(assets?.products, "产品");
    return groups.length > 0 ? `镜头 · ${groups.join(" · ")}` : "镜头";
}

/** 镜头是否含可用内容（画面描述 / 动作 / 对白 任一非空） */
function shotHasContent(sh: Shot): boolean {
    return Boolean((sh.visualDescription ?? "").trim() || (sh.action ?? "").trim() || (sh.dialogue ?? "").trim());
}

/**
 * 将完整分镜行组装为自然语言描述（景别/角度/运镜/光线/构图/动作/对白/时长/氛围/转场/画面），
 * 作为视频提示词生成的输入
 */
function composeShotInput(sh: Shot): string {
    const parts: string[] = [];
    const lensTags = [sh.shotType, sh.angle, sh.cameraMovement, sh.lens, sh.lighting, sh.composition].filter((v) => v && v.trim());
    if (lensTags.length > 0) parts.push(`镜头：${lensTags.join("，")}`);
    const action = (sh.action ?? "").trim();
    if (action) parts.push(`动作：${action}`);
    const dialogue = (sh.dialogue ?? "").trim();
    if (dialogue) parts.push(`对白：${dialogue}`);
    const duration = (sh.duration ?? "").trim();
    if (duration) parts.push(`时长：${duration}`);
    const mood = (sh.mood ?? "").trim();
    if (mood) parts.push(`氛围：${mood}`);
    const transition = (sh.transition ?? "").trim();
    if (transition) parts.push(`转场：${transition}`);
    const visual = (sh.visualDescription ?? "").trim();
    if (visual) parts.push(`场景：${visual}`);
    return parts.join("\n");
}

/** 项目是否含可用素材 */
function hasSourceMaterial(p: StoryboardProject): boolean {
    const hasShots = (p.scenes ?? []).some((s) => (s.shots ?? []).some(shotHasContent));
    const a = p.assets;
    const assetCount = (a?.characters?.length ?? 0) + (a?.locations?.length ?? 0) + (a?.props?.length ?? 0) + (a?.products?.length ?? 0);
    return hasShots || assetCount > 0;
}

/** 通用场景分组构建 */
function buildGroups(project: StoryboardProject | null, filter: (sh: Shot) => boolean) {
    if (!project) return [];
    return (project.scenes ?? [])
        .map((scene) => ({
            sceneId: scene.id,
            sceneTitle: scene.title,
            shots: (scene.shots ?? []).filter(filter) as FlatShot[],
        }))
        .filter((g) => g.shots.length > 0)
        .map((g) => ({ ...g, shots: g.shots.map((sh) => ({ ...sh, sceneId: g.sceneId, sceneTitle: g.sceneTitle })) }));
}

/**
 * 分镜素材面板（双栏工作台左栏）
 * 三个独立分类：画面描述（图片）、全局分镜表（视频）、资产素材（通用）
 */
export function StoryboardSourcePanel({ config, onError, sourceStoryboardId, sourceTab }: Props) {
    const { message } = App.useApp();
    const { selectedPlatforms, selectedStyles, customStyle, generating, setGenerating, addEntry, current, createProject } = usePromptStudioStore();

    const [projects, setProjects] = useState<StoryboardProject[]>([]);
    const [selectedId, setSelectedId] = useState<string>("");

    // ─── 画面描述勾选（图片） ───
    const [checkedVisualShots, setCheckedVisualShots] = useState<Set<string>>(new Set());
    const [editedDescriptions, setEditedDescriptions] = useState<Map<string, string>>(new Map());

    // ─── 全局分镜表勾选（视频） ───
    const [checkedStoryboardShots, setCheckedStoryboardShots] = useState<Set<string>>(new Set());

    // ─── 资产勾选（通用） ───
    const [checkedAssets, setCheckedAssets] = useState<Set<string>>(new Set());
    const [editedAssetInputs, setEditedAssetInputs] = useState<Map<string, string>>(new Map());
    const [assetTemplates, setAssetTemplates] = useState<Map<string, string>>(new Map());

    const [progress, setProgress] = useState({ done: 0, total: 0 });

    // 加载分镜项目列表
    useEffect(() => {
        void getStoryboardRepo()
            .list()
            .then((list) => {
                // 如果有 sourceStoryboardId 但不在 hasSourceMaterial 过滤结果中，强制加入
                let eligible = list.filter(hasSourceMaterial);
                if (sourceStoryboardId && !eligible.some((p) => p.id === sourceStoryboardId)) {
                    const forced = list.find((p) => p.id === sourceStoryboardId);
                    if (forced) eligible = [forced, ...eligible];
                }
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

    // ─── 画面描述组：仅有 visualDescription 的镜头（用于图片生成） ───
    const visualGroups = useMemo(
        () => buildGroups(project, (sh) => Boolean((sh.visualDescription ?? "").trim())),
        [project],
    );

    // ─── 全局分镜表组：有任意内容的镜头（用于视频生成） ───
    const storyboardGroups = useMemo(
        () => buildGroups(project, shotHasContent),
        [project],
    );

    // 项目切换时默认全选
    useEffect(() => {
        if (!project) return;
        const visualIds = (project.scenes ?? []).flatMap((s) => (s.shots ?? []).filter((sh) => (sh.visualDescription ?? "").trim()).map((sh) => sh.id));
        const storyboardIds = (project.scenes ?? []).flatMap((s) => (s.shots ?? []).filter(shotHasContent).map((sh) => sh.id));
        setCheckedVisualShots(new Set(visualIds));
        setCheckedStoryboardShots(new Set(storyboardIds));
        setEditedDescriptions(new Map());
    }, [selectedId, project]);

    // 扁平化资产
    const assetItems = useMemo<FlatAsset[]>(() => {
        const a = project?.assets;
        if (!a) return [];
        const build = (list: Record<string, unknown>[] | undefined, type: FlatAsset["type"]): FlatAsset[] =>
            (list ?? []).map((raw) => ({ id: (raw.id as string) || "", type, label: (raw.name as string) || "", raw }));
        return [
            ...build(a.characters as Record<string, unknown>[], "character"),
            ...build(a.locations as Record<string, unknown>[], "scene"),
            ...build(a.props as Record<string, unknown>[], "prop"),
            ...build(a.products as Record<string, unknown>[], "product"),
        ];
    }, [project]);

    useEffect(() => {
        setCheckedAssets(new Set(assetItems.map((it) => it.id)));
        setEditedAssetInputs(new Map());
        setAssetTemplates(new Map());
    }, [assetItems]);

    /** 资产当前输入 */
    const getAssetInput = (it: FlatAsset): string => {
        const edited = editedAssetInputs.get(it.id);
        if (edited !== undefined) return edited;
        return composeAssetInput(it.type, it.raw, assetTemplates.get(it.id) ?? DEFAULT_TEMPLATE[it.type]);
    };

    const changeTemplate = (id: string, value: string) => {
        setAssetTemplates((prev) => new Map(prev).set(id, value));
        setEditedAssetInputs((prev) => { const next = new Map(prev); next.delete(id); return next; });
    };

    const toggleAsset = (id: string) => {
        setCheckedAssets((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    };

    // ─── 画面描述勾选操作 ───
    const toggleVisualShot = (shotId: string) => {
        setCheckedVisualShots((prev) => { const next = new Set(prev); if (next.has(shotId)) next.delete(shotId); else next.add(shotId); return next; });
    };
    const toggleVisualScene = (sceneId: string) => {
        const group = visualGroups.find((g) => g.sceneId === sceneId);
        if (!group) return;
        setCheckedVisualShots((prev) => {
            const next = new Set(prev);
            const allChecked = group.shots.every((sh) => next.has(sh.id));
            group.shots.forEach((sh) => { if (allChecked) next.delete(sh.id); else next.add(sh.id); });
            return next;
        });
    };

    // ─── 全局分镜表勾选操作 ───
    const toggleStoryboardShot = (shotId: string) => {
        setCheckedStoryboardShots((prev) => { const next = new Set(prev); if (next.has(shotId)) next.delete(shotId); else next.add(shotId); return next; });
    };
    const toggleStoryboardScene = (sceneId: string) => {
        const group = storyboardGroups.find((g) => g.sceneId === sceneId);
        if (!group) return;
        setCheckedStoryboardShots((prev) => {
            const next = new Set(prev);
            const allChecked = group.shots.every((sh) => next.has(sh.id));
            group.shots.forEach((sh) => { if (allChecked) next.delete(sh.id); else next.add(sh.id); });
            return next;
        });
    };

    // ─── 生成逻辑：按平台类型路由 ───
    const handleGenerate = async () => {
        if (!project) return;

        const imagePlatforms = selectedPlatforms.filter((id) => PLATFORM_LIST.find((p) => p.id === id)?.category === "image");
        const videoPlatforms = selectedPlatforms.filter((id) => PLATFORM_LIST.find((p) => p.id === id)?.category === "video");

        // 画面描述输入
        const visualShots = visualGroups.flatMap((g) => g.shots).filter((sh) => checkedVisualShots.has(sh.id));
        const visualInputs = visualShots.map((sh) => editedDescriptions.get(sh.id) ?? sh.visualDescription);

        // 全局分镜表输入
        const storyboardShots = storyboardGroups.flatMap((g) => g.shots).filter((sh) => checkedStoryboardShots.has(sh.id));
        const storyboardInputs = storyboardShots.map((sh) => composeShotInput(sh));

        // 资产输入
        const selectedAssets = assetItems.filter((it) => checkedAssets.has(it.id));
        const assetInputs = selectedAssets.map(getAssetInput);

        // 画面描述和分镜表均可送图片/视频平台
        const allShotInputs = [...visualInputs, ...storyboardInputs, ...assetInputs];
        const imageInputs = allShotInputs;
        const videoInputs = allShotInputs;

        // 检查是否有内容
        const hasImageContent = imagePlatforms.length > 0 && imageInputs.length > 0;
        const hasVideoContent = videoPlatforms.length > 0 && videoInputs.length > 0;
        if (!hasImageContent && !hasVideoContent) {
            message.warning("请勾选镜头/资产并选择对应平台");
            return;
        }

        if (!current) {
            await createProject(`提示词-${project.title}`);
        }

        const totalTasks = (hasImageContent ? imageInputs.length * imagePlatforms.length : 0) + (hasVideoContent ? videoInputs.length * videoPlatforms.length : 0);
        setGenerating(true);
        setProgress({ done: 0, total: totalTasks });

        try {
            let done = 0;

            // 图片平台生成
            if (hasImageContent) {
                for (const platform of imagePlatforms) {
                    const results = await aiBatchGeneratePrompts(config, imageInputs, platform, selectedStyles.length > 0 ? selectedStyles : undefined, customStyle || undefined, undefined, () => {});
                    results.forEach((result, i) => {
                        let category: PromptCategory;
                        let assetRef: string;
                        if (i < visualInputs.length) {
                            category = "general";
                            const shot = visualShots[i];
                            assetRef = describeShotAssets(shot?.visualDescription ?? "", project.assets);
                        } else if (i < visualInputs.length + storyboardInputs.length) {
                            category = "general";
                            const shot = storyboardShots[i - visualInputs.length];
                            const searchText = `${shot?.action ?? ""} ${shot?.dialogue ?? ""}`;
                            assetRef = describeShotAssets(searchText, project.assets);
                        } else {
                            const asset = selectedAssets[i - visualInputs.length - storyboardInputs.length];
                            category = asset.type;
                            assetRef = `${ASSET_TYPE_LABEL[asset.type]}：${asset.label}`;
                        }
                        addEntry({ input: imageInputs[i], platform, prompt: result.prompt, negativePrompt: result.negativePrompt, translation: result.translation, styles: selectedStyles.length > 0 ? selectedStyles : undefined, customStyle: customStyle || undefined, category, assetRef });
                    });
                    done += results.length;
                    setProgress({ done, total: totalTasks });
                }
            }

            // 视频平台生成
            if (hasVideoContent) {
                for (const platform of videoPlatforms) {
                    const results = await aiBatchGeneratePrompts(config, videoInputs, platform, selectedStyles.length > 0 ? selectedStyles : undefined, customStyle || undefined, undefined, () => {});
                    results.forEach((result, i) => {
                        let category: PromptCategory;
                        let assetRef: string;
                        if (i < visualInputs.length) {
                            category = "general";
                            const shot = visualShots[i];
                            assetRef = describeShotAssets(shot?.visualDescription ?? "", project.assets);
                        } else if (i < visualInputs.length + storyboardInputs.length) {
                            category = "general";
                            const shot = storyboardShots[i - visualInputs.length];
                            const searchText = `${shot?.action ?? ""} ${shot?.dialogue ?? ""}`;
                            assetRef = describeShotAssets(searchText, project.assets);
                        } else {
                            const asset = selectedAssets[i - visualInputs.length - storyboardInputs.length];
                            category = asset.type;
                            assetRef = `${ASSET_TYPE_LABEL[asset.type]}：${asset.label}`;
                        }
                        addEntry({ input: videoInputs[i], platform, prompt: result.prompt, negativePrompt: result.negativePrompt, translation: result.translation, styles: selectedStyles.length > 0 ? selectedStyles : undefined, customStyle: customStyle || undefined, category, assetRef });
                    });
                    done += results.length;
                    setProgress({ done, total: totalTasks });
                }
            }

            await usePromptStudioStore.getState().saveCurrent();
            message.success(`已生成 ${done} 条提示词`);
        } catch (error) {
            onError(error instanceof Error ? error.message : "批量生成失败");
        } finally {
            setGenerating(false);
        }
    };

    const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await getStoryboardRepo().remove(id);
        setProjects((prev) => {
            const next = prev.filter((p) => p.id !== id);
            if (selectedId === id) setSelectedId(next[0]?.id ?? "");
            return next;
        });
        message.success("已删除");
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
                    optionRender={(option) => (
                        <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate">{option.label as string}</span>
                            <button
                                className="shrink-0 rounded p-0.5 text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                                onClick={(e) => handleDeleteProject(option.value as string, e)}
                                title="删除此项目"
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        </div>
                    )}
                    options={projects.map((p) => {
                        const visualCount = (p.scenes ?? []).reduce((s, sc) => s + (sc.shots ?? []).filter((sh) => (sh.visualDescription ?? "").trim()).length, 0);
                        const storyboardCount = (p.scenes ?? []).reduce((s, sc) => s + (sc.shots ?? []).filter(shotHasContent).length, 0);
                        const a = p.assets;
                        const assetCount = (a?.characters?.length ?? 0) + (a?.locations?.length ?? 0) + (a?.props?.length ?? 0) + (a?.products?.length ?? 0);
                        return { label: `${p.title}（画面${visualCount} · 分镜${storyboardCount} · 资产${assetCount}）`, value: p.id };
                    })}
                />
            </div>

            {/* 三个分类（可滚动） */}
            <div className="min-h-0 flex-1 overflow-y-auto space-y-3">

                {/* ═══ 分类一：画面描述（用于图片生成） ═══ */}
                {visualGroups.length > 0 && (
                    <div>
                        <div className="mb-1 flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">画面描述</span>
                            <span className="text-[10px] text-stone-400">→ 图片提示词</span>
                        </div>
                    <Collapse
                        key={`visual-${selectedId}`}
                        defaultActiveKey={(!sourceTab || sourceTab === "visual") ? visualGroups.map((g) => g.sceneId) : []}
                        size="small"
                        items={visualGroups.map((group) => ({
                            key: group.sceneId,
                            label: (
                                <span className="text-xs font-medium">
                                    {group.sceneTitle}
                                    <Tag className="ml-2 scale-90" color="blue">{group.shots.length} 镜头</Tag>
                                </span>
                            ),
                            extra: (
                                <Button type="link" size="small" className="!text-xs" onClick={(e) => { e.stopPropagation(); toggleVisualScene(group.sceneId); }}>
                                    {group.shots.every((sh) => checkedVisualShots.has(sh.id)) ? "取消全选" : "全选"}
                                </Button>
                            ),
                            children: (
                                <div className="space-y-2.5">
                                    {group.shots.map((shot, idx) => (
                                        <div key={shot.id} className="rounded-md border border-stone-100 p-2 dark:border-stone-800">
                                            <div className="mb-1.5 flex items-center gap-2">
                                                <Checkbox checked={checkedVisualShots.has(shot.id)} onChange={() => toggleVisualShot(shot.id)} />
                                                <span className="text-[10px] font-bold text-stone-400">#{idx + 1}</span>
                                                <Tag className="m-0 scale-75">{shot.shotType}</Tag>
                                                <Tag className="m-0 scale-75" color="geekblue">{shot.angle}</Tag>
                                                <span className="min-w-0 flex-1 truncate text-xs text-stone-500">{shot.action}</span>
                                            </div>
                                            <Input.TextArea
                                                value={editedDescriptions.get(shot.id) ?? shot.visualDescription}
                                                onChange={(e) => setEditedDescriptions((prev) => new Map(prev).set(shot.id, e.target.value))}
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
                    </div>
                )}

                {/* ═══ 分类二：全局分镜表（用于视频生成） ═══ */}
                {storyboardGroups.length > 0 && (
                    <div>
                        <div className="mb-1 flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">全局分镜表</span>
                            <span className="text-[10px] text-stone-400">→ 视频提示词</span>
                        </div>
                    <Collapse
                        key={`storyboard-${selectedId}`}
                        defaultActiveKey={(!sourceTab || sourceTab === "storyboard") ? storyboardGroups.map((g) => g.sceneId) : []}
                        size="small"
                        items={storyboardGroups.map((group) => ({
                            key: group.sceneId,
                            label: (
                                <span className="text-xs font-medium">
                                    {group.sceneTitle}
                                    <Tag className="ml-2 scale-90" color="purple">{group.shots.length} 镜头</Tag>
                                </span>
                            ),
                            extra: (
                                <Button type="link" size="small" className="!text-xs" onClick={(e) => { e.stopPropagation(); toggleStoryboardScene(group.sceneId); }}>
                                    {group.shots.every((sh) => checkedStoryboardShots.has(sh.id)) ? "取消全选" : "全选"}
                                </Button>
                            ),
                            children: (
                                <div className="space-y-2.5">
                                    {group.shots.map((shot, idx) => (
                                        <div key={shot.id} className="rounded-md border border-stone-100 p-2 dark:border-stone-800">
                                            {/* 勾选 + 序号 + 景别 + 角度 + 时长 + 氛围 */}
                                            <div className="mb-1 flex items-center gap-1.5">
                                                <Checkbox checked={checkedStoryboardShots.has(shot.id)} onChange={() => toggleStoryboardShot(shot.id)} />
                                                <span className="text-[10px] font-bold text-stone-400">#{idx + 1}</span>
                                                <Tag className="m-0 scale-75">{shot.shotType}</Tag>
                                                <Tag className="m-0 scale-75" color="geekblue">{shot.angle}</Tag>
                                                {shot.duration && <Tag className="m-0 scale-75" color="orange">{shot.duration}</Tag>}
                                                {shot.mood && <Tag className="m-0 scale-75" color="blue">{shot.mood}</Tag>}
                                            </div>
                                            {/* 镜头语言 */}
                                            {(shot.cameraMovement || shot.lens || shot.lighting || shot.composition || shot.transition) && (
                                                <div className="mb-1 flex flex-wrap gap-1">
                                                    {shot.cameraMovement && <Tag className="m-0 scale-75" color="cyan">{shot.cameraMovement}</Tag>}
                                                    {shot.lens && <Tag className="m-0 scale-75" color="green">{shot.lens}</Tag>}
                                                    {shot.lighting && <Tag className="m-0 scale-75" color="gold">{shot.lighting}</Tag>}
                                                    {shot.composition && <Tag className="m-0 scale-75" color="purple">{shot.composition}</Tag>}
                                                    {shot.transition && <Tag className="m-0 scale-75" color="volcano">→{shot.transition}</Tag>}
                                                </div>
                                            )}
                                            {/* 动作 */}
                                            <div className="text-xs text-stone-600 dark:text-stone-300">
                                                <span className="mr-1 text-[10px] font-medium text-stone-400">动作</span>{shot.action}
                                            </div>
                                            {/* 对白 */}
                                            {shot.dialogue && (
                                                <div className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                                                    <span className="mr-1 text-[10px] font-medium text-stone-400">对白</span>{shot.dialogue}
                                                </div>
                                            )}
                                            {/* 画面描述 */}
                                            {shot.visualDescription && (
                                                <div className="mt-1 border-t border-stone-100 pt-1 text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">
                                                    <span className="mr-1 text-[10px] font-medium text-stone-400">画面</span>{shot.visualDescription}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ),
                        }))}
                    />
                    </div>
                )}

                {/* ═══ 分类三：资产素材（图片+视频通用） ═══ */}
                {assetItems.length > 0 && (
                    <Collapse
                        size="small"
                        defaultActiveKey={(!sourceTab || sourceTab === "asset") ? ["assets"] : []}
                        items={[{
                            key: "assets",
                            label: <span className="text-xs font-medium text-stone-500">资产素材（{assetItems.length}）</span>,
                            extra: (
                                <Button type="link" size="small" className="!text-xs" onClick={(e) => { e.stopPropagation(); setCheckedAssets((prev) => (prev.size === assetItems.length ? new Set() : new Set(assetItems.map((it) => it.id)))); }}>
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
                                            <div className="mb-1.5 flex items-center gap-2">
                                                <span className="shrink-0 text-[10px] text-stone-400">视图模板</span>
                                                <Select size="small" value={assetTemplates.get(it.id) ?? DEFAULT_TEMPLATE[it.type]} onChange={(v) => changeTemplate(it.id, v)} options={ASSET_TEMPLATES[it.type].map((t) => ({ value: t.value, label: t.label }))} className="!w-44" popupMatchSelectWidth={false} />
                                            </div>
                                            <Input.TextArea value={getAssetInput(it)} onChange={(e) => setEditedAssetInputs((prev) => new Map(prev).set(it.id, e.target.value))} autoSize={{ minRows: 1, maxRows: 4 }} className="!text-xs" placeholder="资产描述（用于生成提示词）" />
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
                    disabled={checkedVisualShots.size + checkedStoryboardShots.size + checkedAssets.size === 0}
                    onClick={handleGenerate}
                >
                    生成选中（画面 {checkedVisualShots.size} + 分镜 {checkedStoryboardShots.size} + 资产 {checkedAssets.size} × {selectedPlatforms.length} 平台）
                </Button>
                {generating && progress.total > 0 && <Progress percent={Math.round((progress.done / progress.total) * 100)} className="mt-2" size="small" format={() => `${progress.done}/${progress.total}`} />}
            </div>
        </div>
    );
}
