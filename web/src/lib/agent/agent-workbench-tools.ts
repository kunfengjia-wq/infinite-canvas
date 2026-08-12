/**
 * Agent 工作台工具 - 覆盖分镜/提示词/剧本创作三个工作台的全部 AI 能力
 * 供外部 Agent 后端通过 function calling 调用
 */
import type { AiConfig } from "@/stores/use-config-store";
import type { AiSceneResult, AiShotResult, StoryAssets } from "@/types/storyboard";
import type { PromptGenerateRequest, PromptPlatform } from "@/types/prompt-studio";
import type { InspirationCard, InspirationCardType, SettingProposal, StructureProposal, StoryBeat } from "@/types/script-creation";

import {
    aiGenerateScript,
    aiExtractAssets,
    aiSplitScenes,
    aiGenerateShots,
    aiGenerateVisualDescription,
    aiCharacterConsistency,
    aiSuggestTransition,
    aiRegenerateAsset,
} from "@/services/storyboard-ai";

import {
    aiGeneratePrompt,
    aiOptimizePrompt,
    aiScorePrompt,
    aiTransferStyle,
    type PromptGenerateResult,
    type QualityScoreResult,
} from "@/services/prompt-studio-ai";

import {
    aiRefreshSeedExamples,
    aiGenerateInspirationCards,
    aiRefreshCardsByType,
    aiGenerateSettings,
    aiRegenerateCharacter,
    aiGenerateStructures,
    aiGenerateSegment,
    aiRewriteSegment,
    aiSummarizeContext,
    aiConsistencyCheck,
    aiFixConsistencyIssues,
    aiDivergeFromBubble,
} from "@/services/script-creation-ai";

// ─── 工具名列表 ────────────────────────────────────────────────────

export const WORKBENCH_TOOL_NAMES = [
    // 分镜工作台（8）
    "storyboard_generate_script",
    "storyboard_extract_assets",
    "storyboard_split_scenes",
    "storyboard_generate_shots",
    "storyboard_generate_description",
    "storyboard_character_consistency",
    "storyboard_suggest_transition",
    "storyboard_regenerate_asset",
    // 提示词工作台（4）
    "prompt_generate",
    "prompt_optimize",
    "prompt_score",
    "prompt_transfer_style",
    // 剧本创作工作台（12）
    "script_refresh_seed",
    "script_generate_inspiration",
    "script_refresh_cards_by_type",
    "script_generate_settings",
    "script_regenerate_character",
    "script_generate_structures",
    "script_generate_segment",
    "script_rewrite_segment",
    "script_summarize_context",
    "script_consistency_check",
    "script_fix_consistency",
    "script_diverge_bubble",
] as const;

export type WorkbenchToolName = (typeof WORKBENCH_TOOL_NAMES)[number];

export function isWorkbenchTool(name: string): name is WorkbenchToolName {
    return (WORKBENCH_TOOL_NAMES as readonly string[]).includes(name);
}

// ─── 工具标签 ──────────────────────────────────────────────────────

export const WORKBENCH_TOOL_LABELS: Record<WorkbenchToolName, string> = {
    storyboard_generate_script: "生成剧本",
    storyboard_extract_assets: "提取视觉资产",
    storyboard_split_scenes: "拆分场景",
    storyboard_generate_shots: "生成镜头",
    storyboard_generate_description: "生成画面描述",
    storyboard_character_consistency: "角色一致性检查",
    storyboard_suggest_transition: "转场建议",
    storyboard_regenerate_asset: "重新生成资产",
    prompt_generate: "生成提示词",
    prompt_optimize: "优化提示词",
    prompt_score: "提示词评分",
    prompt_transfer_style: "风格迁移",
    script_refresh_seed: "刷新灵感种子",
    script_generate_inspiration: "生成灵感卡片",
    script_refresh_cards_by_type: "按类型刷新卡片",
    script_generate_settings: "生成设定方案",
    script_regenerate_character: "重新生成角色",
    script_generate_structures: "生成结构方案",
    script_generate_segment: "逐段创作",
    script_rewrite_segment: "重写段落",
    script_summarize_context: "上下文摘要",
    script_consistency_check: "一致性检查",
    script_fix_consistency: "修复一致性",
    script_diverge_bubble: "气泡发散",
};

