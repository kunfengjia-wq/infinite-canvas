/**
 * 资产上下文工具函数（纯函数，无副作用，可独立测试）
 * 从 storyboard-source-panel.tsx 提取
 */
import type { StoryboardProject } from "@/types/storyboard";

type Shot = {
    shotType?: string;
    angle?: string;
    cameraMovement?: string;
    lens?: string;
    lighting?: string;
    composition?: string;
    action?: string;
    dialogue?: string;
    duration?: string;
    mood?: string;
    transition?: string;
    visualDescription?: string;
};

/** 构建资产上下文摘要（仅包含镜头文本中实际出现的资产，避免无关资产干扰提示词生成） */
export function buildAssetContextForShot(assets: StoryboardProject["assets"], shotText: string): string {
    if (!assets || !shotText) return "";
    const parts: string[] = [];
    const matchChars = (assets.characters ?? []).filter((c) => c.name && shotText.includes(c.name));
    if (matchChars.length) {
        parts.push("【角色资产（生成提示词时必须使用以下外观描述，禁止自行发明角色外貌）】");
        matchChars.forEach((c) => {
            parts.push(`- ${c.name}：${c.appearance}${c.costume ? `，服装：${c.costume}` : ""}${c.keywords ? ` [keywords: ${c.keywords}]` : ""}`);
        });
    }
    const matchLocs = (assets.locations ?? []).filter((l) => l.name && shotText.includes(l.name));
    if (matchLocs.length) {
        parts.push("【场景资产】");
        matchLocs.forEach((l) => {
            parts.push(`- ${l.name}：${l.description}${l.lighting ? `，光线：${l.lighting}` : ""}`);
        });
    }
    const matchProps = (assets.props ?? []).filter((p) => p.name && shotText.includes(p.name));
    if (matchProps.length) {
        parts.push("【道具资产】");
        matchProps.forEach((p) => {
            parts.push(`- ${p.name}：${p.description}`);
        });
    }
    const matchProducts = (assets.products ?? []).filter((p) => p.name && shotText.includes(p.name));
    if (matchProducts.length) {
        parts.push("【产品资产】");
        matchProducts.forEach((p) => {
            parts.push(`- ${p.name}：${p.appearance}${p.packaging ? `，包装：${p.packaging}` : ""}`);
        });
    }
    return parts.join("\n");
}

/** 扫描镜头文本，匹配其中出现的资产名，组装「镜头 · 角色：xx · 道具：xx」标注（确定性、不依赖 AI） */
export function describeShotAssets(text: string, assets: StoryboardProject["assets"]): string {
    const groups: string[] = [];
    const scan = (list: { name: string }[] | undefined, typeLabel: string) => {
        const names = (list ?? []).map((a) => a.name.trim()).filter((name) => name && text.includes(name));
        if (names.length > 0) groups.push(`${typeLabel}：${names.join("、")}`);
    };
    scan(assets?.characters, "角色");
    scan(assets?.locations, "场景");
    scan(assets?.props, "道具");
    scan(assets?.products, "产品");
    return groups.length > 0 ? `镜头 · ${groups.join(" · ")}` : "镜头";
}

/** 镜头是否含可用内容（画面描述 / 动作 / 对白 任一非空） */
export function shotHasContent(sh: Shot): boolean {
    return Boolean((sh.visualDescription ?? "").trim() || (sh.action ?? "").trim() || (sh.dialogue ?? "").trim());
}

/**
 * 将完整分镜行组装为自然语言描述（景别/角度/运镜/光线/构图/动作/对白/时长/氛围/转场/画面），
 * 作为视频提示词生成的输入
 */
export function composeShotInput(sh: Shot): string {
    const parts: string[] = [];
    const lensTags = [sh.shotType, sh.angle, sh.cameraMovement, sh.lens, sh.lighting, sh.composition].filter((v) => v && v.trim());
    if (lensTags.length > 0) parts.push(`镜头：${lensTags.join("，")}`);
    const action = (sh.action ?? "").trim();
    if (action) parts.push(`动作：${action}`);
    const dialogue = (sh.dialogue ?? "").trim();
    if (dialogue) parts.push(`对白：${dialogue}`);
    const duration = (sh.duration ?? "").trim();
    if (duration) parts.push(`时长：${duration}`);
    const mood = (sh.mood ?? "").trim();
    if (mood) parts.push(`氛围：${mood}`);
    const transition = (sh.transition ?? "").trim();
    if (transition) parts.push(`转场：${transition}`);
    const visual = (sh.visualDescription ?? "").trim();
    if (visual) parts.push(`场景：${visual}`);
    return parts.join("\n");
}
