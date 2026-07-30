"""XTTS-v2 TTS 引擎 - 支持 6s 参考音频声音克隆"""
import io
import base64
import asyncio
from functools import partial

from .base import TTSEngine, VoiceInfo, SynthesisRequest

XTTS_VOICES = [
    VoiceInfo("clone", "克隆音色（需参考音频）", "multi", "female"),
    VoiceInfo("female_default", "默认女声", "multi", "female"),
    VoiceInfo("male_default", "默认男声", "multi", "male"),
]


class XTTSEngine(TTSEngine):
    def __init__(self):
        self._model = None

    @property
    def engine_id(self) -> str:
        return "xtts-v2"

    @property
    def display_name(self) -> str:
        return "XTTS-v2 (Coqui)"

    def is_available(self) -> bool:
        try:
            from TTS.api import TTS  # noqa: F401
            return True
        except ImportError:
            return False

    def _ensure_model(self):
        if self._model is not None:
            return
        from TTS.api import TTS
        self._model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")

    def list_voices(self) -> list[VoiceInfo]:
        return XTTS_VOICES

    async def synthesize(self, req: SynthesisRequest) -> bytes:
        self._ensure_model()

        loop = asyncio.get_event_loop()
        audio_bytes = await loop.run_in_executor(
            None, partial(self._sync_synthesize, req)
        )
        return audio_bytes

    def _sync_synthesize(self, req: SynthesisRequest) -> bytes:
        import tempfile
        import os

        # 写入临时输出文件
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            output_path = f.name

        try:
            kwargs = {"text": req.text, "file_path": output_path}

            # 如果有参考音频，使用声音克隆
            if req.reference_audio:
                ref_path = self._save_reference_audio(req.reference_audio)
                kwargs["speaker_wav"] = ref_path
                kwargs["language"] = "zh-cn"
            else:
                kwargs["speaker_wav"] = self._get_default_speaker()
                kwargs["language"] = "zh-cn"

            self._model.tts_to_file(**kwargs)

            with open(output_path, "rb") as f:
                wav_bytes = f.read()

            if req.response_format in ("wav", "pcm"):
                return wav_bytes

            # 转格式
            try:
                from pydub import AudioSegment
                audio = AudioSegment.from_wav(io.BytesIO(wav_bytes))
                out = io.BytesIO()
                audio.export(out, format=req.response_format)
                return out.getvalue()
            except ImportError:
                return wav_bytes
        finally:
            if os.path.exists(output_path):
                os.unlink(output_path)

    def _save_reference_audio(self, b64_audio: str) -> str:
        """将 base64 参考音频保存为临时文件"""
        import tempfile
        audio_data = base64.b64decode(b64_audio)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_data)
            return f.name

    def _get_default_speaker(self) -> str:
        """获取默认参考音频路径"""
        import os
        default_path = os.path.join(os.path.dirname(__file__), "..", "voices", "default_female.wav")
        if os.path.exists(default_path):
            return default_path
        # 如果没有默认音频，抛出提示
        raise ValueError("XTTS-v2 需要参考音频。请上传 6s 参考音频或放置 voices/default_female.wav")
