"""TTS 引擎抽象基类"""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class VoiceInfo:
    id: str
    label: str
    language: str  # "zh", "en", "multi"
    gender: str    # "female", "male"


@dataclass
class SynthesisRequest:
    text: str
    voice: str
    speed: float = 1.0
    response_format: str = "mp3"
    reference_audio: str | None = None  # base64, XTTS/GPT-SoVITS
    emotion: str = "neutral"            # happy/sad/angry/surprise/fear/disgust/neutral/gentle
    emotion_intensity: float = 0.5      # 0-1
    style: str = ""                     # narration/dialogue/whisper/broadcast
    prompt_text: str | None = None      # 参考音频对应文本（GPT-SoVITS）


class TTSEngine(ABC):
    """所有 TTS 引擎的抽象接口"""

    @property
    @abstractmethod
    def engine_id(self) -> str:
        """引擎唯一标识，如 'kokoro-82m'"""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """显示名称"""
        ...

    @abstractmethod
    def list_voices(self) -> list[VoiceInfo]:
        """返回该引擎支持的音色列表"""
        ...

    @abstractmethod
    async def synthesize(self, req: SynthesisRequest) -> bytes:
        """合成语音，返回音频二进制数据"""
        ...

    @abstractmethod
    def is_available(self) -> bool:
        """检查引擎依赖是否已安装"""
        ...
