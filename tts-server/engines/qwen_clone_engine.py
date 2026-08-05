"""Qwen3-TTS 克隆引擎 - 使用 Base 模型实现零样本音色克隆"""
import io
import json
import base64
import asyncio
import tempfile
from pathlib import Path
from functools import partial

from .base import TTSEngine, VoiceInfo, SynthesisRequest

MODEL_NAME = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
VOICES_DIR = Path(__file__).parent.parent / "voices"

# 情绪 -> instruct 映射（与 qwen_engine 共用逻辑）
EMOTION_INSTRUCT = {
    "neutral": "",
    "happy": "用开心愉快的语气说",
    "sad": "用悲伤低沉的语气说",
    "angry": "用愤怒激动的语气说",
    "surprise": "用惊讶意外的语气说",
    "fear": "用害怕紧张的语气说",
    "gentle": "用温柔轻柔的语气说",
}


def _build_instruct(emotion: str, intensity: float, speed: float) -> str | None:
    parts: list[str] = []
    emo_text = EMOTION_INSTRUCT.get(emotion, "")
    if emo_text:
        if intensity > 0.7:
            emo_text += "，语气强烈"
        elif intensity < 0.3:
            emo_text += "，语气轻微"
        parts.append(emo_text)
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


class QwenCloneEngine(TTSEngine):
    """基于 Qwen3-TTS Base 模型的音色克隆引擎"""

    def __init__(self):
        self._model = None

    @property
    def engine_id(self) -> str:
        return "qwen3-tts-clone"

    @property
    def display_name(self) -> str:
        return "Qwen3-TTS 克隆"

    def is_available(self) -> bool:
        try:
            import qwen_tts  # noqa: F401
            import torch  # noqa: F401
        except ImportError:
            return False
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
        from huggingface_hub import snapshot_download

        # 解析本地缓存路径后传入，避免内部网络请求重试卡死（同 qwen_engine）
        local_path = snapshot_download(MODEL_NAME, local_files_only=True)

        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
        self._model = Qwen3TTSModel.from_pretrained(
            local_path,
            device_map=device,
            dtype=dtype,
        )

    def list_voices(self) -> list[VoiceInfo]:
        """列出已保存的克隆音色"""
        voices = []
        if VOICES_DIR.exists():
            for f in VOICES_DIR.glob("*.json"):
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    voices.append(VoiceInfo(
                        id=f"clone_{f.stem}",
                        label=data.get("name", f.stem),
                        language="multi",
                        gender="unknown",
                    ))
                except Exception:
                    continue
        return voices

    # ─── 克隆管理 ─────────────────────────────────────────────

    def clone_voice(self, name: str, samples_b64: list[str], ref_text: str | None = None) -> str:
        """从 base64 音频样本创建克隆音色，返回 voice_id"""
        import numpy as np
        import soundfile as sf

        self._ensure_model()
        VOICES_DIR.mkdir(parents=True, exist_ok=True)

        # 解码第一个样本（零样本克隆只需一段参考音频）
        audio_bytes = base64.b64decode(samples_b64[0])
        audio_buf = io.BytesIO(audio_bytes)
        waveform, sr = sf.read(audio_buf, dtype="float32")

        # 创建 voice clone prompt
        prompt_item = self._model.create_voice_clone_prompt(
            ref_audio=(waveform, sr),
            ref_text=ref_text or "",
        )

        # 持久化：保存 prompt 的序列化数据
        import uuid
        voice_id = uuid.uuid4().hex[:10]
        meta = {
            "id": voice_id,
            "name": name,
            "samples_count": len(samples_b64),
            "ref_text": ref_text,
        }

        # 保存参考音频文件（prompt 重建用）
        audio_path = VOICES_DIR / f"{voice_id}_ref.wav"
        sf.write(str(audio_path), waveform, sr)
        meta["ref_audio_path"] = str(audio_path)

        meta_path = VOICES_DIR / f"{voice_id}.json"
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

        return voice_id

    def delete_voice(self, voice_id: str) -> bool:
        """删除克隆音色"""
        # voice_id 格式: clone_xxx 或 xxx
        vid = voice_id.removeprefix("clone_")
        meta_path = VOICES_DIR / f"{vid}.json"
        audio_path = VOICES_DIR / f"{vid}_ref.wav"
        if meta_path.exists():
            meta_path.unlink()
        if audio_path.exists():
            audio_path.unlink()
        return True

    def list_cloned_voices(self) -> list[dict]:
        """返回克隆音色列表（供 API 使用）"""
        result = []
        if VOICES_DIR.exists():
            for f in VOICES_DIR.glob("*.json"):
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    result.append({
                        "id": f"clone_{f.stem}",
                        "name": data.get("name", f.stem),
                        "samples_count": data.get("samples_count", 1),
                    })
                except Exception:
                    continue
        return result

    # ─── 合成 ─────────────────────────────────────────────────

    async def synthesize(self, req: SynthesisRequest) -> bytes:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, partial(self._sync_full_synthesize, req))

    def _sync_full_synthesize(self, req: SynthesisRequest) -> bytes:
        self._ensure_model()
        return self._sync_synthesize(req)

    def _sync_synthesize(self, req: SynthesisRequest) -> bytes:
        import soundfile as sf

        # 解析克隆音色 ID
        voice_id = req.voice.removeprefix("clone_")
        meta_path = VOICES_DIR / f"{voice_id}.json"

        if not meta_path.exists():
            raise ValueError(f"克隆音色 '{req.voice}' 不存在")

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        ref_audio_path = meta.get("ref_audio_path", "")
        ref_text = meta.get("ref_text", "")

        # 构建 instruct
        instruct = _build_instruct(req.emotion, req.emotion_intensity, req.speed)

        # 使用参考音频进行克隆合成
        kwargs = dict(
            text=req.text,
            language="Chinese",
            ref_audio=ref_audio_path,
            ref_text=ref_text,
        )
        wavs, sr = self._model.generate_voice_clone(**kwargs)

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
