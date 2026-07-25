import { ArrowRight, Copy, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { App, Button, Card, Input, Progress, Tag } from "antd";
import { useNavigate } from "react-router-dom";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { aiGenerateVisualDescription, buildAssetsContext } from "@/services/storyboard-ai";
import { useCopyText } from "@/hooks/use-copy-text";
import type { AiConfig } from "@/stores/use-config-store";

export function DescriptionReview({ config, onError, onExportToPrompt }: { config: AiConfig; onError: (msg: string) => void; onExportToPrompt?: (storyboardId: string) => void }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const navigate = useNavigate();
    const { current, processing, setProcessing, updateShotDescription, confirmDescriptions, saveCurrent } = useStoryboardStore();
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [regeneratingShot, setRegeneratingShot] = useState<string | null>(null);

    if (!current) return null;
    const scenes = current.scenes;
    const allShots = scenes.flatMap((s) => s.shots.map((sh) => ({ scene: s, shot: sh })));
    const totalShots = allShots.length;
    const describedCount = allShots.filter(({ shot }) => shot.visualDescription.trim()).length;

    const handleBatchGenerate = async () => {
        setProcessing(true);
        setProgress({ done: 0, total: totalShots });
        const assetsCtx = buildAssetsContext(current.assets) || undefined;
        try {
            let done = 0;
            for (const { scene, shot } of allShots) {
                if (shot.visualDescription.trim()) {
                    done++;
                    setProgress({ done, total: totalShots });
                    continue;
                }
                const desc = await aiGenerateVisualDescription(config, shot, `${scene.title} - ${scene.summary}`, assetsCtx);
                updateShotDescription(scene.id, shot.id, desc);
                done++;
                setProgress({ done, total: totalShots });
            }
            message.success("所有画面描述已生成");
        } catch (error) {
            onError(error instanceof Error ? error.message : "画面描述生成失败");
        } finally {
            setProcessing(false);
        }
    };

    const handleConfirm = async () => {
        confirmDescriptions();
        await saveCurrent();
        message.success("分镜项目已完成！");
    };

    const handleRegenerateShot = async (sceneId: string, sceneTitle: string, sceneSummary: string, shot: { id: string; shotType: string; angle: string; action: string; mood?: string; dialogue?: string }) => {
        setRegeneratingShot(shot.id);
        try {
            const assetsCtx = buildAssetsContext(current.assets) || undefined;
            const desc = await aiGenerateVisualDescription(config, shot, `${sceneTitle} - ${sceneSummary}`, assetsCtx);
            updateShotDescription(sceneId, shot.id, desc);
            message.success("已重新生成");
        } catch (error) {
            onError(error instanceof Error ? error.message : "重新生成失败");
        } finally {
            setRegeneratingShot(null);
        }
    };

    const handleExportToPromptStudio = async () => {
        await saveCurrent();
        if (onExportToPrompt && current) {
            onExportToPrompt(current.id);
        } else {
            navigate("/studio");
        }
    };

    const handleCopyAll = () => {
        const text = allShots
            .filter(({ shot }) => shot.visualDescription.trim())
            .map(({ scene, shot }) => `[${scene.title}] ${shot.shotType}/${shot.angle} - ${shot.action}\n${shot.visualDescription}`)
            .join("\n\n");
        copyText(text, "已复制全部描述");
    };

    return (
        <div className="mx-auto max-w-5xl">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium">画面描述</h2>
                    <p className="mt-1 text-sm text-stone-500">
                        AI 为每个镜头生成视觉化描述（{describedCount}/{totalShots} 已完成）
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button icon={<Copy className="size-4" />} disabled={describedCount === 0} onClick={handleCopyAll}>
                        复制全部
                    </Button>
                    <Button icon={processing ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} loading={processing} onClick={handleBatchGenerate}>
                        批量生成描述
                    </Button>
                    <Button type="primary" disabled={describedCount === 0} onClick={handleConfirm}>
                        确认完成
                    </Button>
                </div>
            </div>

            {processing && progress.total > 0 && <Progress percent={Math.round((progress.done / progress.total) * 100)} className="mb-4" size="small" />}

            <div className="space-y-6">
                {scenes.map((scene) => (
                    <div key={scene.id}>
                        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-600 dark:text-stone-300">
                            <Tag>{scene.title}</Tag>
                            <span className="text-xs text-stone-400">{scene.shots.length} 镜头</span>
                        </h3>
                        <div className="space-y-3">
                            {scene.shots.map((shot) => (
                                <Card key={shot.id} size="small" className="group bg-stone-50 dark:bg-stone-900/50">
                                    <div className="mb-2 flex items-center gap-2 text-xs text-stone-400">
                                        <Tag color="geekblue">{shot.shotType}</Tag>
                                        <Tag>{shot.angle}</Tag>
                                        <span>{shot.action}</span>
                                        {shot.mood && <Tag color="blue">{shot.mood}</Tag>}
                                        <div className="ml-auto flex gap-1">
                                            <Button
                                                type="text"
                                                size="small"
                                                icon={<Copy className="size-3.5" />}
                                                className="opacity-0 transition group-hover:opacity-100"
                                                title="复制此镜头描述"
                                                onClick={() => copyText(shot.visualDescription, "描述已复制")}
                                                disabled={!shot.visualDescription.trim()}
                                            />
                                            <Button
                                                type="text"
                                                size="small"
                                                icon={regeneratingShot === shot.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                                                disabled={regeneratingShot === shot.id}
                                                onClick={() => handleRegenerateShot(scene.id, scene.title, scene.summary, shot)}
                                                title="重新生成此镜头描述"
                                            />
                                        </div>
                                    </div>
                                    <Input.TextArea
                                        value={shot.visualDescription}
                                        onChange={(e) => updateShotDescription(scene.id, shot.id, e.target.value)}
                                        rows={3}
                                        placeholder="画面视觉描述（点击「批量生成描述」自动填充，或手动编辑）"
                                        className="text-sm"
                                    />
                                </Card>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {current.status === "descriptions_confirmed" && (
                <div className="mt-8 flex justify-center">
                    <Button type="primary" size="large" icon={<ArrowRight className="size-4" />} iconPlacement="end" onClick={handleExportToPromptStudio}>
                        导出到提示词工作台
                    </Button>
                </div>
            )}
        </div>
    );
}
