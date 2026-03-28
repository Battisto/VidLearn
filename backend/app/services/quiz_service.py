"""
quiz_service.py — Phase 7: NLP-based Quiz Generation
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Generates multiple-choice quizzes from video summaries/transcripts.

Strategy (CPU-friendly, no heavy model needed):
  1. Split source text into informative sentences using spaCy
  2. Score each sentence by information density (NE count + token length)
  3. For each selected sentence, extract a key answer span (NE or noun chunk)
  4. Build a Cloze question ("___ is mentioned as …" / "What is …?")
  5. Generate 3 distractors:
       • Other named entities of the same type
       • Top-N nearest noun-chunks from the corpus
       • Fallback to shuffled substrings

Difficulty assignment:
  Easy   — short answers, common nouns, factual "what/who is" questions
  Medium — process / relationship questions, multi-word answers
  Hard   — "why/how" style, abstract or numeric details

Quiz data is stored in a "quizzes" MongoDB collection.
Attempts stored in "quiz_attempts" collection.
"""

import re
import random
import asyncio
from datetime import datetime
from typing import List, Optional, Dict, Any
from concurrent.futures import ThreadPoolExecutor
from bson import ObjectId
from loguru import logger
import json
import google.generativeai as genai

from app.core.database import get_db
from app.core.config import settings

QUIZ_COL    = "quizzes"
ATTEMPT_COL = "quiz_attempts"
VIDEO_COL   = "videos"

_executor  = ThreadPoolExecutor(max_workers=2, thread_name_prefix="quiz")
_nlp       = None          # spaCy model (lazy-loaded)
_nlp_lock  = asyncio.Lock()


# ─── spaCy loader ─────────────────────────────────────────────────────────────

def _load_nlp():
    global _nlp
    if _nlp is not None:
        return _nlp
    try:
        import spacy
        _nlp = spacy.load("en_core_web_sm")
        logger.info("✅ spaCy en_core_web_sm loaded for quiz generation")
    except Exception as exc:
        logger.warning(f"⚠️  spaCy not available: {exc} — using fallback quiz generation")
        _nlp = None
    return _nlp


# ─── Text helpers ──────────────────────────────────────────────────────────────

def _clean_text(text: str) -> str:
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[^\x20-\x7E]', '', text)
    return text.strip()


def _split_sentences(text: str) -> List[str]:
    """Simple sentence splitter (fallback when spaCy unavailable)."""
    raw = re.split(r'(?<=[.!?])\s+', text)
    return [s.strip() for s in raw if len(s.split()) >= 5]


def _sentence_score(sent) -> float:
    """Score a spaCy Span by information density."""
    ents  = len(sent.ents)
    nouns = sum(1 for t in sent if t.pos_ in ("NOUN", "PROPN"))
    verbs = sum(1 for t in sent if t.pos_ == "VERB")
    wlen  = len(sent)
    return ents * 3 + nouns * 1.5 + verbs * 1.2 + (1.0 if 6 <= wlen <= 30 else 0)


# ─── Distractor generation ────────────────────────────────────────────────────

def _collect_entities(doc, label: str, exclude: str) -> List[str]:
    seen, out = set(), []
    for ent in doc.ents:
        t = ent.text.strip()
        if ent.label_ == label and t.lower() != exclude.lower() and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _collect_noun_chunks(doc, exclude: str) -> List[str]:
    seen, out = set(), []
    for chunk in doc.noun_chunks:
        t = chunk.text.strip()
        if t.lower() != exclude.lower() and t not in seen and 1 <= len(t.split()) <= 4:
            seen.add(t)
            out.append(t)
    return out


