import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, parseJsonArray, parseJsonObject, TtlCache } from "./ai-utils";

// ─── parseJsonArray ───────────────────────────────────────────────

describe("parseJsonArray", () => {
    it("parses plain JSON array", () => {
        expect(parseJsonArray('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it("strips markdown code fences", () => {
        const raw = '```json\n["a","b"]\n```';
        expect(parseJsonArray(raw)).toEqual(["a", "b"]);
    });

    it("extracts array from surrounding text", () => {
        const raw = 'Here is the result: [{"id":1}] done';
        expect(parseJsonArray(raw)).toEqual([{ id: 1 }]);
    });

    it("throws on missing array", () => {
        expect(() => parseJsonArray("no array here")).toThrow("格式异常");
    });

    it("throws on invalid JSON", () => {
        expect(() => parseJsonArray("[invalid]")).toThrow("JSON 解析失败");
    });
});

// ─── parseJsonObject ──────────────────────────────────────────────

describe("parseJsonObject", () => {
    it("parses plain JSON object", () => {
        expect(parseJsonObject('{"key":"value"}')).toEqual({ key: "value" });
    });

    it("strips markdown code fences", () => {
        const raw = '```json\n{"a":1}\n```';
        expect(parseJsonObject(raw)).toEqual({ a: 1 });
    });

    it("extracts object from surrounding text", () => {
        const raw = 'Result: {"name":"test"} end';
        expect(parseJsonObject(raw)).toEqual({ name: "test" });
    });

    it("throws on missing object", () => {
        expect(() => parseJsonObject("no object")).toThrow("格式异常");
    });

    it("throws on invalid JSON", () => {
        expect(() => parseJsonObject("{bad}")).toThrow("JSON 解析失败");
    });
});

// ─── withRetry ────────────────────────────────────────────────────

describe("withRetry", () => {
    it("returns result on first success", async () => {
        const fn = vi.fn().mockResolvedValue("ok");
        await expect(withRetry(fn)).resolves.toBe("ok");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries on JSON parse error", async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error("JSON 解析失败"))
            .mockResolvedValue("recovered");
        await expect(withRetry(fn)).resolves.toBe("recovered");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("retries on 格式异常 error", async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error("AI 返回格式异常"))
            .mockResolvedValue("ok");
        await expect(withRetry(fn)).resolves.toBe("ok");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry on non-JSON errors", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("网络超时"));
        await expect(withRetry(fn)).rejects.toThrow("网络超时");
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("throws after max retries exhausted", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("JSON error"));
        await expect(withRetry(fn, 2)).rejects.toThrow("JSON error");
        expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
});

// ─── TtlCache ─────────────────────────────────────────────────────

describe("TtlCache", () => {
    let mockStorage: Map<string, string>;

    beforeEach(() => {
        mockStorage = new Map();
        vi.stubGlobal("sessionStorage", {
            getItem: (key: string) => mockStorage.get(key) ?? null,
            setItem: (key: string, value: string) => mockStorage.set(key, value),
            removeItem: (key: string) => mockStorage.delete(key),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("stores and retrieves value", () => {
        const cache = new TtlCache("test");
        cache.set("k1", "v1");
        expect(cache.get("k1")).toBe("v1");
    });

    it("returns undefined for missing key", () => {
        const cache = new TtlCache("test");
        expect(cache.get("nonexistent")).toBeUndefined();
    });

    it("expires after TTL", () => {
        vi.useFakeTimers();
        const cache = new TtlCache("test", 1000);
        cache.set("k1", "v1");
        expect(cache.get("k1")).toBe("v1");

        vi.advanceTimersByTime(1001);
        expect(cache.get("k1")).toBeUndefined();
        vi.useRealTimers();
    });

    it("persists to sessionStorage", () => {
        const cache = new TtlCache("pfx");
        cache.set("key", "val");
        const raw = mockStorage.get("pfx:key");
        expect(raw).toBeDefined();
        const entry = JSON.parse(raw!);
        expect(entry.value).toBe("val");
        expect(entry.expiresAt).toBeGreaterThan(Date.now());
    });

    it("reads from sessionStorage when mem cache is empty", () => {
        const cache1 = new TtlCache("shared");
        cache1.set("k", "from-session");

        // Simulate a new instance (e.g. after page reload)
        const cache2 = new TtlCache("shared");
        expect(cache2.get("k")).toBe("from-session");
    });

    it("removes expired entry from sessionStorage", () => {
        vi.useFakeTimers();
        const cache = new TtlCache("exp", 500);
        cache.set("k", "v");

        vi.advanceTimersByTime(501);
        // Create new instance to force sessionStorage read path
        const cache2 = new TtlCache("exp", 500);
        expect(cache2.get("k")).toBeUndefined();
        expect(mockStorage.has("exp:k")).toBe(false);
        vi.useRealTimers();
    });
});
