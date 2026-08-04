import { useEffect, useState } from "react";
import { Tag, Tooltip } from "antd";

import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { getFewShotStatus, getSkillSource } from "@/services/prompt-studio-ai";
import type { AiConfig } from "@/stores/use-config-store";
import { PLATFORM_LIST, type PromptPlatform } from "@/types/prompt-studio";

type PlatformStatus = {
    platform: PromptPlatform;
    label: string;
    skill: "remote" | "local";
    dataset: string;
    available: boolean;
};

/**
 * 后端状态条：展示当前生成配置的真实后端状态
 * 让用户看到所选平台用的是远程/本地 skill、few-shot 参考示例是否命中、调用的模型，
 * 解决「前端可选但看不见后端状态」的问题。
 */
export function GenerationStatus({ config }: { config: AiConfig }) {
    const selectedPlatforms = usePromptStudioStore((s) => s.selectedPlatforms);
    const [statuses, setStatuses] = useState<PlatformStatus[]>([]);

    useEffect(() => {
        let cancelled = false;
        void Promise.all(
            selectedPlatforms.map(
                async (platform): Promise<PlatformStatus> => {
                    const [skill, fewshot] = await Promise.all([getSkillSource(platform), getFewShotStatus(platform)]);
                    return {
                        platform,
                        label: PLATFORM_LIST.find((p) => p.id === platform)?.label || platform,
                        skill,
                        dataset: fewshot.dataset,
                        available: fewshot.available,
                    };
                },
            ),
        ).then((res) => {
            if (!cancelled) setStatuses(res);
        });
        return () => {
            cancelled = true;
        };
    }, [selectedPlatforms, config.model, config.textModel]);

    const model = config.model || config.textModel || "未配置";

    return (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-400">
            <span className="mr-1">后端状态</span>
            <Tag className="m-0">模型：{model}</Tag>
            {statuses.map((s) => (
                <Tooltip key={s.platform} title={`数据集：${s.dataset}（${s.available ? "有参考示例" : "无参考示例，使用通用兜底"}）`}>
                    <Tag className="m-0" color={s.skill === "remote" ? "geekblue" : "default"}>
                        {s.label}·{s.skill === "remote" ? "远程" : "本地"}·示例{s.available ? "✓" : "✗"}
                    </Tag>
                </Tooltip>
            ))}
        </div>
    );
}
