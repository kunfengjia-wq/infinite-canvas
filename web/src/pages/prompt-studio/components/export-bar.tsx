import { Copy, Download, FolderPlus } from "lucide-react";
import { App, Button, Space } from "antd";
import { saveAs } from "file-saver";

import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { useCopyText } from "@/hooks/use-copy-text";
import { useAssetStore } from "@/stores/use-asset-store";
import { PLATFORM_LIST } from "@/types/prompt-studio";

export function ExportBar() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const addAsset = useAssetStore((state) => state.addAsset);
    const { current, saveCurrent } = usePromptStudioStore();

    if (!current || current.entries.length === 0) return null;

    const handleCopyAll = () => {
        const text = current.entries.map((e) => {
            const platform = PLATFORM_LIST.find((p) => p.id === e.platform)?.label || e.platform;
            let line = `[${platform}] ${e.prompt}`;
            if (e.negativePrompt) line += `\nNegative: ${e.negativePrompt}`;
            return line;
        }).join("\n\n---\n\n");
        copyText(text, "已复制全部提示词");
    };

    const handleDownloadTxt = () => {
        const text = current.entries.map((e) => {
            const platform = PLATFORM_LIST.find((p) => p.id === e.platform)?.label || e.platform;
            let line = `=== ${platform} ===\n输入: ${e.input}\n提示词: ${e.prompt}`;
            if (e.negativePrompt) line += `\n负面提示词: ${e.negativePrompt}`;
            return line;
        }).join("\n\n");
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        saveAs(blob, `${current.title || "prompts"}.txt`);
    };

    const handleDownloadJson = () => {
        const blob = new Blob([JSON.stringify(current.entries, null, 2)], { type: "application/json" });
        saveAs(blob, `${current.title || "prompts"}.json`);
    };

    const handleSaveToAssets = () => {
        current.entries.forEach((entry) => {
            const platform = PLATFORM_LIST.find((p) => p.id === entry.platform)?.label || entry.platform;
            addAsset({ kind: "text", title: `[${platform}] ${entry.input.slice(0, 30)}`, coverUrl: "", tags: [platform, entry.style || "提示词"], source: "prompt-studio", data: { content: entry.prompt } });
        });
        message.success(`已保存 ${current.entries.length} 条到资产库`);
    };

    const handleSave = async () => {
        await saveCurrent();
        message.success("项目已保存");
    };

    return (
        <section className="border-t border-stone-200 pt-4 dark:border-stone-800">
            <Space wrap>
                <Button icon={<Copy className="size-4" />} onClick={handleCopyAll}>复制全部</Button>
                <Button icon={<Download className="size-4" />} onClick={handleDownloadTxt}>下载 TXT</Button>
                <Button icon={<Download className="size-4" />} onClick={handleDownloadJson}>下载 JSON</Button>
                <Button icon={<FolderPlus className="size-4" />} onClick={handleSaveToAssets}>保存到资产</Button>
                <Button type="primary" onClick={handleSave}>保存项目</Button>
            </Space>
        </section>
    );
}
