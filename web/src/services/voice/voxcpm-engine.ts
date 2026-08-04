import type { TTSEngine, SynthParams, VoiceInfo, CloneParams, ClonedVoice } from "./tts-engines";

/**
 * VoxCPM TTS引擎
 * 使用OpenAI兼容API: POST /v1/audio/speech
 */
export class VoxCPMEngine implements TTSEngine {
  id = "voxcpm";
  name = "VoxCPM (清华)";
  supportsStreaming = true;

  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:8000") {
    this.baseUrl = baseUrl;
  }

  async synthesize(params: SynthParams): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "voxcpm",
        input: params.text,
        voice: params.voice,
        speed: params.speed ?? 1.0,
        // VoxCPM特有参数
        emotion: params.emotion,
        reference_audio: params.referenceAudio,
      }),
    });
    if (!response.ok) throw new Error(`VoxCPM合成失败: ${response.statusText}`);
    return await response.blob();
  }

  async getVoices(): Promise<VoiceInfo[]> {
    // VoxCPM支持通过文字描述创建声音
    return [
      { id: "default", name: "默认音色", language: "zh" },
      { id: "female_warm", name: "温暖女声", language: "zh" },
      { id: "male_deep", name: "沉稳男声", language: "zh" },
    ];
  }

  async cloneVoice(params: CloneParams): Promise<ClonedVoice> {
    const formData = new FormData();
    formData.append("name", params.name);
    for (const sample of params.audioSamples) {
      formData.append("audio_samples", sample);
    }
    if (params.description) {
      formData.append("description", params.description);
    }

    const response = await fetch(`${this.baseUrl}/v1/audio/voices/clone`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error(`VoxCPM声音克隆失败: ${response.statusText}`);
    const data = await response.json();
    return { id: data.voice_id, name: params.name };
  }

  /** VoxCPM独特功能：通过文字描述设计声音 */
  async designVoice(description: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/audio/voices/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    if (!response.ok) throw new Error(`VoxCPM声音设计失败: ${response.statusText}`);
    const data = await response.json();
    return data.voice_id;
  }
}
