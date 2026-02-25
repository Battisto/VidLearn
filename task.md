📊 Project Overview

VidLearn is an AI-powered educational platform designed to convert long educational videos into structured learning materials.

The system will automatically:

Generate concise AI-powered summaries

Create AI-generated quizzes

Provide multilingual translation support (Tamil ↔ English)

Track user progress and performance

Provide interactive learning experience

🎯 Objectives
Primary Objectives

Convert video → transcript → summary

Generate quiz questions automatically from summaries

Support Tamil and English translation

Build a full-stack web application

Store and manage users and learning data

Secondary Objectives

Provide performance analytics

Build scalable backend architecture

Deploy system to cloud

Provide intuitive frontend interface

🧠 Technology Stack
Frontend

React.js

Vite

Tailwind CSS

Backend

FastAPI (Python)

AI / ML

OpenAI Whisper (Speech-to-Text)

BART-large-cnn (Summarization)

Google Gemini API (Quiz Generation)

Translation APIs / Models

Database

MongoDB

DevOps

Docker

AWS / Render / Railway

🧩 System Architecture Flow

Video Upload
↓
Audio Extraction
↓
Speech-to-Text (Whisper)
↓
Text Preprocessing
↓
Summarization (BART)
↓
Quiz Generation (Gemini)
↓
Translation
↓
Store Results
↓
Display to User

📅 Project Phases and Tasks
Phase 1: Project Setup & Environment Configuration

Status: ✅ COMPLETED
Completed On: 2026-02-24
Estimated Time: 3–5 days

Tasks

✅ Create project folder structure (backend/, frontend/, uploads/, logs/)

✅ Setup backend using FastAPI (app factory, CORS, lifespan, route stubs)

✅ Setup frontend using React + Vite (scaffolded + Tailwind CSS v4)

✅ Setup Python virtual environment (backend/venv/)

✅ Install required dependencies (pip + npm)

✅ Configure environment variables (.env.example → .env, frontend/.env)

✅ Setup Git repository (initial commit: 920b308)

✅ Configure development environment (vite proxy → :8000, uvicorn hot-reload)

Phase 2: Video Upload Module

Status: ✅ COMPLETED
Completed On: 2026-02-25
Estimated Time: 4–6 days

Tasks

✅ Create video upload API endpoint (POST /api/videos/upload)

✅ Implement file validation (MIME type, extension, size — client + server)

✅ Save videos to storage (chunked streaming save to /uploads/)

✅ Create frontend upload interface (UploadPage.jsx with form)

✅ Add drag-and-drop upload support (native HTML5 DnD)

✅ Show upload progress (XHR progress events + animated ProgressBar)

✅ Handle upload errors (client validation, server errors, network errors)

Phase 3: Audio Extraction Module

Status: ✅ COMPLETED
Completed On: 2026-02-25
Estimated Time: 3–5 days

Tasks

✅ Install FFmpeg (v8.0.1 confirmed on system PATH)

✅ Integrate FFmpeg with backend (ffmpeg-python wrapper + subprocess)

✅ Extract audio from video (POST /api/videos/{id}/extract-audio)

✅ Save audio file (mono 16 kHz WAV in /audio/ dir, Whisper-optimised)

✅ Handle extraction failures (status machine: FAILED + error_message in DB)

✅ Optimize extraction speed (thread-pool executor keeps event loop free, -hwaccel auto)

Phase 4: Speech-to-Text Transcription

Status: ✅ COMPLETED
Completed On: 2026-02-25
Estimated Time: 4–6 days

Tasks

✅ Install Whisper model (openai-whisper installed via pip)

✅ Load Whisper model (singleton pattern, pre-loaded at startup, cached in memory)

✅ Convert audio → transcript (POST /api/videos/{id}/transcribe with model selector)

✅ Save transcript file (/transcripts/{video_id}.txt saved to disk)

✅ Handle transcription errors (FAILED status + error_message in DB, file cleanup)

