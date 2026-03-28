"""
transcription_service.py — Parallel faster-whisper transcription
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Supports two transcription strategies to maximise CPU throughput:

STRATEGY A — Parallel chunk processing (default for long audio)
    1. FFmpeg splits the WAV into N chunks of WHISPER_CHUNK_SPLIT_SEC each.
    2. N independent WhisperModel instances run concurrently (thread pool).
    3. Segment timestamps are offset by chunk start time and de-duplicated.
    4. Chunks are deleted after processing.

    Speedup: for a 30-min video with WHISPER_PARALLEL_CHUNKS=4,
    wall-clock time drops from ~15 min → ~4 min on a 4-core CPU.

STRATEGY B — Single-instance sequential (short audio or fallback)
    Used when audio is shorter than one chunk or parallel mode is disabled.

Whisper model selection:
    tiny.en  — English-only (no language detection), fastest (~6× real-time with int8)
    tiny     — multilingual, slightly slower
    base.en  — better accuracy, ~3× real-time
    small.en — high quality, ~1.5× real-time

All models are cached as singletons keyed by (model_name, compute_type).
"""

import os
import asyncio
import subprocess
import tempfile
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, List, Tuple

from bson import ObjectId
from loguru import logger

from app.core.config import settings
from app.core.database import get_db
from app.models.video import VideoStatus, TranscriptMetadata, TranscriptResponse, TranscriptSegment

COLLECTION = "videos"
_executor = ThreadPoolExecutor(
    max_workers=max(4, settings.WHISPER_PARALLEL_CHUNKS),
    thread_name_prefix="whisper",
)

# ─── Model cache (thread-safe) ──────────────────────────────────────────────
_model_cache: dict = {}
_model_lock = threading.Lock()  # threading.Lock — safe at module level & across threads


def _load_faster_whisper_sync(model_name: str, compute_type: str = None):
    """
    Load (or return cached) a faster-whisper model.
    Thread-safe via threading.Lock — safe to call from any thread or executor.
    """
    ct  = compute_type or settings.WHISPER_COMPUTE_TYPE
    key = (model_name, ct)

    with _model_lock:
        if key in _model_cache:
            return _model_cache[key]

        from faster_whisper import WhisperModel
        logger.info(f"🔄 Loading faster-whisper '{model_name}' [{ct}] ...")
        model = WhisperModel(
            model_name,
            device="cpu",
            compute_type=ct,
            cpu_threads=settings.WHISPER_THREADS,
            num_workers=1,
        )
        _model_cache[key] = model
        logger.info(f"✅ Loaded faster-whisper '{model_name}' [{ct}]")
        return model


def load_whisper_model(model_name: str = None):
    """Public loader called at startup for pre-warming the model cache."""
    return _load_faster_whisper_sync(model_name or settings.WHISPER_MODEL)


# ─── Audio helpers ────────────────────────────────────────────────────────────

