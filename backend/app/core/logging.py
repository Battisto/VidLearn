import sys
from loguru import logger
from app.core.config import settings


def setup_logging():
    """Configure loguru logging for the application."""
    logger.remove()  # Remove default handler

    log_level = "DEBUG" if settings.DEBUG else "INFO"

    # Console handler — colored, human-readable
    logger.add(
        sys.stdout,
        level=log_level,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
            "<level>{message}</level>"
        ),
        colorize=True,
    )

    # File handler — JSON structured logs
    logger.add(
        "../../logs/vidlearn_{time:YYYY-MM-DD}.log",
        level="INFO",
        rotation="1 day",
        retention="30 days",
        compression="zip",
        format="{time} | {level} | {name}:{function}:{line} - {message}",
    )

    logger.info(f"📋 Logging initialized | Level: {log_level} | Env: {settings.APP_ENV}")
