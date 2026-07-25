import { ChevronDown, FileText, FileUp, LoaderCircle, Settings2, Sparkles } from "lucide-react";
import { useState } from "react";
import { App, Button, Collapse, Input, InputNumber, Select, Upload } from "antd";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { aiGenerateScript } from "@/services/storyboard-ai";
import { PROJECT_TYPES, toSelectOptions } from "@/data/cinematography";
import { toGroupedSelectOptions } from "@/data/visual-styles";
import { PLATFORM_LIST } from "@/types/prompt-studio";
import type { AiConfig } from "@/stores/use-config-store";

// 配置 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const ACCEPT_TYPES = ".txt,.md,.text,.docx,.doc,.pdf,.rtf";

/** 解析 .docx 文件为纯文本 */
async function parseDocx(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
}

/** 解析 .pdf 文件为纯文本 */
async function parsePdf(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item) => ("str" in item ? item.str : "")).join("");
        pages.push(text);
    }
    return pages.join("\n\n");
}

/** 根据文件类型解析内容 */
async function parseFile(file: File): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    switch (ext) {
        case "docx":
        case "doc":
            return parseDocx(file);
        case "pdf":
            return parsePdf(file);
        case "txt":
        case "md":
        case "text":
        case "rtf":
        default:
            return file.text();
    }
}

