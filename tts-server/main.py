"""本地 TTS 服务 - OpenAI 兼容 API
启动: uvicorn main:app --host 0.0.0.0 --port 8880
"""
import base64
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from engines.base import SynthesisRequest
from engines.kokoro_engine import KokoroEngine
from engines.xtts_engine import XTTSEngine
from engines.qwen_engine import QwenTTSEngine
from engines.gptsovits_engine import GPTSoVITSEngine
from engines.indextts_engine import IndexTTSEngine
import audio_utils

app = FastAPI(title="Local TTS Server", version="1.0.0")

# CORS - 允许前端跨域调用
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册引擎
ENGINES = {}
for engine_cls in [KokoroEngine, XTTSEngine, QwenTTSEngine, GPTSoVITSEngine, IndexTTSEngine]:
    engine = engine_cls()
    ENGINES[engine.engine_id] = engine


# ─── 请求模型 ────────────────────────────────────────────────────

class SpeechRequest(BaseModel):
    model: str = Field(default="kokoro-82m", description="引擎 ID")
    input: str = Field(..., description="要合成的文本")
    voice: str = Field(default="zf_xiaobei", description="音色 ID")
    response_format: str = Field(default="mp3", description="输出格式: mp3/wav/opus/flac")
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    instructions: str | None = None
    reference_audio: str | None = Field(default=None, description="base64 参考音频")
    emotion: str = Field(default="neutral", description="情绪: neutral/happy/sad/angry/surprise/fear/gentle")
    emotion_intensity: float = Field(default=0.5, ge=0.0, le=1.0, description="情绪强度")
    prompt_text: str | None = Field(default=None, description="参考音频对应文本")
    pitch_shift: int = Field(default=0, ge=-12, le=12, description="变调（半音）")
    reverb: float = Field(default=0.0, ge=0.0, le=1.0, description="混响")
    gain: float = Field(default=0.0, ge=-40.0, le=40.0, description="增益 dB")


# ─── API 端点 ────────────────────────────────────────────────────

@app.get("/v1/models")
async def list_models():
    """列出可用引擎及其音色"""
    models = []
    for eid, engine in ENGINES.items():
        models.append({
            "id": eid,
            "object": "model",
            "owned_by": "local",
            "display_name": engine.display_name,
            "available": engine.is_available(),
            "voices": [
                {"id": v.id, "label": v.label, "language": v.language, "gender": v.gender}
                for v in engine.list_voices()
            ],
        })
    return {"object": "list", "data": models}


@app.post("/v1/audio/speech")
async def create_speech(req: SpeechRequest):
    """OpenAI 兼容的语音合成端点"""
    engine = ENGINES.get(req.model)
    if not engine:
        raise HTTPException(status_code=404, detail=f"引擎 '{req.model}' 不存在。可用: {list(ENGINES.keys())}")

    if not engine.is_available():
        raise HTTPException(
            status_code=503,
            detail=f"引擎 '{engine.display_name}' 依赖未安装。请运行: pip install -r requirements.txt",
        )

    synth_req = SynthesisRequest(
        text=req.input,
        voice=req.voice,
        speed=req.speed,
        response_format=req.response_format,
        reference_audio=req.reference_audio,
        emotion=req.emotion,
        emotion_intensity=req.emotion_intensity,
        prompt_text=req.prompt_text,
    )

    try:
        audio_bytes = await engine.synthesize(synth_req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"合成失败: {str(e)}")

    # 后处理效果（如果指定了）
    if req.pitch_shift != 0 or req.reverb > 0 or req.gain != 0:
        try:
            audio_bytes = audio_utils.apply_effects(
                audio_bytes,
                pitch_shift=req.pitch_shift,
                reverb=req.reverb,
                gain=req.gain,
                format="wav",
            )
        except RuntimeError:
            pass  # pedalboard 未安装则跳过效果

    # 确定 MIME 类型
    mime_map = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "opus": "audio/opus",
        "flac": "audio/flac",
        "aac": "audio/aac",
        "pcm": "audio/pcm",
    }
    content_type = mime_map.get(req.response_format, "audio/mpeg")

    return Response(content=audio_bytes, media_type=content_type)


@app.get("/health")
async def health():
    """健康检查"""
    status = {}
    for eid, engine in ENGINES.items():
        status[eid] = {"available": engine.is_available(), "name": engine.display_name}
    return {"status": "ok", "engines": status}


# ─── 音色克隆管理 ────────────────────────────────────────────────

VOICES_DIR = Path(__file__).parent / "voices" / "cloned"
VOICES_DIR.mkdir(parents=True, exist_ok=True)


class CloneVoiceRequest(BaseModel):
    name: str = Field(..., description="音色名称")
    samples: list[str] = Field(..., description="base64 音频样本列表")
    prompt_texts: list[str] | None = Field(default=None, description="每段样本对应文本")


