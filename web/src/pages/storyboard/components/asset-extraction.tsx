import { LoaderCircle, MapPin, Package, Plus, Sparkles, Trash2, User, Wrench } from "lucide-react";
import { useState } from "react";
import { App, Button, Card, Empty, Input, Popconfirm, Tabs } from "antd";
import { nanoid } from "nanoid";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { aiExtractAssets } from "@/services/storyboard-ai";
import type { AiConfig } from "@/stores/use-config-store";
import type { CharacterAsset, LocationAsset, ProductAsset, PropAsset } from "@/types/storyboard";

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

    return (
        <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium">资产提取</h2>
                    <p className="mt-1 text-sm text-stone-500">AI 从剧本中提取角色、场景、道具、产品等视觉资产</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        icon={extracting ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                        onClick={handleExtract}
                        disabled={extracting || processing}
                    >
                        {extracting ? "AI 提取中..." : "AI 提取资产"}
                    </Button>
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
                                render={(c: CharacterAsset) => (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Input size="small" value={c.name} onChange={(e) => updateCharacter(c.id, { name: e.target.value })} placeholder="角色名" addonBefore="名称" />
                                        <Input size="small" value={c.costume || ""} onChange={(e) => updateCharacter(c.id, { costume: e.target.value || undefined })} placeholder="服装" addonBefore="服装" />
                                        <Input.TextArea size="small" rows={2} value={c.appearance} onChange={(e) => updateCharacter(c.id, { appearance: e.target.value })} placeholder="外貌描述（发色、体型、特征...）" className="sm:col-span-2" />
                                        <Input size="small" value={c.personality || ""} onChange={(e) => updateCharacter(c.id, { personality: e.target.value || undefined })} placeholder="性格" addonBefore="性格" />
                                        <Input size="small" value={c.keywords} onChange={(e) => updateCharacter(c.id, { keywords: e.target.value })} placeholder="AI 生图关键词（英文）" addonBefore="关键词" />
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
                                render={(l: LocationAsset) => (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Input size="small" value={l.name} onChange={(e) => updateLocation(l.id, { name: e.target.value })} placeholder="场景名" addonBefore="名称" />
                                        <div className="flex gap-2">
                                            <Input size="small" value={l.timeOfDay || ""} onChange={(e) => updateLocation(l.id, { timeOfDay: e.target.value || undefined })} placeholder="时间" addonBefore="时间" />
                                            <Input size="small" value={l.lighting || ""} onChange={(e) => updateLocation(l.id, { lighting: e.target.value || undefined })} placeholder="光线" addonBefore="光线" />
                                        </div>
                                        <Input.TextArea size="small" rows={2} value={l.description} onChange={(e) => updateLocation(l.id, { description: e.target.value })} placeholder="环境描述" className="sm:col-span-2" />
                                        <Input size="small" value={l.keywords} onChange={(e) => updateLocation(l.id, { keywords: e.target.value })} placeholder="AI 生图关键词（英文）" addonBefore="关键词" className="sm:col-span-2" />
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
                                render={(p: PropAsset) => (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Input size="small" value={p.name} onChange={(e) => updateProp(p.id, { name: e.target.value })} placeholder="道具名" addonBefore="名称" />
                                        <Input size="small" value={p.significance || ""} onChange={(e) => updateProp(p.id, { significance: e.target.value || undefined })} placeholder="剧情意义" addonBefore="意义" />
                                        <Input.TextArea size="small" rows={2} value={p.description} onChange={(e) => updateProp(p.id, { description: e.target.value })} placeholder="外观描述" className="sm:col-span-2" />
                                        <Input size="small" value={p.keywords} onChange={(e) => updateProp(p.id, { keywords: e.target.value })} placeholder="AI 生图关键词（英文）" addonBefore="关键词" className="sm:col-span-2" />
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
                                render={(p: ProductAsset) => (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Input size="small" value={p.name} onChange={(e) => updateProduct(p.id, { name: e.target.value })} placeholder="产品名" addonBefore="名称" />
                                        <Input size="small" value={p.brand || ""} onChange={(e) => updateProduct(p.id, { brand: e.target.value || undefined })} placeholder="品牌" addonBefore="品牌" />
                                        <Input.TextArea size="small" rows={2} value={p.appearance} onChange={(e) => updateProduct(p.id, { appearance: e.target.value })} placeholder="产品外观描述" className="sm:col-span-2" />
                                        <Input size="small" value={p.packaging || ""} onChange={(e) => updateProduct(p.id, { packaging: e.target.value || undefined })} placeholder="包装描述" addonBefore="包装" />
                                        <Input size="small" value={p.significance} onChange={(e) => updateProduct(p.id, { significance: e.target.value })} placeholder="品牌意义" addonBefore="意义" />
                                        <Input size="small" value={p.keywords} onChange={(e) => updateProduct(p.id, { keywords: e.target.value })} placeholder="AI 生图关键词（英文）" addonBefore="关键词" className="sm:col-span-2" />
                                    </div>
                                )}
                            />
                        ),
                    },
                ]}
            />
        </div>
    );
}

// ─── 通用资产卡片列表 ───
function AssetCardList<T extends { id: string; name: string }>({ items, empty, onAdd, onRemove, render }: {
    items: T[];
    empty: string;
    onAdd: () => void;
    onRemove: (id: string) => void;
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
                        <Popconfirm title="删除此资产？" onConfirm={() => onRemove(item.id)} okText="删除" cancelText="取消">
                            <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} className="opacity-0 transition group-hover:opacity-100" />
                        </Popconfirm>
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
