"""
audio_service.py
~~~~~~~~~~~~~~~~
Handles extraction of audio from uploaded video files using FFmpeg.

Optimizations applied:
  - Runs FFmpeg in a thread-pool executor to keep FastAPI async event loop free
  - Mono 16 kHz WAV output — ideal for Whisper STT (Phase 4)
  - Hardware-accelerated decoding hint via -hwaccel auto
  - Async file stat for audio metadata gathering
  - Cleans up orphan audio files on failure
"""

import os
import asyncio
import subprocess
import json
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from bson import ObjectId
from loguru import logger

from app.core.config import settings
from app.core.database import get_db
from app.models.video import VideoStatus, AudioMetadata, VideoResponse, VideoMetadata

COLLECTION = "videos"
AUDIO_DIR_NAME = "audio"

# Single-thread pool so heavy FFmpeg jobs don't starve the async loop
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ffmpeg")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_audio_dir(video_path: str) -> str:
    """Return (and create) an 'audio' sibling directory next to the uploads folder."""
    uploads_dir = os.path.dirname(video_path)
    audio_dir = os.path.join(os.path.dirname(uploads_dir), AUDIO_DIR_NAME)
    os.makedirs(audio_dir, exist_ok=True)
    return audio_dir


def _build_audio_path(video_path: str, video_id: str) -> str:
    """Derive the output audio path from the video path."""
    audio_dir = _get_audio_dir(video_path)
    return os.path.join(audio_dir, f"{video_id}.wav")


def _probe_audio(audio_path: str) -> dict:
    """
    Use ffprobe to get duration, sample rate, channels.
    Returns an empty dict on failure — non-fatal.
    """
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_streams",
                "-select_streams", "a:0",
                audio_path,
            ],
            capture_output=True, text=True, timeout=30,
        )
        data = json.loads(result.stdout)
        stream = data.get("streams", [{}])[0]
        return {
            "duration_seconds": float(stream.get("duration", 0)) or None,
            "sample_rate":      int(stream.get("sample_rate", 16000)),
            "channels":         int(stream.get("channels", 1)),
        }
    except Exception as exc:
        logger.warning(f"ffprobe failed (non-fatal): {exc}")
        return {}


def _run_ffmpeg(video_path: str, audio_path: str) -> None:
    """
    Synchronous FFmpeg call — runs in a thread-pool executor.

    Output spec: WAV, mono, 16 kHz (Whisper-optimised).
    Flags:
      -hwaccel auto      → use GPU decoding where available
      -threads 0         → use all CPU cores for decoding (critical for large files)
      -vn                → skip video stream
      -ac 1              → mono
      -ar 16000          → 16 kHz sample rate
      -y                 → overwrite without prompt
    """
    cmd = [
        "ffmpeg",
        "-probesize",    "50M",         # limit probe scan (faster header parse)
        "-analyzeduration", "5000000", # limit analysis (0.5s) — sufficient for AAC/MP3
        "-hwaccel",      "auto",        # GPU decode where available
        "-threads",      "0",           # all cores for decoding
        "-i",            video_path,
        "-map",          "0:a:0",        # take only the first audio track — skip video decode scan
        "-vn",                          # no video output
        "-ac",           "1",           # mono
        "-ar",           "16000",       # 16 kHz — Whisper optimal
        "-acodec",       "pcm_s16le",   # 16-bit PCM WAV
        "-compression_level", "0",      # fastest write
        "-loglevel",     "error",       # suppress verbose FFmpeg output
        "-y",                           # overwrite
        audio_path,
    ]
    logger.debug(f"FFmpeg cmd: {' '.join(cmd)}")

    result = subprocess.run(
        cmd,
        capture_output=True, text=True,
        timeout=settings.FFMPEG_TIMEOUT_SEC,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"FFmpeg exited with code {result.returncode}.\n"
            f"stderr: {result.stderr[-1000:]}"  # last 1000 chars of stderr
        )


async def _update_video_status(video_id: str, status: VideoStatus, extra: dict = None):
    """Async MongoDB status update helper."""
    db = get_db()
    update = {"status": status, "updated_at": datetime.utcnow()}
    if extra:
        update.update(extra)
    await db[COLLECTION].update_one(
        {"_id": ObjectId(video_id)},
        {"$set": update},
    )


