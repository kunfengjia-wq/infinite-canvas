import { Clapperboard, FolderOpen, Plus, Trash2 } from "lucide-react";
import { App, Button, Empty, Popconfirm, Spin } from "antd";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import type { StoryboardStatus } from "@/types/storyboard";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<StoryboardStatus, { text: string; color: string }> = {
    draft: { text: "草稿", color: "text-stone-400" },
    assets_confirmed: { text: "资产已确认", color: "text-blue-500" },
    scenes_confirmed: { text: "场景已确认", color: "text-cyan-500" },
    shots_confirmed: { text: "镜头已确认", color: "text-green-500" },
    descriptions_confirmed: { text: "已完成", color: "text-emerald-500" },
};

export function ProjectSidebar() {
    const { message } = App.useApp();
    const { projects, current, loading, openProject, deleteProject } = useStoryboardStore();

    return (
        <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-stone-50/80 dark:border-stone-800 dark:bg-stone-900/50">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                <span className="text-sm font-medium text-stone-600 dark:text-stone-300">分镜项目</span>
                <Button
                    type="text"
                    size="small"
                    icon={<Plus className="size-4" />}
                    onClick={() => {
                        useStoryboardStore.setState((s) => ({ current: null, step: 1 as const, formResetKey: s.formResetKey + 1 }));
                    }}
                    title="新建项目"
                />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {loading ? (
                    <div className="flex justify-center py-8"><Spin size="small" /></div>
                ) : projects.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无项目" className="py-8" />
                ) : (
                    <div className="space-y-1">
                        {projects.map((project) => {
                            const status = STATUS_LABEL[project.status] || STATUS_LABEL.draft;
                            const isActive = current?.id === project.id;
                            const shotCount = project.scenes.reduce((sum, s) => sum + s.shots.length, 0);
                            return (
                                <div
                                    key={project.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => void openProject(project.id)}
                                    onKeyDown={(e) => e.key === "Enter" && void openProject(project.id)}
                                    className={cn(
                                        "group cursor-pointer rounded-lg px-3 py-2.5 transition-colors",
                                        isActive
                                            ? "bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-800"
                                            : "hover:bg-stone-100 dark:hover:bg-stone-800/60",
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-1">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <Clapperboard className={cn("size-3.5 shrink-0", isActive ? "text-blue-500" : "text-stone-400")} />
                                            <span className="truncate text-sm font-medium">{project.title}</span>
                                        </div>
                                        <Popconfirm
                                            title="删除此项目？"
                                            description="删除后不可恢复"
                                            onConfirm={(e) => {
                                                e?.stopPropagation();
                                                void deleteProject(project.id).then(() => message.success("项目已删除"));
                                            }}
                                            okText="删除"
                                            cancelText="取消"
                                        >
                                            <Button
                                                type="text"
                                                danger
                                                size="small"
                                                icon={<Trash2 className="size-3" />}
                                                className="!size-6 opacity-0 transition group-hover:opacity-100"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </Popconfirm>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 pl-5 text-xs">
                                        <span className={status.color}>{status.text}</span>
                                        {project.scenes.length > 0 && <span className="text-stone-400">{project.scenes.length} 场景</span>}
                                        {shotCount > 0 && <span className="text-stone-400">{shotCount} 镜头</span>}
                                    </div>
                                    <div className="mt-0.5 pl-5 text-[10px] text-stone-300 dark:text-stone-600">
                                        {new Date(project.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {projects.length > 0 && (
                <div className="border-t border-stone-200 px-4 py-2 text-center dark:border-stone-800">
                    <Button type="link" size="small" icon={<FolderOpen className="size-3.5" />} onClick={() => { useStoryboardStore.setState((s) => ({ current: null, step: 1 as const, formResetKey: s.formResetKey + 1 })); }}>
                        新建项目
                    </Button>
                </div>
            )}
        </aside>
    );
}
