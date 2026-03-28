📊 Project Overview

VidLearn is a high-performance, AI-powered educational platform designed to transform video content into comprehensive learning materials. By leveraging state-of-the-art AI models, VidLearn automates the process of note-taking, summarizing, and testing, allowing users to focus purely on learning.

The system features a **one-shot processing pipeline** that automatically:
- 📥 **Imports Content**: Supports direct video uploads or instant YouTube imports (via captions or audio).
- 🔊 **Audio Engineering**: Extracts and optimizes speech for AI transcription using FFmpeg.
- 🎙️ **AI Transcription**: Converts speech to text with 99% accuracy using OpenAI Whisper.
- 📝 **Adaptive Summarization**: Generates summaries at 4 different levels (Brief, Standard, Detailed, Comprehensive).
- 🎓 **Cognitive Quizzing**: Uses NLP (spaCy) to generate Multiple Choice Questions (MCQs) with distractors.
- 🌐 **Multilingual Support**: Bidirectional Tamil ↔ English translation for all generated content.
- 📊 **Learning Analytics**: Personalized dashboard tracking activity, accuracy, and performance trends.

🎯 Objectives
Primary Objectives
- [x] Convert video/YouTube → transcript → summary automatically.
- [x] Generate context-aware quiz questions from AI summaries.
- [x] Support full Tamil ↔ English translation for global accessibility.
- [x] Build a responsive, high-performance full-stack web application.
- [x] Securely manage user accounts and learning data with persistence.

Secondary Objectives
- [x] Provide real-time performance analytics and learning streaks.
- [x] Implement a robust, scalable async backend architecture.
- [ ] Deploy the system to cloud (AWS/Render/Railway) with SSL.
- [x] Deliver a premium, glassmorphism-inspired dark mode interface.

🧠 Technology Stack
Frontend
- **Core**: React.js 18 with Vite (Ultra-fast HMR).
- **Navigation**: React Router 6.
- **State Management**: React Context API (Auth & Global State).
- **Styling**: Modern Vanilla CSS with Glassmorphism & High-end Animations.
- **API Client**: Axios/Fetch with JWT Interceptors.

Backend
- **Framework**: FastAPI (Asynchronous Python 3.10+).
- **Task Management**: Python BackgroundTasks for non-blocking ML pipelines.
- **Security**: JWT (OAuth2), Bcrypt (pinned v4.0.1 for stability).
- **Logging**: Loguru with rotated file output and rich coloring.

AI / ML & NLP
- **Speech-to-Text**: OpenAI Whisper / faster-whisper (Large-v3 support).
- **Summarization**: Google Gemini 1.5 Flash (Primary) / BART-large-cnn (Local fallback).
- **Quiz Engine**: spaCy (en_core_web_sm) for Named Entity Recognition (NER).
- **Translation**: `deep-translator` (Google API Wrapper).
- **YouTube**: `youtube-transcript-api` (Captions) & `yt-dlp` (Audio stream extraction).
- **Audio Processing**: FFmpeg (via `ffmpeg-python`).

Database
- **NoSQL**: MongoDB (v7.0+).
- **Driver**: Motor (Asynchronous MongoDB driver for Python).
- **ODM**: Pydantic v2 (Strict typing & data validation).

🧩 System Architecture Flow
1. **Source Selection**: User uploads file or pastes YouTube URL.
2. **Intelligent Intake**: 
   - *YouTube Path A*: Extract native captions (Instant).
   - *YouTube Path B / Upload*: Extract audio (FFmpeg) -> Transcribe (Whisper).
3. **Refinement**: Text preprocessing (Cleaning, Noise removal, Chunking).
4. **Intelligence Layer**: 
   - Summarization (Gemini/BART).
   - Quiz Generation (spaCy + Rule Engine).
5. **Localization**: Translation to Tamil/English upon user request.
6. **Persistence**: Store all artifacts (transcript, summary, quiz) in MongoDB.
7. **Presentation**: Dynamic updates in Dashboard and Video Detail views.

