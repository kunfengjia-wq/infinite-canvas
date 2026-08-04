import { Plus, Trash2, User, Volume2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { App, Button, Input, Popconfirm, Tooltip } from "antd";

import { useVoiceStore } from "../store/use-voice-store";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";

export function CharacterPanel() {
    const { message } = App.useApp();
    const { current, models, addCharacter, removeCharacter, previewVoice } = useVoiceStore(
        useShallow((s) => ({
            current: s.current,
            models: s.models,
            addCharacter: s.addCharacter,
            removeCharacter: s.removeCharacter,
            previewVoice: s.previewVoice,
        })),
    );
    const [newName, setNewName] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [previewingId, setPreviewingId] = useState<string | null>(null);

    if (!current) return null;

    // 构建 voice ID → 友好名称 映射
    const voiceLabelMap = new Map<string, string>();
    for (const m of models) {
        for (const v of m.voices) {
            voiceLabelMap.set(v.id, v.label);
        }
    }
    const getVoiceLabel = (voiceId: string) => voiceLabelMap.get(voiceId) ?? voiceId;

    const handleAdd = () => {
        const name = newName.trim();
        if (!name) return;
        addCharacter(name);
        setNewName("");
    };

    const handlePreview = async (charId: string, voice: string) => {
        setPreviewingId(charId);
        try {
            await previewVoice(current.engine, voice);
        } catch (e) {
            message.error(e instanceof Error ? e.message : "试听失败");
        } finally {
            setPreviewingId(null);
        }
    };

    return (
        <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#13131a]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <User className="size-3.5 text-stone-500" />
                    <span className="text-xs font-medium text-stone-300">角色</span>
                </div>
                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] tabular-nums text-stone-500">
                    {current.characters.length}
                </span>
            </div>

            {/* Character cards */}
            <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
                {current.characters.map((char) => {
                    const isSelected = selectedId === char.id;
                    const isPreviewing = previewingId === char.id;
                    const lineCount = current.lines.filter((l) => l.characterId === char.id).length;

                    return (
                        <div
                            key={char.id}
                            className={cn(
                                "group relative cursor-pointer rounded-xl border p-3 transition-all",
                                isSelected
                                    ? "border-violet-500/30 bg-violet-500/[0.08] shadow-sm shadow-violet-500/5"
                                    : "border-white/[0.04] bg-white/[0.02] hover:border-white/[0.08] hover:bg-white/[0.04]",
                            )}
                            onClick={() => setSelectedId(isSelected ? null : char.id)}
                        >
                            {/* Top row: avatar + name */}
                            <div className="flex items-center gap-2.5">
                                <div
                                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
                                    style={{ backgroundColor: char.color }}
                                >
                                    {char.name.charAt(0)}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-sm font-medium text-stone-200">{char.name}</span>
                                    <span className="truncate text-[10px] text-stone-500">{getVoiceLabel(char.voice)}</span>
                                </div>
                            </div>

                            {/* Bottom row: stats + actions */}
                            <div className="mt-2 flex items-center gap-1.5">
                                <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-stone-500">
                                    {lineCount} 段台词
                                </span>

                                <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                    <Tooltip title="试听音色">
                                        <Button
                                            type="text"
                                            size="small"
                                            className="!text-stone-400 hover:!text-violet-400 hover:!bg-violet-500/10"
                                            icon={isPreviewing
                                                ? <LoaderCircle className="size-3 animate-spin" />
                                                : <Volume2 className="size-3" />
                                            }
                                            disabled={isPreviewing}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void handlePreview(char.id, char.voice);
                                            }}
                                        />
                                    </Tooltip>
                                    <Popconfirm
                                        title="删除角色及其所有台词？"
                                        onConfirm={() => removeCharacter(char.id)}
                                        onPopupClick={(e) => e.stopPropagation()}
                                    >
                                        <Button
                                            type="text"
                                            size="small"
                                            className="!text-stone-400 hover:!text-red-400 hover:!bg-red-500/10"
                                            icon={<Trash2 className="size-3" />}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </Popconfirm>
                                </div>
                            </div>

                            {/* Selected indicator */}
                            {isSelected && (
                                <div
                                    className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                                    style={{ backgroundColor: char.color }}
                                />
                            )}
                        </div>
                    );
                })}

                {current.characters.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-8">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-white/[0.03]">
                            <User className="size-4 text-stone-600" />
                        </div>
                        <p className="text-xs text-stone-600">暂无角色</p>
                    </div>
                )}
            </div>

            {/* Add character */}
            <div className="border-t border-white/[0.06] p-3">
                <div className="flex gap-1.5">
                    <Input
                        size="small"
                        placeholder="输入角色名"
                        prefix={<User className="size-3 text-stone-600" />}
                        className="!border-white/[0.08] !bg-white/[0.04] !text-stone-200 placeholder:!text-stone-600"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onPressEnter={handleAdd}
                    />
                    <Tooltip title="添加角色">
                        <Button
                            type="primary"
                            size="small"
                            className="!bg-violet-500 !border-none hover:!bg-violet-400"
                            icon={<Plus className="size-3.5" />}
                            onClick={handleAdd}
                        />
                    </Tooltip>
                </div>
            </div>
        </aside>
    );
}
