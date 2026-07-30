"""Qwen3-TTS 引擎 - 中文质量最佳，支持 CustomVoice"""
import io
import asyncio
from functools import partial

from .base import TTSEngine, VoiceInfo, SynthesisRequest

QWEN_VOICES = [
    VoiceInfo("female_1", "女声 1（温柔）", "zh", "female"),
    VoiceInfo("female_2", "女声 2（活泼）", "zh", "female"),
    VoiceInfo("male_1", "男声 1（沉稳）", "zh", "male"),
    VoiceInfo("male_2", "男声 2（青年）", "zh", "male"),
    VoiceInfo("narrator", "旁白", "zh", "male"),
]

MODEL_NAME = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"


class QwenTTSEngine(TTSEngine):
    def __init__(self):
        self._pipeline = None

    @property
    def engine_id(self) -> str:
        return "qwen3-tts"

    @property
    def display_name(self) -> str:
        return "Qwen3-TTS-1.7B"

    def is_available(self) -> bool:
        try:
            import transformers  # noqa: F401
            import torch  # noqa: F401
        except ImportError:
            return False
        # 诚实检查：权重文件必须已完整下载才算可用（config.json 会先下好，不能代表模型就绪）
        try:
            from huggingface_hub import try_to_load_from_cache
            cached = try_to_load_from_cache(MODEL_NAME, "model.safetensors")
            return isinstance(cached, str)
        except Exception:
            return False

    def _ensure_model(self):
        if self._pipeline is not None:
            return
        from transformers import AutoModelForCausalLM, AutoTokenizer
        import torch

        self._tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
        self._model = AutoModelForCausalLM.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
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
        import torch
        import numpy as np
        import soundfile as sf

        voice = req.voice if req.voice in [v.id for v in QWEN_VOICES] else "female_1"

        # 构建 Qwen3-TTS 输入
        messages = [
            {"role": "system", "content": f"You are a helpful assistant that can generate audio. Use voice '{voice}' and speed {req.speed}."},
            {"role": "user", "content": req.text},
        ]

        text = self._tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = self._tokenizer(text, return_tensors="pt").to(self._model.device)

        with torch.no_grad():
            outputs = self._model.generate(**inputs, max_new_tokens=4096)

        # 提取音频 tokens 并解码
        audio_tokens = outputs[0][inputs["input_ids"].shape[1]:]
        audio = self._model.decode_audio(audio_tokens)

        # 编码输出
        buf = io.BytesIO()
        sf.write(buf, audio, 24000, format="WAV")
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
