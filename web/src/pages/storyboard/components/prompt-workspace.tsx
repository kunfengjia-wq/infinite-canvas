import { FolderPlus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { App, Button, Popconfirm, Select } from "antd";

import type { AiConfig } from "@/stores/use-config-store";
import { getStoryboardRepo } from "@/services/db";
import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { InputPanel } from "@/pages/prompt-studio/components/input-panel";
import { PlatformSelector } from "@/pages/prompt-studio/components/platform-selector";
import { PromptResult } from "@/pages/prompt-studio/components/prompt-result";
import { StoryboardSourcePanel } from "@/pages/prompt-studio/components/storyboard-source-panel";
import { StylePresets } from "@/pages/prompt-studio/components/style-presets";
import { ExportBar } from "@/pages/prompt-studio/components/export-bar";

/**
 * 提示词工作台（双栏布局）
 * 有分镜数据时：左栏分镜素材面板 + 右栏手动输入与结果；否则单列模式
 * sourceStoryboardId 由分镜流程导出时传入，实时关联对应分镜项目
 */
export function PromptWorkspace({ config, sourceStoryboardId }: { config: AiConfig; sourceStoryboardId?: string | null }) {
    const { message } = App.useApp();
    const { projects, current, loading, loadProjects, createProject, openProject, deleteProject } = usePromptStudioStore();
    const [hasStoryboard, setHasStoryboard] = useState(Boolean(sourceStoryboardId));

    useEffect(() => {
        void loadProjects();
    }, [loadProjects]);

    // 检测是否有可用分镜项目（含已生成画面描述）
    useEffect(() => {
        if (sourceStoryboardId) {
            setHasStoryboard(true);
            return;
        }
        void getStoryboardRepo()
            .list()
            .then((list) => {
                setHasStoryboard(list.some((p) => (p.scenes ?? []).some((s) => (s.shots ?? []).some((sh) => (sh.visualDescription ?? "").trim()))));
            });
    }, [sourceStoryboardId]);

    const handleCreateProject = async () => {
        await createProject(`提示词项目 ${new Date().toLocaleDateString("zh-CN")}`);
        message.success("已创建新项目");
    };

    /** 项目管理条 */
    const projectBar = (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-stone-500">项目</span>
            <Select
                value={current?.id}
                onChange={(id) => void openProject(id)}
                placeholder="选择提示词项目"
                className="min-w-52 max-w-xs"
                loading={loading}
                options={projects.map((p) => ({ value: p.id, label: `${p.title}（${p.entries.length} 条）` }))}
                notFoundContent="暂无项目"
            />
            <Button icon={<FolderPlus className="size-4" />} onClick={() => void handleCreateProject()}>
                新建
            </Button>
            {current && (
                <Popconfirm title="删除此项目及其所有提示词？" onConfirm={() => void deleteProject(current.id)} okText="删除" cancelText="取消">
                    <Button danger icon={<Trash2 className="size-4" />}>
                        删除
                    </Button>
                </Popconfirm>
            )}
        </div>
    );

    // ─── 双栏模式：有分镜数据 ───
    if (hasStoryboard) {
        return (
            <div className="flex h-full flex-col overflow-hidden">
                {/* 顶部紧凑工具条 */}
                <div className="shrink-0 space-y-1.5 border-b border-stone-100 px-4 py-2.5 dark:border-stone-800">
                    {projectBar}
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
                {projectBar}
                <PlatformSelector />
                <StylePresets />
                <InputPanel config={config} onError={(msg) => message.error(msg)} />
                <PromptResult config={config} onError={(msg) => message.error(msg)} />
                <ExportBar />
            </div>
        </div>
    );
}
