/**
 * 生成历史仓库 - 记录每次 AI 生成的输入/输出/评分
 * 策略：localforage 本地优先，后台异步同步 Supabase
 * 用于反馈闭环：优先选取高分示例作为 few-shot
 */
import localforage from "localforage";
import { supabase, isRemoteSyncEnabled } from "./supabase-client";

/** 兼容 HTTP 环境的 UUID 生成（crypto.randomUUID 仅 HTTPS/localhost 可用） */
function generateId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // fallback: 手动拼接 v4 UUID
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export interface GenerationHistoryRecord {
    id: string;
    project_id: string | null;
    skill_id: string | null;
    input_text: string | null;
    output_text: string | null;
    platform: string | null;
    model: string | null;
    quality_score: number | null;
    user_rating: number | null;
    created_at: string;
}

// ─── 本地存储 ───────────────────────────────────────────────────

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "generation_history" });

/** 内存索引（按时间倒序维护，最多保留 500 条） */
let historyList: GenerationHistoryRecord[] | null = null;
const MAX_LOCAL_RECORDS = 500;

async function ensureLoaded(): Promise<GenerationHistoryRecord[]> {
    if (historyList) return historyList;
    const list: GenerationHistoryRecord[] = [];
    await store.iterate<GenerationHistoryRecord, void>((value) => {
        list.push(value);
    });
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    historyList = list.slice(0, MAX_LOCAL_RECORDS);
    return historyList;
}

// ─── 写入 ───────────────────────────────────────────────────────

/** 记录一次 AI 生成（异步，不阻塞主流程） */
export function recordGeneration(params: {
    projectId?: string;
    skillId?: string;
    inputText?: string;
    outputText?: string;
    platform?: string;
    model?: string;
    qualityScore?: number;
}): void {
    const record: GenerationHistoryRecord = {
        id: generateId(),
        project_id: params.projectId ?? null,
        skill_id: params.skillId ?? null,
        input_text: params.inputText ?? null,
        output_text: params.outputText ?? null,
        platform: params.platform ?? null,
        model: params.model ?? null,
        quality_score: params.qualityScore ?? null,
        user_rating: null,
        created_at: new Date().toISOString(),
    };

    // 写入本地（异步但不阻塞调用方）
    (async () => {
        const list = await ensureLoaded();
        list.unshift(record);
        // 超出上限时淘汰最旧的
        if (list.length > MAX_LOCAL_RECORDS) {
            const removed = list.splice(MAX_LOCAL_RECORDS);
            for (const r of removed) await store.removeItem(r.id);
        }
        await store.setItem(record.id, record);
    })();

    // 后台同步远程
    if (isRemoteSyncEnabled()) {
        supabase.from("generation_history").insert(record).then(({ error }) => {
            if (error) console.warn("[history-repo] sync failed:", error.message);
        });
    }
}

/** 用户评分 */
export async function rateGeneration(id: string, rating: number): Promise<boolean> {
    const list = await ensureLoaded();
    const record = list.find((r) => r.id === id);
    if (!record) return false;

    const clamped = Math.max(1, Math.min(5, rating));
    record.user_rating = clamped;
    await store.setItem(id, record);

    // 后台同步
    if (isRemoteSyncEnabled()) {
        supabase.from("generation_history").update({ user_rating: clamped }).eq("id", id).then(() => {}, () => {});
    }
    return true;
}

// ─── 查询 ───────────────────────────────────────────────────────

/** 获取项目的生成历史 */
export async function getHistoryByProject(projectId: string, limit = 50): Promise<GenerationHistoryRecord[]> {
    const list = await ensureLoaded();
    return list.filter((r) => r.project_id === projectId).slice(0, limit);
}

/** 获取高分生成记录（用于 few-shot 优选） */
export async function getTopGenerations(platform: string, limit = 5): Promise<GenerationHistoryRecord[]> {
    const list = await ensureLoaded();
    return list
        .filter((r) => r.platform === platform && (r.quality_score ?? 0) >= 7)
        .sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0))
        .slice(0, limit);
}

/** 按 skill 获取历史 */
export async function getHistoryBySkill(skillId: string, limit = 20): Promise<GenerationHistoryRecord[]> {
    const list = await ensureLoaded();
    return list.filter((r) => r.skill_id === skillId).slice(0, limit);
}

/** 获取最近历史（通用） */
export async function getRecentHistory(limit = 30): Promise<GenerationHistoryRecord[]> {
    const list = await ensureLoaded();
    return list.slice(0, limit);
}
