import { FileText, FileUp, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { App, Button, Input, Upload } from "antd";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";

import { useStoryboardStore } from "@/stores/use-storyboard-store";

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

export function ScriptInput() {
    const { message } = App.useApp();
    const [title, setTitle] = useState("");
    const [script, setScript] = useState("");
    const [parsing, setParsing] = useState(false);
    const [fileName, setFileName] = useState("");
    const { createProject, setStep, current } = useStoryboardStore();

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
        if (current && current.status === "draft" && !current.scenes.length) {
            useStoryboardStore.setState((state) => ({
                current: state.current ? { ...state.current, title: projectTitle, script: script.trim() } : state.current,
            }));
            await useStoryboardStore.getState().saveCurrent();
        } else {
            await createProject(projectTitle, script.trim());
        }
        setStep(2);
        message.success("项目已创建，进入资产提取");
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
                    <Button type="primary" size="large" onClick={handleStart} disabled={!script.trim() || parsing}>
                        开始解析
                    </Button>
                    {fileName && script.trim() && <span className="text-xs text-stone-400">来源: {fileName}</span>}
                    {script.trim() && <span className="text-xs text-stone-400">{script.length} 字</span>}
                </div>
            </div>
        </div>
    );
}
