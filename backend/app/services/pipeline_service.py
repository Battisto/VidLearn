"""
pipeline_service.py
~~~~~~~~~~~~~~~~~~~
One-shot auto-pipeline: chains every processing stage sequentially in a single
FastAPI BackgroundTask so the caller gets a 202 immediately and can poll status.

Stages run in order:
  1. Extract audio   (FFmpeg)
  2. Transcribe      (faster-whisper / openai-whisper)
  3. Preprocess      (clean + chunk)
  4. Summarize       (Gemini / BART)

Each stage updates MongoDB status, so the frontend can show live progress
with a simple polling loop on GET /api/videos/{id}.

Why a pipeline?
  - Eliminates 4 separate HTTP round-trips (upload → 4 POSTs → poll each step)
  - No inter-stage latency from network overhead
  - Safer: if any stage fails the pipeline stops and FAILED is written to DB
    with a descriptive error_message, just like individual endpoints do.
"""

import asyncio
from datetime import datetime
from typing import Optional

from bson import ObjectId
from loguru import logger

from app.core.database import get_db
from app.models.video import VideoStatus
from app.services import audio_service, transcription_service, preprocessing_service, summarization_service

COLLECTION = "videos"


# ─── DB helper ────────────────────────────────────────────────────────────────

async def _set_error(video_id: str, message: str):
    db = get_db()
    await db[COLLECTION].update_one(
        {"_id": ObjectId(video_id)},
        {"$set": {
            "status":        VideoStatus.FAILED,
            "error_message": message,
            "updated_at":    datetime.utcnow(),
        }},
    )


# ─── Core pipeline ────────────────────────────────────────────────────────────

async def _run_pipeline(
    video_id: str,
    whisper_model: Optional[str],
    provider: Optional[str],
):
    """
    Full async pipeline — runs as a BackgroundTask.
    Each stage is an awaited call to the existing service functions,
    which already handle status transitions and error handling.
    """
    logger.info(f"🚀 Pipeline started | video_id={video_id}")
    start = datetime.utcnow()

    try:
        # ── Stage 1: Audio extraction ─────────────────────────────────────────
        logger.info(f"🎵 [1/3] Extracting audio | video_id={video_id}")
        await audio_service.extract_audio(video_id)

        # ── Stage 2: Transcription ─────────────────────────────────────────────
        logger.info(f"🎤 [2/3] Transcribing | video_id={video_id}")
        await transcription_service.transcribe_video(video_id, model_name=whisper_model)

        # ── Stage 3: Preprocessing ────────────────────────────────────────────
        logger.info(f"🔧 [3/3] Preprocessing | video_id={video_id}")
        await preprocessing_service.preprocess_transcript(video_id)

        elapsed = (datetime.utcnow() - start).total_seconds()
        logger.info(
            f"✅ Pipeline complete (pre-summarization) | video_id={video_id} | "
            f"total_time={elapsed:.1f}s | status=PREPROCESSED — awaiting user summarization"
        )

    except Exception as exc:
        elapsed = (datetime.utcnow() - start).total_seconds()
        error_msg = str(exc)[:600]
        logger.error(
            f"❌ Pipeline failed | video_id={video_id} | "
            f"elapsed={elapsed:.1f}s | {error_msg}"
        )
        # Don't double-write FAILED if a sub-service already did it
        db = get_db()
        doc = await db[COLLECTION].find_one(
            {"_id": ObjectId(video_id)}, {"status": 1}
        )
        if doc and doc.get("status") != VideoStatus.FAILED:
            await _set_error(video_id, f"Pipeline failed: {error_msg}")


# ─── Public API ───────────────────────────────────────────────────────────────

async def start_pipeline(
    video_id: str,
    whisper_model: Optional[str] = None,
    provider: Optional[str] = None,
) -> dict:
    """
    Validate the video exists and is in a pipeline-compatible state,
    then launch _run_pipeline as an asyncio Task (fire-and-forget).

    Returns immediately with a 202-ready payload containing the video_id
    and a status_url the caller can poll.
    """
    from fastapi import HTTPException

    db = get_db()
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Video '{video_id}' not found.")

    # Allow re-running from UPLOADED or FAILED state
    allowed = {VideoStatus.UPLOADED, VideoStatus.FAILED}
    if doc["status"] not in allowed:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot start pipeline: video is in '{doc['status']}' state. "
                "Pipeline requires the video to be freshly uploaded (UPLOADED) or failed (FAILED)."
            ),
        )

    # Fire-and-forget — FastAPI's event loop keeps running the background task
    asyncio.create_task(_run_pipeline(video_id, whisper_model, provider))

    logger.info(f"📋 Pipeline queued | video_id={video_id}")
    return {
        "video_id":   video_id,
        "message":    "Pipeline started. Poll status_url for live progress.",
        "status_url": f"/api/videos/{video_id}",
        "stages":     ["extract-audio", "transcribe", "preprocess", "summarize"],
    }


async def get_pipeline_status(video_id: str) -> dict:
    """
    Convenience endpoint: returns the video status + relevant metadata
    so the frontend can render a single progress view without 4 status calls.
    """
    from fastapi import HTTPException

    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    db = get_db()
    doc = await db[COLLECTION].find_one(
        {"_id": ObjectId(video_id)},
        {
            "status": 1, "error_message": 1,
            "audio_metadata": 1, "transcript_metadata": 1,
            "preprocessing_metadata": 1, "summary_metadata": 1,
        },
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")

    status = doc["status"]

    # Map status to a human-readable current stage
    stage_map = {
        VideoStatus.UPLOADED:          ("queued",                   0),
        VideoStatus.EXTRACTING_AUDIO:  ("extracting audio",         1),
        VideoStatus.AUDIO_READY:       ("audio ready",              1),
        VideoStatus.TRANSCRIBING:      ("transcribing",             2),
        VideoStatus.TRANSCRIPT_READY:  ("transcript ready",         2),
        VideoStatus.PREPROCESSING:     ("preprocessing",            3),
        VideoStatus.PREPROCESSED:      ("ready",                    3),
        VideoStatus.SUMMARIZING:       ("summarizing",              3),
        VideoStatus.SUMMARIZED:        ("complete",                 3),
        VideoStatus.FAILED:            ("failed",                   0),
    }
    stage_label, stage_num = stage_map.get(status, ("unknown", 0))
    total_stages = 3    # extract → transcribe → preprocess (summarize is user-triggered)

    def _serialize_meta(meta: dict) -> dict:
        """Convert datetime objects to ISO strings for JSON serialisation."""
        if not meta:
            return None
        return {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in meta.items()}

    return {
        "video_id":              video_id,
        "status":                status,
        "current_stage":         stage_label,
        "stage_number":          stage_num,
        "total_stages":          total_stages,
        "progress_pct":          round((stage_num / total_stages) * 100),
        "complete":              status == VideoStatus.SUMMARIZED,
        "failed":                status == VideoStatus.FAILED,
        "error_message":         doc.get("error_message"),
        "audio_metadata":        _serialize_meta(doc.get("audio_metadata")),
        "transcript_metadata":   _serialize_meta(doc.get("transcript_metadata")),
        "preprocessing_metadata":_serialize_meta(doc.get("preprocessing_metadata")),
        "summary_metadata":      _serialize_meta(doc.get("summary_metadata")),
    }
