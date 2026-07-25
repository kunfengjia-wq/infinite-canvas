import { Copy, LoaderCircle, Plus, Sparkles, Trash2, User, MapPin, Package } from "lucide-react";
import { useState } from "react";
import { App, Button, Card, Input, Popconfirm, Tabs, Tag } from "antd";
import { nanoid } from "nanoid";

import { useStoryboardStore } from "@/stores/use-storyboard-store";
import { aiExtractAssets } from "@/services/storyboard-ai";
import { useCopyText } from "@/hooks/use-copy-text";
import type { AiConfig } from "@/stores/use-config-store";
import type { CharacterAsset, LocationAsset, PropAsset } from "@/types/storyboard";

export function AssetExtraction({ config, onError }: { config: AiConfig; onError: (msg: string) => void }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const { current, processing, setProcessing, setAssets, confirmAssets, saveCurrent } = useStoryboardStore();
    const [aiOutput, setAiOutput] = useState("");

    if (!current) return null;
    const { characters, locations, props } = current.assets;
    const totalAssets = characters.length + locations.length + props.length;

    const handleExtract = async () => {
        if (!current.script.trim()) {
            message.warning("剧本内容为空，请先输入剧本");
            return;
        }
        setProcessing(true);
        setAiOutput("");
        try {
            const assets = await aiExtractAssets(config, current.script, (delta) => setAiOutput((prev) => prev + delta));
            // 为每个资产添加 id
            const withIds = {
                characters: assets.characters.map((c) => ({ ...c, id: c.id || nanoid() })),
                locations: assets.locations.map((l) => ({ ...l, id: l.id || nanoid() })),
                props: assets.props.map((p) => ({ ...p, id: p.id || nanoid() })),
            };
            setAssets(withIds);
            message.success(`已提取 ${withIds.characters.length} 个角色、${withIds.locations.length} 个场景、${withIds.props.length} 个道具`);
        } catch (error) {
            onError(error instanceof Error ? error.message : "资产提取失败");
        } finally {
            setProcessing(false);
        }
    };

    const handleConfirm = async () => {
        if (totalAssets === 0) {
            message.warning("请先进行资产提取");
            return;
        }
        confirmAssets();
        await saveCurrent();
        message.success("资产已确认，进入场景拆分");
    };

    // ─── 角色编辑 ───
    const updateCharacter = (id: string, patch: Partial<CharacterAsset>) => {
        setAssets({ ...current.assets, characters: characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    };
    const removeCharacter = (id: string) => {
        setAssets({ ...current.assets, characters: characters.filter((c) => c.id !== id) });
    };
    const addCharacter = () => {
        setAssets({ ...current.assets, characters: [...characters, { id: nanoid(), name: "", appearance: "", keywords: "" }] });
    };

    // ─── 场景编辑 ───
    const updateLocation = (id: string, patch: Partial<LocationAsset>) => {
        setAssets({ ...current.assets, locations: locations.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
    };
    const removeLocation = (id: string) => {
        setAssets({ ...current.assets, locations: locations.filter((l) => l.id !== id) });
    };
    const addLocation = () => {
        setAssets({ ...current.assets, locations: [...locations, { id: nanoid(), name: "", description: "", keywords: "" }] });
    };

    // ─── 道具编辑 ───
    const updateProp = (id: string, patch: Partial<PropAsset>) => {
        setAssets({ ...current.assets, props: props.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    };
    const removeProp = (id: string) => {
        setAssets({ ...current.assets, props: props.filter((p) => p.id !== id) });
    };
    const addProp = () => {
        setAssets({ ...current.assets, props: [...props, { id: nanoid(), name: "", description: "", keywords: "" }] });
    };

    const tabItems = [
        {
            key: "characters",
            label: (
                <span className="flex items-center gap-1.5">
                    <User className="size-3.5" />
                    角色 <Tag className="m-0">{characters.length}</Tag>
                </span>
            ),
            children: (
                <div className="space-y-3">
                    {characters.map((char) => (
                        <Card key={char.id} size="small" className="group bg-stone-50 dark:bg-stone-900/50">
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex gap-2">
                                        <Input size="small" value={char.name} onChange={(e) => updateCharacter(char.id, { name: e.target.value })} placeholder="角色名" className="w-32 font-medium" />
                                        <Input size="small" value={char.costume || ""} onChange={(e) => updateCharacter(char.id, { costume: e.target.value || undefined })} placeholder="服装" className="w-40" />
                                    </div>
                                    <Input.TextArea size="small" value={char.appearance} onChange={(e) => updateCharacter(char.id, { appearance: e.target.value })} placeholder="外貌描述（发色、体型、特征等）" rows={2} className="text-sm" />
                                    <div>
                                        <span className="mb-1 block text-xs text-stone-400">角色提示词关键词</span>
                                        <Input.TextArea size="small" value={char.keywords} onChange={(e) => updateCharacter(char.id, { keywords: e.target.value })} placeholder="英文关键词，用于 AI 生图（如: young girl, long black hair, school uniform）" rows={2} className="font-mono text-xs text-blue-600 dark:text-blue-400" />
                                    </div>
                                </div>
                                <Popconfirm title="删除此角色？" onConfirm={() => removeCharacter(char.id)} okText="删除" cancelText="取消">
                                    <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} className="opacity-0 transition group-hover:opacity-100" />
                                </Popconfirm>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<Copy className="size-3.5" />}
                                    className="opacity-0 transition group-hover:opacity-100"
                                    title="复制角色信息"
                                    onClick={() => copyText(`${char.name}\n外貌：${char.appearance}${char.costume ? `\n服装：${char.costume}` : ""}\n关键词：${char.keywords}`, "角色已复制")}
                                />
                            </div>
                        </Card>
                    ))}
                    <Button size="small" type="dashed" icon={<Plus className="size-3.5" />} onClick={addCharacter} block>
                        添加角色
                    </Button>
                    {characters.length > 0 && (
                        <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(characters.map((c) => `${c.name}：${c.appearance}${c.costume ? `，服装：${c.costume}` : ""}\n关键词：${c.keywords}`).join("\n\n"), "已复制全部角色")} block>
                            复制全部角色
                        </Button>
                    )}
                </div>
            ),
        },
        {
            key: "locations",
            label: (
                <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5" />
                    场景 <Tag className="m-0">{locations.length}</Tag>
                </span>
            ),
            children: (
                <div className="space-y-3">
                    {locations.map((loc) => (
                        <Card key={loc.id} size="small" className="group bg-stone-50 dark:bg-stone-900/50">
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex gap-2">
                                        <Input size="small" value={loc.name} onChange={(e) => updateLocation(loc.id, { name: e.target.value })} placeholder="场景名称" className="w-40 font-medium" />
                                        <Input size="small" value={loc.timeOfDay || ""} onChange={(e) => updateLocation(loc.id, { timeOfDay: e.target.value || undefined })} placeholder="时间" className="w-24" />
                                        <Input size="small" value={loc.lighting || ""} onChange={(e) => updateLocation(loc.id, { lighting: e.target.value || undefined })} placeholder="光线" className="w-28" />
                                    </div>
                                    <Input.TextArea size="small" value={loc.description} onChange={(e) => updateLocation(loc.id, { description: e.target.value })} placeholder="环境描述" rows={2} className="text-sm" />
                                    <div>
                                        <span className="mb-1 block text-xs text-stone-400">场景提示词关键词</span>
                                        <Input.TextArea size="small" value={loc.keywords} onChange={(e) => updateLocation(loc.id, { keywords: e.target.value })} placeholder="英文关键词（如: classroom, morning light, wooden desks, blackboard）" rows={2} className="font-mono text-xs text-green-600 dark:text-green-400" />
                                    </div>
                                </div>
                                <Popconfirm title="删除此场景？" onConfirm={() => removeLocation(loc.id)} okText="删除" cancelText="取消">
                                    <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} className="opacity-0 transition group-hover:opacity-100" />
                                </Popconfirm>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<Copy className="size-3.5" />}
                                    className="opacity-0 transition group-hover:opacity-100"
                                    title="复制场景信息"
                                    onClick={() => copyText(`${loc.name}\n描述：${loc.description}${loc.timeOfDay ? `\n时间：${loc.timeOfDay}` : ""}${loc.lighting ? `\n光线：${loc.lighting}` : ""}\n关键词：${loc.keywords}`, "场景已复制")}
                                />
                            </div>
                        </Card>
                    ))}
                    <Button size="small" type="dashed" icon={<Plus className="size-3.5" />} onClick={addLocation} block>
                        添加场景
                    </Button>
                    {locations.length > 0 && (
                        <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(locations.map((l) => `${l.name}：${l.description}${l.timeOfDay ? `，时间：${l.timeOfDay}` : ""}${l.lighting ? `，光线：${l.lighting}` : ""}\n关键词：${l.keywords}`).join("\n\n"), "已复制全部场景")} block>
                            复制全部场景
                        </Button>
                    )}
                </div>
            ),
        },
        {
            key: "props",
            label: (
                <span className="flex items-center gap-1.5">
                    <Package className="size-3.5" />
                    道具 <Tag className="m-0">{props.length}</Tag>
                </span>
            ),
            children: (
                <div className="space-y-3">
                    {props.map((prop) => (
                        <Card key={prop.id} size="small" className="group bg-stone-50 dark:bg-stone-900/50">
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex gap-2">
                                        <Input size="small" value={prop.name} onChange={(e) => updateProp(prop.id, { name: e.target.value })} placeholder="道具名称" className="w-40 font-medium" />
                                        <Input size="small" value={prop.significance || ""} onChange={(e) => updateProp(prop.id, { significance: e.target.value || undefined })} placeholder="剧情意义" className="flex-1" />
                                    </div>
                                    <Input.TextArea size="small" value={prop.description} onChange={(e) => updateProp(prop.id, { description: e.target.value })} placeholder="外观描述" rows={2} className="text-sm" />
                                    <div>
                                        <span className="mb-1 block text-xs text-stone-400">道具提示词关键词</span>
                                        <Input.TextArea size="small" value={prop.keywords} onChange={(e) => updateProp(prop.id, { keywords: e.target.value })} placeholder="英文关键词（如: old leather notebook, handwritten notes, worn edges）" rows={2} className="font-mono text-xs text-orange-600 dark:text-orange-400" />
                                    </div>
                                </div>
                                <Popconfirm title="删除此道具？" onConfirm={() => removeProp(prop.id)} okText="删除" cancelText="取消">
                                    <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />} className="opacity-0 transition group-hover:opacity-100" />
                                </Popconfirm>
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<Copy className="size-3.5" />}
                                    className="opacity-0 transition group-hover:opacity-100"
                                    title="复制道具信息"
                                    onClick={() => copyText(`${prop.name}\n描述：${prop.description}${prop.significance ? `\n意义：${prop.significance}` : ""}\n关键词：${prop.keywords}`, "道具已复制")}
                                />
                            </div>
                        </Card>
                    ))}
                    <Button size="small" type="dashed" icon={<Plus className="size-3.5" />} onClick={addProp} block>
                        添加道具
                    </Button>
                    {props.length > 0 && (
                        <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(props.map((p) => `${p.name}：${p.description}${p.significance ? `（${p.significance}）` : ""}\n关键词：${p.keywords}`).join("\n\n"), "已复制全部道具")} block>
                            复制全部道具
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium">资产提取</h2>
                    <p className="mt-1 text-sm text-stone-500">AI 从剧本中提取角色、场景、道具，并生成对应的提示词关键词</p>
                </div>
                <div className="flex gap-2">
                    <Button type="primary" icon={processing ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} loading={processing} onClick={handleExtract}>
                        AI 提取资产
                    </Button>
                </div>
            </div>

            {processing && aiOutput && (
                <Card size="small" className="mb-4 bg-stone-50 dark:bg-stone-900">
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-stone-500">{aiOutput}</pre>
                </Card>
            )}

            {totalAssets > 0 ? (
                <Tabs items={tabItems} defaultActiveKey="characters" />
            ) : (
                !processing && (
                    <div className="py-12 text-center text-stone-400">
                        <p>点击「AI 提取资产」自动分析剧本中的角色、场景和道具</p>
                        <p className="mt-1 text-xs">提取后可编辑每项资产的提示词关键词</p>
                    </div>
                )
            )}

            <div className="mt-6 flex justify-end">
                <Button type="primary" size="large" disabled={totalAssets === 0} onClick={handleConfirm}>
                    确认资产（{totalAssets} 项）→ 下一步
                </Button>
            </div>
        </div>
    );
}