// ─── OpenAI function calling schemas ───────────────────────────────

export const WORKBENCH_TOOL_SCHEMAS: Record<WorkbenchToolName, object> = {
    storyboard_generate_script: {
        type: "function",
        function: {
            name: "storyboard_generate_script",
            description: "从概念生成剧本，或重写已有剧本",
            parameters: { type: "object", properties: { concept: { type: "string", description: "故事概念/主题" }, mode: { type: "string", enum: ["generate", "rewrite"], description: "生成或重写，默认 generate" } }, required: ["concept"] },
        },
    },
    storyboard_extract_assets: {
        type: "function",
        function: {
            name: "storyboard_extract_assets",
            description: "从剧本中提取角色/场景/道具/产品四类视觉资产",
            parameters: { type: "object", properties: { script: { type: "string", description: "剧本文本" }, visualStyle: { type: "string", description: "视觉风格（可选）" } }, required: ["script"] },
        },
    },
    storyboard_split_scenes: {
        type: "function",
        function: {
            name: "storyboard_split_scenes",
            description: "将剧本拆分为多个场景",
            parameters: { type: "object", properties: { script: { type: "string", description: "剧本文本" } }, required: ["script"] },
        },
    },
    storyboard_generate_shots: {
        type: "function",
        function: {
            name: "storyboard_generate_shots",
            description: "为场景生成镜头列表（景别/角度/动作/视觉描述）",
            parameters: { type: "object", properties: { sceneTitle: { type: "string", description: "场景标题" }, sceneSummary: { type: "string", description: "场景概述" }, script: { type: "string", description: "场景剧本内容" }, assetsContext: { type: "string", description: "资产上下文（可选）" } }, required: ["sceneTitle", "sceneSummary", "script"] },
        },
    },
    storyboard_generate_description: {
        type: "function",
        function: {
            name: "storyboard_generate_description",
            description: "为单个镜头生成详细的画面描述",
            parameters: { type: "object", properties: { shotType: { type: "string", description: "景别（如 远景/全景/中景/近景/特写）" }, angle: { type: "string", description: "角度（如 平视/俯视/仰视）" }, action: { type: "string", description: "动作描述" }, mood: { type: "string", description: "情绪氛围" }, cameraMovement: { type: "string", description: "镜头运动" }, lens: { type: "string", description: "镜头焦距" }, lighting: { type: "string", description: "光线" }, composition: { type: "string", description: "构图" }, sceneContext: { type: "string", description: "场景上下文" }, assetsContext: { type: "string", description: "资产上下文（可选）" }, visualStyle: { type: "string", description: "视觉风格（可选）" } }, required: ["shotType", "angle", "action", "sceneContext"] },
        },
    },
    storyboard_character_consistency: {
        type: "function",
        function: {
            name: "storyboard_character_consistency",
            description: "检查角色描述的一致性",
            parameters: { type: "object", properties: { characterName: { type: "string", description: "角色名称" }, baseDescription: { type: "string", description: "角色基础描述" } }, required: ["characterName", "baseDescription"] },
        },
    },
    storyboard_suggest_transition: {
        type: "function",
        function: {
            name: "storyboard_suggest_transition",
            description: "为两个场景之间建议转场方式",
            parameters: { type: "object", properties: { sceneA: { type: "object", properties: { title: { type: "string" }, summary: { type: "string" }, mood: { type: "string" } }, required: ["title", "summary"], description: "前一个场景" }, sceneB: { type: "object", properties: { title: { type: "string" }, summary: { type: "string" }, mood: { type: "string" } }, required: ["title", "summary"], description: "后一个场景" } }, required: ["sceneA", "sceneB"] },
        },
    },
    storyboard_regenerate_asset: {
        type: "function",
        function: {
            name: "storyboard_regenerate_asset",
            description: "重新生成单个视觉资产",
            parameters: { type: "object", properties: { script: { type: "string", description: "剧本文本" }, assetType: { type: "string", enum: ["characters", "locations", "props", "products"], description: "资产类型" }, assetName: { type: "string", description: "资产名称" }, visualStyle: { type: "string", description: "视觉风格（可选）" } }, required: ["script", "assetType", "assetName"] },
        },
    },
    prompt_generate: {
        type: "function",
        function: {
            name: "prompt_generate",
            description: "为画面描述生成平台专属提示词",
            parameters: { type: "object", properties: { input: { type: "string", description: "画面描述/分镜数据" }, platform: { type: "string", description: "目标平台（如 midjourney/stable-diffusion/kling/seedance 等）" }, customStyle: { type: "string", description: "自定义风格（可选）" }, aspectRatio: { type: "string", description: "画面比例（可选，如 16:9）" } }, required: ["input", "platform"] },
        },
    },
    prompt_optimize: {
        type: "function",
        function: {
            name: "prompt_optimize",
            description: "优化已有提示词的质量",
            parameters: { type: "object", properties: { prompt: { type: "string", description: "原始提示词" }, platform: { type: "string", description: "目标平台" } }, required: ["prompt", "platform"] },
        },
    },
    prompt_score: {
        type: "function",
        function: {
            name: "prompt_score",
            description: "对提示词进行质量评分",
            parameters: { type: "object", properties: { prompt: { type: "string", description: "待评分的提示词" }, platform: { type: "string", description: "目标平台" } }, required: ["prompt", "platform"] },
        },
    },
    prompt_transfer_style: {
        type: "function",
        function: {
            name: "prompt_transfer_style",
            description: "将提示词从一个平台的风格迁移到另一个平台",
            parameters: { type: "object", properties: { prompt: { type: "string", description: "原始提示词" }, sourcePlatform: { type: "string", description: "源平台" }, targetPlatform: { type: "string", description: "目标平台" } }, required: ["prompt", "sourcePlatform", "targetPlatform"] },
        },
    },
    script_refresh_seed: {
        type: "function",
        function: {
            name: "script_refresh_seed",
            description: "AI 实时刷新灵感种子示例（结合时事热点）",
            parameters: { type: "object", properties: {} },
        },
    },
    script_generate_inspiration: {
        type: "function",
        function: {
            name: "script_generate_inspiration",
            description: "从灵感种子生成 6 类灵感卡片",
            parameters: { type: "object", properties: { seed: { type: "string", description: "灵感种子（一句话/关键词）" }, batch: { type: "number", description: "批次号（默认 1）" } }, required: ["seed"] },
        },
    },
    script_refresh_cards_by_type: {
        type: "function",
        function: {
            name: "script_refresh_cards_by_type",
            description: "按类型刷新灵感卡片",
            parameters: { type: "object", properties: { seed: { type: "string", description: "灵感种子" }, cardType: { type: "string", enum: ["character", "world", "conflict", "event", "emotion", "genre"], description: "卡片类型" }, existingTitles: { type: "array", items: { type: "string" }, description: "已有卡片标题（避免重复）" } }, required: ["seed", "cardType"] },
        },
    },
    script_generate_settings: {
        type: "function",
        function: {
            name: "script_generate_settings",
            description: "基于选中的灵感卡片生成 2-3 套故事设定方案",
            parameters: { type: "object", properties: { seed: { type: "string", description: "灵感种子" }, selectedCards: { type: "array", items: { type: "object", properties: { id: { type: "string" }, type: { type: "string" }, title: { type: "string" }, description: { type: "string" }, selected: { type: "boolean" } } }, description: "选中的灵感卡片" } }, required: ["seed", "selectedCards"] },
        },
    },
    script_regenerate_character: {
        type: "function",
        function: {
            name: "script_regenerate_character",
            description: "重新设计单个角色（保持与方案其他元素的兼容性）",
            parameters: { type: "object", properties: { proposal: { type: "object", description: "当前设定方案（完整对象）" }, characterId: { type: "string", description: "要重新设计的角色 ID" } }, required: ["proposal", "characterId"] },
        },
    },
    script_generate_structures: {
        type: "function",
        function: {
            name: "script_generate_structures",
            description: "基于确定的设定生成 2-3 种故事结构方案",
            parameters: { type: "object", properties: { setting: { type: "object", description: "已确定的设定方案（完整对象）" } }, required: ["setting"] },
        },
    },
    script_generate_segment: {
        type: "function",
        function: {
            name: "script_generate_segment",
            description: "按节拍逐段创作剧本",
            parameters: { type: "object", properties: { setting: { type: "object", description: "故事设定（完整对象）" }, structure: { type: "object", description: "故事结构（完整对象）" }, beat: { type: "object", description: "当前节拍（含 index/label/summary/intensity）" }, previousContent: { type: "string", description: "前一段内容（可选）" }, contextSummary: { type: "string", description: "前文摘要（可选）" } }, required: ["setting", "structure", "beat"] },
        },
    },
    script_rewrite_segment: {
        type: "function",
        function: {
            name: "script_rewrite_segment",
            description: "根据修改意见重写单个段落",
            parameters: { type: "object", properties: { beat: { type: "object", description: "当前节拍" }, currentContent: { type: "string", description: "当前段落内容" }, instruction: { type: "string", description: "修改意见" }, setting: { type: "object", description: "故事设定（可选，保持一致性）" }, previousContent: { type: "string", description: "前一段内容（可选）" } }, required: ["beat", "currentContent", "instruction"] },
        },
    },
    script_summarize_context: {
        type: "function",
        function: {
            name: "script_summarize_context",
            description: "将剧本内容压缩为结构化摘要（用于长篇上下文管理）",
            parameters: { type: "object", properties: { content: { type: "string", description: "需要摘要的剧本内容" } }, required: ["content"] },
        },
    },
    script_consistency_check: {
        type: "function",
        function: {
            name: "script_consistency_check",
            description: "检查剧本的一致性（角色/设定/情节/伏笔/节奏）",
            parameters: { type: "object", properties: { setting: { type: "object", description: "故事设定（完整对象）" }, fullScript: { type: "string", description: "完整剧本文本" } }, required: ["setting", "fullScript"] },
        },
    },
    script_fix_consistency: {
        type: "function",
        function: {
            name: "script_fix_consistency",
            description: "根据一致性检查报告修复剧本",
            parameters: { type: "object", properties: { setting: { type: "object", description: "故事设定（完整对象）" }, fullScript: { type: "string", description: "原始剧本" }, report: { type: "string", description: "一致性检查报告" } }, required: ["setting", "fullScript", "report"] },
        },
    },
    script_diverge_bubble: {
        type: "function",
        function: {
            name: "script_diverge_bubble",
            description: "从单个概念发散出关联概念（灵感风暴）",
            parameters: { type: "object", properties: { keyword: { type: "string", description: "要发散的概念词" }, seedContext: { type: "string", description: "剧本灵感种子上下文" }, existingTexts: { type: "array", items: { type: "string" }, description: "已有概念（避免重复）" } }, required: ["keyword", "seedContext"] },
        },
    },
};

