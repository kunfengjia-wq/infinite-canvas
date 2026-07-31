"""Qwen3-TTS 引擎 - 使用官方 qwen-tts 包，支持 9 种音色 + 10 种语言 + 情绪控制"""
import io
import asyncio
from functools import partial

from .base import TTSEngine, VoiceInfo, SynthesisRequest

# 官方 9 种音色
QWEN_VOICES = [
    VoiceInfo("Vivian", "薇薇安（明亮女声）", "zh", "female"),
    VoiceInfo("Serena", "塞蕾娜（温柔女声）", "zh", "female"),
    VoiceInfo("Uncle_Fu", "大叔（低沉男声）", "zh", "male"),
    VoiceInfo("Dylan", "迪兰（北京男声）", "zh", "male"),
    VoiceInfo("Eric", "埃里克（成都男声）", "zh", "male"),
    VoiceInfo("Ryan", "瑞安（动感男声）", "en", "male"),
    VoiceInfo("Aiden", "艾登（阳光男声）", "en", "male"),
    VoiceInfo("Ono_Anna", "小野安娜（日语女声）", "ja", "female"),
    VoiceInfo("Sohee", "素熙（韩语女声）", "ko", "female"),
]

MODEL_NAME = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"

# voice id -> native language 映射
_VOICE_LANG = {
    "Vivian": "Chinese", "Serena": "Chinese", "Uncle_Fu": "Chinese",
    "Dylan": "Chinese", "Eric": "Chinese",
    "Ryan": "English", "Aiden": "English",
    "Ono_Anna": "Japanese", "Sohee": "Korean",
}

# 情绪 -> instruct 自然语言指令
EMOTION_INSTRUCT = {
    "neutral": "",
    "happy": "用开心愉快的语气说",
    "sad": "用悲伤低沉的语气说",
    "angry": "用愤怒激动的语气说",
    "surprise": "用惊讶意外的语气说",
    "fear": "用害怕紧张的语气说",
    "gentle": "用温柔轻柔的语气说",
}

# 说话风格 -> instruct
STYLE_INSTRUCT = {
    "narration": "用讲述故事的语气",
    "dialogue": "",
    "whisper": "小声轻语",
    "broadcast": "用播音腔，字正腔圆",
}


def _build_instruct(emotion: str, intensity: float, speed: float, style: str = "") -> str | None:
    """将情绪/强度/语速/风格合成为 instruct 指令字符串"""
    parts: list[str] = []

    # 风格部分
    style_text = STYLE_INSTRUCT.get(style, "")
    if style_text:
        parts.append(style_text)

    # 情绪部分
    emo_text = EMOTION_INSTRUCT.get(emotion, "")
    if emo_text:
        if intensity > 0.7:
            emo_text += "，语气强烈"
        elif intensity < 0.3:
            emo_text += "，语气轻微"
        parts.append(emo_text)

    # 语速部分
    if speed >= 1.3:
        parts.append("语速较快")
    elif speed >= 1.1:
        parts.append("语速稍快")
    elif speed <= 0.7:
        parts.append("语速很慢")
    elif speed <= 0.9:
        parts.append("语速稍慢")

    if not parts:
        return None
    return "，".join(parts)


class QwenTTSEngine(TTSEngine):
    def __init__(self):
        self._model = None

    @property
    def engine_id(self) -> str:
        return "qwen3-tts"

    @property
    def display_name(self) -> str:
        return "Qwen3-TTS-1.7B"

    def is_available(self) -> bool:
        try:
            import qwen_tts  # noqa: F401
            import torch  # noqa: F401
        except ImportError:
            return False
        # 权重文件必须已完整下载
        try:
            from huggingface_hub import try_to_load_from_cache
            cached = try_to_load_from_cache(MODEL_NAME, "model.safetensors")
            return isinstance(cached, str)
        except Exception:
            return False

    def _ensure_model(self):
        if self._model is not None:
            return
        import torch
        from qwen_tts import Qwen3TTSModel

        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
        self._model = Qwen3TTSModel.from_pretrained(
            MODEL_NAME,
            device_map=device,
            dtype=dtype,
        )

    def list_voices(self) -> list[VoiceInfo]:
        return QWEN_VOICES

    async def synthesize(self, req: SynthesisRequest) -> bytes:
        self._ensure_model()

        loop = asyncio.get_event_loop()
        audio_bytes = await loop.run_in_executor(
            None, partial(self._sync_synthesize, req)
        )
        return audio_bytes

    def _sync_synthesize(self, req: SynthesisRequest) -> bytes:
        import soundfile as sf

        # 确定音色
        voice = req.voice if req.voice in _VOICE_LANG else "Vivian"
        language = _VOICE_LANG[voice]

        # 构建 instruct 指令（情绪 + 语速 + 风格）
        instruct = _build_instruct(req.emotion, req.emotion_intensity, req.speed, req.style)

        # 调用官方 API
        kwargs = dict(text=req.text, speaker=voice, language=language)
        if instruct:
            kwargs["instruct"] = instruct
        wavs, sr = self._model.generate_custom_voice(**kwargs)

        # 编码输出
        buf = io.BytesIO()
        sf.write(buf, wavs[0], sr, format="WAV")
        wav_bytes = buf.getvalue()

        if req.response_format in ("wav", "pcm"):
            return wav_bytes

        try:
            from pydub import AudioSegment
            audio_seg = AudioSegment.from_wav(io.BytesIO(wav_bytes))
            out = io.BytesIO()
            audio_seg.export(out, format=req.response_format)
            return out.getvalue()
        except ImportError:
            return wav_bytes
