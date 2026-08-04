import { Wand2 } from "lucide-react";
import { useState } from "react";
import { App, Button, Slider } from "antd";

import { useVoiceStore } from "../store/use-voice-store";
import { DEFAULT_EFFECTS, EFFECTS_PRESETS, type AudioEffects } from "../types";
import { cn } from "@/lib/utils";

export function EffectsPanel() {
    const { message } = App.useApp();
    const current = useVoiceStore((s) => s.current);
    const applyEffects = useVoiceStore((s) => s.applyEffects);
    const [effects, setEffects] = useState<AudioEffects>({ ...DEFAULT_EFFECTS });
    const [applying, setApplying] = useState(false);
    const [activePreset, setActivePreset] = useState<string | null>(null);

    if (!current) return null;

    const update = (key: keyof AudioEffects, value: number) => {
        setEffects((prev) => ({ ...prev, [key]: value }));
        setActivePreset(null);
    };

    const applyPreset = (name: string, preset: AudioEffects) => {
        setEffects({ ...preset });
        setActivePreset(name);
    };

    const handleApply = async (target: string | "all") => {
        setApplying(true);
        try {
            await applyEffects(target, effects);
            message.success(target === "all" ? "已应用到全部" : "已应用");
        } catch (e) {
            message.error(e instanceof Error ? e.message : "应用失败");
        } finally {
            setApplying(false);
        }
    };

    const sliders: { key: keyof AudioEffects; label: string; min: number; max: number; step: number; unit: string }[] = [
        { key: "pitchShift", label: "变调", min: -12, max: 12, step: 1, unit: "半音" },
        { key: "reverb", label: "混响", min: 0, max: 100, step: 1, unit: "%" },
        { key: "gain", label: "增益", min: -40, max: 40, step: 1, unit: "dB" },
        { key: "highPass", label: "高通滤波", min: 0, max: 2000, step: 50, unit: "Hz" },
        { key: "lowPass", label: "低通滤波", min: 0, max: 8000, step: 100, unit: "Hz" },
    ];

    return (
        <div className="space-y-4 p-3">
            {/* 预设 */}
            <div>
                <p className="mb-2 text-xs font-medium text-stone-500">预设</p>
                <div className="grid grid-cols-2 gap-1.5">
                    {EFFECTS_PRESETS.map((preset) => (
                        <button
                            key={preset.name}
                            type="button"
                            className={cn(
                                "rounded-lg border px-2 py-1.5 text-xs transition-colors",
                                activePreset === preset.name
                                    ? "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                                    : "border-stone-200 hover:border-stone-300 dark:border-stone-700",
                            )}
                            onClick={() => applyPreset(preset.name, preset.effects)}
                        >
                            {preset.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* 滑块 */}
            <div className="space-y-3">
                {sliders.map(({ key, label, min, max, step, unit }) => {
                    const rawValue = effects[key];
                    const displayValue = key === "reverb" ? Math.round(rawValue * 100) : rawValue;
                    const sliderValue = key === "reverb" ? Math.round(rawValue * 100) : rawValue;
                    return (
                        <div key={key}>
                            <div className="mb-0.5 flex items-center justify-between text-[10px] text-stone-500">
                                <span>{label}</span>
                                <span>{displayValue}{unit}</span>
                            </div>
                            <Slider
                                min={min}
                                max={max}
                                step={step}
                                value={sliderValue}
                                onChange={(v) => update(key, key === "reverb" ? v / 100 : v)}
                                className="!my-0"
                            />
                        </div>
                    );
                })}
            </div>

            {/* 操作 */}
            <div className="flex gap-2">
                <Button size="small" onClick={() => { setEffects({ ...DEFAULT_EFFECTS }); setActivePreset(null); }}>
                    重置
                </Button>
                <Button
                    type="primary"
                    size="small"
                    className="flex-1"
                    icon={<Wand2 className="size-3" />}
                    loading={applying}
                    onClick={() => void handleApply("all")}
                >
                    应用到全部音频
                </Button>
            </div>
        </div>
    );
}
