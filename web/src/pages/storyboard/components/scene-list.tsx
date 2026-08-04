import { Clock, LoaderCircle, Palette, Plus, Sparkles, Trash2, Wind } from "lucide-react";
import { useState } from "react";
import { App, Button, Card, Empty, Input, Popconfirm, Select, Tag } from "antd";
import { nanoid } from "nanoid";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { useShallow } from "zustand/react/shallow";
import { aiSplitScenes } from "@/services/storyboard-ai";
import { toMoodSelectOptions } from "@/data/mood-atmosphere";
import type { AiConfig } from "@/stores/use-config-store";

export function SceneList({ config, onError }: { config: AiConfig; onError: (msg: string) => void }) {
    const { message } = App.useApp();
    const { current, processing, setProcessing, setScenes, updateScene, removeScene, addScene, confirmScenes, saveCurrent } = useStoryboardStore(
        useShallow((s) => ({ current: s.current, processing: s.processing, setProcessing: s.setProcessing, setScenes: s.setScenes, updateScene: s.updateScene, removeScene: s.removeScene, addScene: s.addScene, confirmScenes: s.confirmScenes, saveCurrent: s.saveCurrent })),
    );
    const [splitting, setSplitting] = useState(false);

    if (!current) return null;
    const scenes = current.scenes ?? [];

    const handleSplit = async () => {
        setSplitting(true);
        setProcessing(true);
        try {
            const results = await aiSplitScenes(config, current.script);
            const newScenes = results.map((r, i) => ({
                id: nanoid(),
                index: i,
                title: r.title,
                summary: r.summary,
                scriptExcerpt: r.scriptExcerpt,
                timeRange: r.timeRange || undefined,
                mood: r.mood || undefined,
                colorTone: r.colorTone || undefined,
                shots: [],
                confirmed: false,
            }));
            setScenes(newScenes);
            message.success(`已拆分为 ${newScenes.length} 个场景`);
        } catch (error) {
            onError(error instanceof Error ? error.message : "场景拆分失败");
        } finally {
            setSplitting(false);
            setProcessing(false);
        }
    };

    const handleConfirm = async () => {
        if (scenes.length === 0) {
            message.warning("请先拆分或手动添加场景");
            return;
        }
        confirmScenes();
        await saveCurrent();
        message.success(`已确认 ${scenes.length} 个场景，进入镜头细化`);
    };

    const moodOptions = toMoodSelectOptions();

    /** 将当前值动态加入选项（AI 可能输出数据库之外的自定义氛围） */
    const withMood = (current?: string) => {
        if (!current || moodOptions.some((o) => o.value === current)) return moodOptions;
        return [{ label: current, value: current }, ...moodOptions];
    };

    return (
        <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium">场景拆分</h2>
                    <p className="mt-1 text-sm text-stone-500">AI 将剧本拆分为独立场景，标注时间范围、氛围和色调</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        icon={splitting ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                        onClick={handleSplit}
                        disabled={splitting || processing}
                    >
                        {splitting ? "AI 拆分中..." : "AI 拆分场景"}
                    </Button>
                    <Button type="primary" disabled={scenes.length === 0} onClick={handleConfirm}>
                        确认场景（{scenes.length} 个）→ 下一步
                    </Button>
                </div>
            </div>

            {scenes.length === 0 ? (
                <Empty description="暂无场景，点击「AI 拆分场景」自动拆分" className="py-12" />
            ) : (
                <div className="space-y-4">
                    {scenes.map((scene) => (
                        <Card
                            key={scene.id}
                            size="small"
                            className="group bg-stone-50 dark:bg-stone-900/50"
                            title={
                                <div className="flex items-center gap-2">
                                    <Tag color="blue">第{scene.index + 1}场</Tag>
                                    <Input
                                        size="small"
                                        variant="borderless"
                                        value={scene.title}
                                        onChange={(e) => updateScene(scene.id, { title: e.target.value })}
                                        className="max-w-60 font-medium"
                                    />
                                    {scene.mood && <Tag color="purple">{scene.mood}</Tag>}
                                </div>
                            }
                            extra={
                                <Popconfirm title="删除此场景？" onConfirm={() => removeScene(scene.id)} okText="删除" cancelText="取消">
                                    <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} className="opacity-0 transition group-hover:opacity-100" />
                                </Popconfirm>
                            }
                        >
                            <div className="space-y-2">
                                <Input.TextArea
                                    size="small"
                                    rows={2}
                                    value={scene.summary}
                                    onChange={(e) => updateScene(scene.id, { summary: e.target.value })}
                                    placeholder="场景概要"
                                />
                                {/* 时间范围 / 氛围 / 色调 */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <Input
                                        size="small"
                                        value={scene.timeRange || ""}
                                        onChange={(e) => useStoryboardStore.getState().setScenes(scenes.map((s) => (s.id === scene.id ? { ...s, timeRange: e.target.value || undefined } : s)))}
                                        placeholder="时间范围 如 00:00-00:25"
                                        prefix={<Clock className="size-3 text-stone-400" />}
                                        className="!w-44"
                                    />
                                    <Select
                                        size="small"
                                        value={scene.mood || undefined}
                                        onChange={(v) => useStoryboardStore.getState().setScenes(scenes.map((s) => (s.id === scene.id ? { ...s, mood: v || undefined } : s)))}
                                        options={withMood(scene.mood)}
                                        placeholder="氛围"
                                        allowClear
                                        showSearch
                                        suffixIcon={<Wind className="size-3 text-stone-400" />}
                                        className="!w-32"
                                    />
                                    <Input
                                        size="small"
                                        value={scene.colorTone || ""}
                                        onChange={(e) => useStoryboardStore.getState().setScenes(scenes.map((s) => (s.id === scene.id ? { ...s, colorTone: e.target.value || undefined } : s)))}
                                        placeholder="色调 如 暖金色调"
                                        prefix={<Palette className="size-3 text-stone-400" />}
                                        className="!w-40"
                                    />
                                    {scene.shots.length > 0 && <Tag>{scene.shots.length} 镜头</Tag>}
                                </div>
                                {scene.scriptExcerpt && (
                                    <details className="text-xs text-stone-400">
                                        <summary className="cursor-pointer select-none hover:text-stone-500">查看对应剧本片段</summary>
                                        <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-stone-100 p-2 font-sans dark:bg-stone-800">{scene.scriptExcerpt}</pre>
                                    </details>
                                )}
                            </div>
                        </Card>
                    ))}
                    <Button type="dashed" icon={<Plus className="size-4" />} onClick={addScene} block>
                        添加场景
                    </Button>
                </div>
            )}
        </div>
    );
}
