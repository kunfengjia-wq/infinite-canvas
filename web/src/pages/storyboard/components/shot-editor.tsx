import { LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { App, Button, Card, Collapse, Input, Popconfirm, Select, Tag } from "antd";
import { nanoid } from "nanoid";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { aiGenerateShots } from "@/services/storyboard-ai";
import type { AiConfig } from "@/stores/use-config-store";
import type { Scene, Shot } from "@/types/storyboard";

const SHOT_TYPE_OPTIONS = ["远景", "全景", "中景", "近景", "特写", "大特写"];
const ANGLE_OPTIONS = ["平视", "俯视", "仰视", "斜角", "鸟瞰", "低角度"];

export function ShotEditor({ config, onError }: { config: AiConfig; onError: (msg: string) => void }) {
    const { message } = App.useApp();
    const { current, processing, setProcessing, setSceneShots, updateShot, removeShot, addShot, confirmShots, saveCurrent } = useStoryboardStore();
    const [generatingScene, setGeneratingScene] = useState<string | null>(null);

    if (!current) return null;
    const scenes = current.scenes;

    const handleAiShots = async (scene: Scene) => {
        setGeneratingScene(scene.id);
        setProcessing(true);
        try {
            const results = await aiGenerateShots(config, scene.title, scene.summary, current.script);
            const shots: Shot[] = results.map((r, i) => ({
                id: nanoid(),
                index: i,
                shotType: r.shotType,
                angle: r.angle,
                action: r.action,
                dialogue: r.dialogue || undefined,
                duration: r.duration || undefined,
                mood: r.mood || undefined,
                visualDescription: "",
                confirmed: false,
            }));
            setSceneShots(scene.id, shots);
            message.success(`「${scene.title}」已生成 ${shots.length} 个镜头`);
        } catch (error) {
            onError(error instanceof Error ? error.message : "镜头生成失败");
        } finally {
            setGeneratingScene(null);
            setProcessing(false);
        }
    };

    const handleConfirm = async () => {
        const totalShots = scenes.reduce((sum, s) => sum + s.shots.length, 0);
        if (totalShots === 0) {
            message.warning("请至少为一个场景生成镜头");
            return;
        }
        confirmShots();
        await saveCurrent();
        message.success(`已确认 ${totalShots} 个镜头，进入画面描述`);
    };

    const totalShots = scenes.reduce((sum, s) => sum + s.shots.length, 0);

    return (
        <div className="mx-auto max-w-5xl">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium">镜头细化</h2>
                    <p className="mt-1 text-sm text-stone-500">为每个场景生成分镜镜头，可逐镜头调整</p>
                </div>
                <Button type="primary" size="large" disabled={totalShots === 0} onClick={handleConfirm}>
                    确认镜头（{totalShots} 个）→ 下一步
                </Button>
            </div>

            <Collapse
                defaultActiveKey={scenes.map((s) => s.id)}
                items={scenes.map((scene) => ({
                    key: scene.id,
                    label: (
                        <div className="flex items-center gap-2">
                            <span className="font-medium">{scene.title}</span>
                            <Tag>{scene.shots.length} 镜头</Tag>
                            {scene.summary && <span className="text-xs text-stone-400">{scene.summary}</span>}
                        </div>
                    ),
                    extra: (
                        <Button
                            size="small"
                            type="link"
                            icon={generatingScene === scene.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                            onClick={(e) => {
                                e.stopPropagation();
                                void handleAiShots(scene);
                            }}
                        >
                            AI 生成镜头
                        </Button>
                    ),
                    children: (
                        <div className="space-y-3">
                            {scene.shots.map((shot) => (
                                <Card key={shot.id} size="small" className="group bg-stone-50 dark:bg-stone-900/50">
                                    <div className="flex items-start gap-3">
                                        <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded bg-stone-200 text-[10px] font-bold text-stone-500 dark:bg-stone-700">
                                            {shot.index + 1}
                                        </span>
                                        <div className="grid flex-1 gap-2 sm:grid-cols-2">
                                            <div className="flex gap-2">
                                                <Select size="small" value={shot.shotType} onChange={(v) => updateShot(scene.id, shot.id, { shotType: v })} options={SHOT_TYPE_OPTIONS.map((o) => ({ label: o, value: o }))} className="w-24" />
                                                <Select size="small" value={shot.angle} onChange={(v) => updateShot(scene.id, shot.id, { angle: v })} options={ANGLE_OPTIONS.map((o) => ({ label: o, value: o }))} className="w-24" />
                                                {shot.duration && <Tag className="self-center">{shot.duration}</Tag>}
                                                {shot.mood && <Tag color="blue" className="self-center">{shot.mood}</Tag>}
                                            </div>
                                            <Input size="small" value={shot.action} onChange={(e) => updateShot(scene.id, shot.id, { action: e.target.value })} placeholder="动作描述" />
                                            <Input size="small" value={shot.dialogue || ""} onChange={(e) => updateShot(scene.id, shot.id, { dialogue: e.target.value || undefined })} placeholder="对白（可选）" className="sm:col-span-2" />
                                        </div>
                                        <Popconfirm title="删除此镜头？" onConfirm={() => removeShot(scene.id, shot.id)} okText="删除" cancelText="取消">
                                            <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} className="opacity-0 transition group-hover:opacity-100" />
                                        </Popconfirm>
                                    </div>
                                </Card>
                            ))}
                            <Button size="small" type="dashed" icon={<Plus className="size-3.5" />} onClick={() => addShot(scene.id)} block>
                                添加镜头
                            </Button>
                        </div>
                    ),
                }))}
            />
        </div>
    );
}
