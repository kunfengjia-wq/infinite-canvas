import { Copy, Download, FileSpreadsheet, FolderPlus } from "lucide-react";
import { App, Button, Select, Space } from "antd";
import { saveAs } from "file-saver";
import { useState } from "react";

import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { useCopyText } from "@/hooks/use-copy-text";
import { useAssetStore } from "@/stores/use-asset-store";
import { PLATFORM_LIST, STYLE_PRESETS } from "@/types/prompt-studio";
import type { PromptEntry } from "@/types/prompt-studio";

/**
 * 导出栏：复制全部 / 下载 TXT / 下载 JSON / 保存到资产 / 保存项目
 * 支持按平台/评分筛选导出
 */
export function ExportBar() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const addAsset = useAssetStore((state) => state.addAsset);
    const current = usePromptStudioStore((s) => s.current);
    const saveCurrent = usePromptStudioStore((s) => s.saveCurrent);
    const [filterPlatform, setFilterPlatform] = useState<string>("all");
    const [filterRating, setFilterRating] = useState<string>("all");

    if (!current || current.entries.length === 0) return null;

    /** 获取筛选后的条目 */
    const getFilteredEntries = (): PromptEntry[] => {
        let entries = current.entries;
        if (filterPlatform !== "all") {
            entries = entries.filter((e) => e.platform === filterPlatform);
        }
        if (filterRating === "positive") {
            entries = entries.filter((e) => e.rating === 1);
        } else if (filterRating === "negative") {
            entries = entries.filter((e) => e.rating === -1);
        } else if (filterRating === "rated") {
            entries = entries.filter((e) => e.rating != null);
        }
        return entries;
    };

    const usedPlatforms = Array.from(new Set(current.entries.map((e) => e.platform)));

    const handleCopyAll = () => {
        const entries = getFilteredEntries();
        if (entries.length === 0) { message.warning("筛选后无条目"); return; }
        const text = entries
            .map((e) => {
                const platform = PLATFORM_LIST.find((p) => p.id === e.platform)?.label || e.platform;
                let line = `[${platform}]${e.assetRef ? ` [${e.assetRef}]` : ""} ${e.prompt}`;
                if (e.negativePrompt) line += `\nNegative: ${e.negativePrompt}`;
                if (e.translation) line += `\n中文对照: ${e.translation}`;
                return line;
            })
            .join("\n\n---\n\n");
        copyText(text, `已复制 ${entries.length} 条提示词`);
    };

    const handleDownloadTxt = () => {
        const entries = getFilteredEntries();
        if (entries.length === 0) { message.warning("筛选后无条目"); return; }
        const text = entries
            .map((e) => {
                const platform = PLATFORM_LIST.find((p) => p.id === e.platform)?.label || e.platform;
                let line = `=== ${platform} ===\n输入: ${e.input}`;
                if (e.assetRef) line += `\n资产: ${e.assetRef}`;
                line += `\n提示词: ${e.prompt}`;
                if (e.negativePrompt) line += `\n负面提示词: ${e.negativePrompt}`;
                if (e.translation) line += `\n中文对照: ${e.translation}`;
                return line;
            })
            .join("\n\n");
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        saveAs(blob, `${current.title || "prompts"}.txt`);
    };

    const handleDownloadJson = () => {
        const entries = getFilteredEntries();
        if (entries.length === 0) { message.warning("筛选后无条目"); return; }
        const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
        saveAs(blob, `${current.title || "prompts"}.json`);
    };

    const handleDownloadCsv = () => {
        const entries = getFilteredEntries();
        if (entries.length === 0) { message.warning("筛选后无条目"); return; }
        const header = "平台,类型,输入,提示词,负面提示词,中文对照,评价";
        const rows = entries.map((e) => {
            const platform = PLATFORM_LIST.find((p) => p.id === e.platform)?.label || e.platform;
            const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
            return [platform, e.category, esc(e.input), esc(e.prompt), esc(e.negativePrompt ?? ""), esc(e.translation ?? ""), e.rating === 1 ? "正面" : e.rating === -1 ? "负面" : ""].join(",");
        });
        const bom = "\uFEFF";
        const blob = new Blob([bom + header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
        saveAs(blob, `${current.title || "prompts"}.csv`);
    };

    const handleSaveToAssets = () => {
        const entries = getFilteredEntries();
        if (entries.length === 0) { message.warning("筛选后无条目"); return; }
        entries.forEach((entry) => {
            const platform = PLATFORM_LIST.find((p) => p.id === entry.platform)?.label || entry.platform;
            addAsset({ kind: "text", title: `[${platform}] ${entry.input.slice(0, 30)}`, coverUrl: "", tags: [platform, ...(entry.styles?.map((s) => STYLE_PRESETS.find((p) => p.id === s.id)?.label ?? s.id) ?? ["提示词"])], source: "prompt-studio", data: { content: entry.prompt } });
        });
        message.success(`已保存 ${entries.length} 条到资产库`);
    };

    const handleSave = async () => {
        await saveCurrent();
        message.success("项目已保存");
    };

    return (
        <section className="border-t border-stone-200 pt-4 dark:border-stone-800">
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-stone-500">导出筛选：</span>
                <Select size="small" value={filterPlatform} onChange={setFilterPlatform} className="!w-32" options={[
                    { label: "全部平台", value: "all" },
                    ...usedPlatforms.map((p) => ({ label: PLATFORM_LIST.find((pl) => pl.id === p)?.label || p, value: p })),
                ]} />
                <Select size="small" value={filterRating} onChange={setFilterRating} className="!w-28" options={[
                    { label: "全部评价", value: "all" },
                    { label: "仅已点赞", value: "positive" },
                    { label: "仅已标记", value: "negative" },
                    { label: "已评价的", value: "rated" },
                ]} />
                <span className="text-xs text-stone-400">({getFilteredEntries().length} 条)</span>
            </div>
            <Space wrap>
                <Button icon={<Copy className="size-4" />} onClick={handleCopyAll}>复制</Button>
                <Button icon={<Download className="size-4" />} onClick={handleDownloadTxt}>TXT</Button>
                <Button icon={<Download className="size-4" />} onClick={handleDownloadJson}>JSON</Button>
                <Button icon={<FileSpreadsheet className="size-4" />} onClick={handleDownloadCsv}>CSV</Button>
                <Button icon={<FolderPlus className="size-4" />} onClick={handleSaveToAssets}>存入资产</Button>
                <Button type="primary" onClick={handleSave}>保存项目</Button>
            </Space>
        </section>
    );
}
