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
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="summarizer")

# ─── Adaptive summarization levels ────────────────────────────────────────────────
SUMMARY_LEVELS = {
    "brief": {
        "label":          "Brief",
        "description":    "3–5 sentence overview of the main ideas",
        "max_length":     120,
        "min_length":     40,
        "num_beams":      2,
        "length_penalty": 0.8,
        "merge_max":      100,
        "merge_min":      40,
    },
    "standard": {
        "label":          "Standard",
        "description":    "Balanced summary capturing key points and flow",
        "max_length":     200,
        "min_length":     80,
        "num_beams":      4,
        "length_penalty": 1.5,
        "merge_max":      180,
        "merge_min":      80,
    },
    "detailed": {
        "label":          "Detailed",
        "description":    "Thorough coverage including examples and explanations",
        "max_length":     350,
        "min_length":     120,
        "num_beams":      4,
        "length_penalty": 2.0,
        "merge_max":      320,
        "merge_min":      120,
    },
    "comprehensive": {
        "label":          "Comprehensive",
        "description":    "Structured: Overview + Key Concepts + Section Summaries + Takeaways",
        "max_length":     400,
        "min_length":     150,
        "num_beams":      4,
        "length_penalty": 2.0,
        "merge_max":      380,
        "merge_min":      150,
    },
}

# ─── BART singleton (model + tokenizer loaded once) ───────────────────────────
_bart_model     = None
_bart_tokenizer = None


def _load_bart():
    """
    Load facebook/bart-large-cnn using BartForConditionalGeneration directly.
    Avoids the transformers pipeline task-registry (which changed in v4.50+).
    Model and tokenizer are cached as module-level singletons.
    """
    global _bart_model, _bart_tokenizer
    if _bart_model is not None:
        return _bart_model, _bart_tokenizer

    logger.info(f"🔄 Loading BART model: {settings.BART_MODEL} ...")
    from transformers import BartForConditionalGeneration, BartTokenizer
    _bart_tokenizer = BartTokenizer.from_pretrained(settings.BART_MODEL)
    _bart_model     = BartForConditionalGeneration.from_pretrained(settings.BART_MODEL)
    _bart_model.eval()   # inference mode — disables dropout
    logger.info("✅ BART model loaded")
    return _bart_model, _bart_tokenizer


# ─── Provider: Gemini ─────────────────────────────────────────────────────────

def _gemini_summarize_chunk(text: str, is_merge: bool = False, use_pro: bool = False) -> str:
    """Call Gemini API for a single chunk or merge pass (synchronous, runs in executor)."""
    import time
    import google.generativeai as genai

    genai.configure(api_key=settings.GOOGLE_GEMINI_API_KEY)
    # Use Pro model for the merge pass on long videos — much better coherence
    model_name = (
        settings.GEMINI_MERGE_MODEL if (is_merge and use_pro)
        else settings.GEMINI_MODEL
    )
    model = genai.GenerativeModel(model_name)

    if is_merge:
        prompt = (
            "You are an expert educational content writer. "
            "The following are individual summaries of sequential parts of a lecture or educational video. "
            "Merge them into ONE coherent, well-structured summary written in clear paragraphs. "
            "Keep it concise but comprehensive. Eliminate redundancy and repetition. "
            "Do NOT use bullet points. Write in flowing academic prose.\n\n"
            f"Summaries to merge:\n{text}\n\nFinal merged summary:"
        )
    else:
        prompt = (
            "You are an expert educational content writer. "
            "Summarize the following transcript excerpt from an educational video. "
            "Be concise, accurate, and capture the key concepts and any important terms or formulas. "
            "Write in clear, flowing paragraphs. Aim for 3-5 sentences.\n\n"
            f"Transcript:\n{text}\n\nSummary:"
        )

    # Exponential-backoff retry for rate-limit / transient errors
    for attempt in range(1, settings.GEMINI_RETRY_ATTEMPTS + 1):
        try:
            response = model.generate_content(prompt)
            return response.text.strip()
        except Exception as exc:
            err = str(exc)
            is_rate_limit = any(code in err for code in ("429", "503", "RESOURCE_EXHAUSTED"))
            if is_rate_limit and attempt < settings.GEMINI_RETRY_ATTEMPTS:
                wait = 2 ** attempt   # 2s, 4s, 8s …
                logger.warning(f"⏳ Gemini rate-limited (attempt {attempt}), retrying in {wait}s …")
                time.sleep(wait)
            else:
                raise


async def _gemini_summarize_all(chunks: list) -> list:
    """
    Summarize all chunks using Gemini — runs up to GEMINI_MAX_CONCURRENT requests in parallel.
    A semaphore gates concurrency to avoid blowing through rate limits.
    """
    loop = asyncio.get_event_loop()
    sem = asyncio.Semaphore(settings.GEMINI_MAX_CONCURRENT)

    async def _bounded(i: int, chunk: dict) -> str:
        async with sem:
            logger.debug(f"🤖 Gemini summarizing chunk {i+1}/{len(chunks)} …")
            return await loop.run_in_executor(
                _executor, _gemini_summarize_chunk, chunk["text"], False, False
            )

    tasks = [_bounded(i, chunk) for i, chunk in enumerate(chunks)]
    return list(await asyncio.gather(*tasks))


