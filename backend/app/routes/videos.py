from fastapi import APIRouter, UploadFile, File, Form, Query, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional

from app.models.video import (
    VideoResponse, VideoListResponse,
    TranscriptResponse, PreprocessingResponse, SummaryResponse,
)
from app.services import (
    video_service, audio_service,
    transcription_service, preprocessing_service, summarization_service,
)

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
    return JSONResponse(content=await video_service.delete_video(video_id))


# ─── Audio Extraction (Phase 3) ───────────────────────────────────────────────

@router.post("/{video_id}/extract-audio", response_model=VideoResponse, summary="Extract audio → WAV (Phase 3)")
async def extract_audio(video_id: str):
    return await audio_service.extract_audio(video_id)


@router.get("/{video_id}/audio-status", summary="Poll audio extraction status")
async def get_audio_status(video_id: str):
    result = await audio_service.get_audio_status(video_id)
    return JSONResponse(content={
        **result,
        "audio_metadata": (
            {k: str(v) if hasattr(v, "isoformat") else v for k, v in result["audio_metadata"].items()}
            if result.get("audio_metadata") else None
        ),
    })


# ─── Transcription (Phase 4) ──────────────────────────────────────────────────

@router.post("/{video_id}/transcribe", response_model=VideoResponse, summary="Transcribe with Whisper (Phase 4)")
async def transcribe_video(
    video_id: str,
    model: Optional[str] = Query(None, regex="^(tiny|base|small|medium|large|large-v2|large-v3)$"),
):
    return await transcription_service.transcribe_video(video_id, model_name=model)


@router.get("/{video_id}/transcript", response_model=TranscriptResponse, summary="Get transcript + segments (Phase 4)")
async def get_transcript(video_id: str):
    return await transcription_service.get_transcript(video_id)


@router.get("/{video_id}/transcription-status", summary="Poll transcription status")
async def get_transcription_status(video_id: str):
    result = await transcription_service.get_transcription_status(video_id)
    return JSONResponse(content={
        **result,
        "transcript_metadata": (
            {k: str(v) if hasattr(v, "isoformat") else v for k, v in result["transcript_metadata"].items()}
            if result.get("transcript_metadata") else None
        ),
    })


# ─── Text Preprocessing (Phase 5) ────────────────────────────────────────────

@router.post("/{video_id}/preprocess", response_model=VideoResponse, summary="Clean + chunk transcript (Phase 5)")
async def preprocess_transcript(video_id: str):
    return await preprocessing_service.preprocess_transcript(video_id)


@router.get("/{video_id}/preprocessing", response_model=PreprocessingResponse, summary="Get preprocessed chunks (Phase 5)")
async def get_preprocessing_result(video_id: str):
    return await preprocessing_service.get_preprocessing_result(video_id)


@router.get("/{video_id}/preprocessing-status", summary="Poll preprocessing status")
async def get_preprocessing_status(video_id: str):
    result = await preprocessing_service.get_preprocessing_status(video_id)
    return JSONResponse(content={
        **result,
        "preprocessing_metadata": (
            {k: str(v) if hasattr(v, "isoformat") else v for k, v in result["preprocessing_metadata"].items()}
            if result.get("preprocessing_metadata") else None
        ),
    })


# ─── AI Summarization (Phase 6) ───────────────────────────────────────────────

@router.post(
    "/{video_id}/summarize",
    response_model=VideoResponse,
    summary="Summarize transcript with AI (Phase 6)",
    description=(
        "Generates an AI summary of the pre-processed transcript. "
        "Supports two providers:\n"
        "- **gemini** (default): Uses Google Gemini 1.5 Flash — requires GOOGLE_GEMINI_API_KEY in .env\n"
        "- **bart**: Uses facebook/bart-large-cnn locally — no API key required, downloads ~1.6 GB on first use\n\n"
        "Status transitions: preprocessed → summarizing → summarized."
    ),
)
async def summarize_video(
    video_id: str,
    provider: Optional[str] = Query(
        None,
        description="AI provider: gemini | bart",
        regex="^(gemini|bart)$",
    ),
):
    return await summarization_service.summarize_video(video_id, provider=provider)


@router.get(
    "/{video_id}/summary",
    response_model=SummaryResponse,
    summary="Get video summary + chunk summaries (Phase 6)",
)
async def get_summary(video_id: str):
    return await summarization_service.get_summary(video_id)


@router.get(
    "/{video_id}/summarization-status",
    summary="Poll summarization status (Phase 6)",
)
async def get_summarization_status(video_id: str):
    result = await summarization_service.get_summarization_status(video_id)
    return JSONResponse(content={
        **result,
        "summary_metadata": (
            {k: str(v) if hasattr(v, "isoformat") else v for k, v in result["summary_metadata"].items()}
            if result.get("summary_metadata") else None
        ),
    })
