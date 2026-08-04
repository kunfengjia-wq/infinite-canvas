import { Copy, Lightbulb, LoaderCircle, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { App, Button, Input, Modal, Popconfirm, Tag } from "antd";

import { useScriptCreationStore } from "@/stores/use-script-creation-store";
import { useShallow } from "zustand/react/shallow";
import type { AiConfig } from "@/stores/use-config-store";
import { CREATION_PHASES } from "@/types/script-creation";
import { aiRefreshSeedExamples } from "@/services/script-creation-ai";
import { SeedStormCanvas } from "./seed-storm-canvas";
import { cn } from "@/lib/utils";

const DEFAULT_SEED_EXAMPLES = [
    "一个孤独的宇航员在火星发现古老地下城市",
    "末日后的东京，少女与AI机器人寻找最后的花园",
    "民国时期上海滩，一位女侦探破解连环密室杀人案",
    "深海科考队发现沉没的亚特兰蒂斯遗迹",
    "平行宇宙交错，同一个人活出截然不同的人生",
    "赛博朋克世界里的地下音乐革命",
];

export function ScriptProjectSidebar({ config }: { config: AiConfig }) {
    const { message } = App.useApp();
    const { projects, current, createProject, openProject, deleteProject, forkProject } = useScriptCreationStore(
        useShallow((s) => ({ projects: s.projects, current: s.current, createProject: s.createProject, openProject: s.openProject, deleteProject: s.deleteProject, forkProject: s.forkProject })),
    );
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newSeed, setNewSeed] = useState("");
    const [seedExamples, setSeedExamples] = useState<string[]>(DEFAULT_SEED_EXAMPLES);
    const [refreshingSeeds, setRefreshingSeeds] = useState(false);

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

    const handleCloseCreate = () => {
        setCreating(false);
        setNewTitle("");
        setNewSeed("");
    };

    /** AI 实时刷新灵感种子示例 */
    const handleRefreshSeeds = async () => {
        setRefreshingSeeds(true);
        try {
            const fresh = await aiRefreshSeedExamples(config);
            if (fresh.length > 0) setSeedExamples(fresh);
            else message.warning("AI 未返回有效结果，请重试");
        } catch (err) {
            message.error(err instanceof Error ? err.message : "AI 刷新失败");
        } finally {
            setRefreshingSeeds(false);
        }
    };

    return (
        <>
        <aside className="flex w-64 flex-col border-r border-stone-200 bg-stone-50/50 dark:border-stone-800 dark:bg-stone-900/30">
            <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-stone-600 dark:text-stone-300">剧本项目</span>
                <Button type="text" size="small" icon={<Plus className="size-4" />} onClick={() => setCreating(true)} />
            </div>

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

        {/* 新建项目弹窗：左移宽幅 + 右侧灵感风暴画布 */}
        <Modal
            open={creating}
            onOk={handleCreate}
            onCancel={handleCloseCreate}
            okText="开始创作"
            cancelText="取消"
            okButtonProps={{ disabled: !newSeed.trim(), size: "large" }}
            cancelButtonProps={{ size: "large" }}
            width={1100}
            centered
            destroyOnHidden
            title={null}
            footer={null}
            styles={{ body: { padding: 0 } }}
        >
            <div className="flex min-h-[560px]">
                {/* 左侧：表单区 */}
                <div className="flex w-[55%] flex-col">
                    {/* 顶部装饰区 */}
                    <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 px-7 py-5">
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 80%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.2) 0%, transparent 40%)" }} />
                        <div className="relative flex items-center gap-3">
                            <div className="flex size-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                                <Sparkles className="size-4 text-white" />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold text-white">新建剧本项目</h2>
                                <p className="mt-0.5 text-xs text-white/70">写下灵感种子，AI 将为你展开一个完整的故事世界</p>
                            </div>
                        </div>
                    </div>

                    {/* 表单 */}
                    <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-7 py-5">
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-stone-600 dark:text-stone-300">项目名称</label>
                            <Input size="large" placeholder="给你的故事起个名字（可选）" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                        </div>

                        <div className="flex-1">
                            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-stone-600 dark:text-stone-300">
                                <Lightbulb className="size-4 text-amber-500" />
                                灵感种子
                                <span className="text-red-500">*</span>
                            </label>
                            <Input.TextArea
                                rows={8}
                                className="!text-base !leading-relaxed"
                                placeholder={"在这里尽情描述你的想法，越详细越好。\n\n也可以点击右侧灵感泡泡快速填入…"}
                                value={newSeed}
                                onChange={(e) => setNewSeed(e.target.value)}
                                autoFocus
                            />
                            <p className="mt-1.5 text-xs text-stone-400">提示：可以包含角色、场景、情绪、冲突等任何元素</p>
                        </div>

                        {/* 灵感示例标签 + AI 刷新 */}
                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <p className="text-xs font-medium text-stone-400">快速填入</p>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={refreshingSeeds ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                                    onClick={handleRefreshSeeds}
                                    disabled={refreshingSeeds}
                                    className="!text-xs !text-stone-400 hover:!text-blue-500"
                                >
                                    {refreshingSeeds ? "筛选中…" : "AI 刷新"}
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {seedExamples.map((ex) => (
                                    <Tag
                                        key={ex}
                                        className="cursor-pointer rounded-full border-stone-200 px-2.5 py-0.5 text-[11px] transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-stone-600 dark:hover:border-blue-600 dark:hover:bg-blue-950/30"
                                        onClick={() => setNewSeed(ex)}
                                    >
                                        {ex.length > 14 ? ex.slice(0, 14) + "…" : ex}
                                    </Tag>
                                ))}
                            </div>
                        </div>

                        {/* 底部操作 */}
                        <div className="flex items-center justify-end gap-3 border-t border-stone-100 pt-4 dark:border-stone-800">
                            <Button size="large" onClick={handleCloseCreate}>取消</Button>
                            <Button size="large" type="primary" icon={<Sparkles className="size-4" />} onClick={handleCreate} disabled={!newSeed.trim()}>
                                开始创作
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 右侧：灵感风暴画布 */}
                <div className="w-[45%]">
                    <SeedStormCanvas config={config} seed={newSeed} onFillSeed={(text) => setNewSeed((prev) => prev ? prev + "，" + text : text)} />
                </div>
            </div>
        </Modal>
        </>
    );
}
