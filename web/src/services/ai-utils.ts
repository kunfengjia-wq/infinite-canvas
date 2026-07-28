/**
 * AI 服务公共工具函数
 * 消除 storyboard-ai.ts / script-creation-ai.ts 中的重复代码
 */

/** 带重试的 AI 调用包装（JSON 解析失败时自动重试） */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // 仅在 JSON 解析类错误时重试，其他错误直接抛出
            if (!lastError.message.includes("JSON") && !lastError.message.includes("格式异常")) throw lastError;
        }
    }
    throw lastError ?? new Error("重试耗尽");
}

/** 从 AI 输出中提取 JSON 数组 */
export function parseJsonArray<T>(raw: string): T[] {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("AI 返回格式异常，未找到 JSON 数组");
    const jsonStr = cleaned.slice(start, end + 1);
    try {
        return JSON.parse(jsonStr) as T[];
    } catch {
        throw new Error("AI 返回的 JSON 解析失败，请重试");
    }
}

/** 从 AI 输出中提取 JSON 对象 */
export function parseJsonObject<T>(raw: string): T {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("AI 返回格式异常，未找到 JSON 对象");
    const jsonStr = cleaned.slice(start, end + 1);
    try {
        return JSON.parse(jsonStr) as T;
    } catch {
        throw new Error("AI 返回的 JSON 解析失败，请重试");
    }
}
