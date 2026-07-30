"""Index-TTS-2 引擎封装
原生多情绪支持、零样本克隆
通过本地推理或 API 模式对接
"""
import base64
import io
import os
import tempfile
from pathlib import Path

from engines.base import TTSEngine, VoiceInfo, SynthesisRequest

# Index-TTS-2 模型路径
INDEXTTS_MODEL_DIR = os.environ.get("INDEXTTS_MODEL_DIR", "./models/indextts")


class IndexTTSEngine(TTSEngine):
    """Index-TTS-2 引擎 - 原生多情绪、中文优化"""

    def __init__(self):
        self._model = None
        self._available: bool | None = None

    @property
    def engine_id(self) -> str:
        return "indextts-2"

    @property
    def display_name(self) -> str:
        return "Index-TTS-2"

    def list_voices(self) -> list[VoiceInfo]:
        """Index-TTS-2 主要靠参考音频，预置少量"""
        return [
            VoiceInfo(id="default", label="默认女声", language="zh", gender="female"),
            VoiceInfo(id="male_1", label="默认男声", language="zh", gender="male"),
        ]

    def is_available(self) -> bool:
        """检查 indextts 包是否已安装"""
        if self._available is not None:
            return self._available
        try:
            import indextts  # noqa: F401
            self._available = True
        except ImportError:
            self._available = False
        return self._available

    def _load_model(self):
        """延迟加载模型"""
        if self._model is not None:
            return self._model
        try:
            from indextts.infer import IndexTTS
            self._model = IndexTTS(
                model_dir=INDEXTTS_MODEL_DIR,
                cfg_path=os.path.join(INDEXTTS_MODEL_DIR, "config.yaml"),
            )
            return self._model
        except Exception as e:
            raise RuntimeError(f"Index-TTS-2 模型加载失败: {e}")

    async def synthesize(self, req: SynthesisRequest) -> bytes:
        """合成语音"""
        import asyncio
        import numpy as np
        import soundfile as sf

        model = self._load_model()

        # 准备参考音频
        ref_audio_path = None
        if req.reference_audio:
            audio_data = base64.b64decode(req.reference_audio)
            tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            tmp.write(audio_data)
            tmp.close()
            ref_audio_path = tmp.name
        else:
            # 使用默认参考音频（如果存在）
            default_ref = Path(INDEXTTS_MODEL_DIR) / "default_ref.wav"
            if default_ref.exists():
                ref_audio_path = str(default_ref)

        if not ref_audio_path:
            raise ValueError("Index-TTS-2 需要参考音频。请上传参考音频或使用默认参考。")

        try:
            # 在线程池中运行推理（避免阻塞事件循环）
            def _infer():
                output_path = tempfile.mktemp(suffix=".wav")
                # Index-TTS-2 支持通过 prompt 控制情绪
                text = req.text
                # 情绪注入：Index-TTS-2 原生支持情绪描述
                if req.emotion != "neutral":
                    emotion_prompts = {
                        "happy": "用开心的语气说：",
                        "sad": "用悲伤的语气说：",
                        "angry": "用愤怒的语气说：",
                        "surprise": "用惊讶的语气说：",
                        "fear": "用恐惧的语气说：",
                        "gentle": "用温柔的语气说：",
                        "disgust": "用厌恶的语气说：",
                    }
                    prefix = emotion_prompts.get(req.emotion, "")
                    if prefix and req.emotion_intensity > 0.3:
                        text = f"{prefix}{req.text}"

                model.infer(
                    audio_prompt=ref_audio_path,
                    text=text,
                    output=output_path,
                    speed=req.speed,
                )
                with open(output_path, "rb") as f:
                    result = f.read()
                os.unlink(output_path)
                return result

            result = await asyncio.to_thread(_infer)
            return result
        finally:
            if req.reference_audio and ref_audio_path:
                try:
                    os.unlink(ref_audio_path)
                except OSError:
                    pass
