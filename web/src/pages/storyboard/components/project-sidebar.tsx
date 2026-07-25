import { Clapperboard, Plus, Trash2 } from "lucide-react";
import { App, Button, Popconfirm, Tag } from "antd";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
    draft: { label: "草稿", color: "default" },
    assets_confirmed: { label: "资产已确认", color: "cyan" },
    scenes_confirmed: { label: "场景已确认", color: "processing" },
    shots_confirmed: { label: "镜头已确认", color: "warning" },
    descriptions_confirmed: { label: "已完成", color: "success" },
};

export function ProjectSidebar() {
    const { message } = App.useApp();
    const { projects, current, loading, loadProjects, openProject, deleteProject, createProject, setStep } = useStoryboardStore();

    const handleNew = async () => {
        await createProject(`新项目 ${new Date().toLocaleDateString()}`, "");
        setStep(1);
    };

    return (
        <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950">
            <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-stone-600 dark:text-stone-300">分镜项目</span>
                <Button type="text" size="small" icon={<Plus className="size-4" />} onClick={handleNew} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
                {loading && <div className="py-8 text-center text-xs text-stone-400">加载中...</div>}
                {!loading && projects.length === 0 && <div className="py-8 text-center text-xs text-stone-400">暂无项目</div>}
                {projects.map((project) => {
                    const status = STATUS_MAP[project.status] || STATUS_MAP.draft;
                    const totalShots = project.scenes.reduce((sum, s) => sum + s.shots.length, 0);
                    return (
                        <div
                            key={project.id}
                            className={cn(
                                "group mb-1 cursor-pointer rounded-md px-3 py-2.5 transition hover:bg-stone-100 dark:hover:bg-stone-900",
                                current?.id === project.id && "bg-stone-100 dark:bg-stone-900",
                            )}
                            onClick={() => void openProject(project.id)}
                        >
                            <div className="flex items-center gap-2">
                                <Clapperboard className="size-3.5 shrink-0 text-stone-400" />
                                <span className="min-w-0 flex-1 truncate text-sm">{project.title}</span>
                                <Popconfirm
                                    title="删除此项目？"
                                    onConfirm={(e) => {
                                        e?.stopPropagation();
                                        void deleteProject(project.id);
                                        message.success("已删除");
                                    }}
                                    onCancel={(e) => e?.stopPropagation()}
                                    okText="删除"
                                    cancelText="取消"
                                >
                                    <Button type="text" danger size="small" icon={<Trash2 className="size-3" />} className="opacity-0 transition group-hover:opacity-100" onClick={(e) => e.stopPropagation()} />
                                </Popconfirm>
                            </div>
                            <div className="mt-1 flex items-center gap-2 pl-5.5">
                                <Tag className="m-0 scale-90" color={status.color}>{status.label}</Tag>
                                {totalShots > 0 && <span className="text-[10px] text-stone-400">{project.scenes.length}场 / {totalShots}镜</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
