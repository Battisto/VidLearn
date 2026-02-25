from fastapi import APIRouter, UploadFile, File, Form, Query, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional

from app.models.video import VideoResponse, VideoListResponse
from app.services import video_service

router = APIRouter()


@router.post(
    "/upload",
    response_model=VideoResponse,
    status_code=201,
    summary="Upload a video file",
    description=(
        "Upload a video file (mp4, avi, mov, mkv, webm). "
        "The file is validated, saved to storage, and its metadata is persisted in MongoDB."
    ),
)
async def upload_video(
    file: UploadFile = File(..., description="Video file to upload"),
    title: str = Form(..., min_length=1, max_length=200, description="Video title"),
    description: Optional[str] = Form(None, max_length=1000, description="Optional description"),
):
    return await video_service.upload_video(file, title, description)


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


@router.delete(
    "/{video_id}",
    summary="Delete a video",
    description="Permanently deletes a video record from MongoDB and removes the file from disk.",
)
async def delete_video(video_id: str):
    result = await video_service.delete_video(video_id)
    return JSONResponse(content=result)
