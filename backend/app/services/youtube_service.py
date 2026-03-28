"""
youtube_service.py
~~~~~~~~~~~~~~~~~~
Two-path YouTube processing — optimised for speed:

PATH A  ─ Direct caption extraction  (< 2 seconds for any length video)
    Uses youtube-transcript-api to pull YouTube's own captions/auto-subtitles.
    No download, no Whisper, no FFmpeg.
    Pipeline: fetch captions → preprocess → PREPROCESSED (ready for user to summarize)

PATH B  ─ yt-dlp + Whisper  (fallback when captions are unavailable)
    Downloads audio only (16 kHz mono WAV) and runs faster-whisper.
    Pipeline: download audio → AUDIO_READY → transcribe → preprocess → PREPROCESSED

Path A is tried first unless YOUTUBE_PREFER_CAPTIONS=false in .env.
If Path A fails (no captions, geo-blocked, age-restricted) it falls through to Path B automatically.

Supported YouTube URL formats:
  https://youtube.com/watch?v=VIDEO_ID
  https://youtu.be/VIDEO_ID
  https://youtube.com/shorts/VIDEO_ID
  https://music.youtube.com/watch?v=VIDEO_ID
"""

import os
import re
import asyncio
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from bson import ObjectId
from loguru import logger

from app.core.config import settings
from app.core.database import get_db
from app.models.video import VideoStatus
from app.utils.file_utils import get_upload_dir

COLLECTION = "videos"
_executor  = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ytdlp")

# ─── URL helpers ──────────────────────────────────────────────────────────────

_YT_PATTERNS = (
    "youtube.com/watch",
    "youtu.be/",
    "youtube.com/shorts/",
    "youtube.com/embed/",
    "music.youtube.com/watch",
)

_YT_ID_RE = re.compile(r"(?:v=|youtu\.be/|shorts/|embed/)([a-zA-Z0-9_-]{11})")


def _is_youtube_url(url: str) -> bool:
    return any(p in url.lower() for p in _YT_PATTERNS)


def _extract_video_id(url: str) -> Optional[str]:
    m = _YT_ID_RE.search(url)
    return m.group(1) if m else None


def _get_audio_dir() -> str:
    base = get_upload_dir()
    d = os.path.join(os.path.dirname(base), "audio")
    os.makedirs(d, exist_ok=True)
    return d


# ─── Path A: Direct caption extraction ───────────────────────────────────────

def _fetch_captions(video_id: str) -> Optional[dict]:
    """
    Fetch YouTube's native captions via youtube-transcript-api.
    Returns { text (full), segments [{start, end, text}] } or None if unavailable.

    Priority order:
      1. Manual captions in YOUTUBE_CAPTION_LANG (default "en")
      2. Auto-generated captions in YOUTUBE_CAPTION_LANG
      3. Any manual captions in any language (translated to YOUTUBE_CAPTION_LANG)
      4. Any auto-generated captions in any language
    """
    from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound

    preferred_lang = settings.YOUTUBE_CAPTION_LANG or "en"

    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
    except TranscriptsDisabled:
        logger.info(f"📋 Captions disabled for {video_id}")
        return None
    except Exception as exc:
        logger.warning(f"⚠️  Caption list fetch failed for {video_id}: {exc}")
        return None

    transcript = None

    # Try preferred language (manual first, then auto-generated)
    try:
        transcript = transcript_list.find_manually_created_transcript([preferred_lang])
        logger.info(f"✅ Found manual {preferred_lang} captions for {video_id}")
    except NoTranscriptFound:
        pass

    if transcript is None:
        try:
            transcript = transcript_list.find_generated_transcript([preferred_lang])
            logger.info(f"✅ Found auto-generated {preferred_lang} captions for {video_id}")
        except NoTranscriptFound:
            pass

    # Fallback: any available language
    if transcript is None:
        try:
            all_transcripts = list(transcript_list)
            if all_transcripts:
                transcript = all_transcripts[0]
                logger.info(
                    f"⚠️  No {preferred_lang} captions — using {transcript.language} ({video_id})"
                )
        except Exception:
            pass

    if transcript is None:
        return None

    try:
        entries = transcript.fetch()
    except Exception as exc:
        logger.warning(f"⚠️  Caption fetch failed: {exc}")
        return None

    # Build timed segments + flat text
    segments = []
    parts    = []
    for i, e in enumerate(entries):
        text  = e.get("text", "").strip().replace("\n", " ")
        start = round(float(e.get("start", 0)), 2)
        dur   = float(e.get("duration", 0))
        end   = round(start + dur, 2)
        if text:
            segments.append({"id": i, "start": start, "end": end, "text": text})
            parts.append(text)

    full_text = " ".join(parts)
    if not full_text.strip():
        return None

    duration = segments[-1]["end"] if segments else None

    return {
        "text":     full_text,
        "segments": segments,
        "language": preferred_lang,
        "duration": duration,
        "source":   "youtube_captions",
    }


