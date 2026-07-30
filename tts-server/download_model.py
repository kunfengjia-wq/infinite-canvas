"""后台下载 Qwen3-TTS 模型

策略：
- 直连 huggingface.co + HF_TOKEN 认证
- 启用 Xet 协议（分块去重并行传输，自带断点续传）
- 网络不稳定时自动重试
"""
import os
import time

os.environ.setdefault("HF_ENDPOINT", "https://huggingface.co")
# 启用 Xet 协议（分块并行 + CAS 去重，比传统 HTTP 更抗停滞）
os.environ.pop("HF_HUB_DISABLE_XET", None)
os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "0")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")

from huggingface_hub import snapshot_download

MODEL_NAME = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
MAX_ATTEMPTS = 60
RETRY_WAIT = 5


if __name__ == "__main__":
    print(f"[download] endpoint = {os.environ.get('HF_ENDPOINT')}")
    print(f"[download] token set = {bool(os.environ.get('HF_TOKEN'))}")
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            print(f"[download] attempt {attempt}/{MAX_ATTEMPTS} ...", flush=True)
            path = snapshot_download(MODEL_NAME)
            print(f"[download] SUCCESS -> {path}", flush=True)
            break
        except Exception as e:  # noqa: BLE001
            print(f"[download] attempt {attempt} failed: {type(e).__name__}: {e}", flush=True)
            print(f"[download] retry in {RETRY_WAIT}s (auto-resume) ...", flush=True)
            time.sleep(RETRY_WAIT)
    else:
        print(f"[download] GAVE UP after {MAX_ATTEMPTS} attempts", flush=True)
