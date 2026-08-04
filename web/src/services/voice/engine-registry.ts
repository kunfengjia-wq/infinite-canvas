import { VoxCPMEngine } from "./voxcpm-engine";
import { CosyVoiceEngine } from "./cosyvoice-engine";
import { EdgeTTSEngine } from "./edge-tts-engine";
import type { TTSEngine } from "./tts-engines";

/** 已注册的TTS引擎 */
const engines = new Map<string, TTSEngine>();

/** 初始化所有引擎 */
export function initEngines(config: { voxcpmUrl?: string; cosyvoiceUrl?: string }) {
  engines.set("edge-tts", new EdgeTTSEngine());
  if (config.voxcpmUrl) engines.set("voxcpm", new VoxCPMEngine(config.voxcpmUrl));
  if (config.cosyvoiceUrl) engines.set("cosyvoice", new CosyVoiceEngine(config.cosyvoiceUrl));
}

export function getEngine(id: string): TTSEngine | undefined {
  return engines.get(id);
}

export function getAllEngines(): TTSEngine[] {
  return Array.from(engines.values());
}