async def _gemini_merge(chunk_summaries: list) -> str:
    """Merge chunk summaries into one final summary via Gemini Pro."""
    loop = asyncio.get_event_loop()
    merged_input = "\n\n---\n\n".join(
        f"Part {i+1}: {s}" for i, s in enumerate(chunk_summaries)
    )
    # Use Pro for merge if we have many chunks (long video)
    use_pro = len(chunk_summaries) > 5
    return await loop.run_in_executor(
        _executor, _gemini_summarize_chunk, merged_input, True, use_pro
    )


# ─── Provider: BART ───────────────────────────────────────────────────────────

def _bart_summarize_chunk(text: str, level: str = "standard") -> str:
    """
    Summarize a single chunk using BartForConditionalGeneration.
    Generation parameters adapt to the requested summary_level.
    """
    import torch
    cfg   = SUMMARY_LEVELS.get(level, SUMMARY_LEVELS["standard"])
    model, tokenizer = _load_bart()

    inputs = tokenizer(
        text,
        return_tensors="pt",
        max_length=1024,
        truncation=True,
    )
    with torch.no_grad():
        ids = model.generate(
            inputs["input_ids"],
            max_length=cfg["max_length"],
            min_length=cfg["min_length"],
            num_beams=cfg["num_beams"],
            length_penalty=cfg["length_penalty"],
            early_stopping=True,
            no_repeat_ngram_size=3,
        )
    return tokenizer.decode(ids[0], skip_special_tokens=True).strip()


def _bart_merge_summaries(chunk_summaries: List[str], level: str = "standard") -> str:
    """
    Merge chunk summaries through BART with level-adapted length targets.
    Falls back to transition-phrase stitching when merged text is too long.
    """
    import torch
    cfg    = SUMMARY_LEVELS.get(level, SUMMARY_LEVELS["standard"])
    merged = " ".join(chunk_summaries)
    words  = merged.split()

    if len(words) <= 900:
        model, tokenizer = _load_bart()
        inputs = tokenizer(merged, return_tensors="pt", max_length=1024, truncation=True)
        with torch.no_grad():
            ids = model.generate(
                inputs["input_ids"],
                max_length=cfg["merge_max"],
                min_length=cfg["merge_min"],
                num_beams=cfg["num_beams"],
                length_penalty=cfg["length_penalty"],
                early_stopping=True,
                no_repeat_ngram_size=3,
            )
        return tokenizer.decode(ids[0], skip_special_tokens=True).strip()
    else:
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


async def _bart_summarize_all(chunks: List[dict], level: str = "standard") -> List[str]:
    """
    Summarize all chunks with BART (level-aware) — parallel executor tasks.
    """
    loop = asyncio.get_event_loop()
    sem  = asyncio.Semaphore(settings.BART_WORKERS)

    async def _bounded(i: int, chunk: dict) -> str:
        async with sem:
            logger.debug(f"📚 BART summarizing chunk {i+1}/{len(chunks)} [{level}] …")
            return await loop.run_in_executor(
                _executor, _bart_summarize_chunk, chunk["text"], level
            )

    tasks = [_bounded(i, chunk) for i, chunk in enumerate(chunks)]
    return list(await asyncio.gather(*tasks))


# ─── Merge + finalise ─────────────────────────────────────────────────────────

def _simple_merge(summaries: List[str]) -> str:
    """Simple concatenation for very few chunks."""
    return " ".join(s.rstrip(".") + "." for s in summaries)


