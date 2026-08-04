import type { TTSEngine, SynthParams, VoiceInfo } from "./tts-engines";

/**
 * Edge-TTS引擎 (微软免费)
 * 通过后端代理调用
 */
export class EdgeTTSEngine implements TTSEngine {
  id = "edge-tts";
  name = "Edge-TTS (免费)";
  supportsStreaming = false;

  async synthesize(params: SynthParams): Promise<Blob> {
    // 调用项目已有的edge-tts后端
    const response = await fetch(`/api/tts/edge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: params.text,
        voice: params.voice,
        rate: `${Math.round(((params.speed ?? 1.0) - 1) * 100)}%`,
      }),
    });
    if (!response.ok) throw new Error(`Edge-TTS合成失败: ${response.statusText}`);
    return await response.blob();
  }

  async getVoices(): Promise<VoiceInfo[]> {
    // 微软Edge语音列表（中文）
    return [
      { id: "zh-CN-XiaoxiaoNeural", name: "晓晓", language: "zh" },
      { id: "zh-CN-YunxiNeural", name: "云希", language: "zh" },
      { id: "zh-CN-YunjianNeural", name: "云健", language: "zh" },
      { id: "zh-CN-XiaoyiNeural", name: "晓伊", language: "zh" },
      { id: "zh-CN-YunyangNeural", name: "云扬", language: "zh" },
      { id: "zh-CN-XiaochenNeural", name: "晓辰", language: "zh" },
      { id: "zh-CN-XiaohanNeural", name: "晓涵", language: "zh" },
      { id: "zh-CN-XiaomengNeural", name: "晓梦", language: "zh" },
      { id: "zh-CN-XiaomoNeural", name: "晓墨", language: "zh" },
      { id: "zh-CN-XiaoqiuNeural", name: "晓秋", language: "zh" },
      { id: "zh-CN-XiaoruiNeural", name: "晓睿", language: "zh" },
      { id: "zh-CN-XiaoshuangNeural", name: "晓双", language: "zh" },
      { id: "zh-CN-XiaoxuanNeural", name: "晓萱", language: "zh" },
      { id: "zh-CN-XiaoyanNeural", name: "晓颜", language: "zh" },
      { id: "zh-CN-XiaoyouNeural", name: "晓悠", language: "zh" },
      { id: "zh-CN-YunfengNeural", name: "云枫", language: "zh" },
      { id: "zh-CN-YunhaoNeural", name: "云皓", language: "zh" },
      { id: "zh-CN-YunxiaNeural", name: "云夏", language: "zh" },
      { id: "zh-CN-YunyeNeural", name: "云野", language: "zh" },
      { id: "zh-CN-YunzeNeural", name: "云泽", language: "zh" },
    ];
  }
}
