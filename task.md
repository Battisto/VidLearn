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

Status: Not Started
Estimated Time: 3–5 days

Tasks

 Create project folder structure

 Setup backend using FastAPI

 Setup frontend using React + Vite

 Setup Python virtual environment

 Install required dependencies

 Configure environment variables

 Setup Git repository

 Configure development environment

Phase 2: Video Upload Module

Status: Not Started
Estimated Time: 4–6 days

Tasks

 Create video upload API endpoint

 Implement file validation

 Save videos to storage

 Create frontend upload interface

 Add drag-and-drop upload support

 Show upload progress

 Handle upload errors

Phase 3: Audio Extraction Module

Status: Not Started
Estimated Time: 3–5 days

Tasks

 Install FFmpeg

 Integrate FFmpeg with backend

 Extract audio from video

 Save audio file

 Handle extraction failures

 Optimize extraction speed

Phase 4: Speech-to-Text Transcription

Status: Not Started
Estimated Time: 4–6 days

Tasks

 Install Whisper model

 Load Whisper model

 Convert audio → transcript

 Save transcript file

 Handle transcription errors

 Optimize transcription performance

Phase 5: Text Preprocessing

Status: Not Started
Estimated Time: 3–5 days

Tasks

 Clean transcript text

 Remove noise

 Normalize text

 Split transcript into chunks

 Prepare text for summarization

Phase 6: AI Summarization Module

Status: Not Started
Estimated Time: 5–7 days

Tasks

 Install BART summarization model

 Load summarization pipeline

 Summarize text chunks

 Merge chunk summaries

 Store final summary

 Optimize summary quality

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