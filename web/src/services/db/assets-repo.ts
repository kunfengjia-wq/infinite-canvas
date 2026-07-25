/**
 * 资产库仓库 - 管理可复用的角色/场景/道具资产
 * 策略：localforage 本地优先，后台异步同步 Supabase
 */
import localforage from "localforage";
import { supabase, isRemoteSyncEnabled } from "./supabase-client";

export interface AssetRecord {
    id: string;
    project_id: string | null;
    type: "character" | "location" | "prop";
    name: string;
    data: Record<string, unknown>;
    keywords: string | null;
    usage_count: number;
    created_at: string;
}

// ─── 本地存储 ───────────────────────────────────────────────────

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "assets" });

/** 内存索引（避免每次全量遍历 IndexedDB） */
let assetsIndex: Map<string, AssetRecord> | null = null;

async function ensureIndex(): Promise<Map<string, AssetRecord>> {
    if (assetsIndex) return assetsIndex;
    const map = new Map<string, AssetRecord>();
    await store.iterate<AssetRecord, void>((value) => {
        map.set(value.id, value);
    });
    // 首次加载时尝试从远程拉取补充
    if (map.size === 0 && isRemoteSyncEnabled()) {
        try {
            const { data } = await supabase.from("assets").select("*").order("usage_count", { ascending: false }).limit(200);
            for (const row of data || []) {
                const record = row as AssetRecord;
                map.set(record.id, record);
                await store.setItem(record.id, record);
            }
        } catch { /* 静默 */ }
    }
    assetsIndex = map;
    return map;
}

// ─── 后台同步辅助 ───────────────────────────────────────────────

function syncToRemote(record: AssetRecord): void {
    if (!isRemoteSyncEnabled()) return;
    supabase.from("assets").upsert(record, { onConflict: "id" }).then(({ error }) => {
        if (error) console.warn("[assets-repo] sync failed:", error.message);
    });
}

function deleteFromRemote(id: string): void {
    if (!isRemoteSyncEnabled()) return;
    supabase.from("assets").delete().eq("id", id).then(() => {}, () => {});
}

// ─── 查询 ───────────────────────────────────────────────────────

/** 获取所有资产（可按类型筛选） */
export async function getAssets(type?: AssetRecord["type"]): Promise<AssetRecord[]> {
    const map = await ensureIndex();
    let items = [...map.values()];
    if (type) items = items.filter((a) => a.type === type);
    return items.sort((a, b) => b.usage_count - a.usage_count);
}

/** 按项目 ID 获取资产 */
export async function getAssetsByProject(projectId: string): Promise<AssetRecord[]> {
    const map = await ensureIndex();
    return [...map.values()]
        .filter((a) => a.project_id === projectId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** 按关键词搜索资产 */
export async function searchAssets(keyword: string, type?: AssetRecord["type"]): Promise<AssetRecord[]> {
    const map = await ensureIndex();
    const lower = keyword.toLowerCase();
    return [...map.values()]
        .filter((a) => {
            if (type && a.type !== type) return false;
            return (a.keywords?.toLowerCase().includes(lower) || a.name.toLowerCase().includes(lower)) ?? false;
        })
        .sort((a, b) => b.usage_count - a.usage_count)
        .slice(0, 20);
}

/** 获取高频使用资产（用于 few-shot 参考） */
export async function getTopAssets(type: AssetRecord["type"], limit = 5): Promise<AssetRecord[]> {
    const map = await ensureIndex();
    return [...map.values()]
        .filter((a) => a.type === type)
        .sort((a, b) => b.usage_count - a.usage_count)
        .slice(0, limit);
}

// ─── 写入 ───────────────────────────────────────────────────────

/** 创建资产 */
export async function createAsset(asset: Omit<AssetRecord, "usage_count" | "created_at">): Promise<AssetRecord> {
    const record: AssetRecord = { ...asset, usage_count: 0, created_at: new Date().toISOString() };
    const map = await ensureIndex();
    map.set(record.id, record);
    await store.setItem(record.id, record);
    syncToRemote(record);
    return record;
}

/** 批量创建资产（从分镜提取结果导入） */
export async function batchCreateAssets(
    assets: Array<Omit<AssetRecord, "usage_count" | "created_at">>,
): Promise<number> {
    const map = await ensureIndex();
    const now = new Date().toISOString();
    const records: AssetRecord[] = assets.map((a) => ({ ...a, usage_count: 0, created_at: now }));
    for (const record of records) {
        map.set(record.id, record);
        await store.setItem(record.id, record);
    }
    // 后台批量同步
    if (isRemoteSyncEnabled()) {
        supabase.from("assets").upsert(records, { onConflict: "id" }).then(() => {}, () => {});
    }
    return records.length;
}

/** 更新资产 */
export async function updateAsset(id: string, updates: Partial<Pick<AssetRecord, "name" | "data" | "keywords" | "type">>): Promise<boolean> {
    const map = await ensureIndex();
    const existing = map.get(id);
    if (!existing) return false;
    const updated = { ...existing, ...updates };
    map.set(id, updated);
    await store.setItem(id, updated);
    syncToRemote(updated);
    return true;
}

/** 增加使用计数 */
export async function incrementUsageCount(id: string): Promise<void> {
    const map = await ensureIndex();
    const existing = map.get(id);
    if (!existing) return;
    const updated = { ...existing, usage_count: existing.usage_count + 1 };
    map.set(id, updated);
    await store.setItem(id, updated);
    // 使用计数同步优先级低，静默处理
    if (isRemoteSyncEnabled()) {
        supabase.from("assets").update({ usage_count: updated.usage_count }).eq("id", id).then(() => {}, () => {});
    }
}

/** 删除资产 */
export async function deleteAsset(id: string): Promise<boolean> {
    const map = await ensureIndex();
    if (!map.has(id)) return false;
    map.delete(id);
    await store.removeItem(id);
    deleteFromRemote(id);
    return true;
}
