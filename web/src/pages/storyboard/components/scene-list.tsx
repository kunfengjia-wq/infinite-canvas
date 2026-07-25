import { Copy, LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { App, Button, Card, Input, Popconfirm } from "antd";
import { nanoid } from "nanoid";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { aiSplitScenes } from "@/services/storyboard-ai";
import { useCopyText } from "@/hooks/use-copy-text";
import type { AiConfig } from "@/stores/use-config-store";
import type { Scene } from "@/types/storyboard";

export function SceneList({ config, onError }: { config: AiConfig; onError: (msg: string) => void }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const { current, processing, setProcessing, setScenes, updateScene, removeScene, addScene, confirmScenes, saveCurrent } = useStoryboardStore();
    const [aiOutput, setAiOutput] = useState("");

    if (!current) return null;
    const scenes = current.scenes;

    const handleAiSplit = async () => {
        setProcessing(true);
        setAiOutput("");
        try {
            const results = await aiSplitScenes(config, current.script, (delta) => setAiOutput((prev) => prev + delta));
            const newScenes: Scene[] = results.map((r, i) => ({
                id: nanoid(),
                index: i,
                title: r.title,
                summary: r.summary,
                scriptExcerpt: r.scriptExcerpt || undefined,
                shots: [],
                confirmed: false,
            }));
            setScenes(newScenes);
            message.success(`已拆分为 ${newScenes.length} 个场景`);
        } catch (error) {
            onError(error instanceof Error ? error.message : "场景拆分失败");
        } finally {
            setProcessing(false);
        }
    };

    const handleConfirm = async () => {
        if (scenes.length === 0) {
            message.warning("请先进行场景拆分");
            return;
        }
        confirmScenes();
        await saveCurrent();
        message.success("场景已确认，进入镜头细化");
    };

    return (
        <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium">场景拆分</h2>
                    <p className="mt-1 text-sm text-stone-500">AI 识别场景边界，你可以增删改后确认</p>
                </div>
                <div className="flex gap-2">
                    <Button icon={<Plus className="size-4" />} onClick={addScene}>
                        手动添加
                    </Button>
                    <Button type="primary" icon={processing ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} loading={processing} onClick={handleAiSplit}>
                        AI 拆分场景
                    </Button>
                </div>
            </div>

            {processing && aiOutput && (
                <Card size="small" className="mb-4 bg-stone-50 dark:bg-stone-900">
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-stone-500">{aiOutput}</pre>
                </Card>
            )}

            <div className="space-y-3">
                {scenes.map((scene) => (
                    <Card key={scene.id} size="small" className="group">
                        <div className="flex items-start gap-3">
                            <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-medium text-stone-500 dark:bg-stone-800">
                                {scene.index + 1}
                            </span>
                            <div className="min-w-0 flex-1 space-y-2">
                                <Input
                                    value={scene.title}
                                    onChange={(e) => updateScene(scene.id, { title: e.target.value })}
                                    className="font-medium"
                                    placeholder="场景标题"
                                />
                                <Input.TextArea
                                    value={scene.summary}
                                    onChange={(e) => updateScene(scene.id, { summary: e.target.value })}
                                    rows={2}
                                    placeholder="场景概要"
                                    className="text-sm"
                                />
                            </div>
                            <Popconfirm title="删除此场景？" onConfirm={() => removeScene(scene.id)} okText="删除" cancelText="取消">
                                <Button type="text" danger size="small" icon={<Trash2 className="size-4" />} className="opacity-0 transition group-hover:opacity-100" />
                            </Popconfirm>
                            <Button
                                type="text"
                                size="small"
                                icon={<Copy className="size-4" />}
                                className="opacity-0 transition group-hover:opacity-100"
                                title="复制场景信息"
                                onClick={() => copyText(`${scene.title}\n${scene.summary}${scene.scriptExcerpt ? `\n\n剧本片段：\n${scene.scriptExcerpt}` : ""}`, "场景已复制")}
                            />
                        </div>
                    </Card>
                ))}
            </div>

            {scenes.length === 0 && !processing && (
                <div className="py-12 text-center text-stone-400">
                    <p>点击「AI 拆分场景」自动分析，或「手动添加」</p>
                </div>
            )}

            <div className="mt-6 flex justify-end">
                <Button type="primary" size="large" disabled={scenes.length === 0} onClick={handleConfirm}>
                  确认场景（{scenes.length} 个）→ 下一步
                </Button>
            </div>
        </div>
    );
}
