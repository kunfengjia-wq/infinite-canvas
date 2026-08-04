/** TTS引擎接口 */
export interface TTSEngine {
  id: string;
  name: string;
  /** 合成语音 */
  synthesize(params: SynthParams): Promise<Blob>;
  /** 获取可用音色列表 */
  getVoices(): Promise<VoiceInfo[]>;
  /** 声音克隆 */
  cloneVoice?(params: CloneParams): Promise<ClonedVoice>;
  /** 是否支持流式 */
  supportsStreaming: boolean;
}

export interface SynthParams {
  text: string;
  voice: string;
  speed?: number;
  emotion?: string;
  emotionIntensity?: number;
  referenceAudio?: string; // base64
}

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  tags?: string[];
  previewUrl?: string;
}

export interface CloneParams {
  name: string;
  audioSamples: Blob[];
  description?: string; // VoxCPM声音设计
}

export interface ClonedVoice {
  id: string;
  name: string;
}
