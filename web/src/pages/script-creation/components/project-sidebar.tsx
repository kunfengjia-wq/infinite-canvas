import { Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { App, Button, Input, Modal, Popconfirm } from "antd";

import { useScriptCreationStore } from "@/stores/use-script-creation-store";
import { CREATION_PHASES } from "@/types/script-creation";
import { cn } from "@/lib/utils";

export function ScriptProjectSidebar() {
    const { message } = App.useApp();
    const { projects, current, createProject, openProject, deleteProject, forkProject } = useScriptCreationStore();
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newSeed, setNewSeed] = useState("");

    const handleCreate = async () => {
        if (!newSeed.trim()) {
            message.warning("请输入灵感种子");
            return;
        }
        const title = newTitle.trim() || `剧本 ${new Date().toLocaleDateString()}`;
        await createProject(title, newSeed.trim());
        setCreating(false);
        setNewTitle("");
        setNewSeed("");
        message.success("项目已创建，开始探索灵感吧！");
    };

    const handleFork = async (id: string) => {
        const newId = await forkProject(id);
        if (newId) message.success("已派生二创项目");
    };

    return (
        <aside className="flex w-64 flex-col border-r border-stone-200 bg-stone-50/50 dark:border-stone-800 dark:bg-stone-900/30">
            <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-stone-600 dark:text-stone-300">剧本项目</span>
                <Button type="text" size="small" icon={<Plus className="size-4" />} onClick={() => setCreating(true)} />
            </div>

            {/* 新建表单 */}
            {creating && (
                <div className="mx-3 mb-3 space-y-2 rounded-lg border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-800">
                    <Input size="small" placeholder="项目名称（可选）" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                    <Input.TextArea size="small" rows={2} placeholder="灵感种子：一句话描述你的想法..." value={newSeed} onChange={(e) => setNewSeed(e.target.value)} />
                    <div className="flex gap-2">
                        <Button size="small" type="primary" onClick={handleCreate}>
                            创建
                        </Button>
                        <Button size="small" onClick={() => setCreating(false)}>
                            取消
                        </Button>
                    </div>
                </div>
            )}

            {/* 项目列表 */}
            <div className="flex-1 overflow-y-auto px-2 pb-2">
                {projects.map((p) => {
                    const phaseLabel = CREATION_PHASES.find((ph) => ph.phase === p.phase)?.label ?? "";
                    return (
                        <div
                            key={p.id}
                            className={cn(
                                "group mb-1 cursor-pointer rounded-lg px-3 py-2.5 transition-colors",
                                current?.id === p.id ? "bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:ring-blue-800" : "hover:bg-stone-100 dark:hover:bg-stone-800/60",
                            )}
                            onClick={() => void openProject(p.id)}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{p.title}</p>
                                    <p className="mt-0.5 truncate text-xs text-stone-400">{p.seed}</p>
                                    <div className="mt-1 flex items-center gap-1.5">
                                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500 dark:bg-stone-800 dark:text-stone-400">{phaseLabel}</span>
                                        {p.forkedFrom && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">二创</span>}
                                    </div>
                                </div>
                                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                    <Button type="text" size="small" icon={<Copy className="size-3" />} onClick={(e) => { e.stopPropagation(); void handleFork(p.id); }} title="派生二创" />
                                    <Popconfirm title="确定删除？" onConfirm={() => void deleteProject(p.id)} onPopupClick={(e) => e.stopPropagation()}>
                                        <Button type="text" size="small" danger icon={<Trash2 className="size-3" />} onClick={(e) => e.stopPropagation()} />
                                    </Popconfirm>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {projects.length === 0 && !creating && (
                    <div className="mt-8 text-center text-xs text-stone-400">
                        <p>还没有项目</p>
                        <p className="mt-1">点击 + 开始创作</p>
                    </div>
                )}
            </div>
        </aside>
    );
}
