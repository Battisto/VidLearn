"""Phase 8 — Translation APIs"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from app.services import translation_service

router = APIRouter()

class TranslationRequest(BaseModel):
    text: str
    target: str = "ta"
    source: str = "auto"
    video_id: Optional[str] = None
    
@router.post(
    "/translate-text",
    summary="🌐 Translate text to Tamil/English",
    description="Translates the provided text. Defaults to English -> Tamil (ta). target:'en' for Tamil->English"
)
async def translate_text_endpoint(req: TranslationRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    try:
        result = await translation_service.translate_text(req.text, req.source, req.target, req.video_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post(
    "/detect",
    summary="🔍 Detect language",
    description="Detects whether the given text is English or Tamil."
)
async def detect_language_endpoint(req: TranslationRequest): # We can just use the 'text' field
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
    result = await translation_service.detect_language(req.text)
    return result
