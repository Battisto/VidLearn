from fastapi import APIRouter, UploadFile, File, Form, Query, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Optional

from app.models.video import VideoResponse, VideoListResponse, TranscriptResponse
from app.services import video_service, audio_service, transcription_service

router = APIRouter()


# ─── Upload ───────────────────────────────────────────────────────────────────

@router.post(
    "/upload",
    response_model=VideoResponse,
    status_code=201,
    summary="Upload a video file",
)
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
    summary="Extract audio from video (Phase 3)",
    description=(
        "Triggers FFmpeg to extract audio as mono 16 kHz WAV. "
        "Status transitions: uploaded → extracting_audio → audio_ready."
    ),
)
async def extract_audio(video_id: str):
    return await audio_service.extract_audio(video_id)


@router.get(
    "/{video_id}/audio-status",
    summary="Get audio extraction status",
)
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
    summary="Transcribe video audio with Whisper (Phase 4)",
    description=(
        "Runs OpenAI Whisper STT on the extracted audio WAV file. "
        "Requires audio to be extracted first (status = audio_ready). "
        "Status transitions: audio_ready → transcribing → transcript_ready. "
        "Optional `model` query param overrides the default Whisper model size."
    ),
)
async def transcribe_video(
    video_id: str,
    model: Optional[str] = Query(
        None,
        description="Whisper model size: tiny, base, small, medium, large",
        regex="^(tiny|base|small|medium|large|large-v2|large-v3)$",
    ),
):
    return await transcription_service.transcribe_video(video_id, model_name=model)


@router.get(
    "/{video_id}/transcript",
    response_model=TranscriptResponse,
    summary="Get full transcript with timed segments (Phase 4)",
    description="Returns the plain-text transcript and all timed segments for a transcribed video.",
)
async def get_transcript(video_id: str):
    return await transcription_service.get_transcript(video_id)


@router.get(
    "/{video_id}/transcription-status",
    summary="Poll transcription status (Phase 4)",
    description="Lightweight endpoint to poll whether transcription has completed.",
)
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