✅ Optimize transcription performance (thread-pool executor, fp16=False, greedy decoding)

Phase 5: Text Preprocessing

Status: ✅ COMPLETED
Completed On: 2026-02-25
Estimated Time: 3–5 days

Tasks

✅ Clean transcript text (unicode NFC normalization, control char removal)

✅ Remove noise (Whisper artifacts, filler words, timestamps, hallucinated tags, repetitions)

✅ Normalize text (punctuation normalization, curly quotes, em-dashes, trailing spaces)

✅ Split transcript into chunks (overlapping 800-token chunks, 100-token overlap, sentence-boundary aware)

✅ Prepare text for summarization (BART-ready chunks stored in MongoDB + disk as {id}_clean.txt)

Phase 6: AI Summarization Module

Status: ✅ COMPLETED
Completed On: 2026-02-25
Estimated Time: 5–7 days

Tasks

✅ Install BART summarization model (optional local fallback, facebook/bart-large-cnn)

✅ Load summarization pipeline (BART singleton + Gemini API client, auto-detect by API key)

✅ Summarize text chunks (per-chunk summarization with Gemini 1.5 Flash or BART)

✅ Merge chunk summaries (≤3 chunks: smart concatenation; >3 chunks: second-pass AI merge)

✅ Store final summary (summary + chunk_summaries + SummaryMetadata in MongoDB + disk)

✅ Optimize summary quality (dual-provider, merge prompt engineering, compression ratio tracking)

Phase 7: Quiz Generation Module

Status: Not Started
Estimated Time: 5–7 days

Tasks

 Integrate Gemini API

 Design quiz data model

 Generate MCQs from summary

 Add difficulty levels

 Store quiz data

 Create quiz API endpoints

 Handle quiz submissions

 Calculate scores

Phase 8: Translation Module

Status: Not Started
Estimated Time: 5–7 days

Tasks

 Research translation APIs

 Integrate translation service

 Implement English → Tamil

 Implement Tamil → English

 Add language detection

 Store translated text

Phase 9: Backend API Development

Status: Not Started
Estimated Time: 5–7 days

Tasks

 Create REST API endpoints

 Video endpoints

 Summary endpoints

 Quiz endpoints

 Translation endpoints

 User endpoints

 Add error handling

 Add logging

Phase 10: Frontend Development

Status: Not Started
Estimated Time: 2 weeks

Tasks

 Create UI layout

 Video upload page

 Summary display page

 Quiz interface

 Translation interface

 Progress indicators

 Error handling UI

Phase 11: Database Integration

Status: Not Started
Estimated Time: 1 week

Tasks

 Install MongoDB

 Design database schema

 Create database models

 Connect backend to MongoDB

 Store videos

 Store summaries

 Store quizzes

 Store users

Phase 12: User Authentication System

Status: Not Started
Estimated Time: 1 week

Tasks

 Design user model

 Implement registration

 Implement login

 Implement JWT authentication

 Protect API routes

 Create frontend login/signup pages

Phase 13: Dashboard and Analytics

Status: Not Started
Estimated Time: 1–2 weeks

Tasks

 Create user dashboard

 Show video history

 Show quiz results

 Show performance analytics

 Create admin dashboard

Phase 14: Testing and Quality Assurance

Status: Not Started
Estimated Time: 1–2 weeks

Tasks

 Unit testing

 Integration testing

 Frontend testing

 Performance testing

 Security testing

 Bug fixing

Phase 15: Deployment and DevOps

Status: Not Started
Estimated Time: 1 week

Tasks

 Dockerize backend

 Dockerize frontend

 Setup CI/CD

 Deploy backend

 Deploy frontend

 Setup domain and SSL

Phase 16: Documentation and Presentation

Status: Not Started
Estimated Time: 1–2 weeks

Tasks

 Write project report

 Create architecture diagram

 Create API documentation

 Create presentation slides

 Prepare demo video

 Update GitHub README