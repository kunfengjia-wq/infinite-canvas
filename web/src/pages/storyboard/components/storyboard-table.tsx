import { Copy, ChevronDown, ChevronUp, Download, FileText, Maximize2, Minimize2, Search, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Input, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { saveAs } from "file-saver";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { useCopyText } from "@/hooks/use-copy-text";
import type { Shot } from "@/types/storyboard";

type TableRow = Shot & { sceneId: string; sceneTitle: string; key: string };

type Props = {
    variant?: "bottom" | "panel";
    /** 宽面板模式：显示完整列 */
    wide?: boolean;
    maximized?: boolean;
    onToggleMaximize?: () => void;
    /** 导出整表到提示词工作台 */
    onExportToPrompt?: (storyboardId: string, tab?: "visual" | "storyboard" | "asset") => void;
};

/** 解析时长字符串为秒数，如 "3s" / "3秒" / "3-5s" → 取首个数字 */
function parseDuration(d?: string): number {
    if (!d) return 0;
    const m = d.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
}

export function StoryboardTable({ variant = "bottom", wide = false, maximized = false, onToggleMaximize, onExportToPrompt }: Props) {
    const current = useStoryboardStore((s) => s.current);
    const updateShotDescription = useStoryboardStore((s) => s.updateShotDescription);
    const updateShot = useStoryboardStore((s) => s.updateShot);
    const copyText = useCopyText();
    const [collapsed, setCollapsed] = useState(false);
    const [search, setSearch] = useState("");

    const allRows: TableRow[] = useMemo(() => {
        if (!current) return [];
        return current.scenes.flatMap((scene) =>
            scene.shots.map((shot) => ({ ...shot, sceneId: scene.id, sceneTitle: scene.title, key: shot.id })),
        );
    }, [current]);

    // 搜索过滤
    const rows = useMemo(() => {
        if (!search.trim()) return allRows;
        const q = search.trim().toLowerCase();
        return allRows.filter(
            (r) =>
                r.action.toLowerCase().includes(q) ||
                (r.dialogue || "").toLowerCase().includes(q) ||
                r.sceneTitle.toLowerCase().includes(q) ||
                r.visualDescription.toLowerCase().includes(q) ||
                r.shotType.includes(q) ||
                r.angle.includes(q) ||
                (r.cameraMovement || "").includes(q) ||
                (r.lighting || "").includes(q) ||
                (r.composition || "").includes(q),
        );
    }, [allRows, search]);

    // 统计
    const stats = useMemo(() => {
        const totalDuration = allRows.reduce((sum, r) => sum + parseDuration(r.duration), 0);
        const sceneCount = new Set(allRows.map((r) => r.sceneId)).size;
        return { shots: allRows.length, duration: totalDuration, scenes: sceneCount };
    }, [allRows]);

    if (!current || allRows.length === 0) return null;

    const handleCopyTable = () => {
        const header = "序号\t场景\t景别\t角度\t运镜\t光线\t构图\t动作\t对白\t时长\t画面描述";
        const body = rows.map((r, i) =>
            [i + 1, r.sceneTitle, r.shotType, r.angle, r.cameraMovement || "", r.lighting || "", r.composition || "", r.action, r.dialogue || "", r.duration || "", r.visualDescription].join("\t"),
        );
        copyText([header, ...body].join("\n"), "分镜表已复制（可粘贴到 Excel）");
    };

    const handleExportCsv = () => {
        const BOM = "\uFEFF";
        const header = "序号,场景,景别,角度,运镜,焦距,光线,构图,转场,动作,对白,时长,画面描述";
        const body = rows.map((r, i) =>
            [i + 1, `"${r.sceneTitle}"`, r.shotType, r.angle, r.cameraMovement || "", r.lens || "", r.lighting || "", r.composition || "", r.transition || "", `"${r.action.replace(/"/g, '""')}"`, `"${(r.dialogue || "").replace(/"/g, '""')}"`, r.duration || "", `"${r.visualDescription.replace(/"/g, '""')}"`].join(","),
        );
        const blob = new Blob([BOM + [header, ...body].join("\n")], { type: "text/csv;charset=utf-8" });
        saveAs(blob, `${current.title || "分镜表"}.csv`);
    };

    const handleExportPdf = async () => {
        // 使用浏览器原生打印（支持中文）
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            console.error("无法打开打印窗口");
            return;
        }
        
        const rows = current.scenes.flatMap((s) => (s.shots ?? []).map((sh) => ({ ...sh, sceneTitle: s.title || `场景 ${s.index + 1}` })));
        
        const htmlRows = rows.map((r, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${r.sceneTitle}</td>
                <td>${r.shotType || ""}</td>
                <td>${r.angle || ""}</td>
                <td>${r.cameraMovement || ""}</td>
                <td>${r.action || ""}</td>
                <td>${r.dialogue || ""}</td>
                <td>${r.visualDescription || ""}</td>
            </tr>
        `).join("");
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html><head><meta charset="utf-8"><title>${current.title || "分镜表"}</title>
            <style>
                body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 10px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
                th { background: #f5f5f5; font-weight: bold; }
                h1 { font-size: 16px; margin-bottom: 10px; }
            </style></head><body>
            <h1>${current.title || "分镜表"}</h1>
            <table>
                <thead><tr><th>#</th><th>场景</th><th>景别</th><th>角度</th><th>运镜</th><th>动作</th><th>对白</th><th>画面描述</th></tr></thead>
                <tbody>${htmlRows}</tbody>
            </table>
            </body></html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    // ─── 统计栏 ───
    const statsBar = (
        <div className="flex items-center gap-2 text-[10px] text-stone-400">
            <span className="rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">{stats.shots} 镜头</span>
            {stats.duration > 0 && <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-stone-800">≈{stats.duration}s</span>}
            <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-stone-800">{stats.scenes} 场景</span>
        </div>
    );

    // ─── 完整列（宽面板 + 底部模式共用） ───
    const fullColumns: ColumnsType<TableRow> = [
        { title: "#", dataIndex: "index", width: 36, render: (_, __, i) => <span className="text-xs text-stone-400">{i + 1}</span> },
        { title: "场景", dataIndex: "sceneTitle", width: 90, render: (v: string) => <span className="whitespace-normal break-all text-xs text-stone-500">{v}</span> },
        { title: "景别", dataIndex: "shotType", width: 58, render: (v: string) => <Tag className="m-0 scale-90">{v}</Tag> },
        { title: "角度", dataIndex: "angle", width: 58, render: (v: string) => <Tag className="m-0 scale-90" color="geekblue">{v}</Tag> },
        { title: "镜头语言", key: "cinematography", width: 130, render: (_, row) => (
            <div className="flex flex-wrap gap-0.5">
                {row.cameraMovement && <Tag className="m-0 scale-90" color="cyan">{row.cameraMovement}</Tag>}
                {row.lens && <Tag className="m-0 scale-90" color="green">{row.lens}</Tag>}
                {row.lighting && <Tag className="m-0 scale-90" color="gold">{row.lighting}</Tag>}
                {row.composition && <Tag className="m-0 scale-90" color="purple">{row.composition}</Tag>}
                {row.transition && <Tag className="m-0 scale-90" color="volcano">→{row.transition}</Tag>}
                {!row.cameraMovement && !row.lens && !row.lighting && !row.composition && !row.transition && <span className="text-xs text-stone-300">-</span>}
            </div>
        )},
        { title: "动作", dataIndex: "action", width: 200, render: (v: string, row) => (
            <Input.TextArea size="small" variant="borderless" autoSize={{ minRows: 2, maxRows: 8 }} value={v} onChange={(e) => updateShot(row.sceneId, row.id, { action: e.target.value })} className="!px-0 text-xs leading-relaxed" />
        )},
        { title: "对白", dataIndex: "dialogue", width: 160, render: (v: string | undefined, row) => (
            <Input.TextArea size="small" variant="borderless" autoSize={{ minRows: 1, maxRows: 6 }} value={v || ""} onChange={(e) => updateShot(row.sceneId, row.id, { dialogue: e.target.value || undefined })} placeholder="-" className="!px-0 text-xs leading-relaxed text-amber-600 dark:text-amber-400" />
        )},
        { title: "时长", dataIndex: "duration", width: 44, render: (v?: string) => <span className="text-xs text-stone-400">{v || "-"}</span> },
        { title: "画面描述", dataIndex: "visualDescription", width: 260, render: (v: string, row) => (
            <Input.TextArea size="small" variant="borderless" autoSize={{ minRows: 2, maxRows: 10 }} value={v} onChange={(e) => updateShotDescription(row.sceneId, row.id, e.target.value)} placeholder="待生成" className="!px-0 text-xs leading-relaxed text-stone-500" />
        )},
    ];

    // ─── 紧凑列（窄面板） ───
    const compactColumns: ColumnsType<TableRow> = [
        { title: "#", dataIndex: "index", width: 30, render: (_, __, i) => <span className="text-[10px] text-stone-400">{i + 1}</span> },
        { title: "景别", dataIndex: "shotType", width: 50, render: (v: string) => <Tag className="m-0 scale-75">{v}</Tag> },
        { title: "动作", dataIndex: "action", render: (v: string, row) => (
            <Input.TextArea size="small" variant="borderless" autoSize={{ minRows: 2, maxRows: 8 }} value={v} onChange={(e) => updateShot(row.sceneId, row.id, { action: e.target.value })} className="!px-0 text-[11px] leading-relaxed" />
        )},
        { title: "对白", dataIndex: "dialogue", width: 110, render: (v: string | undefined, row) => (
            <Input.TextArea size="small" variant="borderless" autoSize={{ minRows: 1, maxRows: 6 }} value={v || ""} onChange={(e) => updateShot(row.sceneId, row.id, { dialogue: e.target.value || undefined })} placeholder="-" className="!px-0 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400" />
        )},
    ];

    // ─── 面板模式渲染 ───
    if (variant === "panel") {
        const columns = wide ? fullColumns : compactColumns;
        return (
            <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2 dark:border-stone-800">
                    <span className="text-xs font-medium text-stone-600 dark:text-stone-300">
                        全局分镜表 <span className="text-stone-400">({rows.length}{search ? `/${allRows.length}` : ""})</span>
                    </span>
                    <div className="flex gap-0.5">
                        {onToggleMaximize && (
                            <Tooltip title={maximized ? "还原" : "最大化（完整视图）"}>
                                <Button type="text" size="small" icon={maximized ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />} onClick={onToggleMaximize} />
                            </Tooltip>
                        )}
                        <Button type="text" size="small" icon={<Copy className="size-3" />} onClick={handleCopyTable} title="复制全表" />
                        <Button type="text" size="small" icon={<Download className="size-3" />} onClick={handleExportCsv} title="导出 CSV" />
                        <Button type="text" size="small" icon={<FileText className="size-3" />} onClick={() => void handleExportPdf()} title="导出 PDF" />
                        {onExportToPrompt && (
                            <Tooltip title="将整表导入提示词工作台生成提示词">
                                <Button type="primary" size="small" icon={<Send className="size-3" />} onClick={() => onExportToPrompt(current.id, "storyboard")}>去提示词</Button>
                            </Tooltip>
                        )}
                    </div>
                </div>
                <div className="space-y-1.5 border-b border-stone-100 px-3 py-2 dark:border-stone-800">
                    {statsBar}
                    <Input
                        size="small"
                        prefix={<Search className="size-3 text-stone-400" />}
                        placeholder="搜索动作/对白/场景…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        allowClear
                        className="!text-[11px]"
                    />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
                    <Table
                        dataSource={rows}
                        columns={columns}
                        size="small"
                        pagination={false}
                        scroll={wide ? { x: 640, y: "calc(100vh - 260px)" } : { y: "calc(100vh - 260px)" }}
                        className={wide ? "[&_.ant-table]:!text-xs [&_.ant-table-cell]:!py-1 [&_.ant-table-cell]:!px-1.5" : "[&_.ant-table]:!text-[11px] [&_.ant-table-cell]:!py-0.5 [&_.ant-table-cell]:!px-1"}
                    />
                </div>
            </div>
        );
    }

    // ─── 底部模式渲染 ───
    return (
        <div className="flex flex-col">
            <div className="flex items-center justify-between px-4 py-1.5">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setCollapsed(!collapsed)}
                        className="flex items-center gap-2 text-xs font-medium text-stone-500 transition hover:text-stone-700 dark:hover:text-stone-300"
                    >
                        {collapsed ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        全局分镜表 ({rows.length}{search ? `/${allRows.length}` : ""} 镜头)
                    </button>
                    {statsBar}
                </div>
                <div className="flex items-center gap-1">
                    <Input
                        size="small"
                        prefix={<Search className="size-3 text-stone-400" />}
                        placeholder="搜索…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        allowClear
                        className="!w-36 !text-xs"
                    />
                    <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={handleCopyTable} className="!text-xs">复制</Button>
                    <Button type="text" size="small" icon={<Download className="size-3.5" />} onClick={handleExportCsv} className="!text-xs">CSV</Button>
                    <Button type="text" size="small" icon={<FileText className="size-3.5" />} onClick={() => void handleExportPdf()} className="!text-xs">PDF</Button>
                    {onExportToPrompt && (
                        <Button type="primary" size="small" icon={<Send className="size-3.5" />} onClick={() => onExportToPrompt(current.id, "storyboard")} className="!text-xs">去提示词工作台</Button>
                    )}
                </div>
            </div>
            {!collapsed && (
                <div className="max-h-52 overflow-y-auto px-2 pb-2">
                    <Table
                        dataSource={rows}
                        columns={fullColumns}
                        size="small"
                        pagination={false}
                        scroll={{ x: 800 }}
                        className="[&_.ant-table]:!text-xs [&_.ant-table-cell]:!py-1"
                    />
                </div>
            )}
        </div>
    );
}
