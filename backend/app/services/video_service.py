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
        "metadata": {
            "original_filename": file.filename,
            "file_size_bytes": file_size,
            "file_extension": ext,
            "content_type": file.content_type or f"video/{ext}",
        },
        "storage_path": abs_path,
        "transcript": None,
        "summary": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    db = get_db()
    result = await db[COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id

    return _doc_to_response(doc)


async def get_all_videos(page: int = 1, page_size: int = 20) -> dict:
    """Retrieve paginated list of all videos."""
    db = get_db()
    skip = (page - 1) * page_size
    total = await db[COLLECTION].count_documents({})
    cursor = db[COLLECTION].find({}).sort("created_at", -1).skip(skip).limit(page_size)
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
