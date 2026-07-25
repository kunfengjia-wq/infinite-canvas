/**
 * 数据仓库接口层 - 预留数据库迁移
 * 当前实现：localforage (IndexedDB)
 * 未来实现：替换为 API 调用 (fetch → 后端 → PostgreSQL/MySQL)
 */
import localforage from "localforage";

import type { StoryboardProject } from "@/types/storyboard";
import type { PromptProject } from "@/types/prompt-studio";

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

// ─── 工厂（本地优先 + Supabase 后台同步）─────────────────────────

import { supabaseStoryboardRepo, supabasePromptProjectRepo, createSyncRepo } from "./supabase-repo";

const storyboardSyncRepo = createSyncRepo<StoryboardProject>(localStoryboardRepo, supabaseStoryboardRepo);
const promptProjectSyncRepo = createSyncRepo<PromptProject>(localPromptProjectRepo, supabasePromptProjectRepo);

export function getStoryboardRepo(): StoryboardRepo {
    return storyboardSyncRepo;
}

export function getPromptProjectRepo(): PromptProjectRepo {
    return promptProjectSyncRepo;
}