# ─── Path B: yt-dlp audio download ───────────────────────────────────────────

def _fetch_metadata(url: str) -> dict:
    """Fetch video metadata without downloading any media."""
    import yt_dlp
    ydl_opts = {
        "quiet": True, "no_warnings": True,
        "skip_download": True, "socket_timeout": 30,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
    return {
        "title":       info.get("title", "YouTube Video"),
        "duration":    info.get("duration"),
        "uploader":    info.get("uploader", ""),
        "thumbnail":   info.get("thumbnail", ""),
        "video_id":    info.get("id", ""),
        "webpage_url": info.get("webpage_url", url),
        "description": (info.get("description") or "")[:500],
    }


def _download_audio(url: str, out_path: str) -> str:
    """Download best-quality audio as 16 kHz mono WAV."""
    import yt_dlp
    out_template = out_path.replace(".wav", "")
    ydl_opts = {
        "format":     "bestaudio/best",
        "outtmpl":    out_template + ".%(ext)s",
        "quiet":      True,
        "no_warnings": True,
        "socket_timeout": 60,
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "wav"}],
        "postprocessor_args": {
            "FFmpegExtractAudio": ["-ar", "16000", "-ac", "1"],
        },
        "prefer_ffmpeg": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    final = out_template + ".wav"
    if not os.path.exists(final):
        raise RuntimeError(f"yt-dlp completed but WAV not found at {final}")
    logger.info(f"✅ YouTube audio downloaded → {final}")
    return final


# ─── DB helpers ───────────────────────────────────────────────────────────────

async def _set_status(video_id: str, status: str, extra: dict = None):
    db  = get_db()
    upd = {"status": status, "updated_at": datetime.utcnow()}
    if extra:
        upd.update(extra)
    await db[COLLECTION].update_one({"_id": ObjectId(video_id)}, {"$set": upd})


# ─── Public API ───────────────────────────────────────────────────────────────

async def import_youtube_video(
    url: str,
    title_override: Optional[str] = None,
    description_override: Optional[str] = None,
    user_id: str | None = None,
) -> dict:
    """
    Entry point for POST /api/videos/import-youtube.
    Validates URL, fetches metadata (fast), creates DB record,
    launches background processing, and returns immediately.
    """
    from fastapi import HTTPException

    url = url.strip()
    if not _is_youtube_url(url):
        raise HTTPException(
            status_code=400,
            detail="Not a recognised YouTube URL. Supported: youtube.com/watch, youtu.be/, youtube.com/shorts/",
        )

    video_id_yt = _extract_video_id(url)
    loop = asyncio.get_event_loop()

    # Lightweight metadata fetch (no download)
    logger.info(f"🔍 Fetching YouTube metadata: {url}")
    try:
        meta = await loop.run_in_executor(_executor, _fetch_metadata, url)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not fetch video metadata: {str(exc)[:300]}",
        )

    title       = title_override or meta["title"]
    description = description_override or meta.get("description", "")

    db  = get_db()
    doc = {
        "title":       title,
        "description": description,
        "status":      VideoStatus.UPLOADED,
        "metadata": {
            "original_filename": f"{meta.get('video_id', video_id_yt)}.youtube",
            "file_size_bytes":   0,
            "file_extension":    "youtube",
            "content_type":      "video/youtube",
            "source":            "youtube",
            "youtube_url":       meta.get("webpage_url", url),
            "youtube_id":        meta.get("video_id", video_id_yt),
            "uploader":          meta.get("uploader", ""),
            "thumbnail":         meta.get("thumbnail", ""),
            "duration_seconds":  meta.get("duration"),
        },
        "storage_path":   None,
        "transcript":     None,
        "summary":        None,
        "user_id":        user_id,
        "created_at":     datetime.utcnow(),
        "updated_at":     datetime.utcnow(),
    }

    result   = await db[COLLECTION].insert_one(doc)
    video_id = str(result.inserted_id)
    logger.info(f"📝 YouTube record created | video_id={video_id} | title={title!r}")

    # Fire background task
    asyncio.create_task(_process_youtube(video_id, url, video_id_yt, meta))

    return {
        "id":          video_id,
        "title":       title,
        "status":      VideoStatus.UPLOADED,
        "youtube_url": meta.get("webpage_url", url),
        "thumbnail":   meta.get("thumbnail", ""),
        "duration":    meta.get("duration"),
        "uploader":    meta.get("uploader", ""),
        "created_at":  datetime.utcnow().isoformat(),
    }


