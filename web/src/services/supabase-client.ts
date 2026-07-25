import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://wqgvydmxiuhsxodduigi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxZ3Z5ZG14aXVoc3hvZGR1aWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NzEzMzEsImV4cCI6MjEwMDQ0NzMzMX0.gmFXYouU2jc0zLsW7KYbC-i-fEnp1SYXZc-xOfZQefU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type Dataset = {
    id: string;
    name: string;
    description: string;
    platform: string;
    category: string;
    created_at: string;
};

export type DatasetItem = {
    id: string;
    dataset_id: string;
    title: string;
    prompt: string;
    negative_prompt: string;
    platform: string;
    tags: string[];
    reference_image_url: string;
    quality_score: number;
    created_at: string;
};

export type Script = {
    id: string;
    title: string;
    content: string;
    genre: string;
    created_at: string;
};

export type Storyboard = {
    id: string;
    script_id: string;
    scene_number: number;
    description: string;
    camera_angle: string;
    mood: string;
    created_at: string;
};

export type GeneratedPrompt = {
    id: string;
    storyboard_id: string | null;
    platform: string;
    prompt: string;
    negative_prompt: string;
    params_json: Record<string, unknown>;
    created_at: string;
};
