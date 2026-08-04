import { Plus, Trash2, User } from "lucide-react";
import { useState } from "react";
import { Button, Input, Popconfirm, Tooltip } from "antd";

import { useVoiceStore } from "../store/use-voice-store";
import { cn } from "@/lib/utils";

export function CharacterPanel() {
    const current = useVoiceStore((s) => s.current);
    const models = useVoiceStore((s) => s.models);
    const addCharacter = useVoiceStore((s) => s.addCharacter);
    const removeCharacter = useVoiceStore((s) => s.removeCharacter);
    const [newName, setNewName] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);

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

    return (
        <aside className="flex w-52 shrink-0 flex-col border-r border-stone-200 dark:border-stone-800">
            <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs font-medium text-stone-500 dark:text-stone-400">角色</span>
                <span className="text-[10px] text-stone-400">{current.characters.length}</span>
            </div>

            {/* 角色列表 */}
            <div className="flex-1 space-y-1 overflow-y-auto px-2">
                {current.characters.map((char) => (
                    <div
                        key={char.id}
                        className={cn(
                            "group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                            selectedId === char.id
                                ? "bg-violet-50 ring-1 ring-violet-200 dark:bg-violet-900/20 dark:ring-violet-800"
                                : "hover:bg-stone-100 dark:hover:bg-stone-800/60",
                        )}
                        onClick={() => setSelectedId(char.id)}
                    >
                        <span
                            className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{ backgroundColor: char.color }}
                        >
                            {char.name.charAt(0)}
                        </span>
                        <span className="truncate">{char.name}</span>
                        <span className="ml-auto truncate text-[10px] text-stone-400">{getVoiceLabel(char.voice)}</span>
                        <Popconfirm
                            title="删除角色及其所有台词？"
                            onConfirm={() => removeCharacter(char.id)}
                            onPopupClick={(e) => e.stopPropagation()}
                        >
                            <Button
                                type="text"
                                size="small"
                                danger
                                icon={<Trash2 className="size-3" />}
                                className="opacity-0 group-hover:opacity-100"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </Popconfirm>
                    </div>
                ))}
            </div>

            {/* 添加角色 */}
            <div className="border-t border-stone-200 p-2 dark:border-stone-800">
                <div className="flex gap-1.5">
                    <Input
                        size="small"
                        placeholder="角色名"
                        prefix={<User className="size-3 text-stone-400" />}
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onPressEnter={handleAdd}
                    />
                    <Tooltip title="添加角色">
                        <Button type="primary" size="small" icon={<Plus className="size-3.5" />} onClick={handleAdd} />
                    </Tooltip>
                </div>
            </div>
        </aside>
    );
}
