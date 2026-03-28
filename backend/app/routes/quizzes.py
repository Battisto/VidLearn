from fastapi import APIRouter, Query, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional

from app.services import quiz_service
from app.routes.users import get_current_user, get_current_user_optional

router = APIRouter()


# ─── Generate ─────────────────────────────────────────────────────────────────

class GenerateQuizRequest(BaseModel):
    video_id: str
    num_questions: int = 10
    difficulty: Optional[str] = None   # "easy" | "medium" | "hard" | None (mixed)


@router.post(
    "/generate",
    status_code=201,
    summary="🎓 Generate MCQ quiz from video transcript",
    description=(
        "Generates a multiple-choice quiz from the preprocessed transcript. "
        "Pass `difficulty` to filter question difficulty, or leave blank for a mixed quiz. "
        "`num_questions` can be 3–20."
    ),
)
async def generate_quiz(body: GenerateQuizRequest):
    if body.difficulty and body.difficulty not in ("easy", "medium", "hard"):
        raise HTTPException(status_code=400, detail="difficulty must be 'easy', 'medium', or 'hard'")
    return await quiz_service.generate_quiz(
        video_id=body.video_id,
        num_questions=max(3, min(body.num_questions, 20)),
        difficulty=body.difficulty,
    )


# ─── Get quiz ─────────────────────────────────────────────────────────────────

@router.get(
    "/{quiz_id}",
    summary="Get quiz by ID",
)
async def get_quiz(quiz_id: str):
    return await quiz_service.get_quiz(quiz_id)


@router.get(
    "/video/{video_id}",
    summary="Get the latest quiz for a video",
)
async def get_quiz_for_video(video_id: str):
    quiz = await quiz_service.get_quiz_for_video(video_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="No quiz found for this video. Generate one first.")
    return quiz


# ─── Submit attempt ───────────────────────────────────────────────────────────

class SubmitAttemptRequest(BaseModel):
    answers: List[int]      # array of chosen option indices
    user_id: Optional[str] = None


@router.post(
    "/{quiz_id}/submit",
    summary="📊 Submit quiz answers and get score",
    description=(
        "Submit an array of answer indices (0-based per question). "
        "Returns score, percentage, grade (A-F), and per-question breakdown."
    ),
)
async def submit_attempt(
    quiz_id: str, 
    body: SubmitAttemptRequest,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    user_id = body.user_id
    if not user_id and current_user:
        user_id = str(current_user["_id"])
        
    return await quiz_service.submit_attempt(
        quiz_id=quiz_id,
        answers=body.answers,
        user_id=user_id,
    )


# ─── Get attempt ──────────────────────────────────────────────────────────────

@router.get(
    "/attempt/{attempt_id}",
    summary="Get a quiz attempt result",
)
async def get_attempt(attempt_id: str):
    return await quiz_service.get_attempt(attempt_id)


@router.get(
    "/attempts/me",
    summary="Get all quiz attempts for the current user",
)
async def get_my_attempts(current_user: dict = Depends(get_current_user)):
    return await quiz_service.get_user_attempts(str(current_user["_id"]))
