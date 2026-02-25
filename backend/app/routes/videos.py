from fastapi import APIRouter, UploadFile, File, Form, Query, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Optional

from app.models.video import VideoResponse, VideoListResponse
from app.services import video_service, audio_service

router = APIRouter()


# ─── Upload ───────────────────────────────────────────────────────────────────

@router.post(
    "/upload",
    response_model=VideoResponse,
    status_code=201,
    summary="Upload a video file",
    description=(
        "Upload a video file (mp4, avi, mov, mkv, webm). "
        "The file is validated, saved to storage, and metadata persisted in MongoDB."
    ),
)
async def upload_video(
    file: UploadFile = File(..., description="Video file to upload"),
    title: str = Form(..., min_length=1, max_length=200, description="Video title"),
    description: Optional[str] = Form(None, max_length=1000, description="Optional description"),
):
    return await video_service.upload_video(file, title, description)


# ─── List & Get ───────────────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=VideoListResponse,
    summary="List all videos",
    description="Returns a paginated list of all uploaded videos, sorted newest first.",
)
async def list_videos(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
):
    return await video_service.get_all_videos(page=page, page_size=page_size)


@router.get(
    "/{video_id}",
    response_model=VideoResponse,
    summary="Get video details",
    description="Retrieve full metadata for a single video by its ID.",
)
async def get_video(video_id: str):
    return await video_service.get_video_by_id(video_id)


# ─── Delete ───────────────────────────────────────────────────────────────────

@router.delete(
    "/{video_id}",
    summary="Delete a video",
    description="Permanently deletes a video record from MongoDB and removes the file from disk.",
)
async def delete_video(video_id: str):
    result = await video_service.delete_video(video_id)
    return JSONResponse(content=result)


# ─── Audio Extraction (Phase 3) ───────────────────────────────────────────────

@router.post(
    "/{video_id}/extract-audio",
    response_model=VideoResponse,
    summary="Extract audio from video",
    description=(
        "Triggers FFmpeg to extract audio from the uploaded video file. "
        "Audio is saved as mono 16 kHz WAV (optimised for Whisper STT). "
        "The video status transitions: uploaded → extracting_audio → audio_ready."
    ),
)
async def extract_audio(video_id: str):
    return await audio_service.extract_audio(video_id)


@router.get(
    "/{video_id}/audio-status",
    summary="Get audio extraction status",
    description="Poll this endpoint to check whether audio extraction has completed.",
)
async def get_audio_status(video_id: str):
    result = await audio_service.get_audio_status(video_id)
    return JSONResponse(content={
        **result,
        "audio_metadata": (
            {k: str(v) if hasattr(v, 'isoformat') else v
             for k, v in result["audio_metadata"].items()}
            if result.get("audio_metadata") else None
        ),
    })