@app.post("/v1/voices/clone")
async def clone_voice(req: CloneVoiceRequest):
    """上传参考音频创建克隆音色"""
    if not req.samples:
        raise HTTPException(status_code=400, detail="至少需要一段参考音频")

    voice_id = f"clone_{req.name}_{len(list(VOICES_DIR.iterdir()))}"
    voice_dir = VOICES_DIR / voice_id
    voice_dir.mkdir(parents=True, exist_ok=True)

    for i, sample_b64 in enumerate(req.samples):
        audio_data = base64.b64decode(sample_b64)
        (voice_dir / f"sample_{i}.wav").write_bytes(audio_data)

    # 保存元数据
    meta = {"name": req.name, "prompt_texts": req.prompt_texts or []}
    (voice_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    return {"id": voice_id, "name": req.name, "samples_count": len(req.samples)}


@app.get("/v1/voices")
async def list_voices():
    """列出所有克隆音色"""
    voices = []
    for voice_dir in VOICES_DIR.iterdir():
        if not voice_dir.is_dir():
            continue
        meta_file = voice_dir / "meta.json"
        if meta_file.exists():
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            samples = list(voice_dir.glob("sample_*.wav"))
            voices.append({
                "id": voice_dir.name,
                "name": meta.get("name", voice_dir.name),
                "samples_count": len(samples),
            })
    return {"voices": voices}


@app.delete("/v1/voices/{voice_id}")
async def delete_voice(voice_id: str):
    """删除克隆音色"""
    import shutil
    voice_dir = VOICES_DIR / voice_id
    if not voice_dir.exists():
        raise HTTPException(status_code=404, detail="音色不存在")
    shutil.rmtree(voice_dir)
    return {"deleted": voice_id}


# ─── 音频编辑 ────────────────────────────────────────────────────

class TrimRequest(BaseModel):
    audio: str = Field(..., description="base64 音频数据")
    start_ms: int = Field(..., ge=0)
    end_ms: int = Field(..., ge=0)
    format: str = "wav"


class SplitRequest(BaseModel):
    audio: str = Field(..., description="base64 音频数据")
    at_ms: int = Field(..., ge=0)
    format: str = "wav"


class SilenceRequest(BaseModel):
    audio: str = Field(..., description="base64 音频数据")
    at_ms: int = Field(..., ge=0)
    duration_ms: int = Field(..., ge=0)
    format: str = "wav"


class EffectsRequest(BaseModel):
    audio: str = Field(..., description="base64 音频数据")
    pitch_shift: int = Field(default=0, ge=-12, le=12)
    reverb: float = Field(default=0.0, ge=0.0, le=1.0)
    gain: float = Field(default=0.0, ge=-40.0, le=40.0)
    high_pass: int = Field(default=0, ge=0)
    low_pass: int = Field(default=0, ge=0)
    format: str = "wav"


@app.post("/v1/audio/trim")
async def trim_audio_endpoint(req: TrimRequest):
    """裁剪音频"""
    try:
        audio_bytes = base64.b64decode(req.audio)
        result = audio_utils.trim_audio(audio_bytes, req.start_ms, req.end_ms, req.format)
        return {"audio": base64.b64encode(result).decode()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/v1/audio/split")
async def split_audio_endpoint(req: SplitRequest):
    """分割音频"""
    try:
        audio_bytes = base64.b64decode(req.audio)
        part_a, part_b = audio_utils.split_audio(audio_bytes, req.at_ms, req.format)
        return {
            "part_a": base64.b64encode(part_a).decode(),
            "part_b": base64.b64encode(part_b).decode(),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/v1/audio/silence")
async def insert_silence_endpoint(req: SilenceRequest):
    """插入静音"""
    try:
        audio_bytes = base64.b64decode(req.audio)
        result = audio_utils.insert_silence(audio_bytes, req.at_ms, req.duration_ms, req.format)
        return {"audio": base64.b64encode(result).decode()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/v1/audio/effects")
async def apply_effects_endpoint(req: EffectsRequest):
    """应用后处理效果"""
    try:
        audio_bytes = base64.b64decode(req.audio)
        result = audio_utils.apply_effects(
            audio_bytes,
            pitch_shift=req.pitch_shift,
            reverb=req.reverb,
            gain=req.gain,
            high_pass=req.high_pass,
            low_pass=req.low_pass,
            format=req.format,
        )
        return {"audio": base64.b64encode(result).decode()}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/v1/audio/waveform")
async def get_waveform(req: TrimRequest):
    """获取波形数据"""
    try:
        audio_bytes = base64.b64decode(req.audio)
        points = audio_utils.get_waveform_data(audio_bytes, points=200, format=req.format)
        duration = audio_utils.get_audio_duration_ms(audio_bytes, req.format)
        return {"waveform": points, "duration_ms": duration}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("  Local TTS Server")
    print("  http://localhost:8880")
    print("  OpenAI 兼容: POST /v1/audio/speech")
    print("=" * 50)
    for eid, engine in ENGINES.items():
        avail = "✓" if engine.is_available() else "✗ (未安装)"
        print(f"  [{avail}] {engine.display_name} ({eid})")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8880)
