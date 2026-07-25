/**
 * Skills 仓库 - 从 Supabase 加载 AI Skill 配置
 * 策略：启动时加载一次并缓存，失败时降级到本地硬编码
 */
import { supabase } from "./supabase-client";

export interface SkillRecord {
    id: string;
    name: string;
    category: "storyboard" | "prompt" | "canvas";
    node_step: string | null;
    system_prompt: string;
    version: number;
    is_builtin: boolean;
    enabled: boolean;
}

export interface StylePresetRecord {
    id: string;
    label: string;
    keywords: string;
    category: "image" | "video" | "both";
    platform_hint: string | null;
    is_builtin: boolean;
    sort_order: number;
}

// ─── 内存缓存（带 TTL 自动过期）─────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟过期

let skillsCache: Map<string, SkillRecord> | null = null;
let stylePresetsCache: StylePresetRecord[] | null = null;
let skillsLoadPromise: Promise<void> | null = null;
let skillsCacheTime = 0;
let presetsCacheTime = 0;

function isSkillsCacheValid(): boolean {
    return skillsCache !== null && Date.now() - skillsCacheTime < CACHE_TTL_MS;
}

function isPresetsCacheValid(): boolean {
    return stylePresetsCache !== null && Date.now() - presetsCacheTime < CACHE_TTL_MS;
}

/** 加载所有启用的 skills 到缓存（TTL 过期后自动重新拉取） */
async function ensureSkillsLoaded(): Promise<void> {
    if (isSkillsCacheValid()) return;
    if (skillsLoadPromise) return skillsLoadPromise;

    skillsLoadPromise = (async () => {
        try {
            const { data, error } = await supabase
                .from("skills")
                .select("*")
                .eq("enabled", true);

            if (error) throw new Error(error.message);

            const map = new Map<string, SkillRecord>();
            for (const row of data || []) {
                map.set(row.id, row as SkillRecord);
            }
            skillsCache = map;
            skillsCacheTime = Date.now();
        } catch {
            // 加载失败，保留旧缓存（如有）或降级到本地
            if (!skillsCache) skillsCache = null;
        } finally {
            skillsLoadPromise = null;
        }
    })();

    return skillsLoadPromise;
}

/** 加载 style presets 到缓存（TTL 过期后自动重新拉取） */
async function ensureStylePresetsLoaded(): Promise<void> {
    if (isPresetsCacheValid()) return;
    try {
        const { data, error } = await supabase
            .from("style_presets")
            .select("*")
            .order("sort_order", { ascending: true });

        if (error) throw new Error(error.message);
        stylePresetsCache = (data || []) as StylePresetRecord[];
        presetsCacheTime = Date.now();
    } catch {
        if (!stylePresetsCache) stylePresetsCache = null;
    }
}

// ─── 公开 API ───────────────────────────────────────────────────

/**
 * 获取指定 skill 的 system prompt
 * 如果远程加载失败或 skill 不存在，返回 null（调用方使用本地 fallback）
 */
export async function getSkillPrompt(skillId: string): Promise<string | null> {
    await ensureSkillsLoaded();
    if (!skillsCache) return null;
    const skill = skillsCache.get(skillId);
    return skill?.system_prompt ?? null;
}

/**
 * 按 category + node_step 获取 skill prompt
 */
export async function getSkillByNodeStep(category: string, nodeStep: string): Promise<string | null> {
    await ensureSkillsLoaded();
    if (!skillsCache) return null;
    for (const skill of skillsCache.values()) {
        if (skill.category === category && skill.node_step === nodeStep) {
            return skill.system_prompt;
        }
    }
    return null;
}

/**
 * 获取所有 style presets（远程优先，失败返回 null）
 */
export async function getStylePresets(): Promise<StylePresetRecord[] | null> {
    await ensureStylePresetsLoaded();
    return stylePresetsCache;
}

/**
 * 强制刷新缓存（用于运行时更新 prompt 后）
 */
export function invalidateSkillsCache(): void {
    skillsCache = null;
    stylePresetsCache = null;
    skillsLoadPromise = null;
}

/**
 * 更新远程 skill 的 system_prompt（运行时编辑）
 */
export async function updateSkillPrompt(skillId: string, newPrompt: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from("skills")
            .update({ system_prompt: newPrompt, updated_at: new Date().toISOString() })
            .eq("id", skillId);

        if (error) return false;
        // 更新本地缓存
        if (skillsCache?.has(skillId)) {
            const skill = skillsCache.get(skillId)!;
            skillsCache.set(skillId, { ...skill, system_prompt: newPrompt });
        }
        return true;
    } catch {
        return false;
    }
}
