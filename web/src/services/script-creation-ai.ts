/**
 * 剧本创作工作台 AI 服务
 * 五阶段：灵感卡片生成 → 设定方案生成 → 结构方案生成 → 逐段剧本生成 → 一致性检查
 */
import { nanoid } from "nanoid";
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import type { AiConfig } from "@/stores/use-config-store";
import { preferenceRepo } from "@/services/db";
import { getSkillPrompt } from "@/services/db/skills-repo";
import { recordGeneration } from "@/services/db/history-repo";
import { withRetry, parseJsonArray, parseJsonObject } from "@/services/ai-utils";
import type {
    InspirationCard,
    InspirationCardType,
    SettingProposal,
    StructureProposal,
    ScriptSegment,
    StoryBeat,
} from "@/types/script-creation";
import { CARD_TYPE_META } from "@/types/script-creation";

// ─── Phase 1：灵感卡片生成 ──────────────────────────────────────

const INSPIRATION_SYSTEM = `你是一位创意总监，精通各类叙事作品（网文、影视、游戏、动漫）的创意元素。
用户会给你一个灵感种子（一句话/关键词），你需要生成多维度的灵感卡片供用户选择。

生成 6 类卡片，每类 3 张：
1. character（角色卡）：有特色的角色概念，包含身份+核心特征+悬念点
2. world（世界卡）：有画面感的世界/场景设定，包含环境+规则+独特元素
3. conflict（冲突卡）：核心矛盾/困境，包含对立面+赌注+不可调和性
4. event（事件卡）：关键转折/触发事件，包含意外性+影响力+连锁反应
5. emotion（情绪卡）：目标情感体验，包含核心情绪+触发方式+读者/观众感受
6. genre（题材卡）：类型/文风定位，包含题材+叙事风格+目标受众

要求：
- 每张卡片要有创意、有画面感、能激发联想
- 标题简短有力（2-6字），描述一句话展开（15-30字）
- 卡片之间要有组合潜力，任意搭配都能产生有趣的故事
- 避免老套/烂大街的设定，追求新颖但不猎奇
- 如果用户有偏好记录，参考但不完全重复

严格以 JSON 数组格式输出，不要输出任何其他文字：
[{"type":"character","title":"标题","description":"一句话描述"},...]`;

/** 构建偏好上下文 */
async function buildPreferenceContext(): Promise<string> {
    try {
        const allPrefs = await preferenceRepo.list();
        if (allPrefs.length === 0) return "";
        const recent = allPrefs.slice(0, 20);
        const liked = recent.flatMap((r) => r.selected);
        const disliked = recent.flatMap((r) => r.skipped);
        const parts: string[] = [];
        if (liked.length) parts.push(`用户历史偏好（喜欢）：${[...new Set(liked)].slice(0, 15).join("、")}`);
        if (disliked.length) parts.push(`用户历史跳过（不喜欢）：${[...new Set(disliked)].slice(0, 10).join("、")}`);
        return parts.length ? `\n\n【用户偏好参考】\n${parts.join("\n")}` : "";
    } catch {
        return "";
    }
}

export async function aiGenerateInspirationCards(
    config: AiConfig,
    seed: string,
    batch: number,
    onDelta?: (text: string) => void,
): Promise<InspirationCard[]> {
    return withRetry(async () => {
        const prefContext = await buildPreferenceContext();
        const systemPrompt = (await getSkillPrompt("sc_inspiration")) ?? INSPIRATION_SYSTEM;
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt + prefContext },
            { role: "user", content: `灵感种子：「${seed}」\n${batch > 1 ? `（第 ${batch} 批，请生成与之前不同方向的新卡片）` : ""}\n请生成灵感卡片：` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        const items = parseJsonArray<{ type: string; title: string; description: string }>(raw);
        recordGeneration({ skillId: "sc_inspiration", inputText: seed.slice(0, 200), outputText: raw.slice(0, 500), model: config.model });
        return items.map((item) => ({
            id: nanoid(),
            type: item.type as InspirationCardType,
            title: item.title,
            description: item.description,
            selected: false,
            batch,
        }));
    });
}

