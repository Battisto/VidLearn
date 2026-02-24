import motor.motor_asyncio
from loguru import logger
from app.core.config import settings

client: motor.motor_asyncio.AsyncIOMotorClient = None
db = None


async def connect_db():
    """Connect to MongoDB."""
    global client, db
    try:
        client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGODB_URL)
        db = client[settings.DATABASE_NAME]
        # Verify connection
        await client.admin.command("ping")
        logger.info(f"✅ Connected to MongoDB: {settings.DATABASE_NAME}")
    except Exception as e:
        logger.error(f"❌ Failed to connect to MongoDB: {e}")
        raise


async def disconnect_db():
    """Disconnect from MongoDB."""
    global client
    if client:
        client.close()
        logger.info("🔌 Disconnected from MongoDB")


def get_db():
    """Return the database instance."""
    return db
