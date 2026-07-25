import { LoaderCircle, MapPin, Package, Plus, RefreshCw, Send, Sparkles, Trash2, User, Wrench } from "lucide-react";
import { useState } from "react";
import { App, Button, Card, Empty, Input, Popconfirm, Popover, Radio, Select, Tabs, Tooltip } from "antd";
import { nanoid } from "nanoid";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { usePromptStudioStore } from "@/stores/use-prompt-studio-store";
import { aiExtractAssets, aiRegenerateAsset } from "@/services/storyboard-ai";
import type { AiConfig } from "@/stores/use-config-store";
import type { CharacterAsset, LocationAsset, ProductAsset, PropAsset } from "@/types/storyboard";
import { PLATFORM_LIST, type PromptCategory } from "@/types/prompt-studio";

export function AssetExtraction({ config, onError }: { config: AiConfig; onError: (msg: string) => void }) {
    const { message } = App.useApp();
    const { current, processing, setProcessing, setAssets, confirmAssets, saveCurrent } = useStoryboardStore();
    const [extracting, setExtracting] = useState(false);

    if (!current) return null;
    const assets = {
        characters: current.assets?.characters ?? [],
        locations: current.assets?.locations ?? [],
        props: current.assets?.props ?? [],
        products: current.assets?.products ?? [],
    };

    const handleExtract = async () => {
        setExtracting(true);
        setProcessing(true);
        try {
            const result = await aiExtractAssets(config, current.script);
            // 为每个资产补充 id
            setAssets({
                characters: (result.characters || []).map((c) => ({ ...c, id: c.id || nanoid() })),
                locations: (result.locations || []).map((l) => ({ ...l, id: l.id || nanoid() })),
                props: (result.props || []).map((p) => ({ ...p, id: p.id || nanoid() })),
                products: (result.products || []).map((p) => ({ ...p, id: p.id || nanoid() })),
            });
            const total = (result.characters?.length || 0) + (result.locations?.length || 0) + (result.props?.length || 0) + (result.products?.length || 0);
            message.success(`已提取 ${total} 项资产`);
        } catch (error) {
            onError(error instanceof Error ? error.message : "资产提取失败");
        } finally {
            setExtracting(false);
            setProcessing(false);
        }
    };

    const handleConfirm = async () => {
        const total = assets.characters.length + assets.locations.length + assets.props.length + assets.products.length;
        if (total === 0) {
            message.warning("请先提取或手动添加资产");
            return;
        }
        confirmAssets();
        await saveCurrent();
        message.success("资产已确认，进入场景拆分");
    };

    // ─── 资产编辑辅助 ───
    const updateCharacter = (id: string, patch: Partial<CharacterAsset>) =>
        setAssets({ ...assets, characters: assets.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    const updateLocation = (id: string, patch: Partial<LocationAsset>) =>
        setAssets({ ...assets, locations: assets.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
    const updateProp = (id: string, patch: Partial<PropAsset>) =>
        setAssets({ ...assets, props: assets.props.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    const updateProduct = (id: string, patch: Partial<ProductAsset>) =>
        setAssets({ ...assets, products: assets.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

    const total = assets.characters.length + assets.locations.length + assets.props.length + assets.products.length;

    /** 将资产关键词发送到提示词工作台（带视图/风格/平台选择） */
    const [sendPanel, setSendPanel] = useState<{ name: string; keywords: string; category: PromptCategory } | null>(null);
    const [sendFormat, setSendFormat] = useState("three-view");
    const [sendStyle, setSendStyle] = useState("photorealistic");
    const [sendPlatform, setSendPlatform] = useState("midjourney");

    /** 自然语言句式模板，{subject} 会被替换为 keywords */
    const FORMAT_OPTIONS: Record<string, { value: string; label: string; template: string }[]> = {
        character: [
            { value: "three-view", label: "三视图（正/侧/背）", template: "Professional character reference sheet of {subject}. Displayed in three aligned views: front, side, and back. Neutral T-pose, clean pure white background, no props, no scene elements." },
            { value: "four-view", label: "四视图（正/侧/背/3/4）", template: "Character turnaround model sheet of {subject}. Four aligned views: front, three-quarter, side, and back. Neutral standing pose, clean white background, production-ready reference." },
            { value: "bust", label: "半身特写", template: "Detailed character portrait bust shot of {subject}. Head and shoulders, facing camera, intricate facial details visible, clean neutral background." },
            { value: "fullbody", label: "全身单张", template: "Full body character concept art of {subject}. Single dynamic pose, entire figure visible head to toe, clean background, production quality." },
        ],
        scene: [
            { value: "wide", label: "全景（建立镜头）", template: "Wide establishing shot of {subject}. Full environment visible, cinematic composition, depth and scale conveyed, atmospheric perspective." },
            { value: "medium", label: "中景", template: "Medium shot of {subject}. Key environmental details in focus, balanced foreground and background, natural depth of field." },
            { value: "detail", label: "细节特写", template: "Extreme close-up detail shot of {subject}. Texture and material quality emphasized, shallow depth of field, macro photography feel." },
        ],
        prop: [
            { value: "single", label: "单物体（白底）", template: "Professional product photography of {subject}. Isolated on seamless white background, soft diffused studio lighting, sharp focus, no environment." },
            { value: "multi-angle", label: "多角度展示", template: "Multi-angle showcase of {subject}. Front, side, and top views arranged on white background, consistent studio lighting, technical reference style." },
            { value: "in-context", label: "场景搭配", template: "Lifestyle shot of {subject} placed in a natural real-world setting. Contextual environment, soft natural lighting, editorial photography style." },
        ],
        product: [
            { value: "hero", label: "主图（商业广告级）", template: "High-end commercial product photography of {subject}. Pristine white seamless background, professional three-point studio lighting, hero angle, advertising campaign quality, razor-sharp detail." },
            { value: "multi-angle", label: "多角度", template: "Product multi-angle presentation of {subject}. 360-degree views on clean white background, consistent professional lighting, e-commerce catalog style." },
            { value: "lifestyle", label: "场景生活化", template: "Lifestyle brand photography of {subject} in an aspirational real-life setting. Natural warm lighting, editorial composition, premium brand feel." },
        ],
    };

    const STYLE_OPTIONS = [
        { value: "photorealistic", label: "写实摄影", suffix: "Photorealistic, shot on Phase One IQ4 150MP, 8K resolution, hyper-detailed skin and material textures." },
        { value: "cinematic", label: "电影质感", suffix: "Cinematic film still quality, anamorphic lens, subtle film grain, professional color grading, ARRI Alexa 65 look." },
        { value: "commercial", label: "商业广告", suffix: "Premium advertising quality, retouched to perfection, magazine-cover sharpness, high-end brand aesthetic." },
        { value: "concept-art", label: "概念艺术", suffix: "Professional concept art for film production, painted realism, artstation trending quality, by senior visual development artist." },
        { value: "anime", label: "日系动漫", suffix: "High-quality anime illustration style, clean lineart, cel shading, vibrant colors, studio-quality animation key visual." },
        { value: "3d-render", label: "3D 渲染", suffix: "Photorealistic 3D render, Octane Render, global illumination, subsurface scattering, physically-based materials, 8K." },
    ];

    const doSend = async () => {
        if (!sendPanel) return;
        const { name, keywords, category } = sendPanel;
        if (!keywords.trim()) { message.warning("该资产没有关键词"); setSendPanel(null); return; }
        const options = FORMAT_OPTIONS[category] || FORMAT_OPTIONS.prop;
        const fmt = options.find((o) => o.value === sendFormat);
        const style = STYLE_OPTIONS.find((s) => s.value === sendStyle);
        const body = fmt ? fmt.template.replace("{subject}", keywords) : keywords;
        const finalPrompt = style ? `${body} ${style.suffix}` : body;
        const store = usePromptStudioStore.getState();
        if (!store.current) await store.createProject(`分镜资产-${current.title}`);
        usePromptStudioStore.getState().addEntry({ input: name, platform: sendPlatform, prompt: finalPrompt, category, style: style?.label });
        message.success(`「${name}」已发送到提示词工作台（${PLATFORM_LIST.find((p) => p.id === sendPlatform)?.label || sendPlatform}）`);
        setSendPanel(null);
    };

    /** 重新生成单个资产 */
    const [regenId, setRegenId] = useState<string | null>(null);
    const regenerateOne = async (id: string, name: string, type: "characters" | "locations" | "props" | "products") => {
        setRegenId(id);
        setProcessing(true);
        try {
            const result = await aiRegenerateAsset(config, current.script, type, name);
            const patch = { ...result, id, name: (result.name as string) || name };
            if (type === "characters") updateCharacter(id, patch as Partial<CharacterAsset>);
            else if (type === "locations") updateLocation(id, patch as Partial<LocationAsset>);
            else if (type === "props") updateProp(id, patch as Partial<PropAsset>);
            else updateProduct(id, patch as Partial<ProductAsset>);
            message.success(`「${name}」已重新生成`);
        } catch (error) {
            onError(error instanceof Error ? error.message : "重新生成失败");
        } finally {
            setRegenId(null);
            setProcessing(false);
        }
    };

    return (
        <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium">资产提取</h2>
                    <p className="mt-1 text-sm text-stone-500">AI 从剧本中提取角色、场景、道具、产品等视觉资产</p>
                </div>
                <div className="flex gap-2">
                    {total > 0 ? (
                        <Popconfirm title="重新提取将覆盖当前所有资产" description="已手动修改的内容会丢失，确定？" onConfirm={handleExtract} okText="重新提取" cancelText="取消">
                            <Button
                                icon={extracting ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                                disabled={extracting || processing}
                            >
                                {extracting ? "AI 提取中..." : "重新提取（覆盖）"}
                            </Button>
                        </Popconfirm>
                    ) : (
                        <Button
                            icon={extracting ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                            onClick={handleExtract}
                            disabled={extracting || processing}
                        >
                            {extracting ? "AI 提取中..." : "AI 提取资产"}
                        </Button>
                    )}
                    <Button type="primary" disabled={total === 0} onClick={handleConfirm}>
                        确认资产（{total} 项）→ 下一步
                    </Button>
                </div>
            </div>

            <Tabs
                items={[
                    {
                        key: "characters",
                        label: <span className="flex items-center gap-1"><User className="size-3.5" />角色（{assets.characters.length}）</span>,
                        children: (
                            <AssetCardList
                                empty="暂无角色资产"
                                items={assets.characters}
                                onAdd={() => setAssets({ ...assets, characters: [...assets.characters, { id: nanoid(), name: "新角色", appearance: "", keywords: "" }] })}
                                onRemove={(id) => setAssets({ ...assets, characters: assets.characters.filter((c) => c.id !== id) })}
                                onSend={(c) => { setSendFormat("three-view"); setSendPanel({ name: c.name, keywords: c.keywords, category: "character" }); }}
                                onRegen={(c) => void regenerateOne(c.id, c.name, "characters")}
                                regenId={regenId}
                                render={(c: CharacterAsset) => (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Input size="small" value={c.name} onChange={(e) => updateCharacter(c.id, { name: e.target.value })} placeholder="角色名" addonBefore="名称" />
                                        <Input size="small" value={c.costume || ""} onChange={(e) => updateCharacter(c.id, { costume: e.target.value || undefined })} placeholder="服装" addonBefore="服装" />
                                        <Input.TextArea size="small" rows={2} value={c.appearance} onChange={(e) => updateCharacter(c.id, { appearance: e.target.value })} placeholder="外貌描述（发色、体型、特征...）" className="sm:col-span-2" />
                                        <Input size="small" value={c.personality || ""} onChange={(e) => updateCharacter(c.id, { personality: e.target.value || undefined })} placeholder="性格" addonBefore="性格" />
                                        <Input size="small" value={c.keywords} onChange={(e) => updateCharacter(c.id, { keywords: e.target.value })} placeholder="AI 生图关键词（英文）" addonBefore="关键词" />
                                        {c.keywordsZh && <p className="text-xs text-stone-400 sm:col-span-2 m-0 leading-relaxed">译：{c.keywordsZh}</p>}
                                    </div>
                                )}
                            />
                        ),
                    },
                    {
                        key: "locations",
                        label: <span className="flex items-center gap-1"><MapPin className="size-3.5" />场景（{assets.locations.length}）</span>,
                        children: (
                            <AssetCardList
                                empty="暂无场景资产"
                                items={assets.locations}
                                onAdd={() => setAssets({ ...assets, locations: [...assets.locations, { id: nanoid(), name: "新场景", description: "", keywords: "" }] })}
                                onRemove={(id) => setAssets({ ...assets, locations: assets.locations.filter((l) => l.id !== id) })}
                                onSend={(l) => { setSendFormat("wide"); setSendPanel({ name: l.name, keywords: l.keywords, category: "scene" }); }}
                                onRegen={(l) => void regenerateOne(l.id, l.name, "locations")}
                                regenId={regenId}
                                render={(l: LocationAsset) => (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Input size="small" value={l.name} onChange={(e) => updateLocation(l.id, { name: e.target.value })} placeholder="场景名" addonBefore="名称" />
                                        <div className="flex gap-2">
                                            <Input size="small" value={l.timeOfDay || ""} onChange={(e) => updateLocation(l.id, { timeOfDay: e.target.value || undefined })} placeholder="时间" addonBefore="时间" />
                                            <Input size="small" value={l.lighting || ""} onChange={(e) => updateLocation(l.id, { lighting: e.target.value || undefined })} placeholder="光线" addonBefore="光线" />
                                        </div>
                                        <Input.TextArea size="small" rows={2} value={l.description} onChange={(e) => updateLocation(l.id, { description: e.target.value })} placeholder="环境描述" className="sm:col-span-2" />
                                        <Input size="small" value={l.keywords} onChange={(e) => updateLocation(l.id, { keywords: e.target.value })} placeholder="AI 生图关键词（英文）" addonBefore="关键词" className="sm:col-span-2" />
                                        {l.keywordsZh && <p className="text-xs text-stone-400 sm:col-span-2 m-0 leading-relaxed">译：{l.keywordsZh}</p>}
                                    </div>
                                )}
                            />
                        ),
                    },
                    {
                        key: "props",
                        label: <span className="flex items-center gap-1"><Wrench className="size-3.5" />道具（{assets.props.length}）</span>,
                        children: (
                            <AssetCardList
                                empty="暂无道具资产"
                                items={assets.props}
                                onAdd={() => setAssets({ ...assets, props: [...assets.props, { id: nanoid(), name: "新道具", description: "", keywords: "" }] })}
                                onRemove={(id) => setAssets({ ...assets, props: assets.props.filter((p) => p.id !== id) })}
                                onSend={(p) => { setSendFormat("single"); setSendPanel({ name: p.name, keywords: p.keywords, category: "prop" }); }}
                                onRegen={(p) => void regenerateOne(p.id, p.name, "props")}
                                regenId={regenId}
                                render={(p: PropAsset) => (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Input size="small" value={p.name} onChange={(e) => updateProp(p.id, { name: e.target.value })} placeholder="道具名" addonBefore="名称" />
                                        <Input size="small" value={p.significance || ""} onChange={(e) => updateProp(p.id, { significance: e.target.value || undefined })} placeholder="剧情意义" addonBefore="意义" />
                                        <Input.TextArea size="small" rows={2} value={p.description} onChange={(e) => updateProp(p.id, { description: e.target.value })} placeholder="外观描述" className="sm:col-span-2" />
                                        <Input size="small" value={p.keywords} onChange={(e) => updateProp(p.id, { keywords: e.target.value })} placeholder="AI 生图关键词（英文）" addonBefore="关键词" className="sm:col-span-2" />
                                        {p.keywordsZh && <p className="text-xs text-stone-400 sm:col-span-2 m-0 leading-relaxed">译：{p.keywordsZh}</p>}
                                    </div>
                                )}
                            />
                        ),
                    },
                    {
                        key: "products",
                        label: <span className="flex items-center gap-1"><Package className="size-3.5" />产品（{assets.products.length}）</span>,
                        children: (
                            <AssetCardList
                                empty="暂无产品资产（广告片核心资产）"
                                items={assets.products}
                                onAdd={() => setAssets({ ...assets, products: [...assets.products, { id: nanoid(), name: "新产品", appearance: "", significance: "", keywords: "" }] })}
                                onRemove={(id) => setAssets({ ...assets, products: assets.products.filter((p) => p.id !== id) })}
                                onSend={(p) => { setSendFormat("hero"); setSendPanel({ name: p.name, keywords: p.keywords, category: "product" }); }}
                                onRegen={(p) => void regenerateOne(p.id, p.name, "products")}
                                regenId={regenId}
                                render={(p: ProductAsset) => (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Input size="small" value={p.name} onChange={(e) => updateProduct(p.id, { name: e.target.value })} placeholder="产品名" addonBefore="名称" />
                                        <Input size="small" value={p.brand || ""} onChange={(e) => updateProduct(p.id, { brand: e.target.value || undefined })} placeholder="品牌" addonBefore="品牌" />
                                        <Input.TextArea size="small" rows={2} value={p.appearance} onChange={(e) => updateProduct(p.id, { appearance: e.target.value })} placeholder="产品外观描述" className="sm:col-span-2" />
                                        <Input size="small" value={p.packaging || ""} onChange={(e) => updateProduct(p.id, { packaging: e.target.value || undefined })} placeholder="包装描述" addonBefore="包装" />
                                        <Input size="small" value={p.significance} onChange={(e) => updateProduct(p.id, { significance: e.target.value })} placeholder="品牌意义" addonBefore="意义" />
                                        <Input size="small" value={p.keywords} onChange={(e) => updateProduct(p.id, { keywords: e.target.value })} placeholder="AI 生图关键词（英文）" addonBefore="关键词" className="sm:col-span-2" />
                                        {p.keywordsZh && <p className="text-xs text-stone-400 sm:col-span-2 m-0 leading-relaxed">译：{p.keywordsZh}</p>}
                                    </div>
                                )}
                            />
                        ),
                    },
                ]}
            />

            {/* 发送到提示词工作台 - 选择面板 */}
            {sendPanel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSendPanel(null)}>
                    <div className="w-[380px] rounded-xl bg-white p-5 shadow-2xl dark:bg-stone-800" onClick={(e) => e.stopPropagation()}>
                        <h4 className="mb-3 text-sm font-semibold">发送「{sendPanel.name}」到提示词工作台</h4>
                        <div className="space-y-3">
                            <div>
                                <p className="mb-1 text-xs text-stone-500">视图 / 格式</p>
                                <Radio.Group size="small" value={sendFormat} onChange={(e) => setSendFormat(e.target.value)} className="flex flex-col gap-1">
                                    {(FORMAT_OPTIONS[sendPanel.category] || FORMAT_OPTIONS.prop).map((o) => (
                                        <Radio key={o.value} value={o.value}>{o.label}</Radio>
                                    ))}
                                </Radio.Group>
                            </div>
                            <div>
                                <p className="mb-1 text-xs text-stone-500">画面风格</p>
                                <Select size="small" className="w-full" value={sendStyle} onChange={setSendStyle}
                                    options={STYLE_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
                                />
                            </div>
                            <div>
                                <p className="mb-1 text-xs text-stone-500">目标平台</p>
                                <Select size="small" className="w-full" value={sendPlatform} onChange={setSendPlatform}
                                    options={PLATFORM_LIST.map((p) => ({ value: p.id, label: `${p.label}${p.category === "video" ? "（视频）" : ""}` }))}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button size="small" onClick={() => setSendPanel(null)}>取消</Button>
                                <Button size="small" type="primary" icon={<Send className="size-3.5" />} onClick={() => void doSend()}>确认发送</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── 通用资产卡片列表 ───
function AssetCardList<T extends { id: string; name: string; keywords: string }>({ items, empty, onAdd, onRemove, onSend, onRegen, regenId, render }: {
    items: T[];
    empty: string;
    onAdd: () => void;
    onRemove: (id: string) => void;
    onSend?: (item: T) => void;
    onRegen?: (item: T) => void;
    regenId?: string | null;
    render: (item: T) => React.ReactNode;
}) {
    if (items.length === 0) {
        return (
            <div className="py-4">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />
                <div className="mt-2 text-center">
                    <Button size="small" type="dashed" icon={<Plus className="size-3.5" />} onClick={onAdd}>手动添加</Button>
                </div>
            </div>
        );
    }
    return (
        <div className="space-y-3">
            {items.map((item) => (
                <Card key={item.id} size="small" className="group bg-stone-50 dark:bg-stone-900/50" title={<span className="text-sm font-medium">{item.name}</span>}
                    extra={
                        <div className="flex items-center gap-0.5">
                            {onRegen && (
                                <Tooltip title="AI 重新生成此项">
                                    <Button type="text" size="small" icon={<RefreshCw className={`size-3.5 ${regenId === item.id ? "animate-spin" : ""}`} />} className="opacity-0 transition group-hover:opacity-100" disabled={regenId === item.id} onClick={() => onRegen(item)} />
                                </Tooltip>
                            )}
                            {onSend && (
                                <Tooltip title="发送关键词到提示词工作台">
                                    <Button type="text" size="small" icon={<Send className="size-3.5" />} className="opacity-0 transition group-hover:opacity-100" onClick={() => onSend(item)} />
                                </Tooltip>
                            )}
                            <Popconfirm title="删除此资产？" onConfirm={() => onRemove(item.id)} okText="删除" cancelText="取消">
                                <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} className="opacity-0 transition group-hover:opacity-100" />
                            </Popconfirm>
                        </div>
                    }
                >
                    {render(item)}
                </Card>
            ))}
            <Button size="small" type="dashed" icon={<Plus className="size-3.5" />} onClick={onAdd} block>
                添加
            </Button>
        </div>
    );
}
