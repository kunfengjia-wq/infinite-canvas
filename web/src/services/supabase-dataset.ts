import { supabase, type Dataset, type DatasetItem, type Script, type Storyboard, type GeneratedPrompt } from "./supabase-client";

// ===== 数据集 =====

export async function fetchDatasets(): Promise<Dataset[]> {
    const { data, error } = await supabase.from("datasets").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
}

export async function createDataset(input: Pick<Dataset, "name" | "description" | "platform" | "category">): Promise<Dataset> {
    const { data, error } = await supabase.from("datasets").insert(input).select().single();
    if (error) throw new Error(error.message);
    return data;
}

export async function deleteDataset(id: string): Promise<void> {
    const { error } = await supabase.from("datasets").delete().eq("id", id);
    if (error) throw new Error(error.message);
}

// ===== 数据集条目 =====

export async function fetchDatasetItems(datasetId: string): Promise<DatasetItem[]> {
    const { data, error } = await supabase.from("dataset_items").select("*").eq("dataset_id", datasetId).order("quality_score", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
}

export async function fetchItemsByPlatform(platform: string, limit = 20): Promise<DatasetItem[]> {
    const { data, error } = await supabase.from("dataset_items").select("*").eq("platform", platform).order("quality_score", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
}

export async function createDatasetItem(input: Omit<DatasetItem, "id" | "created_at">): Promise<DatasetItem> {
    const { data, error } = await supabase.from("dataset_items").insert(input).select().single();
    if (error) throw new Error(error.message);
    return data;
}

export async function deleteDatasetItem(id: string): Promise<void> {
    const { error } = await supabase.from("dataset_items").delete().eq("id", id);
    if (error) throw new Error(error.message);
}

// ===== 剧本 =====

export async function fetchScripts(): Promise<Script[]> {
    const { data, error } = await supabase.from("scripts").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
}

export async function createScript(input: Pick<Script, "title" | "content" | "genre">): Promise<Script> {
    const { data, error } = await supabase.from("scripts").insert(input).select().single();
    if (error) throw new Error(error.message);
    return data;
}

// ===== 分镜 =====

export async function fetchStoryboards(scriptId: string): Promise<Storyboard[]> {
    const { data, error } = await supabase.from("storyboards").select("*").eq("script_id", scriptId).order("scene_number");
    if (error) throw new Error(error.message);
    return data || [];
}

export async function createStoryboard(input: Omit<Storyboard, "id" | "created_at">): Promise<Storyboard> {
    const { data, error } = await supabase.from("storyboards").insert(input).select().single();
    if (error) throw new Error(error.message);
    return data;
}

// ===== 生成的提示词 =====

export async function saveGeneratedPrompt(input: Omit<GeneratedPrompt, "id" | "created_at">): Promise<GeneratedPrompt> {
    const { data, error } = await supabase.from("generated_prompts").insert(input).select().single();
    if (error) throw new Error(error.message);
    return data;
}

export async function fetchGeneratedPrompts(platform?: string): Promise<GeneratedPrompt[]> {
    let query = supabase.from("generated_prompts").select("*").order("created_at", { ascending: false }).limit(50);
    if (platform) query = query.eq("platform", platform);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
}
