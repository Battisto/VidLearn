import os
import aiofiles
from datetime import datetime
from bson import ObjectId
from fastapi import UploadFile, HTTPException
from loguru import logger

from app.core.database import get_db
from app.core.config import settings
from app.models.video import VideoInDB, VideoMetadata, VideoResponse, VideoStatus
from app.utils.file_utils import validate_video_file, generate_unique_path, get_upload_dir
from pathlib import Path


COLLECTION = "videos"


def _doc_to_response(doc: dict) -> VideoResponse:
    """Convert a MongoDB document dict to a VideoResponse."""
    return VideoResponse(
        id=str(doc["_id"]),
        title=doc["title"],
        description=doc.get("description"),
        status=doc["status"],
        metadata=VideoMetadata(**doc["metadata"]),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


async def upload_video(
    file: UploadFile,
    title: str,
    description: str | None = None,
    user_id: str | None = None,
) -> VideoResponse:
    """
    1. Validate the file type and size.
    2. Stream-save to disk (chunked to avoid memory overload).
    3. Persist metadata to MongoDB.
    4. Return VideoResponse.
    """
    # ── Validate ─────────────────────────────────────────────────────────
    validate_video_file(file)

    upload_dir = get_upload_dir()
    abs_path, unique_name = generate_unique_path(file.filename, upload_dir)

    # ── Stream to disk ───────────────────────────────────────────────────
    file_size = 0
    try:
        async with aiofiles.open(abs_path, "wb") as out_file:
            while chunk := await file.read(1024 * 1024):  # 1 MB chunks
                file_size += len(chunk)
                if file_size > settings.max_file_size_bytes:
                    await out_file.close()
                    os.remove(abs_path)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds maximum size of {settings.MAX_FILE_SIZE_MB} MB.",
                    )
                await out_file.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save uploaded file: {e}")
        if os.path.exists(abs_path):
            os.remove(abs_path)
        raise HTTPException(status_code=500, detail="Failed to save file to storage.")

    logger.info(f"📹 Saved video: {unique_name} ({file_size / 1024 / 1024:.2f} MB)")

    # ── Persist to MongoDB ────────────────────────────────────────────────
    ext = Path(file.filename).suffix.lower().lstrip(".")
    doc = {
        "title": title,
        "description": description,
        "status": VideoStatus.UPLOADED,
        "storage_path": abs_path,
        "metadata": {
            "original_filename": file.filename,
            "file_size_bytes": file_size,
            "file_extension": ext,
            "content_type": file.content_type or f"video/{ext}",
        },
        "user_id": user_id,
        "transcript": None,
        "summary": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    db = get_db()
    result = await db[COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id
    video_id = str(result.inserted_id)

    # ── Auto-trigger full pipeline in background ──────────────────────────
    # The caller gets the VideoResponse immediately (UPLOADED state).
    # The pipeline runs async: extract audio → transcribe → preprocess → summarize.
    import asyncio
    from app.services.pipeline_service import _run_pipeline
    asyncio.create_task(_run_pipeline(video_id, whisper_model=None, provider=None))
    logger.info(f"🚀 Auto-pipeline queued for video_id={video_id}")

    return _doc_to_response(doc)


async def upload_text(
    title: str,
    text: str,
    description: str | None = None,
    user_id: str | None = None,
) -> VideoResponse:
    doc = {
        "title": title,
        "description": description,
        "status": VideoStatus.TRANSCRIPT_READY,
        "storage_path": "text_upload",
        "metadata": {
            "original_filename": "pasted_text.txt",
            "file_size_bytes": len(text.encode('utf-8')),
            "file_extension": "txt",
            "content_type": "text/plain",
        },
        "user_id": user_id,
        "transcript": text,
        "transcript_metadata": {
            "whisper_model": "none (pasted)",
            "word_count": len(text.split()),
            "char_count": len(text),
            "transcribed_at": datetime.utcnow()
        },
        "summary": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    db = get_db()
    result = await db[COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id
    video_id = str(result.inserted_id)

    # Auto-trigger preprocessing
    import asyncio
    from app.services.preprocessing_service import preprocess_transcript
    asyncio.create_task(preprocess_transcript(video_id))
    logger.info(f"🚀 Preprocessing queued for text upload id={video_id}")

    return _doc_to_response(doc)


async def list_videos(page: int = 1, page_size: int = 20, user_id: str | None = None) -> dict:
    """Retrieve paginated list of videos, filtered by user if user_id is provided."""
    db = get_db()
    skip = (page - 1) * page_size
    query = {"user_id": user_id} if user_id else {}
    total = await db[COLLECTION].count_documents(query)
    cursor = db[COLLECTION].find(query).sort("created_at", -1).skip(skip).limit(page_size)
    docs = await cursor.to_list(length=page_size)
    return {
        "videos": [_doc_to_response(d) for d in docs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def get_video_by_id(video_id: str) -> VideoResponse:
    """Retrieve a single video by its MongoDB ObjectId."""
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    db = get_db()
    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Video '{video_id}' not found.")
    return _doc_to_response(doc)


async def delete_video(video_id: str) -> dict:
    """Delete a video from MongoDB and remove its file from disk."""
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID format.")

    db = get_db()
    doc = await db[COLLECTION].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail=f"Video '{video_id}' not found.")

    # Remove file from disk
    storage_path = doc.get("storage_path")
    if storage_path and os.path.exists(storage_path):
        os.remove(storage_path)
        logger.info(f"🗑️  Deleted file: {storage_path}")

    await db[COLLECTION].delete_one({"_id": ObjectId(video_id)})
    logger.info(f"🗑️  Deleted video record: {video_id}")

    return {"message": f"Video '{video_id}' deleted successfully."}
