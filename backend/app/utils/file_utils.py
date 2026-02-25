import os
import uuid
import re
from pathlib import Path
from fastapi import UploadFile, HTTPException
from app.core.config import settings


ALLOWED_MIME_TYPES = {
    "video/mp4",
    "video/x-msvideo",       # avi
    "video/quicktime",        # mov
    "video/x-matroska",       # mkv
    "video/webm",
    "video/mpeg",
    "video/ogg",
}


def validate_video_file(file: UploadFile) -> None:
    """
    Validate the uploaded file:
      - Checks MIME type against the allowed set
      - Checks file extension against config
    Raises HTTP 400 if invalid.
    """
    ext = Path(file.filename).suffix.lower().lstrip(".")
    allowed_exts = settings.allowed_video_formats_list

    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"File type '.{ext}' is not allowed. Allowed: {', '.join(allowed_exts)}",
        )

    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"MIME type '{file.content_type}' is not supported.",
        )


def safe_filename(filename: str) -> str:
    """Sanitize a filename — remove dangerous characters, collapse spaces."""
    name = Path(filename).stem
    ext = Path(filename).suffix
    name = re.sub(r"[^\w\s\-]", "", name)
    name = re.sub(r"\s+", "_", name).strip("_")
    name = name[:100]  # cap length
    return f"{name}{ext}" if name else f"video{ext}"


def generate_unique_path(filename: str, upload_dir: str) -> tuple[str, str]:
    """
    Generate a unique file path using UUID prefix.
    Returns (absolute_path, unique_filename).
    """
    unique_id = uuid.uuid4().hex
    safe_name = safe_filename(filename)
    unique_name = f"{unique_id}_{safe_name}"
    abs_path = os.path.join(upload_dir, unique_name)
    return abs_path, unique_name


def get_upload_dir() -> str:
    """Resolve and ensure the upload directory exists."""
    upload_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", settings.UPLOAD_DIR)
    )
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


def format_file_size(size_bytes: int) -> str:
    """Human-readable file size string."""
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"