def _make_distractors(answer: str, doc, n: int = 3) -> List[str]:
    """Generate n plausible-but-wrong options."""
    candidates = []

    if doc:
        # 1. Same-type named entities
        for ent in doc.ents:
            if ent.text.strip().lower() == answer.lower():
                candidates += _collect_entities(doc, ent.label_, answer)
                break
        # 2. Noun chunks
        if len(candidates) < n * 2:
            candidates += _collect_noun_chunks(doc, answer)
    else:
        # Fallback: grab words from the text
        words = list({w for w in re.findall(r'\b[A-Za-z]{4,}\b', str(doc)) if w.lower() != answer.lower()})
        candidates = words

    random.shuffle(candidates)
    distractors = list(dict.fromkeys(candidates))[:n]

    # Pad with generic fallbacks
    generic_fallbacks = ["Not mentioned", "None of the above", "Cannot be determined", "All of the above"]
    while len(distractors) < n:
        fb = generic_fallbacks.pop(0) if generic_fallbacks else f"Option {len(distractors)+2}"
        distractors.append(fb)

    return distractors[:n]


# ─── Question templates ───────────────────────────────────────────────────────

def _build_question(sentence: str, answer: str, sent_obj=None) -> str:
    """Build a fill-in-the-blank or wh-question around the answer."""
    # Try to make a natural question
    s = sentence.replace(answer, "_____", 1)

    # Identify if it's a definition
    if " is " in sentence.lower() and answer in sentence:
        q = f"What is {answer}?"
        return q

    if " are " in sentence.lower() and answer in sentence:
        q = f"What are {answer}?"
        return q

    # Fallback: cloze style
    return f"Fill in the blank: {s}"


def _assign_difficulty(sentence: str, answer: str, doc_sent=None) -> str:
    words = sentence.split()
    ans_words = answer.split()

    # Numeric or date answers are hard
    if re.search(r'\d{3,}|\d{1,2}/\d{1,2}|\d{4}', answer):
        return "hard"
    # Long answers are medium/hard
    if len(ans_words) >= 3:
        return "hard"
    if len(ans_words) == 2:
        return "medium"
    # Short sentences = easy
    if len(words) <= 12:
        return "easy"
    if len(words) <= 20:
        return "medium"
    return "hard"


# ─── Core generation logic (blocking — runs in executor) ─────────────────────

