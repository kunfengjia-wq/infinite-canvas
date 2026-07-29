import { describe, it, expect } from "vitest";
import { buildAssetContextForShot, describeShotAssets, shotHasContent, composeShotInput } from "./asset-context";
import type { StoryboardProject } from "@/types/storyboard";

type Assets = StoryboardProject["assets"];

const assets: Assets = {
    characters: [
        { id: "c1", name: "林晓", appearance: "长发女性", personality: "温柔", costume: "白色连衣裙", keywords: "young woman, long hair", keywordsZh: "年轻女性" },
        { id: "c2", name: "陈风", appearance: "短发男性", personality: "刚毅", costume: "黑色西装", keywords: "man, short hair", keywordsZh: "男性" },
    ],
    locations: [
        { id: "l1", name: "海边悬崖", description: "悬崖边的草地", timeOfDay: "黄昏", lighting: "暖光", keywords: "cliff", keywordsZh: "悬崖" },
    ],
    props: [
        { id: "p1", name: "红色雨伞", description: "一把红色折叠伞", significance: "定情信物", keywords: "red umbrella", keywordsZh: "红色雨伞" },
    ],
    products: [
        { id: "pr1", name: "香水", brand: "TestBrand", appearance: "玻璃瓶身", packaging: "金色礼盒", significance: "核心产品", keywords: "perfume", keywordsZh: "香水" },
    ],
};

// ─── buildAssetContextForShot ─────────────────────────────────────

describe("buildAssetContextForShot", () => {
    it("returns empty for empty shotText", () => {
        expect(buildAssetContextForShot(assets, "")).toBe("");
    });

    it("returns empty for null assets", () => {
        expect(buildAssetContextForShot(null as unknown as Assets, "林晓")).toBe("");
    });

    it("matches only characters mentioned in shot text", () => {
        const result = buildAssetContextForShot(assets, "林晓站在悬崖边");
        expect(result).toContain("林晓");
        expect(result).toContain("长发女性");
        expect(result).not.toContain("陈风");
    });

    it("matches locations mentioned in shot text", () => {
        const result = buildAssetContextForShot(assets, "镜头拉远，海边悬崖全貌");
        expect(result).toContain("【场景资产】");
        expect(result).toContain("海边悬崖");
        expect(result).toContain("暖光");
    });

    it("matches props mentioned in shot text", () => {
        const result = buildAssetContextForShot(assets, "林晓撑起红色雨伞");
        expect(result).toContain("【道具资产】");
        expect(result).toContain("红色雨伞");
    });

    it("matches products mentioned in shot text", () => {
        const result = buildAssetContextForShot(assets, "特写：香水放在桌上");
        expect(result).toContain("【产品资产】");
        expect(result).toContain("香水");
        expect(result).toContain("金色礼盒");
    });

    it("returns empty when no assets match", () => {
        const result = buildAssetContextForShot(assets, "一个陌生人走在街上");
        expect(result).toBe("");
    });

    it("includes keywords for matched characters", () => {
        const result = buildAssetContextForShot(assets, "林晓回头微笑");
        expect(result).toContain("[keywords: young woman, long hair]");
    });
});

// ─── describeShotAssets ───────────────────────────────────────────

describe("describeShotAssets", () => {
    it("returns plain 镜头 when no assets match", () => {
        expect(describeShotAssets("无人场景", assets)).toBe("镜头");
    });

    it("labels matched character", () => {
        const result = describeShotAssets("林晓走在路上", assets);
        expect(result).toContain("角色：林晓");
    });

    it("labels multiple types", () => {
        const result = describeShotAssets("林晓在海边悬崖撑起红色雨伞", assets);
        expect(result).toContain("角色：林晓");
        expect(result).toContain("场景：海边悬崖");
        expect(result).toContain("道具：红色雨伞");
        expect(result).toMatch(/^镜头 · /);
    });

    it("handles undefined assets gracefully", () => {
        expect(describeShotAssets("任意文本", undefined as unknown as Assets)).toBe("镜头");
    });
});

// ─── shotHasContent ───────────────────────────────────────────────

describe("shotHasContent", () => {
    it("returns true when visualDescription present", () => {
        expect(shotHasContent({ visualDescription: "远景" })).toBe(true);
    });

    it("returns true when action present", () => {
        expect(shotHasContent({ action: "奔跑" })).toBe(true);
    });

    it("returns true when dialogue present", () => {
        expect(shotHasContent({ dialogue: "你好" })).toBe(true);
    });

    it("returns false when all empty", () => {
        expect(shotHasContent({})).toBe(false);
        expect(shotHasContent({ visualDescription: "", action: "  ", dialogue: "" })).toBe(false);
    });
});

// ─── composeShotInput ─────────────────────────────────────────────

describe("composeShotInput", () => {
    it("composes full shot description", () => {
        const result = composeShotInput({
            shotType: "中景",
            angle: "平角",
            cameraMovement: "推",
            action: "林晓转身",
            dialogue: "再见",
            duration: "3s",
            mood: "忧伤",
            transition: "淡出",
            visualDescription: "海边悬崖黄昏",
        });
        expect(result).toContain("镜头：中景，平角，推");
        expect(result).toContain("动作：林晓转身");
        expect(result).toContain("对白：再见");
        expect(result).toContain("时长：3s");
        expect(result).toContain("氛围：忧伤");
        expect(result).toContain("转场：淡出");
        expect(result).toContain("场景：海边悬崖黄昏");
    });

    it("omits empty fields", () => {
        const result = composeShotInput({ shotType: "特写", action: "握手" });
        expect(result).toContain("镜头：特写");
        expect(result).toContain("动作：握手");
        expect(result).not.toContain("对白");
        expect(result).not.toContain("时长");
        expect(result).not.toContain("氛围");
    });

    it("returns empty string for empty shot", () => {
        expect(composeShotInput({})).toBe("");
    });

    it("includes lighting and composition in lens tags", () => {
        const result = composeShotInput({ lighting: "逆光", composition: "三分法" });
        expect(result).toContain("逆光");
        expect(result).toContain("三分法");
    });
});
