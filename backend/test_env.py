import sys
import os

from dotenv import load_dotenv
load_dotenv('.env')

sys.path.append('.')
try:
    from app.core.config import settings
    print('Key:', settings.GOOGLE_GEMINI_API_KEY)
    print('Enabled:', settings.gemini_enabled)
    print('Provider:', settings.SUMMARIZER_PROVIDER)
except Exception as e:
    print('Error:', e)