def _generate_questions_sync(text: str, num_questions: int, difficulty_filter: Optional[str]) -> List[Dict]:
    """
    Blocking quiz generation. Returns a list of question dicts.
    """
    nlp = _load_nlp()
    text = _clean_text(text)

    if len(text) < 100:
        return []

    # ── Process with spaCy (or fallback) ──────────────────────────────────────
    if nlp:
        doc      = nlp(text[:50000])   # spaCy limit guard
        sents    = list(doc.sents)
        # Score and pick best sentences
        scored   = sorted(sents, key=_sentence_score, reverse=True)
        selected = scored[:num_questions * 3]    # take more, filter later
    else:
        # Fallback: simple sentence splitting
        doc      = None
        raw_sents = _split_sentences(text)
        selected  = raw_sents[:num_questions * 3]

    questions = []
    seen_answers = set()

    for sent in selected:
        if len(questions) >= num_questions:
            break

        sent_text = sent.text.strip() if hasattr(sent, "text") else str(sent)
        if len(sent_text.split()) < 5:
            continue

        # ── Extract answer span ────────────────────────────────────────────────
        answer = None
        if nlp and hasattr(sent, "ents") and sent.ents:
            # Prefer named entities
            for ent in sent.ents:
                if len(ent.text) > 2 and ent.text.lower() not in seen_answers:
                    answer = ent.text.strip()
                    break
        if not answer and nlp and hasattr(sent, "noun_chunks"):
            # Try noun chunks
            chunks = [c for c in sent.noun_chunks if len(c.text.split()) <= 3]
            if chunks:
                answer = chunks[0].text.strip()
        if not answer:
            # Fallback: first capitalized word or any 1-3 word run
            m = re.search(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b', sent_text)
            if m:
                answer = m.group(1).strip()
        if not answer:
            words = [w for w in sent_text.split() if len(w) > 4]
            answer = words[0] if words else None

        if not answer or answer.lower() in seen_answers:
            continue

        seen_answers.add(answer.lower())

        # ── Build question ─────────────────────────────────────────────────────
        question_text = _build_question(sent_text, answer)

        # ── Distractors ───────────────────────────────────────────────────────
        distractors = _make_distractors(answer, doc)

        # ── Difficulty ────────────────────────────────────────────────────────
        diff = _assign_difficulty(sent_text, answer)
        if difficulty_filter and diff != difficulty_filter:
            continue   # skip if filtering

        # ── Shuffle options ───────────────────────────────────────────────────
        options      = [answer] + distractors
        correct_idx  = 0
        paired       = list(enumerate(options))
        random.shuffle(paired)
        shuffled     = [v for _, v in paired]
        correct_idx  = next(i for i, (orig_i, _) in enumerate(paired) if orig_i == 0)

        questions.append({
            "question":       question_text,
            "options":        shuffled,
            "correct_answer": correct_idx,
            "explanation":    f"From the transcript: \"{sent_text[:200]}\"",
            "difficulty":     diff,
            "source_sentence": sent_text[:300],
        })

    # Pad to num_questions if not enough spaCy hits
    if not questions:
        logger.warning("Quiz generation produced 0 questions — text may be too short")

    return questions


# ─── Gemini Generation (AI Powered) ───────────────────────────────────────────

def _generate_questions_gemini_sync(text: str, num_q: int, difficulty: Optional[str]) -> List[Dict]:
    """
    Call Gemini API to generate structured quiz JSON.
    Runs in thread pool executor.
    """
    import google.generativeai as genai
    import json
    import time
    import re

    genai.configure(api_key=settings.GOOGLE_GEMINI_API_KEY)
    
    # User requested temperature 0.3-0.5
    model = genai.GenerativeModel(
        model_name=settings.GEMINI_MODEL,
        generation_config={
            "temperature": 0.4
        }
    )

    diff_instruction = ""
    if difficulty and difficulty in ("easy", "medium", "hard"):
        diff_instruction = f"All {num_q} questions MUST be of '{difficulty}' difficulty."
    else:
        diff_instruction = f"Distribute the {num_q} questions across 'easy', 'medium', and 'hard' difficulties."

    prompt = (
        "You are an expert educational content creator. I will provide a summary/transcript of a video. "
        f"Your task is to generate Exactly {num_q} high-quality Multiple Choice Questions (MCQs).\n\n"
        "Rules:\n"
        f"1. {diff_instruction}\n"
        "2. Each question must have exactly 4 distinct options.\n"
        "3. One and only one option must be correct.\n"
        "4. Output MUST be strictly valid JSON in the format described below.\n\n"
        "JSON Structure:\n"
        "{\n"
        "  \"quiz\": [\n"
        "    {\n"
        "      \"question\": \"Question text here?\",\n"
        "      \"options\": [\"Option A\", \"Option B\", \"Option C\", \"Option D\"],\n"
        "      \"answer\": \"Exact text of the correct option\",\n"
        "      \"difficulty\": \"easy|medium|hard\",\n"
        "      \"explanation\": \"Brief explanation of the answer\"\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        f"Source Material:\n{text}\n\n"
        "JSON Response:"
    )

    try:
        response = model.generate_content(prompt)
        raw_text = response.text.strip()
        
        # Robust JSON cleaning
        if "```json" in raw_text:
            raw_text = re.search(r'```json\s*(.*?)\s*```', raw_text, re.DOTALL).group(1)
        elif "```" in raw_text:
            raw_text = re.search(r'```\s*(.*?)\s*```', raw_text, re.DOTALL).group(1)
            
        data = json.loads(raw_text)
        raw_questions = data.get("quiz", [])
        
        # Convert text answers to indices for internal compatibility
        formatted = []
        for q in raw_questions:
            options = q.get("options", [])
            answer_text = q.get("answer", "")
            
            try:
                correct_idx = options.index(answer_text)
            except ValueError:
                # If exact match fails, try fuzzy or pick first
                correct_idx = 0
                logger.warning(f"Gemini answer '{answer_text}' not in options list. Defaulting to 0.")

            formatted.append({
                "question":       q.get("question", "Question?"),
                "options":        options,
                "correct_answer": correct_idx,
                "explanation":    q.get("explanation", "Based on video content."),
                "difficulty":     q.get("difficulty", "medium"),
                "source_sentence": text[:200] # marker
            })
            
        return formatted[:num_q]

    except Exception as e:
        logger.error(f"Gemini quiz generation failed: {e}")
        return []


# ─── DB helpers ───────────────────────────────────────────────────────────────

async def _get_video(video_id: str) -> Dict:
    from fastapi import HTTPException
    db  = get_db()
    doc = await db[VIDEO_COL].find_one({"_id": ObjectId(video_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Video not found.")
    return doc


def _serialize(obj: Any) -> Any:
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(v) for v in obj]
    return obj


# ─── Public API ───────────────────────────────────────────────────────────────

async def generate_quiz(
    video_id: str,
    num_questions: int      = 10,
    difficulty: Optional[str] = None,   # None = mixed
) -> Dict:
    """
    Main entry point — POST /api/quizzes/generate
    Pulls the preprocessed text (or summary) and generates an MCQ quiz.
    """
    from fastapi import HTTPException

    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID.")

    doc = await _get_video(video_id)

    # Source text priority (User: Summary Generation -> Quiz Generation)
    source_text = (
        doc.get("summary")
        or doc.get("cleaned_transcript")
        or doc.get("transcript")
        or ""
    )
    
    # If summary is a structured dict (Comprehensive), extract full text
    if isinstance(source_text, dict):
        source_text = source_text.get("full_text") or source_text.get("overview") or str(source_text)

    # Add chunk texts if available and source_text is still weak
    if not source_text or len(source_text.strip()) < 100:
        chunks = doc.get("preprocessed_chunks", [])
        if chunks:
            source_text = " ".join(c.get("text", "") for c in chunks)

    if len(source_text.strip()) < 50:
        raise HTTPException(
            status_code=422,
            detail="Not enough text to generate a quiz. Please transcribe and preprocess the video first.",
        )

    logger.info(
        f"🎓 Generating quiz | video_id={video_id} | "
        f"n={num_questions} | difficulty={difficulty or 'mixed'}"
    )

    loop     = asyncio.get_event_loop()
    num_q    = max(3, min(num_questions, 20))
    diff_filter = difficulty if difficulty in ("easy", "medium", "hard") else None

    questions = None
    # Use Gemini if enabled (AI Powered - Enhanced)
    if settings.gemini_enabled:
        logger.info(f"🤖 Using {settings.GEMINI_MODEL} for quiz generation...")
        questions = await loop.run_in_executor(
            _executor, _generate_questions_gemini_sync, source_text, num_q, diff_filter
        )
        if not questions:
            logger.warning("⚠️ Gemini generation failed (quota or parsing issue) - falling back to spaCy!")

    if not questions:
        # Fallback to rule-based logic
        logger.info("🧩 Using spaCy rule-based engine for quiz generation...")
        questions = await loop.run_in_executor(
            _executor, _generate_questions_sync, source_text, num_q, diff_filter
        )

    if not questions:
        raise HTTPException(
            status_code=422,
            detail="Could not generate questions from this content. The transcript may be too short.",
        )

    # ── Cap difficulty label ──────────────────────────────────────────────────
    difficulty_label = difficulty or "mixed"

    quiz_doc = {
        "video_id":       video_id,
        "title":          f"Quiz: {doc.get('title', 'Untitled')}",
        "difficulty":     difficulty_label,
        "questions":      questions,
        "total_questions": len(questions),
        "created_at":     datetime.utcnow(),
        "updated_at":     datetime.utcnow(),
    }

    db     = get_db()
    result = await db[QUIZ_COL].insert_one(quiz_doc)
    quiz_id = str(result.inserted_id)

    logger.info(f"✅ Quiz created | quiz_id={quiz_id} | questions={len(questions)}")

    quiz_doc["_id"]     = quiz_id
    quiz_doc["quiz_id"] = quiz_id
    return _serialize(quiz_doc)


async def get_quiz(quiz_id: str) -> Dict:
    from fastapi import HTTPException
    if not ObjectId.is_valid(quiz_id):
        raise HTTPException(status_code=400, detail="Invalid quiz ID.")
    db  = get_db()
    doc = await db[QUIZ_COL].find_one({"_id": ObjectId(quiz_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Quiz not found.")
    return _serialize(doc)


async def get_quiz_for_video(video_id: str) -> Optional[Dict]:
    """Return the most recent quiz for a video (or None)."""
    from fastapi import HTTPException
    if not ObjectId.is_valid(video_id):
        raise HTTPException(status_code=400, detail="Invalid video ID.")
    db  = get_db()
    doc = await db[QUIZ_COL].find_one(
        {"video_id": video_id},
        sort=[("created_at", -1)],
    )
    return _serialize(doc) if doc else None


async def submit_attempt(
    quiz_id: str,
    answers: List[int],    # user's chosen option index per question
    user_id: Optional[str] = None,
) -> Dict:
    """
    Score a quiz attempt and save to quiz_attempts collection.
    Returns { score, total, percentage, results: [{correct, chosen, explanation}] }
    """
    from fastapi import HTTPException

    quiz = await get_quiz(quiz_id)
    questions = quiz.get("questions", [])

    if len(answers) != len(questions):
        raise HTTPException(
            status_code=400,
            detail=f"Expected {len(questions)} answers, got {len(answers)}.",
        )

    results = []
    score   = 0

    for i, (q, chosen) in enumerate(zip(questions, answers)):
        correct  = q["correct_answer"]
        is_right = (chosen == correct)
        if is_right:
            score += 1

        results.append({
            "question_index": i,
            "question":       q["question"],
            "options":        q["options"],
            "chosen":         chosen,
            "correct_answer": correct,
            "is_correct":     is_right,
            "explanation":    q.get("explanation", ""),
            "difficulty":     q.get("difficulty", "medium"),
        })

    total      = len(questions)
    percentage = round(score / total * 100, 1) if total > 0 else 0
    grade      = _grade(percentage)

    attempt_doc = {
        "quiz_id":    quiz_id,
        "video_id":   quiz.get("video_id"),
        "user_id":    user_id,
        "answers":    answers,
        "score":      score,
        "total":      total,
        "percentage": percentage,
        "grade":      grade,
        "results":    results,
        "submitted_at": datetime.utcnow(),
    }

    db     = get_db()
    result = await db[ATTEMPT_COL].insert_one(attempt_doc)
    attempt_doc["_id"]        = str(result.inserted_id)
    attempt_doc["attempt_id"] = str(result.inserted_id)

    logger.info(
        f"📊 Quiz submitted | quiz_id={quiz_id} | "
        f"score={score}/{total} ({percentage}%) | grade={grade}"
    )

    return _serialize(attempt_doc)


def _grade(pct: float) -> str:
    if pct >= 90: return "A"
    if pct >= 80: return "B"
    if pct >= 70: return "C"
    if pct >= 60: return "D"
    return "F"


async def get_attempt(attempt_id: str) -> Dict:
    from fastapi import HTTPException
    if not ObjectId.is_valid(attempt_id):
        raise HTTPException(status_code=400, detail="Invalid attempt ID.")
    db  = get_db()
    doc = await db[ATTEMPT_COL].find_one({"_id": ObjectId(attempt_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Attempt not found.")
    return _serialize(doc)


async def get_user_attempts(user_id: str) -> List[Dict]:
    db = get_db()
    cursor = db[ATTEMPT_COL].find({"user_id": user_id}).sort("submitted_at", -1)
    docs = await cursor.to_list(length=100)
    return _serialize(docs)
