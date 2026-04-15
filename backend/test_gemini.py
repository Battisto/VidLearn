import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv('.env')

genai.configure(api_key=os.getenv('GOOGLE_GEMINI_API_KEY'))

print("Testing flash...")
try:
    model = genai.GenerativeModel('gemini-flash-latest')
    response = model.generate_content('Hello!')
    print('Flash:', response.text)
except Exception as e:
    print('Flash Error:', e)

print("Testing pro...")
try:
    model = genai.GenerativeModel('gemini-pro-latest')
    response = model.generate_content('Hello!')
    print('Pro:', response.text)
except Exception as e:
    print('Pro Error:', e)
