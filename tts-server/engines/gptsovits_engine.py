"""GPT-SoVITS 引擎封装
通过 GPT-SoVITS 的 API v2 模式对接（独立子进程运行 api_v2.py）
支持: 零样本克隆、情绪控制、中/英/日/韩/粤
"""
import asyncio
import base64
import io
import tempfile
import os
from pathlib import Path

import httpx

from engines.base import TTSEngine, VoiceInfo, SynthesisRequest

# GPT-SoVITS API 默认地址（通过 api_v2.py 启动）
GPTSOVITS_API_URL = os.environ.get("GPTSOVITS_API_URL", "http://127.0.0.1:9874")

# 情绪映射 → GPT-SoVITS 支持的 emotion 参数
EMOTION_MAP = {
    "neutral": "",
    "happy": "happy",
    "sad": "sad",
    "angry": "angry",
    "surprise": "surprised",
    "fear": "fearful",
    "disgust": "disgusted",
    "gentle": "gentle",
}


class GPTSoVITSEngine(TTSEngine):
    """GPT-SoVITS 引擎 - 情绪控制最强、中文克隆最佳"""

    def __init__(self):
        self._available: bool | None = None

    @property
    def engine_id(self) -> str:
        return "gpt-sovits"

    @property
    def display_name(self) -> str:
        return "GPT-SoVITS"

    def list_voices(self) -> list[VoiceInfo]:
        """GPT-SoVITS 主要靠参考音频克隆，预置少量角色"""
        return [
            VoiceInfo(id="default", label="默认角色", language="zh", gender="female"),
            VoiceInfo(id="narrator", label="旁白", language="zh", gender="male"),
        ]

    def is_available(self) -> bool:
        """检查 GPT-SoVITS API 是否可达"""
        if self._available is not None:
            return self._available
        try:
            import httpx
            resp = httpx.get(f"{GPTSOVITS_API_URL}/", timeout=3)
            self._available = resp.status_code == 200
        except Exception:
            self._available = False
        return self._available

    async def synthesize(self, req: SynthesisRequest) -> bytes:
        """调用 GPT-SoVITS API v2 合成"""
        # 构建请求参数
        params: dict = {
            "text": req.text,
            "text_lang": "zh",
            "speed_factor": req.speed,
            "media_type": req.response_format if req.response_format != "mp3" else "wav",
            "streaming_mode": False,
        }

        # 情绪控制
        emotion = EMOTION_MAP.get(req.emotion, "")
        if emotion:
            params["emotion"] = emotion

        # 参考音频（零样本克隆）
        if req.reference_audio:
            # base64 → 临时文件
            audio_data = base64.b64decode(req.reference_audio)
            tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            tmp.write(audio_data)
            tmp.close()
            params["ref_audio_path"] = tmp.name
            if req.prompt_text:
                params["prompt_text"] = req.prompt_text
                params["prompt_lang"] = "zh"
        else:
            # 使用默认角色
            params["ref_audio_path"] = ""
            params["prompt_text"] = ""

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    f"{GPTSOVITS_API_URL}/tts",
                    json=params,
                )
                if resp.status_code != 200:
                    raise ValueError(f"GPT-SoVITS 返回错误: {resp.status_code} - {resp.text[:200]}")
                return resp.content
        finally:
            # 清理临时文件
            if req.reference_audio and "ref_audio_path" in params:
                try:
                    os.unlink(params["ref_audio_path"])
                except OSError:
                    pass

    async def clone_voice(self, name: str, audio_samples: list[bytes], prompt_texts: list[str] = None) -> str:
        """创建克隆音色（保存参考音频到 voices/ 目录）"""
        voices_dir = Path(__file__).parent.parent / "voices" / "cloned"
        voices_dir.mkdir(parents=True, exist_ok=True)

        voice_id = f"clone_{name}_{len(list(voices_dir.iterdir()))}"
        voice_dir = voices_dir / voice_id
        voice_dir.mkdir(exist_ok=True)

        for i, sample in enumerate(audio_samples):
            (voice_dir / f"sample_{i}.wav").write_bytes(sample)

        # 保存元数据
        meta = voice_dir / "meta.txt"
        meta.write_text(f"name={name}\n", encoding="utf-8")
        if prompt_texts:
            for i, text in enumerate(prompt_texts):
                meta.write_text(f"prompt_{i}={text}\n", encoding="utf-8", append=True)

        return voice_id
