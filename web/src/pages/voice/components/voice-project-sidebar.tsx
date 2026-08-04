import { Plus, Trash2, AudioLines } from "lucide-react";
import { Button, Popconfirm, Tooltip } from "antd";

import { useVoiceStore } from "../store/use-voice-store";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";

export function VoiceProjectSidebar() {
    const { projects, current, loading, createProject, openProject, deleteProject } = useVoiceStore(
        useShallow((s) => ({ projects: s.projects, current: s.current, loading: s.loading, createProject: s.createProject, openProject: s.openProject, deleteProject: s.deleteProject })),
    );

    return (
        <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0c11]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <div className="flex items-center gap-2">
                    <AudioLines className="size-4 text-violet-400/60" />
                    <span className="text-xs font-medium text-stone-300">配音项目</span>
                </div>
                <Tooltip title="新建项目">
                    <Button
                        type="text"
                        size="small"
                        className="!text-stone-500 hover:!text-stone-300 hover:!bg-white/[0.06]"
                        icon={<Plus className="size-4" />}
                        onClick={() => void createProject("新配音项目")}
                    />
                </Tooltip>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2">
                {loading && <p className="mt-4 text-center text-xs text-stone-600">加载中…</p>}
                {projects.map((p) => (
                    <div
                        key={p.id}
                        className={cn(
                            "group mb-1 flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all",
                            current?.id === p.id
                                ? "bg-violet-500/10 text-violet-300 shadow-sm shadow-violet-500/5"
                                : "text-stone-400 hover:bg-white/[0.04] hover:text-stone-200",
                        )}
                        onClick={() => openProject(p.id)}
                    >
                        <AudioLines className={cn(
                            "size-3.5 shrink-0",
                            current?.id === p.id ? "text-violet-400" : "text-stone-600",
                        )} />
                        <span className="truncate">{p.title}</span>
                        <span className="ml-auto text-[10px] tabular-nums text-stone-600">{p.lines.length}</span>
                        <Popconfirm title="确定删除？" onConfirm={() => void deleteProject(p.id)} onPopupClick={(e) => e.stopPropagation()}>
                            <Button
                                type="text"
                                size="small"
                                className="!text-stone-500 hover:!text-red-400 hover:!bg-red-500/10 opacity-0 group-hover:opacity-100"
                                icon={<Trash2 className="size-3" />}
                                onClick={(e) => e.stopPropagation()}
                            />
                        </Popconfirm>
                    </div>
                ))}
                {projects.length === 0 && !loading && (
                    <div className="flex flex-col items-center gap-2 py-8">
                        <p className="text-xs text-stone-600">还没有项目</p>
                        <p className="text-[10px] text-stone-700">点击 + 开始</p>
                    </div>
                )}
            </div>
        </aside>
    );
}
