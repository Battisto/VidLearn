"""
transcription_service.py
~~~~~~~~~~~~~~~~~~~~~~~~~
Speech-to-Text using OpenAI Whisper.

Architecture:
  - Model is loaded ONCE at startup into a module-level singleton to avoid
    re-loading the heavy model on every request (~seconds overhead).
  - Transcription runs in the same ThreadPoolExecutor used by audio_service
    so it doesn't block the FastAPI async event loop.
  - Output: plain-text transcript + timed segments stored in MongoDB.
  - Transcript is also saved as a .txt file alongside the audio for portability.

Whisper model sizes (tradeoff: speed vs accuracy):
  tiny   ~39M  params — fastest, least accurate
  base   ~74M  params — good balance  ← default
  small  ~244M params — better accuracy
  medium ~769M params — high accuracy
  large  ~1.5B params — best, requires GPU
"""

import os
import asyncio
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from bson import ObjectId
from loguru import logger

from app.core.config import settings
from app.core.database import get_db
from app.models.video import VideoStatus, TranscriptMetadata, TranscriptResponse, TranscriptSegment

COLLECTION = "videos"
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="whisper")

# ─── Model Singleton ──────────────────────────────────────────────────────────
_whisper_model = None
_loaded_model_name = None


def load_whisper_model(model_name: str = None):
    """
    Load the Whisper model into memory (called once at startup or on first use).
    Caches the model globally so subsequent calls are instant.
    """
    global _whisper_model, _loaded_model_name
    model_name = model_name or settings.WHISPER_MODEL

    if _whisper_model is not None and _loaded_model_name == model_name:
        return _whisper_model

    logger.info(f"🔄 Loading Whisper model: '{model_name}' ...")
    import whisper
    _whisper_model = whisper.load_model(model_name)
    _loaded_model_name = model_name
    logger.info(f"✅ Whisper model '{model_name}' loaded successfully")
    return _whisper_model


def get_whisper_model():
    """Return the cached Whisper model, loading it if not yet initialised."""
    if _whisper_model is None:
        return load_whisper_model()
    return _whisper_model


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _transcript_dir(audio_path: str) -> str:
    """Return (and create) a 'transcripts' directory sibling to the audio dir."""
    audio_dir = os.path.dirname(audio_path)
    transcript_dir = os.path.join(os.path.dirname(audio_dir), "transcripts")
    os.makedirs(transcript_dir, exist_ok=True)
    return transcript_dir


