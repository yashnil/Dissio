import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


class IncompleteDrill(BaseModel):
    id: str
    speech_id: str
    title: str
    skill_target: str
    difficulty: str
    status: str
    speech_title: str


class SkillAverage(BaseModel):
    clash: float
    weighing: float
    extensions: float
    drops: float
    judge_adaptation: float


class ProgressSummary(BaseModel):
    speech_count: int
    feedback_ready_count: int
    drills_assigned_count: int
    drill_attempts_count: int
    drills_completed_count: int
    drill_completion_rate: float | None
    incomplete_drills: list[IncompleteDrill]
    skill_averages: SkillAverage | None


@router.get("/{user_id}/progress", response_model=ProgressSummary)
async def get_user_progress(user_id: str) -> ProgressSummary:
    """
    Get aggregated progress metrics for a user.

    Returns:
    - Total speeches created
    - Speeches with feedback ready
    - Total drills assigned
    - Total drill attempts
    - Drill completion rate
    - List of incomplete drills (for "Recommended Next Practice")
    - Average scores across all feedback reports
    """
    supabase = get_supabase()

    # 1. Count speeches
    try:
        speeches_res = (
            supabase.table("speeches")
            .select("id, status")
            .eq("user_id", user_id)
            .execute()
        )
        speech_count = len(speeches_res.data)
        feedback_ready_count = sum(1 for s in speeches_res.data if s["status"] == "done")
    except Exception as exc:
        logger.error("get_user_progress: speeches fetch failed | %s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Failed to fetch speech data") from exc

    # 2. Count drills
    try:
        drills_res = (
            supabase.table("drills")
            .select("id, status")
            .eq("user_id", user_id)
            .execute()
        )
        drills_assigned_count = len(drills_res.data)
        drills_completed_count = sum(1 for d in drills_res.data if d["status"] == "completed")
        drill_completion_rate = (
            drills_completed_count / drills_assigned_count if drills_assigned_count > 0 else None
        )
    except Exception as exc:
        logger.error("get_user_progress: drills fetch failed | %s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Failed to fetch drill data") from exc

    # 3. Count drill attempts
    try:
        attempts_res = (
            supabase.table("drill_attempts")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        drill_attempts_count = attempts_res.count or 0
    except Exception as exc:
        logger.error("get_user_progress: drill attempts fetch failed | %s", type(exc).__name__)
        drill_attempts_count = 0

    # 4. Fetch incomplete drills (for "Recommended Next Practice")
    # Get the most recent drills that are not completed
    try:
        incomplete_res = (
            supabase.table("drills")
            .select("id, speech_id, title, skill_target, difficulty, status, speeches(title)")
            .eq("user_id", user_id)
            .neq("status", "completed")
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )
        incomplete_drills = [
            IncompleteDrill(
                id=d["id"],
                speech_id=d["speech_id"],
                title=d["title"],
                skill_target=d["skill_target"],
                difficulty=d["difficulty"],
                status=d["status"],
                speech_title=d["speeches"]["title"] if d.get("speeches") else "Unknown Speech",
            )
            for d in incomplete_res.data
        ]
    except Exception as exc:
        logger.error("get_user_progress: incomplete drills fetch failed | %s", type(exc).__name__)
        incomplete_drills = []

    # 5. Calculate average feedback scores
    try:
        feedback_res = (
            supabase.table("feedback_reports")
            .select("scores, speeches!inner(user_id)")
            .eq("speeches.user_id", user_id)
            .execute()
        )

        if feedback_res.data:
            # Average each dimension
            clash_scores = []
            weighing_scores = []
            extensions_scores = []
            drops_scores = []
            judge_adaptation_scores = []

            for fb in feedback_res.data:
                scores = fb.get("scores", {})
                if isinstance(scores, dict):
                    if "clash" in scores: clash_scores.append(scores["clash"])
                    if "weighing" in scores: weighing_scores.append(scores["weighing"])
                    if "extensions" in scores: extensions_scores.append(scores["extensions"])
                    if "drops" in scores: drops_scores.append(scores["drops"])
                    if "judge_adaptation" in scores: judge_adaptation_scores.append(scores["judge_adaptation"])

            skill_averages = SkillAverage(
                clash=sum(clash_scores) / len(clash_scores) if clash_scores else 0,
                weighing=sum(weighing_scores) / len(weighing_scores) if weighing_scores else 0,
                extensions=sum(extensions_scores) / len(extensions_scores) if extensions_scores else 0,
                drops=sum(drops_scores) / len(drops_scores) if drops_scores else 0,
                judge_adaptation=sum(judge_adaptation_scores) / len(judge_adaptation_scores) if judge_adaptation_scores else 0,
            )
        else:
            skill_averages = None
    except Exception as exc:
        logger.error("get_user_progress: feedback averages failed | %s", type(exc).__name__)
        skill_averages = None

    return ProgressSummary(
        speech_count=speech_count,
        feedback_ready_count=feedback_ready_count,
        drills_assigned_count=drills_assigned_count,
        drill_attempts_count=drill_attempts_count,
        drills_completed_count=drills_completed_count,
        drill_completion_rate=drill_completion_rate,
        incomplete_drills=incomplete_drills,
        skill_averages=skill_averages,
    )
