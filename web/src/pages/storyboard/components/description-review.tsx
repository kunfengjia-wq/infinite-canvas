import { Camera, Copy, LoaderCircle, RotateCcw, Send, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { App, Button, Card, Collapse, Empty, Input, Progress, Tag, Tooltip } from "antd";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { useShallow } from "zustand/react/shallow";
import { aiGenerateVisualDescription, buildAssetsContext } from "@/services/storyboard-ai";
import { useCopyText } from "@/hooks/use-copy-text";
import type { AiConfig } from "@/stores/use-config-store";
import type { Scene, Shot } from "@/types/storyboard";

export function DescriptionReview({ config, onError, onExportToPrompt }: { config: AiConfig; onError: (msg: string) => void; onExportToPrompt?: (storyboardId: string, tab?: "visual" | "storyboard" | "asset") => void }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const { current, processing, setProcessing, updateShotDescription, confirmDescriptions, saveCurrent } = useStoryboardStore(
        useShallow((s) => ({ current: s.current, processing: s.processing, setProcessing: s.setProcessing, updateShotDescription: s.updateShotDescription, confirmDescriptions: s.confirmDescriptions, saveCurrent: s.saveCurrent })),
    );
    const [generatingId, setGeneratingId] = useState<string | null>(null);
    const [batchGenerating, setBatchGenerating] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
    const [failedShots, setFailedShots] = useState<{ sceneId: string; shotId: string; action: string }[]>([]);
    const abortRef = useRef(new AbortController());

    useEffect(() => {
        return () => abortRef.current.abort();
    }, []);

    useEffect(() => {
        abortRef.current.abort();
        abortRef.current = new AbortController();
    }, [current?.id]);

    if (!current) return null;
    const scenes = current.scenes ?? [];
    const allShots = scenes.flatMap((s) => (s.shots ?? []).map((sh) => ({ scene: s, shot: sh })));
    const describedCount = allShots.filter(({ shot }) => (shot.visualDescription ?? "").trim()).length;

    const handleGenerate = async (scene: Scene, shot: Shot) => {
        setGeneratingId(shot.id);
        setProcessing(true);
        try {
            const assetsCtx = buildAssetsContext(current.assets);
            const styleHint = current.visualStyle ? `，视觉风格：${current.visualStyle}` : "";
            const sceneContext = `${scene.title} - ${scene.summary}${scene.mood ? `，氛围：${scene.mood}` : ""}${scene.colorTone ? `，色调：${scene.colorTone}` : ""}${styleHint}`;
            const description = await aiGenerateVisualDescription(
                config,
                { shotType: shot.shotType, angle: shot.angle, action: shot.action, mood: shot.mood, dialogue: shot.dialogue, cameraMovement: shot.cameraMovement, lens: shot.lens, lighting: shot.lighting },
                sceneContext,
                assetsCtx || undefined,
                undefined,
                current.visualStyle,
            );
            updateShotDescription(scene.id, shot.id, description);
        } catch (error) {
            onError(error instanceof Error ? error.message : "画面描述生成失败");
        } finally {
            setGeneratingId(null);
            setProcessing(false);
        }
    };

    const handleBatchGenerate = async () => {
        setBatchGenerating(true);
        setProcessing(true);
        setFailedShots([]);
        const assetsCtx = buildAssetsContext(current.assets);
        const styleHint = current.visualStyle ? `，视觉风格：${current.visualStyle}` : "";
        const pending = allShots.filter(({ shot }) => !shot.visualDescription.trim());
        setBatchProgress({ done: 0, total: pending.length });
        const CONCURRENCY = 3;
        let success = 0;
        const failures: { sceneId: string; shotId: string; action: string }[] = [];

        for (let i = 0; i < pending.length; i += CONCURRENCY) {
            if (abortRef.current.signal.aborted) break;
            const batch = pending.slice(i, i + CONCURRENCY);
            const results = await Promise.allSettled(
                batch.map(async ({ scene, shot }) => {
                    // 从最新 store 状态获取数据，避免使用过期的闭包引用
                    const latestCurrent = useStoryboardStore.getState().current;
                    const latestScene = latestCurrent?.scenes.find(s => s.id === scene.id);
                    const latestShot = latestScene?.shots.find(sh => sh.id === shot.id);
                    if (!latestScene || !latestShot) return { sceneId: scene.id, shotId: shot.id, description: "[已删除]" };
                    
                    const sceneContext = `${latestScene.title} - ${latestScene.summary}${latestScene.mood ? `，氛围：${latestScene.mood}` : ""}${latestScene.colorTone ? `，色调：${latestScene.colorTone}` : ""}${styleHint}`;
                    const description = await aiGenerateVisualDescription(
                        config,
                        { shotType: latestShot.shotType, angle: latestShot.angle, action: latestShot.action, mood: latestShot.mood, dialogue: latestShot.dialogue, cameraMovement: latestShot.cameraMovement, lens: latestShot.lens, lighting: latestShot.lighting },
                        sceneContext,
                        assetsCtx || undefined,
                        undefined,
                        current.visualStyle,
                    );
                    return { sceneId: scene.id, shotId: shot.id, description };
                }),
            );
            for (let j = 0; j < results.length; j++) {
                const result = results[j];
                if (result.status === "fulfilled") {
                    updateShotDescription(result.value.sceneId, result.value.shotId, result.value.description);
                    success++;
                } else {
                    const item = batch[j];
                    failures.push({ sceneId: item.scene.id, shotId: item.shot.id, action: item.shot.action });
                }
            }
            setBatchProgress({ done: Math.min(i + CONCURRENCY, pending.length), total: pending.length });
        }

        setBatchGenerating(false);
        setProcessing(false);
        setFailedShots(failures);
        if (failures.length === 0) {
            message.success(`批量生成完成，成功 ${success} 条`);
        } else {
            message.warning(`成功 ${success} 条，失败 ${failures.length} 条`);
        }
    };

    /** 重试失败的镜头 */
    const handleRetryFailed = async () => {
        if (failedShots.length === 0) return;
        setBatchGenerating(true);
        setProcessing(true);
        const assetsCtx = buildAssetsContext(current.assets);
        const styleHint = current.visualStyle ? `，视觉风格：${current.visualStyle}` : "";
        const stillFailed: typeof failedShots = [];

        for (const item of failedShots) {
            const scene = scenes.find((s) => s.id === item.sceneId);
            const shot = scene?.shots.find((sh) => sh.id === item.shotId);
            if (!scene || !shot) continue;
            try {
                const sceneContext = `${scene.title} - ${scene.summary}${scene.mood ? `，氛围：${scene.mood}` : ""}${scene.colorTone ? `，色调：${scene.colorTone}` : ""}${styleHint}`;
                const description = await aiGenerateVisualDescription(
                    config,
                    { shotType: shot.shotType, angle: shot.angle, action: shot.action, mood: shot.mood, dialogue: shot.dialogue, cameraMovement: shot.cameraMovement, lens: shot.lens, lighting: shot.lighting },
                    sceneContext,
                    assetsCtx || undefined,
                    undefined,
                    current.visualStyle,
                );
                updateShotDescription(scene.id, shot.id, description);
            } catch {
                stillFailed.push(item);
            }
        }

        setBatchGenerating(false);
        setProcessing(false);
        setFailedShots(stillFailed);
        message.success(stillFailed.length === 0 ? "重试全部成功" : `仍有 ${stillFailed.length} 条失败`);
    };

    const handleConfirm = async () => {
        if (describedCount === 0) {
            message.warning("请至少为一个镜头生成画面描述");
            return;
        }
        confirmDescriptions();
        await saveCurrent();
        message.success("画面描述已确认");
    };

    return (
        <div className="mx-auto max-w-5xl">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium">画面描述</h2>
                    <p className="mt-1 text-sm text-stone-500">AI 为每个镜头生成详细的视觉描述，可直接用于 AI 生图/生视频</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        icon={batchGenerating ? <LoaderCircle className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                        onClick={handleBatchGenerate}
                        disabled={batchGenerating || processing || allShots.length === 0}
                    >
                        {batchGenerating ? `生成中 ${batchProgress.done}/${batchProgress.total}` : "批量生成未描述镜头"}
                    </Button>
                    {failedShots.length > 0 && (
                        <Button
                            icon={<RotateCcw className="size-4" />}
                            onClick={handleRetryFailed}
                            disabled={batchGenerating || processing}
                            danger
                        >
                            重试失败（{failedShots.length}）
                        </Button>
                    )}
                    <Button type="primary" disabled={describedCount === 0} onClick={handleConfirm}>
                        确认描述（{describedCount}/{allShots.length}）
                    </Button>
                    {onExportToPrompt && (
                        <Button icon={<Send className="size-4" />} onClick={() => onExportToPrompt(current.id, "visual")} disabled={describedCount === 0}>
                            导出到提示词工作台
                        </Button>
                    )}
                </div>
            </div>

            {batchGenerating && batchProgress.total > 0 && (
                <Progress percent={Math.round((batchProgress.done / batchProgress.total) * 100)} size="small" className="mb-4" />
            )}

            {allShots.length === 0 ? (
                <Empty description="暂无镜头，请先完成镜头细化步骤" className="py-12" />
            ) : (
                <Collapse
                    defaultActiveKey={scenes.map((s) => s.id)}
                    items={scenes.map((scene) => ({
                        key: scene.id,
                        label: (
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{scene.title}</span>
                                <Tag>{scene.shots.filter((sh) => sh.visualDescription.trim()).length}/{scene.shots.length} 已描述</Tag>
                            </div>
                        ),
                        children: (
                            <div className="space-y-3">
                                {scene.shots.map((shot) => (
                                    <Card key={shot.id} size="small" className="bg-stone-50 dark:bg-stone-900/50">
                                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                                            <Tag color="blue">{shot.shotType}</Tag>
                                            <Tag>{shot.angle}</Tag>
                                            {shot.cameraMovement && <Tag color="cyan">{shot.cameraMovement}</Tag>}
                                            {shot.lighting && <Tag color="gold">{shot.lighting}</Tag>}
                                            {shot.mood && <Tag color="purple">{shot.mood}</Tag>}
                                            {shot.duration && <Tag>{shot.duration}</Tag>}
                                            <span className="ml-1 min-w-0 flex-1 truncate text-xs text-stone-500">{shot.action}</span>
                                            <div className="flex gap-1">
                                                <Tooltip title={shot.visualDescription.trim() ? "重新生成画面描述" : "AI 生成画面描述"}>
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={generatingId === shot.id ? <LoaderCircle className="size-3.5 animate-spin" /> : shot.visualDescription.trim() ? <RotateCcw className="size-3.5" /> : <Sparkles className="size-3.5" />}
                                                        disabled={generatingId === shot.id || batchGenerating}
                                                        onClick={() => handleGenerate(scene, shot)}
                                                    />
                                                </Tooltip>
                                                <Tooltip title="复制描述">
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<Copy className="size-3.5" />}
                                                        disabled={!shot.visualDescription.trim()}
                                                        onClick={() => copyText(shot.visualDescription, "画面描述已复制")}
                                                    />
                                                </Tooltip>
                                            </div>
                                        </div>
                                        {shot.dialogue && (
                                            <p className="mb-2 flex items-center gap-1 text-xs text-stone-400">
                                                <Camera className="size-3" /> 对白：{shot.dialogue}
                                            </p>
                                        )}
                                        <Input.TextArea
                                            size="small"
                                            rows={3}
                                            value={shot.visualDescription}
                                            onChange={(e) => updateShotDescription(scene.id, shot.id, e.target.value)}
                                            placeholder="点击 ✨ 生成画面描述，或手动输入..."
                                            className="text-sm"
                                        />
                                    </Card>
                                ))}
                            </div>
                        ),
                    }))}
                />
            )}
        </div>
    );
}