def _save_transcript_file(video_id: str, audio_path: str, text: str) -> str:
    """Save the plain-text transcript to disk as {video_id}.txt."""
    out_dir = _transcript_dir(audio_path)
    out_path = os.path.join(out_dir, f"{video_id}.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    logger.info(f"💾 Transcript saved → {out_path}")
    return out_path


def _run_whisper(audio_path: str, model_name: str) -> dict:
    """
    Synchronous Whisper transcription — runs in thread executor.

    Returns the raw Whisper result dict:
      {
        "text": "...",
        "segments": [...],
        "language": "en",
      }
    """
    model = load_whisper_model(model_name)
    logger.debug(f"🎙️  Whisper transcribing: {audio_path}")

    result = model.transcribe(
        audio_path,
        fp16=False,          # safer on CPU; set True if CUDA available
        verbose=False,
        word_timestamps=True,
        condition_on_previous_text=True,
        temperature=0.0,     # greedy decoding — fastest + most deterministic
    )
    return result


async def _update_status(video_id: str, status: VideoStatus, extra: dict = None):
    db = get_db()
    update = {"status": status, "updated_at": datetime.utcnow()}
    if extra:
        update.update(extra)
    await db[COLLECTION].update_one(
        {"_id": ObjectId(video_id)},
        {"$set": update},
    )


def _doc_to_response(doc: dict) -> "VideoResponse":
    from app.models.video import VideoResponse, AudioMetadata
    audio_meta = None
    if doc.get("audio_metadata"):
        audio_meta = AudioMetadata(**doc["audio_metadata"])
    transcript_meta = None
    if doc.get("transcript_metadata"):
        transcript_meta = TranscriptMetadata(**doc["transcript_metadata"])
    return VideoResponse(
        id=str(doc["_id"]),
        title=doc["title"],
        description=doc.get("description"),
        status=doc["status"],
        metadata=__import__("app.models.video", fromlist=["VideoMetadata"]).VideoMetadata(**doc["metadata"]),
        audio_metadata=audio_meta,
        transcript=doc.get("transcript"),
        transcript_metadata=transcript_meta,
        error_message=doc.get("error_message"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


# ─── Public API ───────────────────────────────────────────────────────────────

async def transcribe_video(video_id: str, model_name: str = None) -> "VideoResponse":
    """
    Main entry point — called by POST /api/videos/{id}/transcribe.

    Flow:
      1. Validate video exists + has audio extracted (status = AUDIO_READY)
      2. Set status → TRANSCRIBING
      3. Run Whisper in thread executor (non-blocking)
      4. Parse result: plain text + timed segments
      5. Save transcript to disk
      6. Persist transcript + metadata to MongoDB → TRANSCRIPT_READY
      7. Return updated VideoResponse
    """
    from fastapi import HTTPException

    db = get_db()
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Video '{video_id}' not found.")

    # Validate state — must have audio ready
    allowed = {VideoStatus.AUDIO_READY, VideoStatus.TRANSCRIPT_READY, VideoStatus.FAILED}
    if doc["status"] not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot transcribe: video is in '{doc['status']}' state. "
                   f"Audio must be extracted first.",
        )

    audio_meta = doc.get("audio_metadata")
    if not audio_meta or not audio_meta.get("audio_path"):
        raise HTTPException(
            status_code=422,
            detail="No audio file found. Run audio extraction first.",
        )

    audio_path = audio_meta["audio_path"]
    if not os.path.exists(audio_path):
        raise HTTPException(
            status_code=422,
            detail="Audio file not found on disk. Re-run audio extraction.",
        )

    model_name = model_name or settings.WHISPER_MODEL

    # ── Set status → TRANSCRIBING ─────────────────────────────────────────
    await _update_status(video_id, VideoStatus.TRANSCRIBING, {"error_message": None})
    logger.info(f"🎙️  Starting transcription | video_id={video_id} | model={model_name}")

    # ── Run Whisper (thread executor) ─────────────────────────────────────
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _executor,
            _run_whisper,
            audio_path,
            model_name,
        )
    except Exception as exc:
        error_msg = str(exc)[:500]
        logger.error(f"❌ Whisper failed | video_id={video_id} | {error_msg}")
        await _update_status(
            video_id, VideoStatus.FAILED,
            {"error_message": f"Transcription failed: {error_msg}"},
        )
        raise HTTPException(status_code=500, detail=f"Transcription failed: {error_msg}")

    # ── Parse result ──────────────────────────────────────────────────────
    full_text = result.get("text", "").strip()
    segments  = result.get("segments", [])
    language  = result.get("language", "unknown")

    word_count = len(full_text.split()) if full_text else 0
    char_count = len(full_text)
    duration   = segments[-1]["end"] if segments else None

    # Detect language probability from first segment if available
    lang_prob = None
    if segments:
        lang_prob = segments[0].get("avg_logprob")  # proxy for confidence

    logger.info(
        f"✅ Transcription complete | video_id={video_id} | "
        f"lang={language} | words={word_count} | duration={duration:.1f}s"
        if duration else
        f"✅ Transcription complete | video_id={video_id} | lang={language} | words={word_count}"
    )

    # ── Save to disk ──────────────────────────────────────────────────────
    await loop.run_in_executor(
        _executor,
        _save_transcript_file,
        video_id,
        audio_path,
        full_text,
    )

    # ── Persist to MongoDB ────────────────────────────────────────────────
    transcript_meta = {
        "whisper_model":         model_name,
        "language":              language,
        "language_probability":  lang_prob,
        "duration_seconds":      duration,
        "word_count":            word_count,
        "char_count":            char_count,
        "transcribed_at":        datetime.utcnow(),
    }

    # Store segments as plain dicts (strip word-level timestamps to save space)
    clean_segments = [
        {"id": s["id"], "start": round(s["start"], 2),
         "end": round(s["end"], 2), "text": s["text"].strip()}
        for s in segments
    ]

    await _update_status(
        video_id,
        VideoStatus.TRANSCRIPT_READY,
        {
            "transcript":            full_text,
            "transcript_segments":   clean_segments,
            "transcript_metadata":   transcript_meta,
        },
    )

    updated_doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    return _doc_to_response(updated_doc)


async def get_transcript(video_id: str) -> TranscriptResponse:
    """Retrieve the transcript + timed segments for a video."""
    from fastapi import HTTPException

    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    db = get_db()
    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")

    segments = None
    if doc.get("transcript_segments"):
        segments = [TranscriptSegment(**s) for s in doc["transcript_segments"]]

    transcript_meta = None
    if doc.get("transcript_metadata"):
        transcript_meta = TranscriptMetadata(**doc["transcript_metadata"])

    return TranscriptResponse(
        video_id=video_id,
        title=doc["title"],
        status=doc["status"],
        transcript=doc.get("transcript"),
        transcript_metadata=transcript_meta,
        segments=segments,
    )


async def get_transcription_status(video_id: str) -> dict:
    """Lightweight status check — poll-friendly."""
    from fastapi import HTTPException

    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    db = get_db()
    doc = await db[COLLECTION].find_one(
        {"_id": ObjectId(video_id)},
        {"status": 1, "transcript_metadata": 1, "error_message": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")

    return {
        "video_id":            video_id,
        "status":              doc["status"],
        "transcript_ready":    doc["status"] == VideoStatus.TRANSCRIPT_READY,
        "transcript_metadata": doc.get("transcript_metadata"),
        "error_message":       doc.get("error_message"),
    }
