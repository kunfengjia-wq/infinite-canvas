"""Test TTS synthesis endpoint"""
import urllib.request
import json
import time

URL = "http://localhost:8880/v1/audio/speech"
payload = {
    "model": "qwen3-tts",
    "input": "hello world",
    "voice": "female_1",
    "response_format": "wav",
}

data = json.dumps(payload).encode()
req = urllib.request.Request(URL, data=data, headers={"Content-Type": "application/json"})
print(f"[{time.strftime('%H:%M:%S')}] Sending synthesis request (model loading may take minutes)...")
try:
    r = urllib.request.urlopen(req, timeout=600)
    audio = r.read()
    print(f"[{time.strftime('%H:%M:%S')}] SUCCESS: got {len(audio)} bytes of audio")
    with open("test_output.wav", "wb") as f:
        f.write(audio)
    print("Saved to test_output.wav")
except Exception as e:
    print(f"[{time.strftime('%H:%M:%S')}] FAILED: {type(e).__name__}: {e}")
    if hasattr(e, "read"):
        print(f"Response body: {e.read().decode()[:500]}")
