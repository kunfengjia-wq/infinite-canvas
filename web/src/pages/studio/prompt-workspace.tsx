import { useEffect, useState } from "react";
import { App } from "antd";

import type { AiConfig } from "@/stores/use-config-store";
import { getStoryboardRepo } from "@/services/db";
import { InputPanel } from "@/pages/prompt-studio/components/input-panel";
import { PlatformSelector } from "@/pages/prompt-studio/components/platform-selector";
import { PromptResult } from "@/pages/prompt-studio/components/prompt-result";
import { StoryboardSourcePanel } from "@/pages/prompt-studio/components/storyboard-source-panel";
import { StylePresets } from "@/pages/prompt-studio/components/style-presets";
import { ExportBar } from "@/pages/prompt-studio/components/export-bar";

export function PromptWorkspace({ config, sourceStoryboardId }: { config: AiConfig; sourceStoryboardId?: string | null }) {
    const { message } = App.useApp();
    const [hasStoryboard, setHasStoryboard] = useState(Boolean(sourceStoryboardId));

    // 检测是否有可用分镜项目
    useEffect(() => {
        if (sourceStoryboardId) {
            setHasStoryboard(true);
            return;
        }
        void getStoryboardRepo().list().then((projects) => {
            setHasStoryboard(projects.some((p) => p.scenes.some((s) => s.shots.some((sh) => sh.visualDescription.trim()))));
        });
    }, [sourceStoryboardId]);

    // ─── 双栏模式：有分镜数据 ───
    if (hasStoryboard) {
        return (
            <div className="flex h-full flex-col overflow-hidden">
                {/* 顶部紧凑工具条 */}
                <div className="shrink-0 space-y-1.5 border-b border-stone-100 px-4 py-2.5 dark:border-stone-800">
                    <PlatformSelector compact />
                    <StylePresets compact />
                </div>

                {/* 双栏主体 */}
                <div className="flex min-h-0 flex-1 overflow-hidden">
                    {/* 左栏：分镜素材 */}
                    <div className="w-[44%] min-w-[340px] overflow-hidden border-r border-stone-100 p-3 dark:border-stone-800">
                        <StoryboardSourcePanel config={config} onError={(msg) => message.error(msg)} sourceStoryboardId={sourceStoryboardId} />
                    </div>
                    {/* 右栏：提示词工作区 */}
                    <div className="flex-1 space-y-5 overflow-y-auto p-4">
                        <InputPanel config={config} onError={(msg) => message.error(msg)} collapsible />
                        <PromptResult config={config} onError={(msg) => message.error(msg)} />
                    </div>
                </div>

                {/* 底部导出栏 */}
                <div className="shrink-0 border-t border-stone-100 px-4 py-2 dark:border-stone-800">
                    <ExportBar />
                </div>
            </div>
        );
    }

    // ─── 单列模式：无分镜数据 ───
    return (
        <div className="h-full overflow-y-auto p-4">
            <div className="mx-auto max-w-5xl space-y-5">
                <PlatformSelector />
                <StylePresets />
                <InputPanel config={config} onError={(msg) => message.error(msg)} />
                <PromptResult config={config} onError={(msg) => message.error(msg)} />
                <ExportBar />
            </div>
        </div>
    );
}
