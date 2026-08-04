import { Plus, Trash2, AudioLines } from "lucide-react";
import { Button, Popconfirm } from "antd";

import { useVoiceStore } from "../store/use-voice-store";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";

export function VoiceProjectSidebar() {
    const { projects, current, loading, createProject, openProject, deleteProject } = useVoiceStore(
        useShallow((s) => ({ projects: s.projects, current: s.current, loading: s.loading, createProject: s.createProject, openProject: s.openProject, deleteProject: s.deleteProject })),
    );

    return (
        <aside className="flex w-56 shrink-0 flex-col border-r border-stone-200 bg-stone-50/50 dark:border-stone-800 dark:bg-stone-900/30">
            <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-stone-600 dark:text-stone-300">配音项目</span>
                <Button type="text" size="small" icon={<Plus className="size-4" />} onClick={() => void createProject("新配音项目")} />
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2">
                {loading && <p className="mt-4 text-center text-xs text-stone-400">加载中…</p>}
                {projects.map((p) => (
                    <div
                        key={p.id}
                        className={cn(
                            "group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                            current?.id === p.id ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" : "hover:bg-stone-100 dark:hover:bg-stone-800",
                        )}
                        onClick={() => openProject(p.id)}
                    >
                        <AudioLines className="size-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{p.title}</span>
                        <span className="ml-auto text-[10px] text-stone-400">{p.lines.length} 段</span>
                        <Popconfirm title="确定删除？" onConfirm={() => void deleteProject(p.id)} onPopupClick={(e) => e.stopPropagation()}>
                            <Button type="text" size="small" danger icon={<Trash2 className="size-3" />} className="opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()} />
                        </Popconfirm>
                    </div>
                ))}
                {projects.length === 0 && !loading && (
                    <p className="mt-8 text-center text-xs text-stone-400">还没有项目<br />点击 + 开始</p>
                )}
            </div>
        </aside>
    );
}