def _doc_to_response(doc: dict) -> VideoResponse:
    from app.models.video import AudioMetadata as AM
    audio_meta = None
    if doc.get("audio_metadata"):
        audio_meta = AM(**doc["audio_metadata"])
    return VideoResponse(
        id=str(doc["_id"]),
        title=doc["title"],
        description=doc.get("description"),
        status=doc["status"],
        metadata=VideoMetadata(**doc["metadata"]),
        audio_metadata=audio_meta,
        error_message=doc.get("error_message"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


# ─── Public API ───────────────────────────────────────────────────────────────

async def extract_audio(video_id: str) -> VideoResponse:
    """
    Main entry point — called by the /api/videos/{id}/extract-audio endpoint.

    Flow:
      1. Fetch video document (validates it exists + is in correct state)
      2. Set status → EXTRACTING_AUDIO
      3. Run FFmpeg in thread executor (non-blocking)
      4. Probe extracted audio for metadata (duration, sr, channels)
      5. Persist AudioMetadata + set status → AUDIO_READY
      6. Return updated VideoResponse
    """
    from fastapi import HTTPException

    db = get_db()

    # ── Fetch document ────────────────────────────────────────────────────
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Video '{video_id}' not found.")

    allowed_states = {VideoStatus.UPLOADED, VideoStatus.AUDIO_READY, VideoStatus.FAILED}
    if doc["status"] not in allowed_states:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot extract audio while video is in '{doc['status']}' state.",
        )

    video_path = doc["storage_path"]
    if not os.path.exists(video_path):
        raise HTTPException(
            status_code=422,
            detail="Video file not found on disk. It may have been deleted.",
        )

    audio_path = _build_audio_path(video_path, video_id)

    # ── Set status → EXTRACTING_AUDIO ─────────────────────────────────────
    await _update_video_status(video_id, VideoStatus.EXTRACTING_AUDIO, {"error_message": None})
    logger.info(f"🎵 Starting audio extraction | video_id={video_id}")

    # ── Run FFmpeg (in thread pool — non-blocking) ────────────────────────
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(_executor, _run_ffmpeg, video_path, audio_path)
    except Exception as exc:
        error_msg = str(exc)[:500]
        logger.error(f"❌ FFmpeg failed | video_id={video_id} | {error_msg}")
        # Cleanup orphan audio file
        if os.path.exists(audio_path):
            os.remove(audio_path)
        await _update_video_status(
            video_id, VideoStatus.FAILED,
            {"error_message": f"Audio extraction failed: {error_msg}"},
        )
        raise HTTPException(status_code=500, detail=f"Audio extraction failed: {error_msg}")

    logger.info(f"✅ Audio extracted → {audio_path}")

    # ── Probe audio metadata ──────────────────────────────────────────────
    probe_data = await loop.run_in_executor(_executor, _probe_audio, audio_path)
    audio_size = os.path.getsize(audio_path) if os.path.exists(audio_path) else 0

    audio_meta = {
        "audio_path":        audio_path,
        "audio_size_bytes":  audio_size,
        "extracted_at":      datetime.utcnow(),
        **probe_data,
    }

    # ── Persist + return ──────────────────────────────────────────────────
    await _update_video_status(
        video_id, VideoStatus.AUDIO_READY,
        {"audio_metadata": audio_meta},
    )

    updated_doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    logger.info(
        f"🎵 Audio ready | video_id={video_id} | "
        f"{probe_data.get('duration_seconds', '?'):.1f}s | "
        f"{audio_size / 1024:.1f} KB"
        if probe_data.get('duration_seconds') else
        f"🎵 Audio ready | video_id={video_id} | {audio_size / 1024:.1f} KB"
    )
    return _doc_to_response(updated_doc)


async def get_audio_status(video_id: str) -> dict:
    """Return the current audio extraction status for a video."""
    from fastapi import HTTPException

    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    db = get_db()
    doc = await db[COLLECTION].find_one(
        {"_id": ObjectId(video_id)},
        {"status": 1, "audio_metadata": 1, "error_message": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")

    return {
        "video_id":      video_id,
        "status":        doc["status"],
        "audio_ready":   doc["status"] == VideoStatus.AUDIO_READY,
        "audio_metadata": doc.get("audio_metadata"),
        "error_message": doc.get("error_message"),
    }
