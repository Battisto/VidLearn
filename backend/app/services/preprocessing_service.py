"""
preprocessing_service.py
~~~~~~~~~~~~~~~~~~~~~~~~~
Orchestrates text preprocessing for a transcribed video.

Flow:
  1. Fetch video (must be TRANSCRIPT_READY or PREPROCESSED)
  2. Set status → PREPROCESSING
  3. Run full_clean() on the raw transcript  (stdin thread — CPU-bound)
  4. Chunk cleaned text with chunk_text()
  5. Persist cleaned_transcript, preprocessed_chunks, preprocessing_metadata → PREPROCESSED
  6. Optionally save cleaned text to disk as {video_id}_clean.txt

This step is a prerequisite for Phase 6 (AI Summarization), which reads
`preprocessed_chunks` directly from MongoDB.
"""

import os
import asyncio
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from bson import ObjectId
from loguru import logger

from app.core.database import get_db
from app.models.video import (
    VideoStatus, PreprocessingMetadata, TextChunk,
    VideoResponse, VideoMetadata, AudioMetadata,
    TranscriptMetadata, PreprocessingResponse,
)
from app.utils.text_processor import full_clean, chunk_text, estimate_tokens

COLLECTION   = "videos"
CHUNK_TOKENS = 800
OVERLAP      = 100

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="preproc")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _preprocess_sync(raw_transcript: str) -> dict:
    """
    Synchronous preprocessing — runs in thread executor.
    Returns a dict with all results.
    """
    original_word_count = len(raw_transcript.split())
    original_char_count = len(raw_transcript)

    # Full cleaning pipeline
    cleaned, noise_count = full_clean(raw_transcript)

    cleaned_word_count = len(cleaned.split())
    cleaned_char_count = len(cleaned)

    # Chunk for BART
    chunks = chunk_text(cleaned, max_tokens=CHUNK_TOKENS, overlap_tokens=OVERLAP)

    return {
        "cleaned":             cleaned,
        "chunks":              chunks,
        "original_word_count": original_word_count,
        "original_char_count": original_char_count,
        "cleaned_word_count":  cleaned_word_count,
        "cleaned_char_count":  cleaned_char_count,
        "noise_count":         noise_count,
    }


