import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://wqgvydmxiuhsxodduigi.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxZ3Z5ZG14aXVoc3hvZGR1aWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NzEzMzEsImV4cCI6MjEwMDQ0NzMzMX0.gmFXYouU2jc0zLsW7KYbC-i-fEnp1SYXZc-xOfZQefU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** 是否启用远程同步（可通过环境变量或运行时配置控制） */
export function isRemoteSyncEnabled(): boolean {
    return import.meta.env.VITE_REMOTE_SYNC !== "false";
}
