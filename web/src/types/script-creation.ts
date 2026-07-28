/**
 * 剧本创作工作台 - 数据模型
 * 五阶段流程：灵感探索 → 设定构建 → 结构搭建 → 逐段创作 → 完稿输出
 * 核心范式：发散（AI 多选项生成）→ 收敛（人类选择与编辑）交替迭代
 */

// ─── 阶段定义 ───────────────────────────────────────────────────

/** 创作阶段 */
export type CreationPhase = 1 | 2 | 3 | 4 | 5;

/** 阶段元信息 */
export const CREATION_PHASES: { phase: CreationPhase; label: string; description: string }[] = [
    { phase: 1, label: "灵感探索", description: "播下灵感种子，AI 生成灵感卡片，勾选你心动的元素" },
    { phase: 2, label: "设定构建", description: "AI 整合所选元素，生成角色档案与世界观方案" },
    { phase: 3, label: "结构搭建", description: "AI 生成故事结构框架，选择叙事骨架" },
    { phase: 4, label: "逐段创作", description: "按结构逐段生成剧本，逐段确认与打磨" },
    { phase: 5, label: "完稿输出", description: "一致性检查，导出完整剧本，衔接分镜工作台" },
];

// ─── Phase 1：灵感卡片 ──────────────────────────────────────────

/** 灵感卡片类型 */
export type InspirationCardType = "character" | "world" | "conflict" | "event" | "emotion" | "genre";

/** 卡片类型元信息 */
export const CARD_TYPE_META: Record<InspirationCardType, { label: string; question: string; color: string }> = {
    character: { label: "角色卡", question: "谁？", color: "#3b82f6" },
    world: { label: "世界卡", question: "在哪？什么规则？", color: "#10b981" },
    conflict: { label: "冲突卡", question: "核心矛盾？", color: "#ef4444" },
    event: { label: "事件卡", question: "关键转折？", color: "#f97316" },
    emotion: { label: "情绪卡", question: "什么体验？", color: "#a855f7" },
    genre: { label: "题材卡", question: "什么类型？", color: "#06b6d4" },
};

export const CARD_TYPE_ORDER: InspirationCardType[] = ["character", "world", "conflict", "event", "emotion", "genre"];

/** 灵感卡片 */
export type InspirationCard = {
    id: string;
    type: InspirationCardType;
    /** 卡片标题（如"失忆老兵"） */
    title: string;
    /** 一句话描述 */
    description: string;
    /** 用户是否选中 */
    selected: boolean;
    /** 是否为用户手动添加 */
    custom?: boolean;
    /** 生成批次（用于换一批） */
    batch: number;
};

// ─── Phase 2：设定方案 ──────────────────────────────────────────

/** 角色档案 */
export type CharacterProfile = {
    id: string;
    name: string;
    role: "主角" | "对手" | "配角" | "导师" | "盟友";
    personality: string;
    motivation: string;
    /** 角色弧光（成长变化） */
    arc: string;
    appearance?: string;
    /** 与其他角色的关系 */
    relationships?: string;
};

/** 世界观设定 */
export type WorldSetting = {
    id: string;
    /** 时代/背景 */
    era: string;
    /** 核心环境描述 */
    environment: string;
    /** 力量体系/规则（如修仙体系、科技水平） */
    rules: string;
    /** 社会结构 */
    society?: string;
    /** 独特设定/金手指 */
    specialElement?: string;
};

/** 核心矛盾 */
export type CoreConflict = {
    id: string;
    /** 主线冲突 */
    mainConflict: string;
    /** 支线矛盾 */
    subConflicts: string[];
    /** 主题表达 */
    theme: string;
};

/** 设定方案（Phase 2 AI 输出） */
export type SettingProposal = {
    id: string;
    /** 方案名称（如"方案A：暗黑逆袭线"） */
    title: string;
    /** 方案一句话概述 */
    summary: string;
    characters: CharacterProfile[];
    world: WorldSetting;
    conflict: CoreConflict;
};

