
import sys
sys.path.append('.')
from app.core.config import settings
print('Key:', settings.GOOGLE_GEMINI_API_KEY)
print('Enabled:', settings.gemini_enabled)
print('Provider:', settings.SUMMARIZER_PROVIDER)

