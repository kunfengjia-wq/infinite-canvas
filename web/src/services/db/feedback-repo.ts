/**
 * 提示词反馈仓库 - 正面/负面提示词库
 * 策略：localforage 本地优先，后台异步同步 Supabase
 * 用于反馈闭环：点赞的提示词作为正面示例注入生成，劣质的作为规避指令
 */
import localforage from "localforage";
import { supabase, isRemoteSyncEnabled } from "./supabase-client";

/** 兼容 HTTP 环境的 UUID 生成 */
function generateId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export interface PromptFeedbackRecord {
    id: string;
    prompt: string;
    negative_prompt?: string;
    platform: string;
    /** 原始输入（分镜描述） */
    input_text: string;
    /** JSON: [{id, weight}] */
    styles?: string;
    /** 1=正面（点赞），-1=负面（劣质） */
    rating: 1 | -1;
    created_at: string;
}

// ─── 本地存储 ───────────────────────────────────────────────────

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "prompt_feedback" });

/** 内存缓存 */
let feedbackList: PromptFeedbackRecord[] | null = null;
const MAX_LOCAL_RECORDS = 1000;

async function ensureLoaded(): Promise<PromptFeedbackRecord[]> {
    if (feedbackList) return feedbackList;
    const list: PromptFeedbackRecord[] = [];
    await store.iterate<PromptFeedbackRecord, void>((value) => {
        list.push(value);
    });
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    feedbackList = list.slice(0, MAX_LOCAL_RECORDS);
    return feedbackList;
}

// ─── 写入 ───────────────────────────────────────────────────────

/** 提交一条反馈（点赞/劣质），异步不阻塞主流程 */
export function submitFeedback(params: {
    prompt: string;
    negativePrompt?: string;
    platform: string;
    inputText: string;
    styles?: { id: string; weight: number }[];
    rating: 1 | -1;
}): void {
    const record: PromptFeedbackRecord = {
        id: generateId(),
        prompt: params.prompt,
        negative_prompt: params.negativePrompt ?? undefined,
        platform: params.platform,
        input_text: params.inputText,
        styles: params.styles ? JSON.stringify(params.styles) : undefined,
        rating: params.rating,
        created_at: new Date().toISOString(),
    };

    // 写入本地
    (async () => {
        const list = await ensureLoaded();
        list.unshift(record);
        if (list.length > MAX_LOCAL_RECORDS) {
            const removed = list.splice(MAX_LOCAL_RECORDS);
            for (const r of removed) await store.removeItem(r.id);
        }
        await store.setItem(record.id, record);
    })();

    // 后台同步远程
    if (isRemoteSyncEnabled()) {
        supabase.from("prompt_feedback").insert(record).then(({ error }) => {
            if (error) console.warn("[feedback-repo] sync failed:", error.message);
        });
    }
}

/** 撤销反馈（用户取消点赞/劣质时删除记录） */
export async function revokeFeedback(prompt: string, platform: string): Promise<void> {
    const list = await ensureLoaded();
    const idx = list.findIndex((r) => r.prompt === prompt && r.platform === platform);
    if (idx !== -1) {
        const [removed] = list.splice(idx, 1);
        await store.removeItem(removed.id);
    }
}

// ─── 查询 ───────────────────────────────────────────────────────

/** 获取正面示例（用户点赞的高质量提示词） */
export async function getPositiveExamples(platform: string, limit = 2): Promise<PromptFeedbackRecord[]> {
    const list = await ensureLoaded();
    return list
        .filter((r) => r.rating === 1 && r.platform === platform)
        .slice(0, limit);
}

/** 获取负面示例（用户标记劣质的提示词） */
export async function getNegativeExamples(platform: string, limit = 3): Promise<PromptFeedbackRecord[]> {
    const list = await ensureLoaded();
    return list
        .filter((r) => r.rating === -1 && r.platform === platform)
        .slice(0, limit);
}

/** 获取所有反馈统计 */
export async function getFeedbackStats(): Promise<{ positive: number; negative: number }> {
    const list = await ensureLoaded();
    return {
        positive: list.filter((r) => r.rating === 1).length,
        negative: list.filter((r) => r.rating === -1).length,
    };
}
