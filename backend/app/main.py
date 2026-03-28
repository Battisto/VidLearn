from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from loguru import logger

from app.core.config import settings
from app.core.database import connect_db, disconnect_db
from app.core.logging import setup_logging
from app.routes import health, videos, quizzes, translations, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown."""
    # ── Startup ───────────────────────────────────────────────────────────
    setup_logging()
    logger.info(f"🚀 Starting {settings.APP_NAME} [{settings.APP_ENV}]")
    await connect_db()

    # Pre-load Whisper model in background thread so first request isn't slow
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    from app.services.transcription_service import load_whisper_model
    try:
        engine = settings.WHISPER_ENGINE
        model  = settings.WHISPER_MODEL
        logger.info(f"⚡ Pre-loading Whisper | engine={engine} | model={model} ...")
        executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="whisper_preload")
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(executor, load_whisper_model, model)
        executor.shutdown(wait=False)
        logger.info(f"✅ Whisper pre-loaded | engine={engine} | model={model}")
    except Exception as e:
        logger.warning(f"⚠️  Whisper pre-load skipped: {e} (will load on first use)")

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────
    logger.info(f"🛑 Shutting down {settings.APP_NAME}")
    await disconnect_db()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        description="AI-powered educational platform — video to structured learning materials",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────
    app.include_router(health.router,        prefix="/api",          tags=["Health"])
    app.include_router(users.router,         prefix="/api/users",     tags=["Users"])
    app.include_router(videos.router,        prefix="/api/videos",    tags=["Videos"])
    app.include_router(quizzes.router,       prefix="/api/quizzes",   tags=["Quizzes"])
    app.include_router(translations.router,  prefix="/api/translate", tags=["Translations"])

    return app


app = create_app()