// ─── 工具执行入口 ──────────────────────────────────────────────────

type WorkbenchToolInput = Record<string, unknown>;

export async function runWorkbenchTool(name: WorkbenchToolName, input: WorkbenchToolInput, config: AiConfig): Promise<unknown> {
    switch (name) {
        // ─── 分镜工作台 ───
        case "storyboard_generate_script":
            return aiGenerateScript(config, String(input.concept || ""), input.mode === "rewrite" ? "rewrite" : "generate");
        case "storyboard_extract_assets":
            return aiExtractAssets(config, String(input.script || ""), undefined, typeof input.visualStyle === "string" ? input.visualStyle : undefined);
        case "storyboard_split_scenes":
            return aiSplitScenes(config, String(input.script || ""));
        case "storyboard_generate_shots":
            return aiGenerateShots(config, String(input.sceneTitle || ""), String(input.sceneSummary || ""), String(input.script || ""), typeof input.assetsContext === "string" ? input.assetsContext : undefined);
        case "storyboard_generate_description": {
            const shot = {
                shotType: String(input.shotType || ""),
                angle: String(input.angle || ""),
                action: String(input.action || ""),
                mood: typeof input.mood === "string" ? input.mood : undefined,
                dialogue: typeof input.dialogue === "string" ? input.dialogue : undefined,
                cameraMovement: typeof input.cameraMovement === "string" ? input.cameraMovement : undefined,
                lens: typeof input.lens === "string" ? input.lens : undefined,
                lighting: typeof input.lighting === "string" ? input.lighting : undefined,
                composition: typeof input.composition === "string" ? input.composition : undefined,
            };
            return aiGenerateVisualDescription(config, shot, String(input.sceneContext || ""), typeof input.assetsContext === "string" ? input.assetsContext : undefined, undefined, typeof input.visualStyle === "string" ? input.visualStyle : undefined);
        }
        case "storyboard_character_consistency":
            return aiCharacterConsistency(config, String(input.characterName || ""), String(input.baseDescription || ""));
        case "storyboard_suggest_transition": {
            const sceneA = input.sceneA as { title: string; summary: string; mood?: string };
            const sceneB = input.sceneB as { title: string; summary: string; mood?: string };
            return aiSuggestTransition(config, sceneA, sceneB);
        }
        case "storyboard_regenerate_asset":
            return aiRegenerateAsset(config, String(input.script || ""), input.assetType as "characters" | "locations" | "props" | "products", String(input.assetName || ""), undefined, typeof input.visualStyle === "string" ? input.visualStyle : undefined);

        // ─── 提示词工作台 ───
        case "prompt_generate": {
            const request: PromptGenerateRequest = {
                input: String(input.input || ""),
                platform: input.platform as PromptPlatform,
                customStyle: typeof input.customStyle === "string" ? input.customStyle : undefined,
                aspectRatio: typeof input.aspectRatio === "string" ? input.aspectRatio : undefined,
            };
            return aiGeneratePrompt(config, request);
        }
        case "prompt_optimize":
            return aiOptimizePrompt(config, String(input.prompt || ""), input.platform as PromptPlatform);
        case "prompt_score":
            return aiScorePrompt(config, String(input.prompt || ""), input.platform as PromptPlatform);
        case "prompt_transfer_style":
            return aiTransferStyle(config, String(input.prompt || ""), input.sourcePlatform as PromptPlatform, input.targetPlatform as PromptPlatform);

        // ─── 剧本创作工作台 ───
        case "script_refresh_seed":
            return aiRefreshSeedExamples(config);
        case "script_generate_inspiration":
            return aiGenerateInspirationCards(config, String(input.seed || ""), typeof input.batch === "number" ? input.batch : 1);
        case "script_refresh_cards_by_type": {
            const existingTitles = Array.isArray(input.existingTitles) ? input.existingTitles.filter((t): t is string => typeof t === "string") : [];
            return aiRefreshCardsByType(config, String(input.seed || ""), input.cardType as InspirationCardType, existingTitles);
        }
        case "script_generate_settings": {
            const selectedCards = (Array.isArray(input.selectedCards) ? input.selectedCards : []) as InspirationCard[];
            return aiGenerateSettings(config, String(input.seed || ""), selectedCards);
        }
        case "script_regenerate_character": {
            const proposal = input.proposal as SettingProposal;
            return aiRegenerateCharacter(config, proposal, String(input.characterId || ""));
        }
        case "script_generate_structures": {
            const setting = input.setting as SettingProposal;
            return aiGenerateStructures(config, setting);
        }
        case "script_generate_segment": {
            const settingForSeg = input.setting as SettingProposal;
            const structure = input.structure as StructureProposal;
            const beat = input.beat as StoryBeat;
            return aiGenerateSegment(config, settingForSeg, structure, beat, typeof input.previousContent === "string" ? input.previousContent : "", typeof input.contextSummary === "string" ? input.contextSummary : "");
        }
        case "script_rewrite_segment": {
            const beatForRew = input.beat as StoryBeat;
            const settingForRew = typeof input.setting === "object" ? input.setting as SettingProposal : undefined;
            return aiRewriteSegment(config, beatForRew, String(input.currentContent || ""), String(input.instruction || ""), settingForRew, typeof input.previousContent === "string" ? input.previousContent : undefined);
        }
        case "script_summarize_context":
            return aiSummarizeContext(config, String(input.content || ""));
        case "script_consistency_check": {
            const settingForCheck = input.setting as SettingProposal;
            return aiConsistencyCheck(config, settingForCheck, String(input.fullScript || ""));
        }
        case "script_fix_consistency": {
            const settingForFix = input.setting as SettingProposal;
            return aiFixConsistencyIssues(config, settingForFix, String(input.fullScript || ""), String(input.report || ""));
        }
        case "script_diverge_bubble": {
            const existingTexts = Array.isArray(input.existingTexts) ? input.existingTexts.filter((t): t is string => typeof t === "string") : [];
            return aiDivergeFromBubble(config, String(input.keyword || ""), String(input.seedContext || ""), existingTexts);
        }
        default:
            throw new Error(`未知工作台工具：${name}`);
    }
}
