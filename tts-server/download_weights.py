"""健壮下载 Qwen3-TTS 的 model.safetensors（针对不稳定网络）

背景：境内直连/代理传输几百 MB 后会停滞，且 huggingface_hub 的下载器
对"连接开着但不传数据"的停滞不会超时，会无限挂起。

本脚本自行控制下载：
- httpx 流式逐块读取，read 超时（停滞 30s 即抛 ReadTimeout，不会挂死）
- 始终从磁盘 .part 文件的已有字节数断点续传（HTTP Range）
- 反复重试，直到文件大小等于服务器声明的总大小
- 直接写入 HF 缓存快照目录，transformers 可直接加载
"""
import os
import time
from pathlib import Path

import httpx

REPO = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
FILENAME = "model.safetensors"
URL = f"https://huggingface.co/{REPO}/resolve/main/{FILENAME}"
PROXY = os.environ.get("HTTPS_PROXY", "socks5h://127.0.0.1:10808")
TOKEN = os.environ.get("HF_TOKEN", "")

MAX_ATTEMPTS = 300
READ_TIMEOUT = 30.0
CHUNK = 1024 * 1024  # 1 MB


def find_snapshot_dir() -> Path:
    cache = Path(os.environ.get("HF_HOME", str(Path.home() / ".cache" / "huggingface"))) / "hub"
    model_dir = cache / f"models--{REPO.replace('/', '--')}"
    snaps = sorted((model_dir / "snapshots").glob("*"))
    if not snaps:
        raise RuntimeError(f"未找到快照目录: {model_dir / 'snapshots'}")
    return snaps[0]


def main() -> None:
    snap = find_snapshot_dir()
    target = snap / FILENAME
    part = snap / (FILENAME + ".part")
    print(f"[dl] snapshot = {snap}", flush=True)
    print(f"[dl] proxy    = {PROXY}", flush=True)

    headers = {"User-Agent": "qoder-tts-downloader"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"

    total: int | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            start = part.stat().st_size if part.exists() else 0
            req_headers = dict(headers)
            if start > 0:
                req_headers["Range"] = f"bytes={start}-"
            print(f"[dl] attempt {attempt}: resume from {start / 1e6:.1f} MB", flush=True)

            timeout = httpx.Timeout(connect=30.0, read=READ_TIMEOUT, write=30.0, pool=30.0)
            with httpx.Client(proxy=PROXY, timeout=timeout, follow_redirects=True) as client:
                with client.stream("GET", URL, headers=req_headers) as resp:
                    if resp.status_code not in (200, 206):
                        raise RuntimeError(f"HTTP {resp.status_code}: {resp.read()[:200]!r}")
                    cr = resp.headers.get("content-range")
                    if cr and "/" in cr:
                        total = int(cr.split("/")[-1])
                    elif total is None:
                        cl = resp.headers.get("content-length")
                        total = (start + int(cl)) if cl else None
                    if resp.status_code == 200 and part.exists():
                        part.unlink()  # 服务器忽略 Range，从头写
                    with open(part, "ab" if resp.status_code == 206 else "wb") as f:
                        for chunk in resp.iter_bytes(chunk_size=CHUNK):
                            if chunk:
                                f.write(chunk)
            cur = part.stat().st_size
            print(f"[dl] attempt {attempt} ended at {cur / 1e6:.1f} MB (total={total})", flush=True)
            if total is not None and cur >= total:
                break
        except Exception as e:  # noqa: BLE001
            cur = part.stat().st_size if part.exists() else 0
            print(f"[dl] attempt {attempt} error: {type(e).__name__}: {e} (at {cur / 1e6:.1f} MB)", flush=True)
        time.sleep(3)

    cur = part.stat().st_size if part.exists() else 0
    if total is not None and cur >= total:
        if target.exists() or target.is_symlink():
            target.unlink()
        part.replace(target)
        print(f"[dl] SUCCESS -> {target} ({cur / 1e6:.1f} MB)", flush=True)
    else:
        print(f"[dl] INCOMPLETE: {cur / 1e6:.1f} MB / {total}", flush=True)


if __name__ == "__main__":
    main()
