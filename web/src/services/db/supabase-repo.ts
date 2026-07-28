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
const TABLE_SCRIPT = "script_projects";

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
export const supabaseScriptProjectRepo = createSupabaseRepo<any>(TABLE_SCRIPT);

/**
 * 混合同步仓库：本地优先 + 远程合并
 * - list：合并本地+远程，同一项目按 updatedAt 取最新
 * - save：先写本地，后台同步远程
 * - get：本地优先，本地没有则拉远程
 */
export function createSyncRepo<T extends { id: string; updatedAt: string }>(
    local: Repository<T>,
    remote: Repository<T>,
): Repository<T> {
    return {
        async list() {
            const localItems = await local.list();
            if (!isRemoteSyncEnabled()) return localItems;

            try {
                const remoteItems = await remote.list();
                if (remoteItems.length === 0) return localItems;

                // 合并：以 id 为 key，按 updatedAt 取最新版本
                const merged = new Map<string, T>();
                for (const item of localItems) merged.set(item.id, item);
                for (const remoteItem of remoteItems) {
                    const localItem = merged.get(remoteItem.id);
                    if (!localItem || new Date(remoteItem.updatedAt) > new Date(localItem.updatedAt)) {
                        merged.set(remoteItem.id, remoteItem);
                        // 同步到本地
                        local.save(remoteItem).catch(() => {});
                    }
                }

                return Array.from(merged.values()).sort(
                    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
                );
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
