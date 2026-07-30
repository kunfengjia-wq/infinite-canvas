import { type ReactNode, useEffect, useState } from "react";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { audioFormatOptions, audioSpeedLabel, audioVoiceOptions, normalizeAudioFormatValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue } from "@/lib/audio-generation";
import { type CanvasTheme } from "@/lib/canvas-theme";
import type { AiConfig } from "@/stores/use-config-store";

const speedOptions = ["0.75", "1", "1.25", "1.5"];

type AudioSettingKey = "audioVoice" | "audioFormat" | "audioSpeed" | "audioInstructions" | "ttsBaseUrl" | "ttsEngine";

type AudioSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: AudioSettingKey, value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
};

export function AudioSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5" }: AudioSettingsPanelProps) {
    const voice = normalizeAudioVoiceValue(config.audioVoice);
    const format = normalizeAudioFormatValue(config.audioFormat);
    const speed = normalizeAudioSpeedValue(config.audioSpeed);

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">音频设置</div> : null}
                <SettingGroup title="声音" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {audioVoiceOptions.map((item) => (
                            <OptionPill key={item.value} selected={voice === item.value} theme={theme} onClick={() => onConfigChange("audioVoice", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="格式" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {audioFormatOptions.map((item) => (
                            <OptionPill key={item.value} selected={format === item.value} theme={theme} onClick={() => onConfigChange("audioFormat", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="语速" color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {speedOptions.map((value) => (
                            <OptionPill key={value} selected={speed === value} theme={theme} onClick={() => onConfigChange("audioSpeed", value)}>
                                {audioSpeedLabel(value)}
                            </OptionPill>
                        ))}
                    </div>
                    <input
                        type="number"
                        min={0.25}
                        max={4}
                        step={0.05}
                        className="h-9 w-full rounded-full border bg-transparent px-3 text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                        value={config.audioSpeed || "1"}
                        onChange={(event) => onConfigChange("audioSpeed", event.target.value)}
                        onBlur={(event) => onConfigChange("audioSpeed", normalizeAudioSpeedValue(event.target.value))}
                        onMouseDown={(event) => event.stopPropagation()}
                    />
                </SettingGroup>
                <SettingGroup title="声音指令" color={theme.node.muted}>
                    <textarea
                        value={config.audioInstructions || ""}
                        placeholder="例如：自然、温暖、适合旁白。"
                        className="thin-scrollbar h-20 w-full resize-none rounded-xl border bg-transparent px-3 py-2 text-sm leading-5 outline-none"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                        onChange={(event) => onConfigChange("audioInstructions", event.target.value)}
                        onMouseDown={(event) => event.stopPropagation()}
                    />
                </SettingGroup>
                <LocalTtsSection config={config} onConfigChange={onConfigChange} theme={theme} />
            </div>
        </ImageSettingsTheme>
    );
}

function OptionPill({ selected, theme, onClick, children }: { selected: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80" style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onClick={onClick}>
            {children}
        </button>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}

/** 本地 TTS 引擎配置区域 */
function LocalTtsSection({ config, onConfigChange, theme }: { config: AiConfig; onConfigChange: (key: AudioSettingKey, value: string) => void; theme: CanvasTheme }) {
    const [engines, setEngines] = useState<{ id: string; display_name: string; available: boolean }[]>([]);
    const [online, setOnline] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const base = config.ttsBaseUrl || "http://localhost:8880";
        fetch(`${base}/v1/models`)
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then((json) => {
                if (cancelled) return;
                setEngines((json.data ?? []).map((m: { id: string; display_name: string; available: boolean }) => ({ id: m.id, display_name: m.display_name, available: m.available })));
                setOnline(true);
            })
            .catch(() => { if (!cancelled) setOnline(false); });
        return () => { cancelled = true; };
    }, [config.ttsBaseUrl]);

    return (
        <SettingGroup title="本地 TTS 服务" color={theme.node.muted}>
            {/* 服务状态 */}
            <div className="flex items-center gap-2 text-xs" style={{ color: online ? "#10b981" : theme.node.muted }}>
                <span className="inline-block size-2 rounded-full" style={{ background: online ? "#10b981" : theme.node.stroke }} />
                {online ? "已连接" : "离线"}
            </div>

            {/* Base URL */}
            <input
                type="text"
                className="h-9 w-full rounded-full border bg-transparent px-3 text-sm outline-none"
                style={{ borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                value={config.ttsBaseUrl || "http://localhost:8880"}
                placeholder="http://localhost:8880"
                onChange={(e) => onConfigChange("ttsBaseUrl", e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
            />

            {/* 引擎选择 */}
            {engines.length > 0 && (
                <div className="grid grid-cols-3 gap-2.5">
                    {engines.map((eng) => (
                        <OptionPill key={eng.id} selected={config.ttsEngine === eng.id} theme={theme} onClick={() => onConfigChange("ttsEngine", eng.id)}>
                            {eng.display_name}
                        </OptionPill>
                    ))}
                </div>
            )}
        </SettingGroup>
    );
}