// ─── Phase 3：故事结构 ──────────────────────────────────────────

/** 结构类型 */
export type StructureType = "三幕式" | "五段式" | "Save the Cat 节拍" | "网文卷纲式" | "单元剧式";

/** 结构节拍（幕/章/段落） */
export type StoryBeat = {
    id: string;
    index: number;
    /** 节拍名称（如"第一幕：铺垫"、"催化剂"） */
    label: string;
    /** 一句话梗概 */
    summary: string;
    /** 情绪强度 1-10（用于情绪曲线） */
    intensity: number;
    /** 预估篇幅占比（如"15%"） */
    proportion?: string;
};

/** 结构方案（Phase 3 AI 输出） */
export type StructureProposal = {
    id: string;
    title: string;
    structureType: StructureType;
    /** 结构概述 */
    overview: string;
    beats: StoryBeat[];
    /** 预估总篇幅（字数） */
    estimatedLength?: string;
    /** 情绪曲线描述 */
    emotionArc?: string;
};

// ─── Phase 4：逐段创作 ──────────────────────────────────────────

/** 段落状态 */
export type SegmentStatus = "pending" | "generating" | "draft" | "confirmed";

/** 剧本段落（对应一个结构节拍） */
export type ScriptSegment = {
    id: string;
    /** 对应的结构节拍 ID */
    beatId: string;
    index: number;
    /** 段落标题 */
    title: string;
    /** 生成的剧本内容 */
    content: string;
    status: SegmentStatus;
    /** 重写次数 */
    rewriteCount: number;
};

// ─── 偏好记录 ───────────────────────────────────────────────────

/** 用户偏好记录（用于优化后续生成） */
export type PreferenceRecord = {
    /** 卡片类型 */
    cardType: InspirationCardType;
    /** 被选中的卡片标题 */
    selected: string[];
    /** 被跳过（换掉/未选）的卡片标题 */
    skipped: string[];
    timestamp: string;
};

// ─── 项目 ───────────────────────────────────────────────────────

/** 项目状态 */
export type ScriptProjectStatus = "exploring" | "setting" | "structuring" | "writing" | "completed";

/** 剧本创作项目 */
export type ScriptProject = {
    id: string;
    title: string;
    /** 灵感种子（用户输入的一句话） */
    seed: string;
    phase: CreationPhase;
    /** 历史最远到达阶段（只增不减，用于步骤回退后仍可前进） */
    maxPhase: CreationPhase;
    status: ScriptProjectStatus;

    // Phase 1 数据
    cards: InspirationCard[];
    cardBatch: number;

    // Phase 2 数据
    settingProposals: SettingProposal[];
    /** 用户选择/混搭后的最终设定 */
    finalSetting: SettingProposal | null;

    // Phase 3 数据
    structureProposals: StructureProposal[];
    /** 用户选定的结构 */
    finalStructure: StructureProposal | null;

    // Phase 4 数据
    segments: ScriptSegment[];
    /** 前文摘要（长篇上下文管理） */
    contextSummary: string;

    // Phase 5 数据
    /** 完整剧本（合并输出） */
    fullScript: string;
    /** 一致性检查报告 */
    consistencyReport: string;

    /** Fork 来源项目 ID（二创） */
    forkedFrom?: string;

    createdAt: string;
    updatedAt: string;
};

/** 创建空项目 */
export function createEmptyScriptProject(title: string, seed: string): ScriptProject {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        title,
        seed,
        phase: 1,
        maxPhase: 1,
        status: "exploring",
        cards: [],
        cardBatch: 0,
        settingProposals: [],
        finalSetting: null,
        structureProposals: [],
        finalStructure: null,
        segments: [],
        contextSummary: "",
        fullScript: "",
        consistencyReport: "",
        createdAt: now,
        updatedAt: now,
    };
}
