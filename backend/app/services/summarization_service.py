"""
summarization_service.py
~~~~~~~~~~~~~~~~~~~~~~~~
AI-powered text summarization for VidLearn — Phase 6.

Supports two providers with automatic fallback:
  1. Google Gemini API  (cloud, high quality, requires API key)
  2. BART               (local, facebook/bart-large-cnn, no API key needed)

Selection logic:
  - If GOOGLE_GEMINI_API_KEY is set → use Gemini
  - Else → use BART (downloads model on first use, ~1.6 GB)
  - Can override per-request with ?provider= query param

Pipeline:
  1. Validate video is PREPROCESSED (has chunked text)
  2. Set status → SUMMARIZING
  3. Summarize each chunk independently  (parallel for Gemini)
  4. Merge chunk summaries into a clean final summary
  5. Persist summary + SummaryMetadata → SUMMARIZED
  6. Save summary as {video_id}_summary.txt

Merging strategy:
  - ≤ 3 chunk summaries: concatenate with transition phrases
  - > 3 chunk summaries: pass merged text through a second Gemini/BART call
    with a "merge" prompt to produce a coherent final summary
"""

import os
import asyncio
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional
from pathlib import Path

from bson import ObjectId
from loguru import logger

from app.core.config import settings
from app.core.database import get_db
from app.models.video import (
    VideoStatus, SummaryMetadata, SummaryResponse,
    VideoResponse, VideoMetadata, AudioMetadata,
    TranscriptMetadata, PreprocessingMetadata,
)

COLLECTION = "videos"
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="summarizer")

# ─── BART singleton ────────────────────────────────────────────────────────────
_bart_pipeline = None


def _load_bart():
    global _bart_pipeline
    if _bart_pipeline is not None:
        return _bart_pipeline
    logger.info(f"🔄 Loading BART model: {settings.BART_MODEL} ...")
    from transformers import pipeline
    _bart_pipeline = pipeline(
        "summarization",
        model=settings.BART_MODEL,
        device=-1,          # CPU; set 0 for CUDA GPU
    )
    logger.info("✅ BART model loaded")
    return _bart_pipeline


# ─── Provider: Gemini ─────────────────────────────────────────────────────────

def _gemini_summarize_chunk(text: str, is_merge: bool = False) -> str:
    """Call Gemini API for a single chunk or merge pass."""
    import google.generativeai as genai

    genai.configure(api_key=settings.GOOGLE_GEMINI_API_KEY)
    model = genai.GenerativeModel(settings.GEMINI_MODEL)

    if is_merge:
        prompt = (
            "You are an expert educational content writer. "
            "The following are individual summaries of sequential parts of a lecture or educational video. "
            "Merge them into ONE coherent, well-structured summary in clear paragraphs. "
            "Keep it concise but comprehensive. Remove redundancy. Use plain prose — no bullet points.\n\n"
            f"Summaries to merge:\n{text}\n\nFinal merged summary:"
        )
    else:
        prompt = (
            "You are an expert educational content writer. "
            "Summarize the following transcript excerpt from an educational video. "
            "Be concise, accurate, and capture the key concepts. "
            "Write in clear, flowing paragraphs. Aim for 2-4 sentences.\n\n"
            f"Transcript:\n{text}\n\nSummary:"
        )

    response = model.generate_content(prompt)
    return response.text.strip()


async def _gemini_summarize_all(chunks: List[dict]) -> List[str]:
    """Summarize all chunks using Gemini — runs sequentially to respect rate limits."""
    loop = asyncio.get_event_loop()
    summaries = []
    for i, chunk in enumerate(chunks):
        logger.debug(f"🤖 Gemini summarizing chunk {i+1}/{len(chunks)} ...")
        summary = await loop.run_in_executor(
            _executor, _gemini_summarize_chunk, chunk["text"], False
        )
        summaries.append(summary)
    return summaries


async def _gemini_merge(chunk_summaries: List[str]) -> str:
    """Merge chunk summaries into one final summary via Gemini."""
    loop = asyncio.get_event_loop()
    merged_input = "\n\n---\n\n".join(
        f"Part {i+1}: {s}" for i, s in enumerate(chunk_summaries)
    )
    return await loop.run_in_executor(
        _executor, _gemini_summarize_chunk, merged_input, True
    )


# ─── Provider: BART ───────────────────────────────────────────────────────────