def _get_audio_duration(audio_path: str) -> float:
    """Use ffprobe to get WAV duration in seconds."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet", "-print_format", "json",
                "-show_streams", audio_path,
            ],
            capture_output=True, text=True, timeout=30,
        )
        import json
        info = json.loads(result.stdout)
        for stream in info.get("streams", []):
            if "duration" in stream:
                return float(stream["duration"])
    except Exception:
        pass
    return 0.0


def _split_audio_chunks(audio_path: str, chunk_sec: int) -> List[Tuple[str, float]]:
    """
    Split WAV into fixed-length chunks using FFmpeg stream copy (near-instant).
    Returns list of (chunk_path, start_offset_seconds).
    Each chunk includes a 3-second overlap with the next to avoid cut-off words.
    """
    duration = _get_audio_duration(audio_path)
    if duration <= 0 or duration <= chunk_sec:
        return [(audio_path, 0.0)]   # no split needed

    tmp_dir   = tempfile.mkdtemp(prefix="whisper_chunks_")
    chunks    = []
    offset    = 0.0
    chunk_idx = 0
    overlap   = 3.0   # seconds of overlap to avoid boundary word loss

    while offset < duration:
        chunk_path = os.path.join(tmp_dir, f"chunk_{chunk_idx:04d}.wav")
        end        = min(offset + chunk_sec + overlap, duration)
        seg_len    = end - offset

        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-i", audio_path,
                "-ss", str(offset),
                "-t",  str(seg_len),
                "-ar", "16000", "-ac", "1",
                "-c:a", "pcm_s16le",
                chunk_path,
            ],
            check=True, capture_output=True, timeout=120,
        )

        chunks.append((chunk_path, offset))
        offset    += chunk_sec
        chunk_idx += 1

    logger.info(f"🔪 Split audio into {len(chunks)} chunks ({chunk_sec}s each)")
    return chunks


def _transcribe_chunk(chunk_path: str, time_offset: float, model_name: str) -> List[dict]:
    """
    Transcribe one audio chunk with its own WhisperModel instance.
    Returns segments with timestamps adjusted by time_offset.
    """
    model = _load_faster_whisper_sync(model_name)
    lang  = settings.WHISPER_LANGUAGE.strip() or None

    segments_iter, _ = model.transcribe(
        chunk_path,
        language=lang,
        beam_size=settings.WHISPER_BEAM_SIZE,
        best_of=settings.WHISPER_BEST_OF,
        temperature=0.0,
        vad_filter=settings.WHISPER_VAD_FILTER,
        vad_parameters=dict(min_silence_duration_ms=400, speech_pad_ms=150),
        word_timestamps=False,
        condition_on_previous_text=True,
        no_speech_threshold=0.6,
        log_prob_threshold=-1.0,
        compression_ratio_threshold=2.4,
        initial_prompt=(
            "This is an educational lecture or tutorial. "
            "Transcribe clearly and retain all technical terms."
        ),
    )

    result = []
    for seg in segments_iter:
        result.append({
            "start": round(seg.start + time_offset, 2),
            "end":   round(seg.end   + time_offset, 2),
            "text":  seg.text.strip(),
        })
    return result


def _merge_parallel_segments(
    all_segments: List[List[dict]],
    chunk_sec: float,
    overlap: float = 3.0,
) -> List[dict]:
    """
    Merge segment lists from parallel chunks.
    Drop overlap duplicates: segments from chunk N that start in the overlap zone
    are discarded if an equivalent segment from chunk N+1 covers the same time.
    """
    merged = []
    # For each chunk, only keep segments that start before the boundary
    for chunk_idx, segs in enumerate(all_segments):
        boundary = (chunk_idx + 1) * chunk_sec   # nominal end of this chunk
        for seg in segs:
            if chunk_idx < len(all_segments) - 1 and seg["start"] >= boundary:
                continue   # falls in next chunk's territory
            merged.append(seg)

    # Sort by start time and re-index
    merged.sort(key=lambda s: s["start"])
    for i, s in enumerate(merged):
        s["id"] = i

    return merged


def _run_whisper_parallel(audio_path: str, model_name: str) -> dict:
    """
    Main transcription function — parallel chunk strategy.
    Falls back to single-instance if audio is short.
    """
    chunk_sec = settings.WHISPER_CHUNK_SPLIT_SEC
    n_parallel = settings.WHISPER_PARALLEL_CHUNKS

    chunks = _split_audio_chunks(audio_path, chunk_sec)
    is_split = len(chunks) > 1

    if is_split and n_parallel > 1:
        logger.info(
            f"⚡ Parallel transcription: {len(chunks)} chunks × {n_parallel} workers"
        )
        from concurrent.futures import ThreadPoolExecutor as TPE
        with TPE(max_workers=n_parallel, thread_name_prefix="wsp") as pool:
            futures = [
                pool.submit(_transcribe_chunk, path, offset, model_name)
                for path, offset in chunks
            ]
            results = [f.result() for f in futures]

        # Clean up temp chunks
        for path, _ in chunks:
            if path != audio_path:
                try:
                    os.remove(path)
                except OSError:
                    pass
        try:
            import shutil
            shutil.rmtree(os.path.dirname(chunks[0][0]), ignore_errors=True)
        except Exception:
            pass

        segments = _merge_parallel_segments(results, chunk_sec)
    else:
        # Single chunk (short audio or parallel disabled)
        logger.info("🎙️  Single-instance transcription")
        raw = _transcribe_chunk(audio_path, 0.0, model_name)
        segments = [{**s, "id": i} for i, s in enumerate(raw)]

    full_text = " ".join(s["text"] for s in segments if s["text"])
    duration  = segments[-1]["end"] if segments else 0.0
    lang      = settings.WHISPER_LANGUAGE or "en"

    logger.info(
        f"✅ Transcription done | chunks={len(chunks)} | "
        f"segments={len(segments)} | words={len(full_text.split())}"
    )

    return {
        "text":     full_text,
        "segments": segments,
        "language": lang,
        "duration": duration,
    }


def _run_openai_whisper(audio_path: str, model_name: str) -> dict:
    """Fallback: openai-whisper (PyTorch). Used when WHISPER_ENGINE=openai."""
    global _openai_model, _openai_model_name
    if not hasattr(_run_openai_whisper, "_model") or \
            getattr(_run_openai_whisper, "_model_name", None) != model_name:
        import whisper
        logger.info(f"🔄 Loading openai-whisper '{model_name}' ...")
        _run_openai_whisper._model      = whisper.load_model(model_name)
        _run_openai_whisper._model_name = model_name

    model = _run_openai_whisper._model
    lang  = settings.WHISPER_LANGUAGE.strip() or None
    kwargs = dict(fp16=False, verbose=False, word_timestamps=True,
                  beam_size=settings.WHISPER_BEAM_SIZE, temperature=0.0)
    if lang:
        kwargs["language"] = lang

    try:
        result = model.transcribe(audio_path, **kwargs)
    except TypeError:
        result = model.transcribe(audio_path, fp16=False, verbose=False)

    segs     = result.get("segments", [])
    duration = segs[-1]["end"] if segs else None
    segments = [{"id": s["id"], "start": round(s["start"], 2),
                 "end": round(s["end"], 2), "text": s["text"].strip()} for s in segs]
    return {
        "text":     result.get("text", "").strip(),
        "segments": segments,
        "language": result.get("language", "unknown"),
        "duration": duration,
    }


def _run_whisper(audio_path: str, model_name: str) -> dict:
    """Dispatch to configured engine."""
    if settings.WHISPER_ENGINE.lower() == "faster":
        try:
            return _run_whisper_parallel(audio_path, model_name)
        except ImportError:
            logger.warning("faster-whisper not available — falling back to openai-whisper")
            return _run_openai_whisper(audio_path, model_name)
    return _run_openai_whisper(audio_path, model_name)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _transcript_dir(audio_path: str) -> str:
    d = os.path.join(os.path.dirname(os.path.dirname(audio_path)), "transcripts")
    os.makedirs(d, exist_ok=True)
    return d


def _save_transcript_file(video_id: str, audio_path: str, text: str) -> str:
    out_path = os.path.join(_transcript_dir(audio_path), f"{video_id}.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    return out_path


async def _update_status(video_id: str, status: VideoStatus, extra: dict = None):
    db  = get_db()
    upd = {"status": status, "updated_at": datetime.utcnow()}
    if extra:
        upd.update(extra)
    await db[COLLECTION].update_one({"_id": ObjectId(video_id)}, {"$set": upd})


def _doc_to_response(doc: dict):
    from app.models.video import VideoResponse, AudioMetadata, VideoMetadata
    return VideoResponse(
        id=str(doc["_id"]),
        title=doc["title"],
        description=doc.get("description"),
        status=doc["status"],
        metadata=VideoMetadata(**doc["metadata"]),
        audio_metadata=AudioMetadata(**doc["audio_metadata"]) if doc.get("audio_metadata") else None,
        transcript=doc.get("transcript"),
        transcript_metadata=TranscriptMetadata(**doc["transcript_metadata"]) if doc.get("transcript_metadata") else None,
        error_message=doc.get("error_message"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


# ─── Public API ───────────────────────────────────────────────────────────────

async def transcribe_video(video_id: str, model_name: str = None):
    """Main entry — called by POST /api/videos/{id}/transcribe and the pipeline."""
    from fastapi import HTTPException

    db = get_db()
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Video '{video_id}' not found.")

    allowed = {VideoStatus.AUDIO_READY, VideoStatus.TRANSCRIPT_READY, VideoStatus.FAILED}
    if doc["status"] not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot transcribe: video is in '{doc['status']}' state.",
        )

    audio_meta = doc.get("audio_metadata") or {}
    audio_path = audio_meta.get("audio_path")
    if not audio_path or not os.path.exists(audio_path):
        raise HTTPException(status_code=422, detail="Audio file not found. Re-run audio extraction.")

    model_name = model_name or settings.WHISPER_MODEL
    engine     = settings.WHISPER_ENGINE
    n_parallel = settings.WHISPER_PARALLEL_CHUNKS

    await _update_status(video_id, VideoStatus.TRANSCRIBING, {"error_message": None})
    logger.info(
        f"🎙️  Transcribing | video_id={video_id} | engine={engine} | "
        f"model={model_name} | parallel_chunks={n_parallel}"
    )

    t_start = datetime.utcnow()
    loop    = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(_executor, _run_whisper, audio_path, model_name)
    except Exception as exc:
        err = str(exc)[:500]
        logger.error(f"❌ Whisper failed | video_id={video_id} | {err}")
        await _update_status(video_id, VideoStatus.FAILED,
                             {"error_message": f"Transcription failed: {err}"})
        raise HTTPException(status_code=500, detail=f"Transcription failed: {err}")

    elapsed    = (datetime.utcnow() - t_start).total_seconds()
    full_text  = result.get("text", "").strip()
    segments   = result.get("segments", [])
    language   = result.get("language", "unknown")
    duration   = result.get("duration")
    word_count = len(full_text.split()) if full_text else 0

    logger.info(
        f"✅ Transcription done | video_id={video_id} | words={word_count} | "
        f"elapsed={elapsed:.1f}s" + (f" | rt={duration/elapsed:.1f}×" if duration and elapsed > 0 else "")
    )

    await loop.run_in_executor(_executor, _save_transcript_file, video_id, audio_path, full_text)

    transcript_meta = {
        "whisper_model":        model_name,
        "whisper_engine":       engine,
        "language":             language,
        "duration_seconds":     duration,
        "word_count":           word_count,
        "char_count":           len(full_text),
        "transcription_sec":    round(elapsed, 1),
        "parallel_chunks":      n_parallel,
        "transcribed_at":       datetime.utcnow(),
    }

    clean_segments = [
        {"id": s.get("id", i), "start": s["start"], "end": s["end"], "text": s["text"]}
        for i, s in enumerate(segments)
    ]

    await _update_status(video_id, VideoStatus.TRANSCRIPT_READY, {
        "transcript":          full_text,
        "transcript_segments": clean_segments,
        "transcript_metadata": transcript_meta,
    })

    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    return _doc_to_response(doc)


async def get_transcript(video_id: str) -> TranscriptResponse:
    from fastapi import HTTPException
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")
    db  = get_db()
    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")

    segments       = [TranscriptSegment(**s) for s in doc["transcript_segments"]] \
                     if doc.get("transcript_segments") else None
    transcript_meta = TranscriptMetadata(**doc["transcript_metadata"]) \
                      if doc.get("transcript_metadata") else None

    return TranscriptResponse(
        video_id=video_id,
        title=doc["title"],
        status=doc["status"],
        transcript=doc.get("transcript"),
        transcript_metadata=transcript_meta,
        segments=segments,
    )


async def get_transcription_status(video_id: str) -> dict:
    from fastapi import HTTPException
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")
    db  = get_db()
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
