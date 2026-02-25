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
    MAX_FILE_SIZE_MB: int = 500
    ALLOWED_VIDEO_FORMATS: str = "mp4,avi,mov,mkv,webm"

    # Whisper (Phase 4)
    WHISPER_MODEL: str = "base"

    # Summarization (Phase 6)
    SUMMARIZER_PROVIDER: str = "gemini"      # "gemini" | "bart" | "both"
    GOOGLE_GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"  # fast + free tier
    BART_MODEL: str = "facebook/bart-large-cnn"
    SUMMARY_MIN_LENGTH: int = 80
    SUMMARY_MAX_LENGTH: int = 500
    SUMMARY_MAX_TOKENS: int = 150           # per BART chunk summary

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
