import type { TTSEngine, SynthParams, VoiceInfo } from "./tts-engines";

/**
 * CosyVoice TTS引擎 (阿里通义)
 * API: FastAPI + gRPC
 */
export class CosyVoiceEngine implements TTSEngine {
  id = "cosyvoice";
  name = "CosyVoice (阿里)";
  supportsStreaming = true;

  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:50000") {
    this.baseUrl = baseUrl;
  }

  async synthesize(params: SynthParams): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/inference/sft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: params.text,
        mode: "zero_shot",
        prompt_text: "",
        prompt_wav: params.referenceAudio,
        // CosyVoice特有：指令控制
        instruct: params.emotion ? `用${params.emotion}的语气说` : undefined,
      }),
    });
    if (!response.ok) throw new Error("CosyVoice合成失败");
    return await response.blob();
  }

  async getVoices(): Promise<VoiceInfo[]> {
    // CosyVoice主要靠参考音频，预设较少
    return [
      { id: "zero_shot", name: "零样本克隆", language: "zh", tags: ["克隆"] },
      { id: "cross_lingual", name: "跨语言", language: "multi", tags: ["跨语言"] },
    ];
  }
}
