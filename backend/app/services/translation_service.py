"""
translation_service.py — Phase 8: Translation Module
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Provides translation and language detection capabilities,
primarily focusing on English <-> Tamil translations using `deep-translator`
(a free wrapper around Google Translate API).
"""

import asyncio
import re
from typing import Dict, Optional, List
from concurrent.futures import ThreadPoolExecutor
from loguru import logger

from deep_translator import GoogleTranslator, single_detection

# Use thread pool to avoid blocking the event loop with synchronous network requests
_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="transl")

# Google Translate limits per request
MAX_CHARS_PER_REQUEST = 4500

def _split_text_for_translation(text: str, limit: int = MAX_CHARS_PER_REQUEST) -> List[str]:
    """Split text intelligently without breaking sentences if possible."""
    chunks = []
    # Split by newlines first
    paragraphs = re.split(r'\n+', text)
    
    current_chunk = ""
    for p in paragraphs:
        if not p.strip():
            continue
            
        # If adding the paragraph exceeds limit, commit the current chunk
        if len(current_chunk) + len(p) + 1 > limit:
            if current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = ""
                
            # If the single paragraph is still too big, split by sentences
            if len(p) > limit:
                sentences = re.split(r'(?<=[.!?])\s+', p)
                for s in sentences:
                    if len(current_chunk) + len(s) + 1 > limit:
                        if current_chunk:
                            chunks.append(current_chunk.strip())
                            current_chunk = ""
                        # If a single sentence is incredibly huge (rare), forcibly split by limit
                        while len(s) > limit:
                            chunks.append(s[:limit])
                            s = s[limit:]
                    current_chunk += s + " "
            else:
                current_chunk = p + "\n"
        else:
            current_chunk += p + "\n"
            
    if current_chunk.strip():
        chunks.append(current_chunk.strip())
        
    return chunks

from app.core.config import settings
import google.generativeai as genai

# Try setting up Gemini
if settings.gemini_enabled:
    genai.configure(api_key=settings.GOOGLE_GEMINI_API_KEY)

def _translate_with_gemini(text: str, source: str = 'auto', target: str = 'ta') -> str:
    """Use Gemini for high-quality contextual translation. Avoids word-for-word literal errors like mouse -> computer mouse."""
    lang_map = {'ta': 'Tamil', 'en': 'English'}
    target_lang = lang_map.get(target, target)
    source_lang = lang_map.get(source, "the source language") if source != 'auto' else "the original language"
    
    prompt = (
        f"Translate the following text from {source_lang} to {target_lang}. "
        f"Maintain the original tone, context, and meaning. Provide only the translated text as your response without any markdown formatting, preamble, or explanations.\n\n"
        f"Text:\n{text}"
    )
    
    # Use flash for speed, it is very good at translation
    model = genai.GenerativeModel('gemini-1.5-flash')
    response = model.generate_content(prompt, generation_config={"temperature": 0.2})
    
    if response.text:
        return response.text.strip()
    return ""

def _translate_sync(text: str, source: str = 'auto', target: str = 'ta') -> str:
    """Synchronous translation logic over chunked text. Tries Gemini first, falls back to Google Translate."""
    if not text or not text.strip():
        return ""
        
    # Attempt high-quality Gemini translation if enabled
    if settings.gemini_enabled:
        try:
            logger.info("🤖 Using Context-Aware Gemini Translation...")
            return _translate_with_gemini(text, source, target)
        except Exception as e:
            logger.warning(f"⚠️ Gemini translation failed ({e}), falling back to deep-translator...")
            
    logger.info("📡 Using Standard deep-translator (Google Translate)...")
    chunks = _split_text_for_translation(text)
    translator = GoogleTranslator(source=source, target=target)
    
    translated_chunks = []
    for chunk in chunks:
        res = translator.translate(chunk)
        translated_chunks.append(res)
        
    return "\n\n".join(translated_chunks)

def _detect_sync(text: str) -> Dict[str, str]:
    """Detect language of text. Single detection wrapper."""
    if not text or not text.strip():
        return {"language": "unknown"}
    # Detection requires langdetect or purely deep_translator.single_detection
    try:
        # we can use GoogleTranslator detect feature (detect is provided by deep_translator via the detection api, but single_detection supports some engines)
        # However, single_detection needs api_key for detectLanguage API, we can use google translate trick instead:
        # Let's use `langdetect` if available, or fallback to an internal mechanism.
        # As deep-translator single_detection relies on certain API packages, we'll try a simpler trick:
        # We can just attempt to detect via google API or return a default response if it fails.
        # Actually GoogleTranslator does not directly expose 'detect'. Let's use `langdetect` package if possible,
        # but since we might not have it, let's use a simple heuristic or leave it optional.
        pass
    except Exception:
        pass
        
    # Heuristic for english VS tamil for our specific usecase
    tamil_chars = set(chr(i) for i in range(0x0B80, 0x0BFF + 1))
    tam_count = sum(1 for c in text if c in tamil_chars)
    if tam_count > len(text) * 0.1: # if 10% of chars are Tamil, it's likely Tamil
        return {"language": "ta", "name": "Tamil"}
        
    # Assume English for the default 
    return {"language": "en", "name": "English"}


from bson import ObjectId
from app.core.database import get_db
from datetime import datetime

# ─── Public Async API ─────────────────────────────────────────────────────────────

async def translate_text(text: str, source: str = "auto", target: str = "ta", video_id: Optional[str] = None) -> Dict[str, str]:
    """
    Translate text asynchronously.
    If video_id is provided, optionally check/cache the translation.
    """
    if video_id and ObjectId.is_valid(video_id):
        db = get_db()
        # Hash text to prevent storing same text over and over for same video
        import hashlib
        text_hash = hashlib.md5(text.encode()).hexdigest()
        
        cached = await db["translations"].find_one({
            "video_id": video_id, 
            "target": target, 
            "text_hash": text_hash
        })
        if cached:
            logger.info("⚡ Returning cached translation.")
            return {
                "source": cached.get("source", source),
                "target": cached.get("target", target),
                "original_text_length": len(text),
                "translated_text": cached.get("translated_text", "")
            }

    loop = asyncio.get_event_loop()
    logger.info(f"🌐 Translating text [{source} -> {target}] ({len(text)} chars)")
    
    translated = await loop.run_in_executor(
        _executor, _translate_sync, text, source, target
    )
    
    result = {
        "source": source,
        "target": target,
        "original_text_length": len(text),
        "translated_text": translated,
    }
    
    if video_id and ObjectId.is_valid(video_id):
        db = get_db()
        await db["translations"].insert_one({
            "video_id": video_id,
            "target": target,
            "source": source,
            "text_hash": text_hash,
            "translated_text": translated,
            "created_at": datetime.utcnow()
        })
        
    return result

async def detect_language(text: str) -> Dict[str, str]:
    """
    Detect the language of the provided text.
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(_executor, _detect_sync, text[:1000]) # only need start of text
    return result