async def _merge_summaries(chunk_summaries: List[str], provider: str, level: str = "standard") -> str:
    """Merge chunk summaries using appropriate provider and level."""
    loop = asyncio.get_event_loop()

    if len(chunk_summaries) == 1:
        return chunk_summaries[0]

    if len(chunk_summaries) <= 3 and level == "brief":
        return _simple_merge(chunk_summaries)

    # Multi-chunk or non-brief: use model merge
    if provider == "gemini" and settings.gemini_enabled:
        return await _gemini_merge(chunk_summaries)
    else:
        return await loop.run_in_executor(
            _executor, _bart_merge_summaries, chunk_summaries, level
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
    summary_level: str = "standard",
) -> VideoResponse:
    """
    Main entry point — POST /api/videos/{id}/summarize.

    provider:      "gemini" | "bart" | None (auto-detect from settings)
    summary_level: "brief" | "standard" | "detailed" | "comprehensive"
    """
    from fastapi import HTTPException

    # Validate level
    if summary_level not in SUMMARY_LEVELS:
        summary_level = "standard"

    level_cfg = SUMMARY_LEVELS[summary_level]

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
        raw = doc.get("cleaned_transcript") or doc.get("transcript", "")
        if not raw:
            raise HTTPException(status_code=422, detail="No preprocessed text found.")
        chunks = [{"index": 0, "text": raw, "word_count": len(raw.split()), "char_count": len(raw)}]

    # ── Provider resolution ─────────────────────────────────────────────────────────
    if provider is None:
        provider = settings.SUMMARIZER_PROVIDER
    if provider == "gemini" and not settings.gemini_enabled:
        logger.warning("⚠️  Gemini API key not set — falling back to BART")
        provider = "bart"

    model_name = settings.GEMINI_MODEL if provider == "gemini" else settings.BART_MODEL
    logger.info(
        f"📝 Summarizing | video_id={video_id} | provider={provider} | "
        f"level={summary_level} | chunks={len(chunks)}"
    )

    await _update_status(video_id, VideoStatus.SUMMARIZING, {"error_message": None})

    # ── Chunk-level summarization ────────────────────────────────────────────────────
    try:
        if provider == "gemini":
            chunk_summaries = await _gemini_summarize_all(chunks)
        else:
            chunk_summaries = await _bart_summarize_all(chunks, level=summary_level)
    except Exception as exc:
        error_msg = str(exc)[:600]
        logger.error(f"❌ Summarization failed | {error_msg}")
        await _update_status(video_id, VideoStatus.FAILED,
                             {"error_message": f"Summarization failed: {error_msg}"})
        raise HTTPException(status_code=500, detail=f"Summarization failed: {error_msg}")

    # ── Merge ─────────────────────────────────────────────────────────────────
    try:
        merged = await _merge_summaries(chunk_summaries, provider, level=summary_level)
    except Exception as exc:
        logger.error(f"❌ Merge failed: {exc} — using simple join")
        merged = _simple_merge(chunk_summaries)

    merged = merged.strip().strip('"')

    # ── Comprehensive: build structured sections ────────────────────────────────
    structured_sections = None
    if summary_level == "comprehensive":
        structured_sections = _build_comprehensive_sections(merged, chunk_summaries, chunks)
        final_summary = structured_sections["full_text"]
    else:
        final_summary = merged

    # ── Save + persist ────────────────────────────────────────────────────────────
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(_executor, _save_summary_file, video_id, final_summary)
    except Exception as e:
        logger.warning(f"⚠️ Could not save summary file: {e}")

    input_words  = sum(c.get("word_count", 0) for c in chunks)
    summary_meta = {
        "provider":              provider,
        "model":                 model_name,
        "summary_level":         summary_level,
        "summary_level_label":   level_cfg["label"],
        "chunk_count":           len(chunks),
        "chunk_summaries_count": len(chunk_summaries),
        "input_word_count":      input_words,
        "summary_word_count":    len(final_summary.split()),
        "summary_char_count":    len(final_summary),
        "summarized_at":         datetime.utcnow(),
    }

    update_payload = {
        "summary":           final_summary,
        "chunk_summaries":   chunk_summaries,
        "summary_metadata":  summary_meta,
    }
    if structured_sections:
        update_payload["structured_summary"] = structured_sections

    await _update_status(video_id, VideoStatus.SUMMARIZED, update_payload)

    logger.info(
        f"✅ Summary done | video_id={video_id} | level={summary_level} | "
        f"provider={provider} | words={len(final_summary.split())}"
    )

    updated = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    return _doc_to_response(updated)


def _build_comprehensive_sections(merged: str, chunk_summaries: List[str], chunks: List[dict]) -> dict:
    """
    Build structured sections for Comprehensive level.
    Returns a dict with: overview, key_concepts, section_summaries, takeaways, full_text
    """
    # Overview = the merged summary
    overview = merged

    # Key concepts: extract noun phrases / capitalized multi-word terms
    import re
    all_text = " ".join(c.get("text", "") for c in chunks)
    # Simple heuristic: find capitalized sequences (likely proper nouns / technical terms)
    concept_re = re.compile(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\b')
    seen, concepts = set(), []
    for m in concept_re.finditer(all_text[:8000]):
        term = m.group(1)
        if term.lower() not in seen and len(term) > 5:
            seen.add(term.lower())
            concepts.append(term)
            if len(concepts) >= 10:
                break

    # Section summaries: the per-chunk summaries, numbered
    section_summaries = [
        {"section": i + 1, "summary": s}
        for i, s in enumerate(chunk_summaries)
    ]

    # Takeaways: last 2 sentences of merged summary
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', merged) if s.strip()]
    takeaways = sentences[-3:] if len(sentences) >= 3 else sentences

    # Full text (used as the stored summary)
    concept_block = ", ".join(concepts) if concepts else "See transcript for details."
    section_block = "\n".join(
        f"  [{s['section']}] {s['summary']}" for s in section_summaries
    )
    takeaway_block = "\n".join(f"  • {t}" for t in takeaways)

    full_text = (
        f"OVERVIEW\n{'─'*60}\n{overview}\n\n"
        f"KEY CONCEPTS\n{'─'*60}\n{concept_block}\n\n"
        f"SECTION SUMMARIES\n{'─'*60}\n{section_block}\n\n"
        f"TAKEAWAYS\n{'─'*60}\n{takeaway_block}"
    )

    return {
        "overview":          overview,
        "key_concepts":      concepts,
        "section_summaries": section_summaries,
        "takeaways":         takeaways,
        "full_text":         full_text,
    }


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
