import { LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { App, Button, Input, Select } from "antd";

import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { aiGeneratePrompt } from "@/services/prompt-studio-ai";
import type { AiConfig } from "@/stores/use-config-store";
import { PROMPT_CATEGORIES, type PromptCategory } from "@/types/prompt-studio";

export function InputPanel({ config, onError }: { config: AiConfig; onError: (msg: string) => void }) {
    const { message } = App.useApp();
    const { selectedPlatform, selectedStyle, generating, setGenerating, addEntry, current, createProject } = usePromptStudioStore();
    const [input, setInput] = useState("");
    const [category, setCategory] = useState<PromptCategory>("general");
    const [streamText, setStreamText] = useState("");

    const handleGenerate = async () => {
        if (!input.trim()) {
            message.warning("请输入画面描述");
            return;
        }
        // 确保有当前项目
        if (!current) {
            await createProject(`提示词 ${new Date().toLocaleDateString()}`);
        }
        setGenerating(true);
        setStreamText("");
        try {
            const result = await aiGeneratePrompt(config, { input: input.trim(), platform: selectedPlatform, style: selectedStyle || undefined }, (delta) => setStreamText((prev) => prev + delta));
            addEntry({ input: input.trim(), platform: selectedPlatform, prompt: result.prompt, negativePrompt: result.negativePrompt, style: selectedStyle || undefined, category });
            await usePromptStudioStore.getState().saveCurrent();
            message.success("提示词已生成");
        } catch (error) {
            onError(error instanceof Error ? error.message : "生成失败");
        } finally {
            setGenerating(false);
        }
    };

    return (
        <section>
            <h3 className="mb-3 text-sm font-medium text-stone-600 dark:text-stone-300">输入描述</h3>
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <Select
                        value={category}
                        onChange={setCategory}
                        className="w-28"
                        options={PROMPT_CATEGORIES.map((c) => ({ label: c.label, value: c.id }))}
                        size="small"
                    />
                    <span className="text-xs text-stone-400">选择提示词类型</span>
                </div>
                <Input.TextArea
                    rows={4}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="输入画面描述、概念或从分镜工作台导入的镜头描述...&#10;&#10;示例：一个女孩站在雨中的东京街头，霓虹灯倒映在积水中，她撑着透明雨伞，回头微笑"
                    className="text-sm"
                />
                <div className="flex items-center gap-3">
                    <Button type="primary" icon={generating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} loading={generating} onClick={handleGenerate} disabled={!input.trim()}>
                        生成提示词
                    </Button>
                    <span className="text-xs text-stone-400">将转化为当前平台格式</span>
                </div>
                {generating && streamText && (
                    <div className="rounded-md border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-900">
                        <pre className="whitespace-pre-wrap text-xs text-stone-500">{streamText}</pre>
                    </div>
                )}
            </div>
        </section>
    );
}
