import json
import os
import resource
import tempfile
import threading
import time
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

app = FastAPI(title="Zhijian FunASR Service", version="1.0.0")
MODEL_DIR = os.getenv("FUNASR_MODEL_DIR", "/var/lib/zhijian-asr/models")
PRIMARY_MODEL = os.getenv("FUNASR_PRIMARY_MODEL", "paraformer-zh")
FALLBACK_MODEL = os.getenv("FUNASR_FALLBACK_MODEL", "iic/SenseVoiceSmall")
MAX_CONCURRENCY = max(1, int(os.getenv("FUNASR_MAX_CONCURRENCY", "1")))
MAX_UPLOAD_BYTES = int(os.getenv("FUNASR_MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))
semaphore = threading.BoundedSemaphore(MAX_CONCURRENCY)
models = {}
model_lock = threading.Lock()


def load_model(model_name: str):
    with model_lock:
        if model_name in models:
            return models[model_name]
        from funasr import AutoModel

        kwargs = {"model": model_name, "device": os.getenv("FUNASR_DEVICE", "cpu"), "disable_update": True}
        if "paraformer" in model_name.lower():
            kwargs.update({"vad_model": "fsmn-vad", "punc_model": "ct-punc"})
        elif "sensevoice" in model_name.lower():
            kwargs.update({"vad_model": "fsmn-vad"})
        model = AutoModel(**kwargs)
        models[model_name] = model
        return model


def parse_hotwords(value: str):
    try:
        entries = json.loads(value or "[]")
    except json.JSONDecodeError:
        entries = []
    words = []
    for entry in entries[:500]:
        text = str(entry.get("text", "") if isinstance(entry, dict) else entry).strip()
        weight = int(entry.get("weight", 15) if isinstance(entry, dict) else 15)
        if text:
            words.append(f"{text} {max(1, min(100, weight))}")
    return " ".join(words)


@app.get("/health")
def health():
    return {
        "ok": True,
        "provider": "funasr",
        "primaryModel": PRIMARY_MODEL,
        "fallbackModel": FALLBACK_MODEL,
        "loadedModels": list(models.keys()),
        "maxConcurrency": MAX_CONCURRENCY,
        "memoryMb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
    }


@app.post("/v1/audio/transcriptions")
def transcribe(
    file: UploadFile = File(...),
    model: str = Form(PRIMARY_MODEL),
    language: str = Form("zh"),
    hotwords: str = Form("[]"),
):
    if not semaphore.acquire(timeout=5):
        raise HTTPException(status_code=429, detail="ASR service is busy")
    suffix = Path(file.filename or "recording.webm").suffix or ".webm"
    temp_path = None
    started = time.perf_counter()
    try:
        content = file.file.read(MAX_UPLOAD_BYTES + 1)
        if not content:
            raise HTTPException(status_code=400, detail="Empty audio file")
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Audio file is too large")
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
            temporary.write(content)
            temp_path = temporary.name
        selected = PRIMARY_MODEL if model in ("paraformer-zh", PRIMARY_MODEL) else FALLBACK_MODEL
        asr = load_model(selected)
        kwargs = {"input": temp_path, "language": language, "batch_size_s": 60}
        hotword_text = parse_hotwords(hotwords)
        if hotword_text and "paraformer" in selected.lower():
            kwargs["hotword"] = hotword_text
        result = asr.generate(**kwargs)
        text = "".join(str(item.get("text", "")) for item in result if isinstance(item, dict)).strip()
        if not text:
            raise HTTPException(status_code=502, detail="ASR returned empty transcript")
        return {
            "text": text,
            "model": "paraformer-zh" if "paraformer" in selected.lower() else "sensevoice-small",
            "language": language,
            "processingMs": round((time.perf_counter() - started) * 1000),
            "hotwordsApplied": bool(hotword_text and "paraformer" in selected.lower()),
        }
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
        semaphore.release()


if os.getenv("FUNASR_PRELOAD", "true").lower() == "true":
    threading.Thread(target=lambda: load_model(PRIMARY_MODEL), daemon=True).start()