export function ScriptInput({ config }: { config: AiConfig }) {
    const { message } = App.useApp();
    const [title, setTitle] = useState("");
    const [script, setScript] = useState("");
    const [parsing, setParsing] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [fileName, setFileName] = useState("");
    // 项目配置
    const [projectType, setProjectType] = useState<string | undefined>(undefined);
    const [targetDuration, setTargetDuration] = useState<number | null>(null);
    const [visualStyle, setVisualStyle] = useState<string | undefined>(undefined);
    const [targetPlatform, setTargetPlatform] = useState<string | undefined>(undefined);
    const { createProject, setStep, current } = useStoryboardStore();

    const projectTypeOptions = toSelectOptions(PROJECT_TYPES);
    const styleOptions = toGroupedSelectOptions();
    const platformOptions = PLATFORM_LIST.map((p) => ({ label: `${p.label}（${p.category === "video" ? "视频" : "图片"}）`, value: p.label }));

    /** 风格 Select 支持自定义输入（用户可能输入数据库之外的风格） */
    const styleOptionsWithCustom = (current?: string) => {
        if (!current) return styleOptions;
        const exists = styleOptions.some((g) => g.options.some((o) => o.value === current));
        if (exists) return styleOptions;
        return [...styleOptions, { label: "自定义", options: [{ label: current, value: current }] }];
    };

    const handleFile = async (file: File) => {
        setParsing(true);
        setFileName(file.name);
        try {
            const text = await parseFile(file);
            if (!text.trim()) {
                message.warning("文件内容为空或无法解析");
                return;
            }
            setScript(text);
            if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
            message.success(`已导入「${file.name}」（${text.length} 字）`);
        } catch (error) {
            message.error(error instanceof Error ? `文件解析失败: ${error.message}` : "文件解析失败，请尝试其他格式");
        } finally {
            setParsing(false);
        }
    };

    const handleStart = async () => {
        if (!script.trim()) {
            message.warning("请输入剧本内容");
            return;
        }
        const projectTitle = title.trim() || `分镜项目 ${new Date().toLocaleDateString()}`;
        const meta = {
            projectType: projectType || undefined,
            targetDuration: targetDuration || undefined,
            visualStyle: visualStyle || undefined,
            targetPlatform: targetPlatform || undefined,
        };
        if (current && current.status === "draft" && !(current.scenes ?? []).length) {
            useStoryboardStore.setState((state) => ({
                current: state.current ? { ...state.current, title: projectTitle, script: script.trim(), ...meta } : state.current,
            }));
            await useStoryboardStore.getState().saveCurrent();
        } else {
            const id = await createProject(projectTitle, script.trim());
            // 创建后补充元信息
            useStoryboardStore.setState((state) => ({
                current: state.current?.id === id ? { ...state.current, ...meta } : state.current,
                projects: state.projects.map((p) => (p.id === id ? { ...p, ...meta } : p)),
            }));
            await useStoryboardStore.getState().saveCurrent();
        }
        setStep(2);
        message.success("项目已创建，进入资产提取");
    };

    const handleAiGenerate = async () => {
        const concept = script.trim();
        if (!concept) {
            message.warning("请先输入故事概念/灵感，再使用 AI 生成");
            return;
        }
        setGenerating(true);
        try {
            const mode = concept.length > 200 ? "rewrite" : "generate";
            const result = await aiGenerateScript(config, concept, mode);
            setScript(result);
            if (!title) setTitle("AI 生成剧本");
            message.success(mode === "rewrite" ? "剧本已改写优化" : "剧本已生成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AI 生成失败");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="mx-auto max-w-3xl">
            <div className="mb-6">
                <h2 className="text-lg font-medium">输入剧本</h2>
                <p className="mt-1 text-sm text-stone-500">粘贴剧本文本或上传文件（支持 .docx / .pdf / .txt / .md）</p>
            </div>

            <div className="space-y-4">
                <Input
                    size="large"
                    placeholder="项目名称（可选）"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    prefix={<FileText className="size-4 text-stone-400" />}
                />

                {/* 项目配置（可选） */}
                <Collapse
                    ghost
                    expandIcon={({ isActive }) => <ChevronDown className={`size-4 text-stone-400 transition-transform ${isActive ? "rotate-180" : ""}`} />}
                    items={[{
                        key: "config",
                        label: (
                            <span className="flex items-center gap-2 text-sm text-stone-500">
                                <Settings2 className="size-4" />
                                项目配置（可选，影响 AI 生成风格）
                                {projectType && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-950 dark:text-blue-400">{projectType}</span>}
                                {visualStyle && <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-600 dark:bg-purple-950 dark:text-purple-400">{visualStyle}</span>}
                            </span>
                        ),
                        children: (
                            <div className="grid gap-3 rounded-lg border border-stone-200 bg-stone-50/50 p-4 sm:grid-cols-2 dark:border-stone-700 dark:bg-stone-900/30">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-stone-500">项目类型</label>
                                    <Select
                                        value={projectType}
                                        onChange={setProjectType}
                                        options={projectTypeOptions}
                                        placeholder="广告宣传片 / 微电影 / MV..."
                                        allowClear
                                        showSearch
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-stone-500">目标时长（秒）</label>
                                    <InputNumber
                                        value={targetDuration}
                                        onChange={setTargetDuration}
                                        min={5}
                                        max={3600}
                                        placeholder="如 60"
                                        className="!w-full"
                                        addonAfter="秒"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-stone-500">视觉风格偏好</label>
                                    <Select
                                        value={visualStyle}
                                        onChange={setVisualStyle}
                                        options={styleOptionsWithCustom(visualStyle)}
                                        placeholder="电影写实 / 3DCG / 赛博朋克..."
                                        allowClear
                                        showSearch
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-stone-500">目标生成平台</label>
                                    <Select
                                        value={targetPlatform}
                                        onChange={setTargetPlatform}
                                        options={platformOptions}
                                        placeholder="可灵 / Runway / Midjourney..."
                                        allowClear
                                        showSearch
                                        className="w-full"
                                    />
                                </div>
                            </div>
                        ),
                    }]}
                />

                {/* 拖拽上传区域 */}
                <Upload.Dragger
                    accept={ACCEPT_TYPES}
                    showUploadList={false}
                    beforeUpload={(file) => {
                        void handleFile(file);
                        return false; // 阻止自动上传
                    }}
                    disabled={parsing}
                    className="!border-stone-300 !bg-stone-50 dark:!border-stone-700 dark:!bg-stone-900/50"
                >
                    <div className="py-4">
                        {parsing ? (
                            <div className="flex flex-col items-center gap-2">
                                <LoaderCircle className="size-8 animate-spin text-stone-400" />
                                <p className="text-sm text-stone-500">正在解析 {fileName}...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <FileUp className="size-8 text-stone-400" />
                                <p className="text-sm text-stone-600 dark:text-stone-300">点击或拖拽剧本文件到此处</p>
                                <p className="text-xs text-stone-400">支持 Word (.docx)、PDF (.pdf)、纯文本 (.txt / .md)</p>
                            </div>
                        )}
                    </div>
                </Upload.Dragger>

                <Input.TextArea
                    rows={14}
                    placeholder={"或直接在此粘贴剧本内容...\n\n示例：\n第一幕 教室 白天\n\n老师站在讲台上，手里拿着一叠试卷。\n老师：这次考试成绩出来了...\n小明紧张地低下头..."}
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    className="font-mono text-sm"
                />

                <div className="flex items-center gap-3">
                    <Button type="primary" size="large" onClick={handleStart} disabled={!script.trim() || parsing || generating}>
                        开始解析
                    </Button>
                    <Button size="large" icon={generating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} onClick={handleAiGenerate} disabled={!script.trim() || parsing || generating}>
                        {generating ? "AI 生成中..." : "AI 生成/改写剧本"}
                    </Button>
                    {fileName && script.trim() && <span className="text-xs text-stone-400">来源: {fileName}</span>}
                    {script.trim() && <span className="text-xs text-stone-400">{script.length} 字</span>}
                </div>
            </div>
        </div>
    );
}