async def _process_youtube(video_id: str, url: str, video_id_yt: Optional[str], meta: dict):
    """
    Background pipeline. Tries Path A first (captions), falls back to Path B (download).
    Either way ends at PREPROCESSED so the user can review transcript and trigger summarization.
    """
    from app.services import preprocessing_service, transcription_service

    db   = get_db()
    loop = asyncio.get_event_loop()

    # ── Path A: Direct caption extraction ─────────────────────────────────────
    if settings.YOUTUBE_PREFER_CAPTIONS and video_id_yt:
        logger.info(f"⚡ Path A: fetching captions directly | video_id={video_id} | yt_id={video_id_yt}")
        try:
            caption_data = await loop.run_in_executor(
                _executor, _fetch_captions, video_id_yt
            )
        except Exception as exc:
            logger.warning(f"⚠️  Caption fetch error: {exc} — falling back to Path B")
            caption_data = None

        if caption_data:
            # Captions found — write directly to DB, skip audio & Whisper entirely
            word_count = len(caption_data["text"].split())
            char_count = len(caption_data["text"])

            transcript_meta = {
                "whisper_model":        "youtube_captions",
                "whisper_engine":       "youtube_captions",
                "language":             caption_data["language"],
                "language_probability": 1.0,
                "duration_seconds":     caption_data.get("duration"),
                "word_count":           word_count,
                "char_count":           char_count,
                "transcribed_at":       datetime.utcnow(),
                "source":               "youtube_captions",
            }

            clean_segments = [
                {"id": s["id"], "start": s["start"], "end": s["end"], "text": s["text"]}
                for s in caption_data["segments"]
            ]

            await _set_status(video_id, VideoStatus.TRANSCRIPT_READY, {
                "transcript":          caption_data["text"],
                "transcript_segments": clean_segments,
                "transcript_metadata": transcript_meta,
                # Also mark audio as skipped
                "audio_metadata": {
                    "audio_path":       None,
                    "source":           "youtube_captions_skip",
                    "duration_seconds": caption_data.get("duration"),
                    "extracted_at":     datetime.utcnow(),
                },
            })

            logger.info(
                f"✅ Path A complete | video_id={video_id} | "
                f"words={word_count} | duration={caption_data.get('duration')}s"
            )

            # Preprocessing
            try:
                await preprocessing_service.preprocess_transcript(video_id)
                logger.info(f"✅ Preprocessing done | video_id={video_id}")
            except Exception as exc:
                logger.error(f"❌ Preprocessing failed | {exc}")
                await _set_status(video_id, VideoStatus.FAILED, {
                    "error_message": f"Preprocessing failed: {str(exc)[:300]}"
                })
            return  # Path A done — user will trigger summarization

        else:
            logger.info(f"⚠️  No captions for {video_id_yt} — switching to Path B (yt-dlp + Whisper)")

    # ── Path B: yt-dlp download + Whisper transcription ───────────────────────
    audio_dir = _get_audio_dir()
    out_path  = os.path.join(audio_dir, f"{video_id}.wav")

    try:
        await _set_status(video_id, VideoStatus.EXTRACTING_AUDIO)
        logger.info(f"⬇️  Path B: downloading audio | video_id={video_id}")

        wav_path = await loop.run_in_executor(_executor, _download_audio, url, out_path)
        file_size = os.path.getsize(wav_path)

        await _set_status(video_id, VideoStatus.AUDIO_READY, {
            "audio_metadata": {
                "audio_path":        wav_path,
                "audio_format":      "wav",
                "sample_rate":       16000,
                "channels":          1,
                "duration_seconds":  meta.get("duration"),
                "file_size_bytes":   file_size,
                "extracted_at":      datetime.utcnow(),
                "source":            "youtube_yt_dlp",
            },
        })
        logger.info(f"✅ Audio ready | video_id={video_id} | {file_size/1024/1024:.1f} MB")

        await transcription_service.transcribe_video(video_id)
        await preprocessing_service.preprocess_transcript(video_id)

        logger.info(f"✅ Path B complete | video_id={video_id}")

    except Exception as exc:
        error_msg = str(exc)[:500]
        logger.error(f"❌ Path B failed | video_id={video_id} | {error_msg}")
        await _set_status(video_id, VideoStatus.FAILED, {
            "error_message": f"YouTube import failed: {error_msg}"
        })
