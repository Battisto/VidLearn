# VidLearn 🎓

> Turn Videos into Structured Learning Experiences. 🚀

VidLearn is a high-performance AI platform that automates the process of educational content consumption. It transforms any video or YouTube link into concise summaries, interactive quizzes, and accurate transcripts with full multilingual support.

## 🧠 Intelligence Stack

| Feature | Technology |
|---|---|
| **Frontend** | React 18 + Vite |
| **Backend** | FastAPI (Async Python 3.10+) |
| **Transcription** | OpenAI Whisper (99% Accuracy) |
| **Summarization** | Google Gemini 1.5 Flash / BART-large-cnn |
| **Quiz Generation** | NLP-driven spaCy Engine (Rule-based MCQs) |
| **Translation** | deep-translator (Tamil ↔ English) |
| **Intake** | yt-dlp + youtube-transcript-api |
| **Database** | MongoDB (Motor Async) |
| **Audio** | FFmpeg |

## 📁 Architecture

```
m1/
├── backend/
│   ├── app/
│   │   ├── core/      # Config, security, database
│   │   ├── routes/    # User, Video, Summary, Quiz, Translation endpoints
│   │   └── services/  # AI processing pipelines and YouTube logic
│   ├── .env           # API Keys & DB URLs
│   └── requirements.txt
├── frontend/          # React App (Pages: Upload, Dashboard, Process, Summary, Quiz)
├── uploads/           # Raw video artifacts
└── task.md            # Detailed project roadmap & status
```

## 🚀 Rapid Setup

### 1. Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # venv\Scripts\activate on Windows
pip install -r requirements.txt
python run.py
```
*Note: Requires FFmpeg installed on system PATH.*

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

## 📅 Status Tracking

For a deep dive into implementation details, current features, and fixed bugs, please review the **[task.md](./task.md)** file.

## 📡 API Documentation

- **Swagger UI**: `http://localhost:8000/api/docs`
- **ReDoc**: `http://localhost:8000/api/redoc`
