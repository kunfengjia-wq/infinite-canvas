"""Kokoro-82M TTS 引擎 - 轻量级，CPU 可跑，实时率高"""
import io
import asyncio
from functools import partial

from .base import TTSEngine, VoiceInfo, SynthesisRequest

# Kokoro 内置音色
KOKORO_VOICES = [
    VoiceInfo("zf_xiaobei", "小北（女）", "zh", "female"),
    VoiceInfo("zf_xiaoni", "小妮（女）", "zh", "female"),
    VoiceInfo("zf_xiaoxiao", "小小（女）", "zh", "female"),
    VoiceInfo("zm_yunjian", "云健（男）", "zh", "male"),
    VoiceInfo("zm_yunxi", "云希（男）", "zh", "male"),
    VoiceInfo("af_bella", "Bella (F)", "en", "female"),
    VoiceInfo("af_sarah", "Sarah (F)", "en", "female"),
    VoiceInfo("am_adam", "Adam (M)", "en", "male"),
    VoiceInfo("am_michael", "Michael (M)", "en", "male"),
]


class KokoroEngine(TTSEngine):
    def __init__(self):
        self._model = None
        self._voices_data = {}

    @property
    def engine_id(self) -> str:
        return "kokoro-82m"

    @property
    def display_name(self) -> str:
        return "Kokoro-82M"

    def is_available(self) -> bool:
        try:
            import kokoro_onnx  # noqa: F401
        except ImportError:
            return False
        # 检查模型文件是否存在
        import os
        model_path = os.path.join(os.path.dirname(__file__), "..", "models", "kokoro-v1.0.onnx")
        return os.path.exists(model_path)

    def _ensure_model(self):
        if self._model is not None:
            return
        from kokoro_onnx import Kokoro
        import os

        model_path = os.path.join(os.path.dirname(__file__), "..", "models", "kokoro-v1.0.onnx")
        voices_path = os.path.join(os.path.dirname(__file__), "..", "models", "voices-v1.0.bin")

        # 如果模型文件不存在，使用默认下载路径
        if not os.path.exists(model_path):
            model_path = "kokoro-v1.0.onnx"
            voices_path = "voices-v1.0.bin"

        self._model = Kokoro(model_path, voices_path)

    def list_voices(self) -> list[VoiceInfo]:
        return KOKORO_VOICES

    async def synthesize(self, req: SynthesisRequest) -> bytes:
        self._ensure_model()

        voice = req.voice if req.voice in [v.id for v in KOKORO_VOICES] else "zf_xiaobei"
        speed = max(0.5, min(2.0, req.speed))

        # kokoro_onnx 是同步的，放到线程池
        loop = asyncio.get_event_loop()
        samples, sample_rate = await loop.run_in_executor(
            None,
            partial(self._model.create_audio, req.text, voice_id=voice, speed=speed),
        )

        # 转换为请求的格式
        return self._encode_audio(samples, sample_rate, req.response_format)

    def _encode_audio(self, samples, sample_rate: int, fmt: str) -> bytes:
        import soundfile as sf

        buf = io.BytesIO()
        sf_format = "WAV" if fmt in ("wav", "pcm") else "WAV"
        sf.write(buf, samples, sample_rate, format=sf_format)
        wav_bytes = buf.getvalue()

        if fmt in ("wav", "pcm"):
            return wav_bytes

        # 转 mp3/其他格式
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_wav(io.BytesIO(wav_bytes))
            out = io.BytesIO()
            audio.export(out, format=fmt if fmt != "mp3" else "mp3")
            return out.getvalue()
        except ImportError:
            # pydub 不可用时返回 WAV
            return wav_bytes