def _bart_summarize_chunk(text: str) -> str:
    """Summarize a single chunk with BART (synchronous, runs in executor)."""
    pipe = _load_bart()
    words = text.split()
    # BART max input is ~1024 tokens — truncate if needed
    if len(words) > 900:
        text = " ".join(words[:900])

    result = pipe(
        text,
        max_length=settings.SUMMARY_MAX_TOKENS,
        min_length=30,
        do_sample=False,
        truncation=True,
    )
    return result[0]["summary_text"].strip()


def _bart_merge_summaries(chunk_summaries: List[str]) -> str:
    """
    Merge chunk summaries.
    If short enough, pass through BART again; otherwise concatenate intelligently.
    """
    merged = " ".join(chunk_summaries)
    words = merged.split()

    if len(words) <= 900:
        # Run through BART for a clean merge
        pipe = _load_bart()
        result = pipe(
            merged,
            max_length=settings.SUMMARY_MAX_LENGTH,
            min_length=settings.SUMMARY_MIN_LENGTH,
            do_sample=False,
            truncation=True,
        )
        return result[0]["summary_text"].strip()
    else:
        # Too large — stitch with transition phrases
        transitions = [
            "Building on this,", "Furthermore,", "Additionally,",
            "The video also explains that", "In conclusion,",
        ]
        parts = []
        for i, s in enumerate(chunk_summaries):
            if i > 0 and i < len(transitions):
                parts.append(f"{transitions[i]} {s.rstrip('.')}.")
            else:
                parts.append(s)
        return " ".join(parts)


async def _bart_summarize_all(chunks: List[dict]) -> List[str]:
    """Summarize all chunks with BART using thread executor."""
    loop = asyncio.get_event_loop()
    summaries = []
    for i, chunk in enumerate(chunks):
        logger.debug(f"📚 BART summarizing chunk {i+1}/{len(chunks)} ...")
        summary = await loop.run_in_executor(
            _executor, _bart_summarize_chunk, chunk["text"]
        )
        summaries.append(summary)
    return summaries


# ─── Merge + finalise ─────────────────────────────────────────────────────────

def _simple_merge(summaries: List[str]) -> str:
    """Simple concatenation for very few chunks."""
    return " ".join(s.rstrip(".") + "." for s in summaries)


async def _merge_summaries(chunk_summaries: List[str], provider: str) -> str:
    """Merge chunk summaries using appropriate provider."""
    loop = asyncio.get_event_loop()

    if len(chunk_summaries) == 1:
        return chunk_summaries[0]

    if len(chunk_summaries) <= 3:
        return _simple_merge(chunk_summaries)

    # Multi-chunk merge
    if provider == "gemini" and settings.gemini_enabled:
        return await _gemini_merge(chunk_summaries)
    else:
        return await loop.run_in_executor(
            _executor, _bart_merge_summaries, chunk_summaries
        )


