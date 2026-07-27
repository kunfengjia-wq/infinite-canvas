/**
 * 数据仓库接口层 - 预留数据库迁移
 * 当前实现：localforage (IndexedDB)
 * 未来实现：替换为 API 调用 (fetch → 后端 → PostgreSQL/MySQL)
 */
import localforage from "localforage";

import type { StoryboardProject } from "@/types/storyboard";
import type { PromptProject } from "@/types/prompt-studio";
import type { ScriptProject, PreferenceRecord } from "@/types/script-creation";

// ─── 通用仓库接口 ───────────────────────────────────────────────

export interface Repository<T extends { id: string }> {
    list(): Promise<T[]>;
    get(id: string): Promise<T | null>;
    save(item: T): Promise<void>;
    remove(id: string): Promise<void>;
}

// ─── 分镜项目仓库 ───────────────────────────────────────────────

export interface StoryboardRepo extends Repository<StoryboardProject> {}

const storyboardStore = localforage.createInstance({ name: "infinite-canvas", storeName: "storyboard_projects" });

export const localStoryboardRepo: StoryboardRepo = {
    async list() {
        const projects: StoryboardProject[] = [];
        await storyboardStore.iterate<StoryboardProject, void>((value) => {
            projects.push(value);
        });
        return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    },
    async get(id) {
        return (await storyboardStore.getItem<StoryboardProject>(id)) ?? null;
    },
    async save(project) {
        await storyboardStore.setItem(project.id, project);
    },
    async remove(id) {
        await storyboardStore.removeItem(id);
    },
};

// ─── 提示词项目仓库 ─────────────────────────────────────────────

export interface PromptProjectRepo extends Repository<PromptProject> {}

const promptProjectStore = localforage.createInstance({ name: "infinite-canvas", storeName: "prompt_projects" });

export const localPromptProjectRepo: PromptProjectRepo = {
    async list() {
        const projects: PromptProject[] = [];
        await promptProjectStore.iterate<PromptProject, void>((value) => {
            projects.push(value);
        });
        return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    },
    async get(id) {
        return (await promptProjectStore.getItem<PromptProject>(id)) ?? null;
    },
    async save(project) {
        await promptProjectStore.setItem(project.id, project);
    },
    async remove(id) {
        await promptProjectStore.removeItem(id);
    },
};

// ─── 剧本创作项目仓库 ─────────────────────────────────────────────

export interface ScriptProjectRepo extends Repository<ScriptProject> {}

const scriptProjectStore = localforage.createInstance({ name: "infinite-canvas", storeName: "script_projects" });

export const localScriptProjectRepo: ScriptProjectRepo = {
    async list() {
        const projects: ScriptProject[] = [];
        await scriptProjectStore.iterate<ScriptProject, void>((value) => {
            projects.push(value);
        });
        return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    },
    async get(id) {
        return (await scriptProjectStore.getItem<ScriptProject>(id)) ?? null;
    },
    async save(project) {
        await scriptProjectStore.setItem(project.id, project);
    },
    async remove(id) {
        await scriptProjectStore.removeItem(id);
    },
};

// ─── 偏好记录仓库 ─────────────────────────────────────────────────

const preferenceStore = localforage.createInstance({ name: "infinite-canvas", storeName: "script_preferences" });

export const preferenceRepo = {
    async list(): Promise<PreferenceRecord[]> {
        const records: PreferenceRecord[] = [];
        await preferenceStore.iterate<PreferenceRecord, void>((value) => {
            records.push(value);
        });
        return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    async add(record: PreferenceRecord): Promise<void> {
        const key = `${record.cardType}_${Date.now()}`;
        await preferenceStore.setItem(key, record);
    },
    /** 获取某类型的最近 N 条偏好 */
    async getRecent(cardType: string, limit = 10): Promise<PreferenceRecord[]> {
        const all = await this.list();
        return all.filter((r) => r.cardType === cardType).slice(0, limit);
    },
};

// ─── 工厂（本地优先 + Supabase 后台同步）─────────────────────────

import { supabaseStoryboardRepo, supabasePromptProjectRepo, supabaseScriptProjectRepo, createSyncRepo } from "./supabase-repo";

const storyboardSyncRepo = createSyncRepo<StoryboardProject>(localStoryboardRepo, supabaseStoryboardRepo);
const promptProjectSyncRepo = createSyncRepo<PromptProject>(localPromptProjectRepo, supabasePromptProjectRepo);
const scriptProjectSyncRepo = createSyncRepo<ScriptProject>(localScriptProjectRepo, supabaseScriptProjectRepo);

export function getStoryboardRepo(): StoryboardRepo {
    return storyboardSyncRepo;
}

export function getPromptProjectRepo(): PromptProjectRepo {
    return promptProjectSyncRepo;
}

export function getScriptProjectRepo(): ScriptProjectRepo {
    return scriptProjectSyncRepo;
}
