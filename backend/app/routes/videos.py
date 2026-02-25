from fastapi import APIRouter, UploadFile, File, Form, Query, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional

from app.models.video import VideoResponse, VideoListResponse, TranscriptResponse, PreprocessingResponse
from app.services import video_service, audio_service, transcription_service, preprocessing_service

router = APIRouter()


# ─── Upload ───────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=VideoResponse, status_code=201, summary="Upload a video file")
async def upload_video(
    file: UploadFile = File(...),
    title: str = Form(..., min_length=1, max_length=200),
    description: Optional[str] = Form(None, max_length=1000),
):
    return await video_service.upload_video(file, title, description)


# ─── List & Get ───────────────────────────────────────────────────────────────

@router.get("/", response_model=VideoListResponse, summary="List all videos")
async def list_videos(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    return await video_service.get_all_videos(page=page, page_size=page_size)


@router.get("/{video_id}", response_model=VideoResponse, summary="Get video details")
async def get_video(video_id: str):
    return await video_service.get_video_by_id(video_id)


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/{video_id}", summary="Delete a video")
async def delete_video(video_id: str):
    result = await video_service.delete_video(video_id)
    return JSONResponse(content=result)


# ─── Audio Extraction (Phase 3) ───────────────────────────────────────────────

@router.post(
    "/{video_id}/extract-audio",
    response_model=VideoResponse,
    summary="Extract audio → mono 16 kHz WAV (Phase 3)",
)
async def extract_audio(video_id: str):
    return await audio_service.extract_audio(video_id)


@router.get("/{video_id}/audio-status", summary="Poll audio extraction status")
async def get_audio_status(video_id: str):
    result = await audio_service.get_audio_status(video_id)
    return JSONResponse(content={
        **result,
        "audio_metadata": (
            {k: str(v) if hasattr(v, "isoformat") else v
             for k, v in result["audio_metadata"].items()}
            if result.get("audio_metadata") else None
        ),
    })


# ─── Transcription (Phase 4) ──────────────────────────────────────────────────

@router.post(
    "/{video_id}/transcribe",
    response_model=VideoResponse,
    summary="Transcribe audio with Whisper STT (Phase 4)",
)
async def transcribe_video(
    video_id: str,
    model: Optional[str] = Query(
        None,
        description="Whisper model: tiny | base | small | medium | large",
        regex="^(tiny|base|small|medium|large|large-v2|large-v3)$",
    ),
):
    return await transcription_service.transcribe_video(video_id, model_name=model)


@router.get(
    "/{video_id}/transcript",
    response_model=TranscriptResponse,
    summary="Get full transcript + timed segments (Phase 4)",
)
async def get_transcript(video_id: str):
    return await transcription_service.get_transcript(video_id)


@router.get("/{video_id}/transcription-status", summary="Poll transcription status")
async def get_transcription_status(video_id: str):
    result = await transcription_service.get_transcription_status(video_id)
    return JSONResponse(content={
        **result,
        "transcript_metadata": (
            {k: str(v) if hasattr(v, "isoformat") else v
             for k, v in result["transcript_metadata"].items()}
            if result.get("transcript_metadata") else None
        ),
    })


# ─── Text Preprocessing (Phase 5) ────────────────────────────────────────────

@router.post(
    "/{video_id}/preprocess",
    response_model=VideoResponse,
    summary="Clean + chunk transcript for summarization (Phase 5)",
    description=(
        "Runs the full text preprocessing pipeline on the raw Whisper transcript:\n"
        "1. Unicode normalization\n"
        "2. Noise removal (Whisper artifacts, filler words, timestamps)\n"
        "3. Punctuation normalization\n"
        "4. Sentence boundary fixing\n"
        "5. Overlapping chunk splitting (800-token chunks, 100-token overlap) — BART-ready\n\n"
        "Requires status = transcript_ready."
    ),
)
async def preprocess_transcript(video_id: str):
    return await preprocessing_service.preprocess_transcript(video_id)


@router.get(
    "/{video_id}/preprocessing",
    response_model=PreprocessingResponse,
    summary="Get cleaned transcript + all chunks (Phase 5)",
    description="Returns the cleaned transcript text and all preprocessed chunks ready for summarization.",
)
async def get_preprocessing_result(video_id: str):
    return await preprocessing_service.get_preprocessing_result(video_id)


@router.get(
    "/{video_id}/preprocessing-status",
    summary="Poll preprocessing status (Phase 5)",
)
async def get_preprocessing_status(video_id: str):
    result = await preprocessing_service.get_preprocessing_status(video_id)
    return JSONResponse(content={
        **result,
        "preprocessing_metadata": (
            {k: str(v) if hasattr(v, "isoformat") else v
             for k, v in result["preprocessing_metadata"].items()}
            if result.get("preprocessing_metadata") else None
        ),
    })
