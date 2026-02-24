# VidLearn 🎓

> AI-powered educational platform that converts long videos into structured learning materials.

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React.js + Vite + Tailwind CSS |
| Backend | FastAPI (Python) |
| STT | OpenAI Whisper |
| Summarization | BART-large-cnn |
| Quiz Generation | Google Gemini API |
| Database | MongoDB |
| DevOps | Docker, AWS/Render/Railway |

## 📁 Project Structure

```
m1/
├── backend/
│   ├── app/
│   │   ├── core/          # config, database, logging
│   │   ├── models/        # Pydantic + MongoDB models
│   │   ├── routes/        # API route handlers
│   │   ├── services/      # Business logic (AI, storage)
│   │   └── utils/         # Shared helpers
│   ├── requirements.txt
│   ├── .env.example
│   └── run.py
├── frontend/              # React + Vite app
├── uploads/               # Video file storage
├── logs/                  # Application logs
└── task.md
```

## ⚙️ Setup

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env       # then fill in your API keys
python run.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## 📡 API

Once the backend is running, visit:
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc
- Health Check: http://localhost:8000/api/health

## 📅 Project Phases

See [task.md](./task.md) for detailed phase breakdown.