/** 按类型刷新卡片 */
export async function aiRefreshCardsByType(
    config: AiConfig,
    seed: string,
    cardType: InspirationCardType,
    existingTitles: string[],
    onDelta?: (text: string) => void,
): Promise<InspirationCard[]> {
    return withRetry(async () => {
        const meta = CARD_TYPE_META[cardType];
        const messages: AiTextMessage[] = [
            { role: "system", content: `你是创意总监。用户需要更多「${meta.label}」（${meta.question}）方向的灵感卡片。\n生成 3 张全新的${meta.label}，避免与已有卡片重复。\n\n严格以 JSON 数组格式输出：\n[{"title":"标题","description":"一句话描述"},...]` },
            { role: "user", content: `灵感种子：「${seed}」\n已有卡片（避免重复）：${existingTitles.join("、")}\n\n请生成 3 张新的${meta.label}：` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        const items = parseJsonArray<{ title: string; description: string }>(raw);
        return items.map((item) => ({
            id: nanoid(),
            type: cardType,
            title: item.title,
            description: item.description,
            selected: false,
            batch: -1,
        }));
    });
}

// ─── Phase 2：设定方案生成 ──────────────────────────────────────

const SETTING_SYSTEM = `你是一位资深故事架构师，精通角色塑造、世界观构建和矛盾设计。
用户会给你一组选中的灵感卡片，你需要整合它们生成 2-3 套完整的故事设定方案。

每套方案包含：
1. title：方案名称（如"方案A：暗黑逆袭线"）
2. summary：一句话概述
3. characters：角色列表（2-4个），每个含 name, role(主角/对手/配角/导师/盟友), personality, motivation, arc(角色弧光), appearance(可选), relationships(可选)
4. world：世界观，含 era(时代背景), environment(核心环境), rules(力量体系/规则), society(社会结构,可选), specialElement(独特设定/金手指,可选)
5. conflict：核心矛盾，含 mainConflict(主线), subConflicts(支线数组), theme(主题)

要求：
- 方案之间要有明显差异（如一个偏热血、一个偏悬疑）
- 角色要有深度，动机合理，弧光清晰
- 世界观要自洽，规则明确
- 矛盾要有层次感（主线+支线交织）
- 充分利用用户选中的卡片元素，但可以扩展和深化

严格以 JSON 数组格式输出，不要输出任何其他文字：
[{"title":"方案A：...","summary":"...","characters":[...],"world":{...},"conflict":{...}},...]`;

export async function aiGenerateSettings(
    config: AiConfig,
    seed: string,
    selectedCards: InspirationCard[],
    onDelta?: (text: string) => void,
): Promise<SettingProposal[]> {
    return withRetry(async () => {
        const systemPrompt = (await getSkillPrompt("sc_setting")) ?? SETTING_SYSTEM;
        const cardsContext = selectedCards
            .map((c) => `[${CARD_TYPE_META[c.type].label}] ${c.title}：${c.description}`)
            .join("\n");
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `灵感种子：「${seed}」\n\n用户选中的灵感卡片：\n${cardsContext}\n\n请生成 2-3 套设定方案：` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        const items = parseJsonArray<any>(raw);
        recordGeneration({ skillId: "sc_setting", inputText: cardsContext.slice(0, 300), outputText: raw.slice(0, 500), model: config.model });
        return items.map((item) => ({
            id: nanoid(),
            title: item.title,
            summary: item.summary,
            characters: (item.characters || []).map((c: any) => ({ ...c, id: nanoid() })),
            world: { ...item.world, id: nanoid() },
            conflict: { ...item.conflict, id: nanoid() },
        }));
    });
}

/** 重新生成单个角色（保持与方案其他元素的兼容性） */
export async function aiRegenerateCharacter(
    config: AiConfig,
    proposal: SettingProposal,
    characterId: string,
    onDelta?: (text: string) => void,
): Promise<SettingProposal["characters"][number]> {
    return withRetry(async () => {
        const target = proposal.characters.find((c) => c.id === characterId);
        const others = proposal.characters.filter((c) => c.id !== characterId);
        const othersCtx = others.map((c) => `${c.name}(${c.role})：${c.personality}，动机：${c.motivation}`).join("\n");
        const messages: AiTextMessage[] = [
            { role: "system", content: `你是角色设计专家。请重新设计一个角色，保持与已有角色和世界观的兼容性。\n\n输出严格 JSON：\n{"name":"...","role":"主角/对手/配角/导师/盟友","personality":"...","motivation":"...","arc":"...","appearance":"...","relationships":"..."}` },
            { role: "user", content: `方案概述：${proposal.summary}\n世界观：${proposal.world.environment}，规则：${proposal.world.rules}\n核心矛盾：${proposal.conflict.mainConflict}\n\n已有角色：\n${othersCtx}\n\n需要重新设计的角色（原设定：${target?.name} - ${target?.role} - ${target?.personality}）\n\n请生成一个全新的替代角色（保持相同 role “${target?.role}”，但名字、性格、动机、弧光全部重新设计）：` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        const item = parseJsonObject<any>(raw);
        return { ...item, id: characterId, role: item.role ?? target?.role ?? "配角" };
    });
}

// ─── Phase 3：结构方案生成 ──────────────────────────────────────

const STRUCTURE_SYSTEM = `你是一位故事结构大师，精通三幕式、五段式、Save the Cat 节拍表、网文卷纲等多种叙事结构。
用户会给你确定的故事设定（角色+世界观+矛盾），你需要生成 2-3 种不同的故事结构方案。

每套方案包含：
1. title：方案名称
2. structureType：结构类型（三幕式/五段式/Save the Cat 节拍/网文卷纲式/单元剧式）
3. overview：结构概述（2-3句话）
4. beats：节拍列表，每个含 index, label(节拍名), summary(一句话梗概), intensity(情绪强度1-10), proportion(篇幅占比如"15%")
5. estimatedLength：预估总篇幅（如"8000-12000字"）
6. emotionArc：情绪曲线描述

结构类型说明：
- 三幕式：铺垫→对抗→解决（适合短片/微电影）
- 五段式：期待→幻想→受挫→噩梦→决定性结局（适合爽文/网文）
- Save the Cat 节拍：15个标准节拍（适合电影级叙事）
- 网文卷纲式：开篇hook→升级→小高潮→转折→大高潮→收尾（适合连载）
- 单元剧式：多个独立单元+暗线贯穿（适合系列短剧）

要求：
- 不同方案使用不同结构类型
- 节拍数量合理（三幕式5-8个，五段式8-12个，Save the Cat 12-15个）
- 情绪强度要有起伏节奏（不能一直高或一直低）
- 充分利用设定中的角色弧光和矛盾层次

严格以 JSON 数组格式输出，不要输出任何其他文字：
[{"title":"...","structureType":"...","overview":"...","beats":[...],"estimatedLength":"...","emotionArc":"..."},...]`;

export async function aiGenerateStructures(
    config: AiConfig,
    setting: SettingProposal,
    onDelta?: (text: string) => void,
): Promise<StructureProposal[]> {
    return withRetry(async () => {
        const systemPrompt = (await getSkillPrompt("sc_structure")) ?? STRUCTURE_SYSTEM;
        const settingContext = buildSettingContext(setting);
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `已确定的故事设定：\n${settingContext}\n\n请生成 2-3 种故事结构方案：` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        const items = parseJsonArray<any>(raw);
        recordGeneration({ skillId: "sc_structure", inputText: settingContext.slice(0, 300), outputText: raw.slice(0, 500), model: config.model });
        return items.map((item) => ({
            id: nanoid(),
            title: item.title,
            structureType: item.structureType,
            overview: item.overview,
            beats: (item.beats || []).map((b: any, i: number) => ({ ...b, id: nanoid(), index: i })),
            estimatedLength: item.estimatedLength,
            emotionArc: item.emotionArc,
        }));
    });
}

// ─── Phase 4：逐段剧本生成 ──────────────────────────────────────

const SEGMENT_WRITER_SYSTEM = `你是一位专业编剧/网文作者，擅长将大纲转化为生动的剧本/小说正文。
用户会给你故事设定、整体结构和当前要写的段落信息，你需要写出该段落的完整内容。

写作要求：
1. 标准剧本格式：场景标题（INT./EXT. 地点-时间）+ 动作描写 + 对白
   或网文格式：叙事+对白+心理描写（根据题材自动选择）
2. 对白自然有个性，不同角色说话方式不同
3. 动作/环境描写简洁有画面感
4. 节奏匹配情绪强度（高强度=快节奏短句，低强度=舒缓描写）
5. 每段 500-1500 字
6. 必须承接前文内容，保持角色/设定一致性
7. 直接输出正文，不要加解释或元信息`;

export async function aiGenerateSegment(
    config: AiConfig,
    setting: SettingProposal,
    structure: StructureProposal,
    beat: StoryBeat,
    previousContent: string,
    contextSummary: string,
    onDelta?: (text: string) => void,
): Promise<string> {
    return withRetry(async () => {
        const systemPrompt = (await getSkillPrompt("sc_segment_writer")) ?? SEGMENT_WRITER_SYSTEM;
        const settingContext = buildSettingContext(setting);
        const structureOverview = structure.beats.map((b) => `${b.index + 1}. ${b.label}：${b.summary}`).join("\n");
        const userContent = [
            `【故事设定】\n${settingContext}`,
            `\n【整体结构】\n${structureOverview}`,
            contextSummary ? `\n【前文摘要】\n${contextSummary}` : "",
            previousContent ? `\n【前一段内容（末尾500字）】\n${previousContent.slice(-500)}` : "",
            `\n【当前任务】\n请写第 ${beat.index + 1} 段「${beat.label}」：${beat.summary}\n情绪强度：${beat.intensity}/10`,
            "\n请开始写作：",
        ].filter(Boolean).join("\n");

        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        recordGeneration({ skillId: "sc_segment_writer", inputText: beat.summary.slice(0, 200), outputText: raw.slice(0, 500), model: config.model });
        return raw.trim();
    });
}

/** 重写段落（传入设定+前文上下文，避免破坏一致性） */
export async function aiRewriteSegment(
    config: AiConfig,
    beat: StoryBeat,
    currentContent: string,
    instruction: string,
    setting?: SettingProposal,
    previousContent?: string,
    onDelta?: (text: string) => void,
): Promise<string> {
    return withRetry(async () => {
        const settingContext = setting ? buildSettingContext(setting) : "";
        const userParts: string[] = [
            `【修改意见】${instruction}`,
        ];
        if (settingContext) userParts.push(`\n【故事设定（保持一致性）】\n${settingContext}`);
        if (previousContent) userParts.push(`\n【前一段内容（末尾300字，确保衔接）】\n${previousContent.slice(-300)}`);
        userParts.push(`\n【当前内容】\n${currentContent}`);
        userParts.push("\n请根据修改意见重写，保持角色/设定/语气一致，输出完整内容：");

        const messages: AiTextMessage[] = [
            { role: "system", content: SEGMENT_WRITER_SYSTEM },
            { role: "user", content: userParts.join("\n") },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        return raw.trim();
    });
}

/** 生成前文摘要（长篇上下文管理） */
export async function aiSummarizeContext(
    config: AiConfig,
    content: string,
    onDelta?: (text: string) => void,
): Promise<string> {
    return withRetry(async () => {
        const messages: AiTextMessage[] = [
            { role: "system", content: "你是文本摘要专家。将给定的剧本/小说内容压缩为 200-400 字的结构化摘要，保留：关键角色状态、已发生的重要事件、未解决的悬念/伏笔、当前情绪走向。直接输出摘要，不要加前缀。" },
            { role: "user", content: `请摘要以下内容：\n\n${content.slice(0, 6000)}` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        return raw.trim();
    });
}

// ─── Phase 5：一致性检查 ────────────────────────────────────────

export async function aiConsistencyCheck(
    config: AiConfig,
    setting: SettingProposal,
    fullScript: string,
    onDelta?: (text: string) => void,
): Promise<string> {
    const systemPrompt = (await getSkillPrompt("sc_consistency_check")) ?? `你是剧本审校专家。检查剧本的一致性，输出结构化报告：\n1. 角色一致性（名字/性格/外貌是否前后矛盾）\n2. 设定一致性（世界观规则是否被违反）\n3. 情节逻辑（是否有不合理跳跃）\n4. 伏笔回收（是否有未回收的伏笔）\n5. 节奏评估（整体节奏是否合理）\n\n格式：每项给出 ✅通过 或 ⚠️问题+具体位置+修改建议。最后给出总评。`;
    const settingContext = buildSettingContext(setting);

    // 超长剧本分块检查（每块 10000 字，避免截断丢失后半部分）
    const CHUNK_SIZE = 10000;
    if (fullScript.length <= CHUNK_SIZE) {
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `【设定】\n${settingContext}\n\n【完整剧本】\n${fullScript}\n\n请进行一致性检查：` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        recordGeneration({ skillId: "sc_consistency_check", inputText: fullScript.slice(0, 300), outputText: raw.slice(0, 500), model: config.model });
        return raw.trim();
    }

    // 分块检查
    const chunks: string[] = [];
    let pos = 0;
    while (pos < fullScript.length) {
        let end = Math.min(pos + CHUNK_SIZE, fullScript.length);
        if (end < fullScript.length) {
            const breakPoint = fullScript.lastIndexOf("\n\n", end);
            if (breakPoint > pos + CHUNK_SIZE * 0.5) end = breakPoint;
        }
        chunks.push(fullScript.slice(pos, end));
        pos = end;
    }

    const reports: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
        onDelta?.(`正在检查第 ${i + 1}/${chunks.length} 段...\n`);
        const overlap = i > 0 ? chunks[i - 1].slice(-500) : "";
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `【设定】\n${settingContext}\n\n${overlap ? `【前段末尾（上下文参考）】\n${overlap}\n\n` : ""}【剧本第 ${i + 1}/${chunks.length} 段】\n${chunks[i]}\n\n请对这一段进行一致性检查：` },
        ];
        const raw = await requestImageQuestion(config, messages, () => {});
        reports.push(`## 第 ${i + 1} 段检查\n${raw.trim()}`);
    }

    recordGeneration({ skillId: "sc_consistency_check", inputText: fullScript.slice(0, 300), outputText: reports.join("").slice(0, 500), model: config.model });
    return reports.join("\n\n---\n\n");
}

// ─── 辅助 ─────────────────────────────────────────────────────

/** 一致性检查后 AI 一键修复 */
export async function aiFixConsistencyIssues(
    config: AiConfig,
    setting: SettingProposal,
    fullScript: string,
    report: string,
    onDelta?: (text: string) => void,
): Promise<string> {
    const systemPrompt = (await getSkillPrompt("sc_consistency_fix")) ?? `你是剧本修复专家。用户会给你一份一致性检查报告和原始剧本。
你的任务是根据报告中标记的问题（⚠️项）直接修复剧本。

规则：
- 只修复报告指出的问题，不要改动无关内容
- 保持原文风格、语气、节奏不变
- 修复后直接输出完整剧本，不要输出任何解释或标记
- 如果报告全部通过（无⚠️），原样输出剧本`;
    const settingContext = buildSettingContext(setting);
    if (fullScript.length > 15000) {
        console.warn(`剧本过长(${fullScript.length}字)，AI修复将仅处理前15000字`);
    }
    const messages: AiTextMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `【设定】\n${settingContext}\n\n【一致性检查报告】\n${report}\n\n【原始剧本】\n${fullScript.slice(0, 15000)}\n\n请修复上述问题，输出完整剧本：` },
    ];
    const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
    recordGeneration({ skillId: "sc_consistency_fix", inputText: report.slice(0, 300), outputText: raw.slice(0, 500), model: config.model });
    return raw.trim();
}

function buildSettingContext(setting: SettingProposal): string {
    const parts: string[] = [];
    parts.push(`方案：${setting.title} - ${setting.summary}`);
    parts.push("\n【角色】");
    setting.characters.forEach((c) => {
        parts.push(`- ${c.name}（${c.role}）：${c.personality}，动机：${c.motivation}，弧光：${c.arc}${c.relationships ? `，关系：${c.relationships}` : ""}`);
    });
    parts.push("\n【世界观】");
    parts.push(`时代：${setting.world.era}，环境：${setting.world.environment}，规则：${setting.world.rules}`);
    if (setting.world.specialElement) parts.push(`独特设定：${setting.world.specialElement}`);
    parts.push("\n【矛盾】");
    parts.push(`主线：${setting.conflict.mainConflict}`);
    parts.push(`支线：${setting.conflict.subConflicts.join("；")}`);
    parts.push(`主题：${setting.conflict.theme}`);
    return parts.join("\n");
}

// ─── 灵感种子刷新：AI 实时筛选热门创作灵感 ────────────────────

const SEED_REFRESH_FALLBACK = `你是一位剧本创意策展人，精通当下影视、网文、游戏、动漫行业的热门趋势与社会议题。
你的任务是为创作者提供 6 条「灵感种子」——每条是一句话的故事概念，能直接作为剧本创作的起点。

筛选原则：
1. 结合当前时事热点、社会议题、科技趋势、流行文化现象
2. 覆盖多种类型：科幻、悬疑、情感、奇幻、现实主义、喜剧等
3. 每条种子要有画面感、有冲突张力、能激发联想
4. 避免老套设定，追求新颖但不猎奇
5. 每条控制在 15-30 字，简洁有力

严格以 JSON 数组格式输出，不要输出任何其他文字：
["种子1","种子2","种子3","种子4","种子5","种子6"]`;

/** AI 实时刷新灵感种子示例（支持 skill 远程配置 + 时效性注入） */
export async function aiRefreshSeedExamples(
    config: AiConfig,
    onDelta?: (text: string) => void,
): Promise<string[]> {
    return withRetry(async () => {
        const skillPrompt = (await getSkillPrompt("sc_seed_refresh")) ?? SEED_REFRESH_FALLBACK;
        const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
        const systemPrompt = `${skillPrompt}\n\n【当前日期】${today}\n请确保灵感种子与此日期前后的时事热点、社会现象、科技进展、流行文化紧密相关，保证时效性。`;
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `今天是${today}，请结合最新时事热点和流行趋势，生成 6 条适合剧本创作的灵感种子：` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        const items = parseJsonArray<string>(raw);
        return items.filter((s) => typeof s === "string" && s.trim().length > 0).slice(0, 8);
    });
}

// ─── 灵感风暴：从单个泡泡发散关联概念 ───────────────────────

const STORM_DIVERGE_FALLBACK = `你是剧本创作灵感发散器。用户正在构思一个剧本，你需要从给定概念发散出能直接服务于剧本创作的关联概念。

规则：
- 输出 4 个概念词，每个 2-5 字
- 必须与原始种子主题强关联，能组合成故事元素（角色/冲突/场景/转折）
- 禁止泛泛而谈，每个词要能直接变成剧本里的一个具体元素
- 禁止输出与种子无关的随机词

严格输出 JSON 数组，不要任何其他文字：
["词1","词2","词3","词4"]`;

/** 从单个泡泡发散关联概念（支持 skill 覆盖 + 种子上下文保持关联性） */
export async function aiDivergeFromBubble(
    config: AiConfig,
    keyword: string,
    seedContext: string,
    existingTexts: string[],
    onDelta?: (text: string) => void,
): Promise<string[]> {
    return withRetry(async () => {
        const skillPrompt = (await getSkillPrompt("sc_storm_diverge")) ?? STORM_DIVERGE_FALLBACK;
        const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
        const systemPrompt = `${skillPrompt}\n\n【当前日期】${today}`;
        const messages: AiTextMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `剧本灵感种子：「${seedContext}」\n当前要发散的概念：「${keyword}」\n已有概念（避免重复）：${existingTexts.join("、") || "无"}\n\n请围绕种子主题，从「${keyword}」发散 4 个能直接用于剧本的关联概念：` },
        ];
        const raw = await requestImageQuestion(config, messages, onDelta ?? (() => {}));
        const items = parseJsonArray<string>(raw);
        return items.filter((s) => typeof s === "string" && s.trim().length > 0).slice(0, 5);
    }, 1);
}