# ─── DB helpers ───────────────────────────────────────────────────────────────

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
    t_meta  = TranscriptMetadata(**doc["transcript_metadata"]) if doc.get("transcript_metadata") else None
    p_meta  = PreprocessingMetadata(**doc["preprocessing_metadata"]) if doc.get("preprocessing_metadata") else None
    s_meta  = SummaryMetadata(**doc["summary_metadata"]) if doc.get("summary_metadata") else None
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
        summary=doc.get("summary"),
        summary_metadata=s_meta,
        error_message=doc.get("error_message"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


def _resolve_summaries_dir() -> str:
    base = Path(__file__).resolve().parents[3]
    s_dir = base / "summaries"
    s_dir.mkdir(exist_ok=True)
    return str(s_dir)


def _save_summary_file(video_id: str, summary: str) -> str:
    out_path = os.path.join(_resolve_summaries_dir(), f"{video_id}_summary.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(summary)
    return out_path


# ─── Public API ───────────────────────────────────────────────────────────────

async def summarize_video(
    video_id: str,
    provider: Optional[str] = None,
) -> VideoResponse:
    """
    Main entry point — POST /api/videos/{id}/summarize.

    provider: "gemini" | "bart" | None (auto-detect)
    """
    from fastapi import HTTPException

    db = get_db()
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")

    allowed = {VideoStatus.PREPROCESSED, VideoStatus.SUMMARIZED, VideoStatus.FAILED}
    if doc["status"] not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot summarize: video is in '{doc['status']}' state. "
                   "Text must be preprocessed first.",
        )

    chunks = doc.get("preprocessed_chunks", [])
    if not chunks:
        # Fallback: try raw transcript
        raw = doc.get("cleaned_transcript") or doc.get("transcript", "")
        if not raw:
            raise HTTPException(status_code=422, detail="No preprocessed text found. Run preprocessing first.")
        chunks = [{"index": 0, "text": raw, "word_count": len(raw.split()), "char_count": len(raw)}]

    # ── Determine provider ────────────────────────────────────────────────
    if provider is None:
        provider = settings.SUMMARIZER_PROVIDER
    if provider == "gemini" and not settings.gemini_enabled:
        logger.warning("⚠️  Gemini API key not set — falling back to BART")
        provider = "bart"

    model_name = settings.GEMINI_MODEL if provider == "gemini" else settings.BART_MODEL
    logger.info(
        f"📝 Starting summarization | video_id={video_id} | "
        f"provider={provider} | model={model_name} | chunks={len(chunks)}"
    )

    # ── Set status → SUMMARIZING ──────────────────────────────────────────
    await _update_status(video_id, VideoStatus.SUMMARIZING, {"error_message": None})

    # ── Summarize all chunks ──────────────────────────────────────────────
    try:
        if provider == "gemini":
            chunk_summaries = await _gemini_summarize_all(chunks)
        else:
            chunk_summaries = await _bart_summarize_all(chunks)
    except Exception as exc:
        error_msg = str(exc)[:600]
        logger.error(f"❌ Summarization failed | video_id={video_id} | {error_msg}")
        await _update_status(
            video_id, VideoStatus.FAILED,
            {"error_message": f"Summarization failed: {error_msg}"},
        )
        raise HTTPException(status_code=500, detail=f"Summarization failed: {error_msg}")

    # ── Merge into final summary ──────────────────────────────────────────
    try:
        final_summary = await _merge_summaries(chunk_summaries, provider)
    except Exception as exc:
        error_msg = str(exc)[:400]
        logger.error(f"❌ Summary merge failed | video_id={video_id} | {error_msg}")
        # Fallback: simple join
        final_summary = _simple_merge(chunk_summaries)

    # Clean up: strip leading/trailing whitespace and quotes
    final_summary = final_summary.strip().strip('"')

    # ── Save to disk ──────────────────────────────────────────────────────
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(_executor, _save_summary_file, video_id, final_summary)
    except Exception as e:
        logger.warning(f"⚠️ Could not save summary file (non-fatal): {e}")

    # ── Persist to MongoDB ────────────────────────────────────────────────
    input_words = sum(c.get("word_count", 0) for c in chunks)
    summary_meta = {
        "provider":               provider,
        "model":                  model_name,
        "chunk_count":            len(chunks),
        "chunk_summaries_count":  len(chunk_summaries),
        "input_word_count":       input_words,
        "summary_word_count":     len(final_summary.split()),
        "summary_char_count":     len(final_summary),
        "summarized_at":          datetime.utcnow(),
    }

    await _update_status(
        video_id,
        VideoStatus.SUMMARIZED,
        {
            "summary":          final_summary,
            "chunk_summaries":  chunk_summaries,
            "summary_metadata": summary_meta,
        },
    )

    logger.info(
        f"✅ Summary complete | video_id={video_id} | "
        f"provider={provider} | words={len(final_summary.split())}"
    )

    updated = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    return _doc_to_response(updated)


async def get_summary(video_id: str) -> SummaryResponse:
    """Return the summary + chunk summaries for a video."""
    from fastapi import HTTPException

    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    db = get_db()
    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")

    s_meta = SummaryMetadata(**doc["summary_metadata"]) if doc.get("summary_metadata") else None

    return SummaryResponse(
        video_id=video_id,
        title=doc["title"],
        status=doc["status"],
        summary=doc.get("summary"),
        chunk_summaries=doc.get("chunk_summaries"),
        summary_metadata=s_meta,
    )


async def get_summarization_status(video_id: str) -> dict:
    """Lightweight poll endpoint."""
    from fastapi import HTTPException

    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    db = get_db()
    doc = await db[COLLECTION].find_one(
        {"_id": ObjectId(video_id)},
        {"status": 1, "summary_metadata": 1, "error_message": 1},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")

    return {
        "video_id":         video_id,
        "status":           doc["status"],
        "summarized":       doc["status"] in [VideoStatus.SUMMARIZED, VideoStatus.COMPLETED],
        "summary_metadata": doc.get("summary_metadata"),
        "error_message":    doc.get("error_message"),
    }
