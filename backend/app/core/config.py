from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "VidLearn"
    APP_ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "change-me-in-production"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "vidlearn_db"

    # JWT
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # File Storage
    UPLOAD_DIR: str = "../uploads"
    MAX_FILE_SIZE_MB: int = 2048            # 2 GB — supports feature-length videos
    ALLOWED_VIDEO_FORMATS: str = "mp4,avi,mov,mkv,webm"

    # ── Audio Extraction (Phase 3) ───────────────────────────────────────────
    FFMPEG_TIMEOUT_SEC: int = 7200          # 2 h max for very long videos
    AUDIO_BITRATE: str = "16k"             # narrowband — Whisper only needs 16 kHz mono

    # ── Whisper Transcription (Phase 4) ──────────────────────────────────────
    WHISPER_ENGINE: str = "faster"         # "faster" (CTranslate2) | "openai" (original)
    WHISPER_MODEL: str = "tiny.en"          # tiny.en = English-only, no lang-detect, fastest CPU
    WHISPER_COMPUTE_TYPE: str = "int8"     # int8 = fastest on CPU
    WHISPER_CHUNK_LENGTH: int = 30          # seconds per VAD chunk
    WHISPER_LANGUAGE: str = "en"           # fixed — skips language detection pass
    WHISPER_BEAM_SIZE: int = 1             # 1 = greedy (fastest); 5 = beam search (more accurate)
    WHISPER_BEST_OF: int = 1              # candidates (irrelevant for greedy)
    WHISPER_VAD_FILTER: bool = True        # skip silence chunks — huge speedup
    WHISPER_THREADS: int = 4              # CPU threads per model instance
    WHISPER_PARALLEL_CHUNKS: int = 4      # split audio into N chunks → N parallel Whisper instances
    WHISPER_CHUNK_SPLIT_SEC: int = 300    # seconds per chunk when splitting (5 min default)

    # ── YouTube caption extraction ──────────────────────────────────────
    YOUTUBE_PREFER_CAPTIONS: bool = True   # use YouTube built-in captions (instant, no Whisper)
    YOUTUBE_CAPTION_LANG: str = "en"       # preferred language; falls back to any available

    # ── Text Preprocessing (Phase 5) ─────────────────────────────────────────
    CHUNK_TOKENS: int = 1200               # tokens per chunk (was 800) — bigger = fewer chunks
    CHUNK_OVERLAP: int = 150               # overlap tokens (was 100)

    # ─── Summarisation (Phase 6) ───────────────────────────────────────────────
    SUMMARIZER_PROVIDER: str = "gemini"      # "gemini" | "bart"
    GOOGLE_GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-flash-latest"   # chunk summarisation — fast + free tier
    GEMINI_MERGE_MODEL: str = "gemini-pro-latest"  # final merge — higher quality for long videos
    GEMINI_MAX_CONCURRENT: int = 5          # parallel Gemini requests (respects 60 req/min free tier)
    GEMINI_RETRY_ATTEMPTS: int = 3          # exponential-backoff retries on 429/503
    BART_MODEL: str = "facebook/bart-large-cnn"
    BART_WORKERS: int = 2                   # parallel BART threads
    SUMMARY_MIN_LENGTH: int = 100
    SUMMARY_MAX_LENGTH: int = 800           # was 500 — more room for long-video summaries
    SUMMARY_MAX_TOKENS: int = 200           # per BART chunk summary (was 150)

    # CORS
    FRONTEND_URL: str = "http://localhost:5173"

    @property
    def allowed_video_formats_list(self) -> List[str]:
        return [f.strip() for f in self.ALLOWED_VIDEO_FORMATS.split(",")]

    @property
    def max_file_size_bytes(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.GOOGLE_GEMINI_API_KEY and self.GOOGLE_GEMINI_API_KEY != "your-gemini-api-key-here")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
