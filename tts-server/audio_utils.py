"""音频处理工具
裁剪、拼接、静音插入、后处理效果（pedalboard）
"""
import io
import base64
import numpy as np

try:
    from pydub import AudioSegment
except ImportError:
    AudioSegment = None

try:
    import pedalboard
    from pedalboard import Pedalboard, PitchShift, Reverb, Gain, HighpassFilter, LowpassFilter
except ImportError:
    pedalboard = None


def trim_audio(audio_bytes: bytes, start_ms: int, end_ms: int, format: str = "wav") -> bytes:
    """裁剪音频：保留 start_ms ~ end_ms 区间"""
    if AudioSegment is None:
        raise RuntimeError("pydub 未安装，无法裁剪音频")
    audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=format)
    trimmed = audio[start_ms:end_ms]
    out = io.BytesIO()
    trimmed.export(out, format=format)
    return out.getvalue()


def split_audio(audio_bytes: bytes, at_ms: int, format: str = "wav") -> tuple[bytes, bytes]:
    """在 at_ms 处分割音频，返回前后两段"""
    if AudioSegment is None:
        raise RuntimeError("pydub 未安装")
    audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=format)
    part_a = audio[:at_ms]
    part_b = audio[at_ms:]
    buf_a, buf_b = io.BytesIO(), io.BytesIO()
    part_a.export(buf_a, format=format)
    part_b.export(buf_b, format=format)
    return buf_a.getvalue(), buf_b.getvalue()


def insert_silence(audio_bytes: bytes, at_ms: int, duration_ms: int, format: str = "wav") -> bytes:
    """在 at_ms 处插入静音"""
    if AudioSegment is None:
        raise RuntimeError("pydub 未安装")
    audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=format)
    silence = AudioSegment.silent(duration=duration_ms, frame_rate=audio.frame_rate)
    result = audio[:at_ms] + silence + audio[at_ms:]
    out = io.BytesIO()
    result.export(out, format=format)
    return out.getvalue()


def delete_region(audio_bytes: bytes, start_ms: int, end_ms: int, format: str = "wav") -> bytes:
    """删除 start_ms ~ end_ms 区间"""
    if AudioSegment is None:
        raise RuntimeError("pydub 未安装")
    audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=format)
    result = audio[:start_ms] + audio[end_ms:]
    out = io.BytesIO()
    result.export(out, format=format)
    return out.getvalue()


def apply_effects(
    audio_bytes: bytes,
    pitch_shift: int = 0,
    reverb: float = 0.0,
    gain: float = 0.0,
    high_pass: int = 0,
    low_pass: int = 0,
    format: str = "wav",
) -> bytes:
    """应用后处理效果
    
    Args:
        pitch_shift: 变调（半音，-12 ~ +12）
        reverb: 混响 (0-1)
        gain: 增益 dB (-40 ~ +40)
        high_pass: 高通滤波频率 Hz (0=关闭)
        low_pass: 低通滤波频率 Hz (0=关闭)
    """
    if pedalboard is None:
        raise RuntimeError("pedalboard 未安装，无法应用效果。请运行: pip install pedalboard")

    import soundfile as sf

    # 解码音频
    input_buf = io.BytesIO(audio_bytes)
    data, sample_rate = sf.read(input_buf, dtype="float32")

    # 确保是单声道处理
    if data.ndim > 1:
        data = data.T  # pedalboard 期望 (channels, samples)
    else:
        data = data[np.newaxis, :]

    # 构建效果链
    effects = []
    if pitch_shift != 0:
        effects.append(PitchShift(semitones=pitch_shift))
    if reverb > 0:
        effects.append(Reverb(room_size=min(reverb, 1.0), wet_level=reverb * 0.5))
    if gain != 0:
        effects.append(Gain(gain_db=gain))
    if high_pass > 0:
        effects.append(HighpassFilter(cutoff_frequency_hz=high_pass))
    if low_pass > 0:
        effects.append(LowpassFilter(cutoff_frequency_hz=low_pass))

    if effects:
        board = Pedalboard(effects)
        data = board(data, sample_rate)

    # 编码输出
    output_buf = io.BytesIO()
    out_data = data[0] if data.shape[0] == 1 else data.T
    sf.write(output_buf, out_data, sample_rate, format=format.upper() if format != "mp3" else "WAV")
    return output_buf.getvalue()


def get_audio_duration_ms(audio_bytes: bytes, format: str = "wav") -> int:
    """获取音频时长（毫秒）"""
    if AudioSegment is None:
        raise RuntimeError("pydub 未安装")
    audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=format)
    return len(audio)


def concat_audios(audio_segments: list[bytes], silence_ms: int = 500, format: str = "wav") -> bytes:
    """拼接多段音频，段间插入静音

    Args:
        audio_segments: 多段音频二进制数据列表
        silence_ms: 段间静音时长（毫秒）
        format: 音频格式
    Returns:
        拼接后的音频二进制
    """
    if AudioSegment is None:
        raise RuntimeError("pydub 未安装，无法拼接音频")
    if not audio_segments:
        raise ValueError("没有音频可拼接")

    result = AudioSegment.empty()
    silence = AudioSegment.silent(duration=silence_ms)

    for i, seg_bytes in enumerate(audio_segments):
        seg = AudioSegment.from_file(io.BytesIO(seg_bytes), format=format)
        if i > 0:
            result += silence
        result += seg

    out = io.BytesIO()
    result.export(out, format=format)
    return out.getvalue()


def get_waveform_data(audio_bytes: bytes, points: int = 200, format: str = "wav") -> list[float]:
    """提取波形数据用于前端渲染（归一化到 -1 ~ 1）"""
    if AudioSegment is None:
        raise RuntimeError("pydub 未安装")
    audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format=format)
    samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
    if audio.channels > 1:
        samples = samples.reshape(-1, audio.channels).mean(axis=1)
    # 降采样到指定点数
    if len(samples) > points:
        chunk_size = len(samples) // points
        samples = samples[:chunk_size * points].reshape(points, chunk_size).max(axis=1)
    # 归一化
    max_val = np.abs(samples).max()
    if max_val > 0:
        samples = samples / max_val
    return samples.tolist()
