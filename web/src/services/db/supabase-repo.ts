/**
 * Supabase 远程仓库实现
 * 策略：本地优先（localforage），后台同步到 Supabase
 * - 读取：优先本地，本地无数据时拉取远程
 * - 写入：先写本地，再异步同步远程（不阻塞 UI）
 */
import { supabase, isRemoteSyncEnabled } from "./supabase-client";
import type { Repository } from "./index";

const TABLE_STORYBOARD = "storyboard_projects";
const TABLE_PROMPT = "prompt_projects";

/** 通用 Supabase 仓库（JSONB 存储整个项目对象） */
function createSupabaseRepo<T extends { id: string; updatedAt: string }>(table: string): Repository<T> {
    return {
        async list() {
            const { data, error } = await supabase.from(table).select("data").order("updated_at", { ascending: false });
            if (error) throw new Error(error.message);
            return ((data || []) as Array<{ data: T }>).map((row) => row.data);
        },
        async get(id) {
            const { data, error } = await supabase.from(table).select("data").eq("id", id).single();
            if (error) {
                if (error.code === "PGRST116") return null; // not found
                throw new Error(error.message);
            }
            return (data as { data: T }).data ?? null;
        },
        async save(item) {
            await supabase.from(table).upsert(
                { id: item.id, data: item, updated_at: item.updatedAt },
                { onConflict: "id" },
            );
        },
        async remove(id) {
            await supabase.from(table).delete().eq("id", id);
        },
    };
}

export const supabaseStoryboardRepo = createSupabaseRepo<any>(TABLE_STORYBOARD);
export const supabasePromptProjectRepo = createSupabaseRepo<any>(TABLE_PROMPT);

/**
 * 混合同步仓库：本地优先 + 后台远程同步
 */
export function createSyncRepo<T extends { id: string; updatedAt: string }>(
    local: Repository<T>,
    remote: Repository<T>,
): Repository<T> {
    return {
        async list() {
            const localItems = await local.list();
            if (localItems.length > 0) return localItems;
            // 本地无数据时尝试拉取远程
            if (!isRemoteSyncEnabled()) return localItems;
            try {
                const remoteItems = await remote.list();
                // 同步到本地
                await Promise.all(remoteItems.map((item) => local.save(item)));
                return remoteItems;
            } catch {
                return localItems;
            }
        },
        async get(id) {
            const localItem = await local.get(id);
            if (localItem) return localItem;
            if (!isRemoteSyncEnabled()) return null;
            try {
                const remoteItem = await remote.get(id);
                if (remoteItem) await local.save(remoteItem);
                return remoteItem;
            } catch {
                return null;
            }
        },
        async save(item) {
            // 先写本地（保证 UI 响应速度）
            await local.save(item);
            // 后台同步远程（不阻塞）
            if (isRemoteSyncEnabled()) {
                remote.save(item).catch(() => { /* 静默失败，下次再同步 */ });
            }
        },
        async remove(id) {
            await local.remove(id);
            if (isRemoteSyncEnabled()) {
                remote.remove(id).catch(() => {});
            }
        },
    };
}