def _save_cleaned_file(video_id: str, cleaned_text: str, transcript_dir: str) -> str:
    """Save the cleaned transcript as {video_id}_clean.txt."""
    out_path = os.path.join(transcript_dir, f"{video_id}_clean.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(cleaned_text)
    return out_path


def _resolve_transcript_dir() -> str:
    """Return the transcripts directory (same location as audio_service uses)."""
    base = Path(__file__).resolve().parents[3]  # project root
    t_dir = base / "transcripts"
    t_dir.mkdir(exist_ok=True)
    return str(t_dir)


async def _update_status(video_id: str, status: VideoStatus, extra: dict = None):
    db = get_db()
    update = {"status": status, "updated_at": datetime.utcnow()}
    if extra:
        update.update(extra)
    await db[COLLECTION].update_one(
        {"_id": ObjectId(video_id)},
        {"$set": update},
    )


def _doc_to_response(doc: dict) -> VideoResponse:
    audio_meta = AudioMetadata(**doc["audio_metadata"]) if doc.get("audio_metadata") else None
    t_meta = TranscriptMetadata(**doc["transcript_metadata"]) if doc.get("transcript_metadata") else None
    p_meta = PreprocessingMetadata(**doc["preprocessing_metadata"]) if doc.get("preprocessing_metadata") else None
    return VideoResponse(
        id=str(doc["_id"]),
        title=doc["title"],
        description=doc.get("description"),
        status=doc["status"],
        metadata=VideoMetadata(**doc["metadata"]),
        audio_metadata=audio_meta,
        transcript=doc.get("transcript"),
        transcript_metadata=t_meta,
        cleaned_transcript=doc.get("cleaned_transcript"),
        preprocessing_metadata=p_meta,
        error_message=doc.get("error_message"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


# ─── Public API ───────────────────────────────────────────────────────────────

async def preprocess_transcript(video_id: str) -> VideoResponse:
    """
    Main entry point — called by POST /api/videos/{id}/preprocess.

    Requires status = TRANSCRIPT_READY | PREPROCESSED | FAILED (with transcript).
    """
    from fastapi import HTTPException

    db = get_db()
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")

    allowed = {VideoStatus.TRANSCRIPT_READY, VideoStatus.PREPROCESSED, VideoStatus.FAILED}
    if doc["status"] not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot preprocess: video is in '{doc['status']}' state. "
                   "Transcription must complete first.",
        )

    raw_transcript = doc.get("transcript", "")
    if not raw_transcript or not raw_transcript.strip():
        raise HTTPException(
            status_code=422,
            detail="No transcript found. Run transcription first.",
        )

    # ── Set status → PREPROCESSING ────────────────────────────────────────
    await _update_status(video_id, VideoStatus.PREPROCESSING, {"error_message": None})
    logger.info(
        f"🔧 Starting preprocessing | video_id={video_id} | "
        f"raw_chars={len(raw_transcript)}"
    )

    # ── Run preprocessing (thread executor) ───────────────────────────────
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            _executor, _preprocess_sync, raw_transcript
        )
    except Exception as exc:
        error_msg = str(exc)[:500]
        logger.error(f"❌ Preprocessing failed | video_id={video_id} | {error_msg}")
        await _update_status(
            video_id, VideoStatus.FAILED,
            {"error_message": f"Preprocessing failed: {error_msg}"},
        )
        raise HTTPException(status_code=500, detail=f"Preprocessing failed: {error_msg}")

    cleaned    = result["cleaned"]
    chunks     = result["chunks"]
    noise_ct   = result["noise_count"]

    logger.info(
        f"✅ Preprocessing done | video_id={video_id} | "
        f"words: {result['original_word_count']} → {result['cleaned_word_count']} | "
        f"noise_removed={noise_ct} | chunks={len(chunks)}"
    )

    # ── Save cleaned file to disk ─────────────────────────────────────────
    t_dir = _resolve_transcript_dir()
    try:
        await loop.run_in_executor(
            _executor, _save_cleaned_file, video_id, cleaned, t_dir
        )
    except Exception as e:
        logger.warning(f"⚠️  Could not save cleaned file (non-fatal): {e}")

    # ── Persist to MongoDB ────────────────────────────────────────────────
    preprocessing_meta = {
        "original_char_count":  result["original_char_count"],
        "cleaned_char_count":   result["cleaned_char_count"],
        "original_word_count":  result["original_word_count"],
        "cleaned_word_count":   result["cleaned_word_count"],
        "noise_removed_count":  noise_ct,
        "chunk_count":          len(chunks),
        "chunk_size_tokens":    CHUNK_TOKENS,
        "chunk_overlap_tokens": OVERLAP,
        "preprocessed_at":      datetime.utcnow(),
    }

    await _update_status(
        video_id,
        VideoStatus.PREPROCESSED,
        {
            "cleaned_transcript":    cleaned,
            "preprocessed_chunks":   chunks,
            "preprocessing_metadata": preprocessing_meta,
        },
    )

    updated = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    return _doc_to_response(updated)


async def get_preprocessing_result(video_id: str) -> PreprocessingResponse:
    """Return cleaned transcript + all chunks for a preprocessed video."""
    from fastapi import HTTPException

    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    db = get_db()
    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")

    chunks = None
    if doc.get("preprocessed_chunks"):
        chunks = [TextChunk(**c) for c in doc["preprocessed_chunks"]]

    p_meta = None
    if doc.get("preprocessing_metadata"):
        p_meta = PreprocessingMetadata(**doc["preprocessing_metadata"])

    return PreprocessingResponse(
        video_id=video_id,
        title=doc["title"],
        status=doc["status"],
        cleaned_transcript=doc.get("cleaned_transcript"),
        preprocessing_metadata=p_meta,
        chunks=chunks,
    )


async def get_preprocessing_status(video_id: str) -> dict:
    """Lightweight poll endpoint."""
    from fastapi import HTTPException

    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    db = get_db()
    doc = await db[COLLECTION].find_one(
        {"_id": ObjectId(video_id)},
        {"status": 1, "preprocessing_metadata": 1, "error_message": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")

    return {
        "video_id":               video_id,
        "status":                 doc["status"],
        "preprocessed":           doc["status"] == VideoStatus.PREPROCESSED,
        "preprocessing_metadata": doc.get("preprocessing_metadata"),
        "error_message":          doc.get("error_message"),
    }
