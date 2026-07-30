import { Check, LoaderCircle, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { App, Button, Input, Tag } from "antd";

import { useScriptCreationStore } from "@/stores/use-script-creation-store";
import { aiGenerateInspirationCards, aiRefreshCardsByType } from "@/services/script-creation-ai";
import { CARD_TYPE_META, CARD_TYPE_ORDER } from "@/types/script-creation";
import type { InspirationCard, InspirationCardType } from "@/types/script-creation";
import type { AiConfig } from "@/stores/use-config-store";
import { cn } from "@/lib/utils";

export function InspirationCards({ config }: { config: AiConfig }) {
    const { message } = App.useApp();
    const { current, processing, setProcessing, setCards, toggleCard, updateCardDescription, addCustomCard, removeCardsByType, appendCards, confirmCards, saveCurrent } = useScriptCreationStore();
    const [refreshingType, setRefreshingType] = useState<InspirationCardType | null>(null);
    const [addingType, setAddingType] = useState<InspirationCardType | null>(null);
    const [customTitle, setCustomTitle] = useState("");
    const [customDesc, setCustomDesc] = useState("");
    const [editingCardId, setEditingCardId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");

    if (!current) return null;

    const hasCards = current.cards.length > 0;
    const selectedCount = current.cards.filter((c) => c.selected).length;

    /** 首次生成卡片 */
    const handleGenerate = async () => {
        setProcessing(true);
        try {
            const batch = current.cardBatch + 1;
            const cards = await aiGenerateInspirationCards(config, current.seed, batch);
            setCards(cards);
            useScriptCreationStore.setState((state) => (state.current ? { current: { ...state.current, cardBatch: batch } } : state));
            message.success(`已生成 ${cards.length} 张灵感卡片，勾选你心动的元素！`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "生成失败");
        } finally {
            setProcessing(false);
            void saveCurrent();
        }
    };

    /** 按类型换一批 */
    const handleRefreshType = async (type: InspirationCardType) => {
        setRefreshingType(type);
        try {
            const existing = current.cards.filter((c) => c.type === type).map((c) => c.title);
            const newCards = await aiRefreshCardsByType(config, current.seed, type, existing);
            removeCardsByType(type);
            appendCards(newCards);
            message.success(`${CARD_TYPE_META[type].label}已刷新`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "刷新失败");
        } finally {
            setRefreshingType(null);
            void saveCurrent();
        }
    };

    /** 添加自定义卡片 */
    const handleAddCustom = (type: InspirationCardType) => {
        if (!customTitle.trim()) return;
        addCustomCard(type, customTitle.trim(), customDesc.trim() || "自定义灵感");
        setAddingType(null);
        setCustomTitle("");
        setCustomDesc("");
        void saveCurrent();
    };

    /** 确认选择，进入下一阶段 */
    const handleConfirm = () => {
        if (selectedCount === 0) {
            message.warning("请至少勾选一张卡片");
            return;
        }
        confirmCards();
        message.success("偏好已记录，进入设定构建！");
    };

    return (
        <div className="mx-auto max-w-5xl">
            {/* 种子展示 */}
            <div className="mb-6 rounded-xl border border-stone-200 bg-gradient-to-r from-blue-50/50 to-purple-50/50 p-4 dark:border-stone-700 dark:from-blue-950/20 dark:to-purple-950/20">
                <p className="text-xs font-medium text-stone-400">灵感种子</p>
                <p className="mt-1 text-lg font-medium">「{current.seed}」</p>
            </div>

            {/* 未生成：引导 */}
            {!hasCards && !processing && (
                <div className="flex flex-col items-center gap-4 py-16">
                    <Sparkles className="size-12 text-stone-300 dark:text-stone-600" />
                    <p className="text-stone-500">点击下方按钮，AI 将为你生成 6 类灵感卡片</p>
                    <Button type="primary" size="large" icon={<Sparkles className="size-4" />} onClick={handleGenerate}>
                        生成灵感卡片
                    </Button>
                </div>
            )}

            {/* 生成中 */}
            {processing && (
                <div className="flex flex-col items-center gap-3 py-16">
                    <LoaderCircle className="size-10 animate-spin text-blue-500" />
                    <p className="text-sm text-stone-500">AI 正在发散创意，生成灵感卡片...</p>
                </div>
            )}

            {/* 卡片区域 */}
            {hasCards && !processing && (
                <>
                    <div className="space-y-6">
                        {CARD_TYPE_ORDER.map((type) => {
                            const meta = CARD_TYPE_META[type];
                            const cards = current.cards.filter((c) => c.type === type);
                            if (cards.length === 0) return null;
                            return (
                                <CardGroup
                                    key={type}
                                    type={type}
                                    cards={cards}
                                    refreshing={refreshingType === type}
                                    adding={addingType === type}
                                    customTitle={customTitle}
                                    customDesc={customDesc}
                                    editingCardId={editingCardId}
                                    editText={editText}
                                    onToggle={toggleCard}
                                    onRefresh={() => void handleRefreshType(type)}
                                    onStartAdd={() => { setAddingType(type); setCustomTitle(""); setCustomDesc(""); }}
                                    onCancelAdd={() => setAddingType(null)}
                                    onCustomTitle={setCustomTitle}
                                    onCustomDesc={setCustomDesc}
                                    onAddCustom={() => handleAddCustom(type)}
                                    onStartEdit={(id, desc) => { setEditingCardId(id); setEditText(desc); }}
                                    onEditChange={setEditText}
                                    onEditSave={(id) => { updateCardDescription(id, editText); setEditingCardId(null); void saveCurrent(); }}
                                />
                            );
                        })}
                    </div>

                    {/* 底部操作栏 */}
                    <div className="sticky bottom-4 mt-8 flex items-center justify-between rounded-xl border border-stone-200 bg-white/90 px-5 py-3 shadow-lg backdrop-blur dark:border-stone-700 dark:bg-stone-900/90">
                        <span className="text-sm text-stone-500">
                            已选择 <span className="font-semibold text-blue-600">{selectedCount}</span> 张卡片
                        </span>
                        <div className="flex gap-3">
                            <Button icon={<RefreshCw className="size-4" />} onClick={handleGenerate}>
                                全部重新生成
                            </Button>
                            <Button type="primary" onClick={handleConfirm} disabled={selectedCount === 0}>
                                确认选择，构建设定 →
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── 卡片分组 ───────────────────────────────────────────────────

function CardGroup({
    type,
    cards,
    refreshing,
    adding,
    customTitle,
    customDesc,
    editingCardId,
    editText,
    onToggle,
    onRefresh,
    onStartAdd,
    onCancelAdd,
    onCustomTitle,
    onCustomDesc,
    onAddCustom,
    onStartEdit,
    onEditChange,
    onEditSave,
}: {
    type: InspirationCardType;
    cards: InspirationCard[];
    refreshing: boolean;
    adding: boolean;
    customTitle: string;
    customDesc: string;
    editingCardId: string | null;
    editText: string;
    onToggle: (id: string) => void;
    onRefresh: () => void;
    onStartAdd: () => void;
    onCancelAdd: () => void;
    onCustomTitle: (v: string) => void;
    onCustomDesc: (v: string) => void;
    onAddCustom: () => void;
    onStartEdit: (id: string, desc: string) => void;
    onEditChange: (v: string) => void;
    onEditSave: (id: string) => void;
}) {
    const meta = CARD_TYPE_META[type];
    return (
        <div>
            <div className="mb-2 flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                <span className="text-sm font-semibold">{meta.label}</span>
                <span className="text-xs text-stone-400">{meta.question}</span>
                <div className="ml-auto flex gap-1">
                    <Button type="text" size="small" icon={<Plus className="size-3.5" />} onClick={onStartAdd}>
                        自定义
                    </Button>
                    <Button type="text" size="small" icon={refreshing ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} onClick={onRefresh} disabled={refreshing}>
                        换一批
                    </Button>
                </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((card) => (
                    <button
                        key={card.id}
                        type="button"
                        onClick={() => onToggle(card.id)}
                        className={cn(
                            "group relative rounded-lg border p-3 text-left transition-all",
                            card.selected
                                ? "border-blue-400 bg-blue-50 shadow-sm ring-1 ring-blue-300 dark:border-blue-600 dark:bg-blue-950/40 dark:ring-blue-700"
                                : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm dark:border-stone-700 dark:bg-stone-800/60 dark:hover:border-stone-600",
                        )}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-medium">{card.title}</span>
                            <span
                                className={cn(
                                    "flex size-4 shrink-0 items-center justify-center rounded-full border transition-all",
                                    card.selected ? "border-blue-500 bg-blue-500 text-white" : "border-stone-300 dark:border-stone-600",
                                )}
                            >
                                {card.selected && <Check className="size-3" />}
                            </span>
                        </div>
                        <p
                            className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400"
                            onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(card.id, card.description); }}
                            title="双击编辑描述"
                        >
                            {editingCardId === card.id ? (
                                <Input
                                    size="small"
                                    autoFocus
                                    value={editText}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => onEditChange(e.target.value)}
                                    onBlur={() => onEditSave(card.id)}
                                    onPressEnter={() => onEditSave(card.id)}
                                />
                            ) : (
                                card.description
                            )}
                        </p>
                        {card.custom && <Tag className="absolute -left-1 -top-1.5 m-0 scale-90 bg-amber-50 text-amber-600">自定义</Tag>}
                    </button>
                ))}

                {/* 自定义卡片输入 */}
                {adding && (
                    <div className="rounded-lg border border-dashed border-stone-300 p-3 dark:border-stone-600">
                        <Input size="small" placeholder="卡片标题" value={customTitle} onChange={(e) => onCustomTitle(e.target.value)} autoFocus />
                        <Input size="small" className="mt-2" placeholder="一句话描述（可选）" value={customDesc} onChange={(e) => onCustomDesc(e.target.value)} onPressEnter={onAddCustom} />
                        <div className="mt-2 flex gap-2">
                            <Button size="small" type="primary" onClick={onAddCustom} disabled={!customTitle.trim()}>
                                添加
                            </Button>
                            <Button size="small" onClick={onCancelAdd}>
                                取消
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