📅 Project Phases and Tasks

Phase 1: Project Setup & Environment Configuration
Status: ✅ COMPLETED
Completed On: 2026-02-24
Estimated Time: 3–5 days
- ✅ Create modular project structure (backend/app, frontend/src).
- ✅ Setup FastAPI application factory with CORS and Lifespan management.
- ✅ Setup Frontend with Vite + Dark Mode baseline.
- ✅ Configure `.env` with API keys (Gemini, JWT Secret, MongoDB).

Phase 2: Video & YouTube Intake Module
Status: ✅ COMPLETED
Completed On: 2026-02-25
- ✅ Implement chunked video upload API.
- ✅ Implement **Two-Path YouTube Import** (Captions first, Audio download fallback).
- ✅ Show real-time upload progress in UI.

Phase 3 & 4: Audio Extraction & Transcription
Status: ✅ COMPLETED
Completed On: 2026-02-25
- ✅ Integrate FFmpeg for Whisper-optimized WAV extraction.
- ✅ Load Whisper models as singleton to optimize memory.
- ✅ Implement async transcription with model selection (Tiny to Large).

Phase 5 & 6: Preprocessing & Adaptive Summarization
Status: ✅ COMPLETED
Completed On: 2026-02-25
- ✅ Implement sentence-boundary aware text chunking.
- ✅ Integrate **Google Gemini 1.5 Flash** for high-quality summaries.
- ✅ Implement 4 summary levels (Brief to Comprehensive).
- ✅ Fix: Handled MongoDB `_id` to `id` string conversion for Pydantic v2.

Phase 7: Quiz Generation Module
Status: ✅ COMPLETED
Completed On: 2026-03-11
- ✅ Implement NLP-based question extraction using **spaCy**.
- ✅ Enhanced: Integrated Gemini 1.5 Flash for high-quality, context-aware MCQs
✅ Added: Adaptive question counts and temperature-controlled generation (0.4)
✅ Setup grade-based scoring (A-F algorithm).
- ✅ Fix: Corrected quiz result navigation when accessed via Dashboard.

Phase 8: Translation Module
Status: ✅ COMPLETED
Completed On: 2026-03-11
- ✅ Integrated `deep-translator` for reliable English ↔ Tamil support.
- ✅ Add language toggle UI in Transcript and Summary pages.

Phase 9, 10, 11: System Integration & Database
Status: ✅ COMPLETED
Completed On: 2026-03-12
- ✅ Connect Motor (Async) to MongoDB.
- ✅ Implement One-Shot Pipeline Service (chains all AI steps).
- ✅ Design responsive status-aware UI for processing states.

Phase 12 & 13: Authentication & Dashboard
Status: ✅ COMPLETED
Completed On: 2026-03-12
- ✅ Implement JWT Auth with Login/Register pages.
- ✅ **Fix**: Resolved `bcrypt/passlib` version conflict by pinning `bcrypt==4.0.1`.
- ✅ Create Dashboard with Stats (Accuracy, Total Videos, Quizzes).
- ✅ **Fix**: Updated Sidebar/Navbar to show "Dashboard" instead of "Home" when logged in.
- ✅ **Fix**: Ensured all uploads and quizzes are correctly linked to the active user.

Phase 14: Testing and QA
Status: 🔄 IN PROGRESS
Estimated Time: 1 week
- [x] Create API debug scripts (`test_reg_api.py`, `test_login_api.py`).
- [x] Manual E2E testing of the processing pipeline.
- [ ] Formalize unit tests for AI services.
- [ ] Load testing for large file uploads.

Phase 15: Deployment
Status: ⏳ NOT STARTED
- [ ] Dockerize Backend and Frontend.
- [ ] Setup Nginx/Reverse Proxy.
- [ ] SSL Configuration.

Phase 16: Documentation
Status: 🔄 IN PROGRESS
- [x] Create comprehensive `task.md`.
- [x] Write detailed `README.md`.
- [ ] Generate API Swagger docs (`/api/docs`).