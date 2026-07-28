/**
 * 配置云同步 - 跨浏览器共享 API 配置
 * 将 AI 配置（channels/apiKey/model 等）同步到 Supabase user_settings 表
 * 策略：
 * - 启动时：本地无有效配置（channels 为空）时从远程拉取
 * - 变更时：防抖 2 秒后推送到远程
 */
import { supabase, isRemoteSyncEnabled } from "./supabase-client";

const TABLE = "user_settings";
/** 单用户固定 ID（小团队场景，所有浏览器共享同一份配置） */
const SETTINGS_ID = "default";

type SyncableConfig = {
    config: unknown;
    webdav: unknown;
    updatedAt: string;
};

/** 从 Supabase 拉取配置（仅当本地无有效配置时调用） */
export async function pullConfigFromCloud(): Promise<{ config: unknown; webdav: unknown } | null> {
    if (!isRemoteSyncEnabled()) return null;
    try {
        const { data, error } = await supabase
            .from(TABLE)
            .select("data")
            .eq("id", SETTINGS_ID)
            .single();
        if (error || !data) return null;
        const payload = (data as { data: SyncableConfig }).data;
        if (!payload?.config) return null;
        return { config: payload.config, webdav: payload.webdav };
    } catch {
        return null;
    }
}

/** 推送配置到 Supabase（防抖调用） */
export async function pushConfigToCloud(config: unknown, webdav: unknown): Promise<void> {
    if (!isRemoteSyncEnabled()) return;
    try {
        const payload: SyncableConfig = { config, webdav, updatedAt: new Date().toISOString() };
        await supabase.from(TABLE).upsert(
            { id: SETTINGS_ID, data: payload, updated_at: payload.updatedAt },
            { onConflict: "id" },
        );
    } catch {
        // 静默失败
    }
}

// ─── 防抖推送 ────────────────────────────────────────────────────
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** 防抖 2 秒后推送配置到云端 */
export function debouncedPushConfig(config: unknown, webdav: unknown): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        void pushConfigToCloud(config, webdav);
    }, 2000);
}
