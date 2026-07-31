import { useEffect, useState } from "react";
import { Button, Input, Upload as AntUpload } from "antd";
import { AudioLines, Disc3, FolderOpen, Music, Play, Scissors, Search, Trash2, Upload } from "lucide-react";

import { useSoundLibrary, useFilteredClips } from "../store/use-sound-library";
import type { SoundCategory } from "../types";
import { cn } from "@/lib/utils";

const CATEGORY_TABS: { value: SoundCategory | "all"; label: string; icon: React.ReactNode }[] = [
    { value: "all", label: "全部", icon: <FolderOpen className="size-3" /> },
    { value: "voice", label: "音色", icon: <AudioLines className="size-3" /> },
    { value: "sfx", label: "音效", icon: <Music className="size-3" /> },
    { value: "bgm", label: "配乐", icon: <Disc3 className="size-3" /> },
    { value: "clip", label: "片段", icon: <Scissors className="size-3" /> },
];

/**
 * 独立音效库面板
 * - 分类 Tab
 * - 搜索
 * - 音频卡片列表
 * - 导入文件
 */
export function SoundLibraryPanel() {
    const { loadClips, addClip, removeClip, playClip, stopClip, setSearch, setCategory, activeCategory, searchQuery } = useSoundLibrary();
    const clips = useFilteredClips();
    const [playingId, setPlayingId] = useState<string | null>(null);

    useEffect(() => {
        void loadClips();
    }, [loadClips]);

    const handlePlay = (clip: (typeof clips)[0]) => {
        if (playingId === clip.id) {
            // 再次点击真正停止播放
            stopClip();
            setPlayingId(null);
            return;
        }
        playClip(clip);
        setPlayingId(clip.id);
        // 简单定时清除播放状态
        setTimeout(() => setPlayingId((cur) => (cur === clip.id ? null : cur)), (clip.duration || 3) * 1000);
    };

    const handleImportFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = async () => {
            const b64 = (reader.result as string).split(",")[1];
            // 获取时长
            const audio = new Audio(URL.createObjectURL(file));
            await new Promise<void>((r) => { audio.onloadedmetadata = () => r(); });
            await addClip({
                name: file.name.replace(/\.[^.]+$/, ""),
                category: "clip",
                tags: ["导入"],
                audioB64: b64,
                mime: file.type || "audio/wav",
                duration: audio.duration || 0,
            });
        };
        reader.readAsDataURL(file);
        return false;
    };

    return (
        <div className="flex h-full flex-col">
            {/* 标题 + 导入 */}
            <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-medium text-stone-500">音效库</span>
                <AntUpload accept="audio/*" showUploadList={false} beforeUpload={handleImportFile}>
                    <Button type="text" size="small" icon={<Upload className="size-3" />} title="导入音频文件" />
                </AntUpload>
            </div>

            {/* 搜索 */}
            <div className="px-3 pb-2">
                <Input
                    size="small"
                    placeholder="搜索音效..."
                    prefix={<Search className="size-3 text-stone-400" />}
                    value={searchQuery}
                    onChange={(e) => setSearch(e.target.value)}
                    allowClear
                />
            </div>

            {/* 分类 Tab */}
            <div className="flex gap-1 px-3 pb-2">
                {CATEGORY_TABS.map((tab) => (
                    <button
                        key={tab.value}
                        type="button"
                        className={cn(
                            "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors",
                            activeCategory === tab.value
                                ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                                : "text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800",
                        )}
                        onClick={() => setCategory(tab.value)}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 列表 */}
            <div className="flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
                {clips.length === 0 && (
                    <p className="mt-8 text-center text-[11px] text-stone-400">
                        {searchQuery ? "无匹配结果" : "音效库为空"}
                    </p>
                )}
                {clips.map((clip) => (
                    <div
                        key={clip.id}
                        className="group flex items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-2 transition-colors hover:border-violet-200 dark:border-stone-700 dark:hover:border-violet-800"
                    >
                        <Button
                            type="text"
                            size="small"
                            className="shrink-0"
                            icon={<Play className={cn("size-3", playingId === clip.id && "text-violet-500")} />}
                            onClick={() => handlePlay(clip)}
                        />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-medium">{clip.name}</p>
                            <div className="flex items-center gap-1">
                                <span className="text-[9px] text-stone-400">{clip.duration.toFixed(1)}s</span>
                                {clip.tags.map((t) => (
                                    <span key={t} className="rounded bg-stone-100 px-1 text-[8px] text-stone-400 dark:bg-stone-800">{t}</span>
                                ))}
                            </div>
                        </div>
                        <Button
                            type="text"
                            size="small"
                            danger
                            icon={<Trash2 className="size-3" />}
                            className="opacity-0 group-hover:opacity-100"
                            onClick={() => void removeClip(clip.id)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
