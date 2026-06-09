"""
Pilot readiness endpoints.

  GET /users/{user_id}/pilot-summary  — per-user pilot metrics + skill trends
  GET /pilot                          — aggregate pilot dashboard (current user only)
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(tags=["pilot"])


# ── Response models ────────────────────────────────────────────────────────────

class SkillTrend(BaseModel):
    current: float
    previous: Optional[float] = None
    delta: Optional[float] = None
    trend: str  # improving | stable | needs_attention | no_data


class SkillTrends(BaseModel):
    clash: SkillTrend
    weighing: SkillTrend
    extensions: SkillTrend
    drops: SkillTrend
    judge_adaptation: SkillTrend


class PilotSummary(BaseModel):
    speech_count: int
    analyzed_speech_count: int
    drill_count: int
    drill_attempt_count: int
    completed_drill_count: int
    rerecord_count: int
    comparison_count: int
    feedback_rating_count: int
    average_feedback_rating: Optional[float]
    drill_rating_count: int
    average_drill_rating: Optional[float]
    return_for_second_speech: bool
    completed_one_drill: bool
    latest_skill_scores: Optional[dict[str, float]]
    skill_trends: Optional[SkillTrends]
    common_issues: list[str]


class PilotAggregate(BaseModel):
    total_users: int
    speeches_uploaded: int
    analyzed_speeches: int
    drills_assigned: int
    drill_attempts: int
    rerecords: int
    feedback_ratings: int
    average_feedback_usefulness: Optional[float]
    drill_ratings: int
    average_drill_usefulness: Optional[float]
    common_issues: list[str]
    common_drop_off: str


# ── Helpers ────────────────────────────────────────────────────────────────────

_RATING_WEIGHTS = {"helpful": 1.0, "somewhat": 0.5, "not_helpful": 0.0}


def _rating_to_float(rating: Optional[str]) -> Optional[float]:
    return _RATING_WEIGHTS.get(rating or "") if rating else None


def _average_ratings(ratings: list[str]) -> Optional[float]:
    values = [_RATING_WEIGHTS[r] for r in ratings if r in _RATING_WEIGHTS]
    return sum(values) / len(values) if values else None


def _compute_skill_trends(reports: list[dict[str, Any]]) -> Optional[SkillTrends]:
    if not reports:
        return None

    dims = ["clash", "weighing", "extensions", "drops", "judge_adaptation"]
    scores_by_dim: dict[str, list[float]] = {d: [] for d in dims}

    for report in reports:
        scores = report.get("scores") or {}
        if isinstance(scores, dict):
            for d in dims:
                if d in scores and scores[d] is not None:
                    scores_by_dim[d].append(float(scores[d]))

    def _build_trend(vals: list[float]) -> SkillTrend:
        if not vals:
            return SkillTrend(current=0.0, trend="no_data")
        current = vals[-1]
        if len(vals) >= 2:
            previous = vals[-2]
            delta = current - previous
            if delta >= 2:
                trend = "improving"
            elif delta <= -2:
                trend = "needs_attention"
            else:
                trend = "stable"
            return SkillTrend(current=current, previous=previous, delta=round(delta, 1), trend=trend)
        return SkillTrend(current=current, trend="no_data")

    return SkillTrends(
        clash=_build_trend(scores_by_dim["clash"]),
        weighing=_build_trend(scores_by_dim["weighing"]),
        extensions=_build_trend(scores_by_dim["extensions"]),
        drops=_build_trend(scores_by_dim["drops"]),
        judge_adaptation=_build_trend(scores_by_dim["judge_adaptation"]),
    )


def _extract_common_issues(reports: list[dict[str, Any]], limit: int = 5) -> list[str]:
    """Extract the most common top_3_priorities from feedback reports."""
    freq: dict[str, int] = {}
    for report in reports:
        raw = report.get("raw_feedback") or {}
        if isinstance(raw, dict):
            priorities = raw.get("top_3_priorities") or []
            for p in priorities[:3]:
                freq[p] = freq.get(p, 0) + 1
    sorted_issues = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    return [issue for issue, _ in sorted_issues[:limit]]


# ── GET /users/{user_id}/pilot-summary ────────────────────────────────────────

@router.get("/users/{user_id}/pilot-summary", response_model=PilotSummary)
async def get_pilot_summary(user_id: str) -> PilotSummary:
    """Return enriched pilot metrics for a single user, including skill trends."""
    supabase = get_supabase()

    # 1. Speeches
    try:
        speeches_res = (
            supabase.table("speeches")
            .select("id, status, parent_speech_id")
            .eq("user_id", user_id)
            .execute()
        )
        speeches = speeches_res.data or []
        speech_count = len(speeches)
        analyzed_count = sum(1 for s in speeches if s.get("status") == "done")
        rerecord_count = sum(1 for s in speeches if s.get("parent_speech_id"))
    except Exception as exc:
        logger.error("pilot_summary: speeches failed | %s", type(exc).__name__)
        speech_count = analyzed_count = rerecord_count = 0
        speeches = []

    # 2. Drills
    try:
        drills_res = (
            supabase.table("drills")
            .select("id, status")
            .eq("user_id", user_id)
            .execute()
        )
        drills = drills_res.data or []
        drill_count = len(drills)
        completed_drill_count = sum(1 for d in drills if d.get("status") == "completed")
    except Exception as exc:
        logger.error("pilot_summary: drills failed | %s", type(exc).__name__)
        drill_count = completed_drill_count = 0

    # 3. Drill attempts
    try:
        attempts_res = (
            supabase.table("drill_attempts")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        drill_attempt_count = attempts_res.count or 0
    except Exception as exc:
        logger.error("pilot_summary: drill_attempts failed | %s", type(exc).__name__)
        drill_attempt_count = 0

    # 4. Comparisons viewed (from product_events)
    try:
        comp_res = (
            supabase.table("product_events")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("event_name", "comparison_viewed")
            .execute()
        )
        comparison_count = comp_res.count or 0
    except Exception as exc:
        logger.error("pilot_summary: comparison_count failed | %s", type(exc).__name__)
        comparison_count = 0

    # 5. Feedback ratings
    try:
        fb_res = (
            supabase.table("feedback_reports")
            .select("helpful_rating, scores, raw_feedback, created_at")
            .in_("speech_id", [s["id"] for s in speeches] if speeches else ["__none__"])
            .order("created_at")
            .execute()
        )
        fb_reports = fb_res.data or []
        rated_reports = [r for r in fb_reports if r.get("helpful_rating")]
        feedback_rating_count = len(rated_reports)
        average_feedback_rating = _average_ratings([r["helpful_rating"] for r in rated_reports])
    except Exception as exc:
        logger.error("pilot_summary: feedback_ratings failed | %s", type(exc).__name__)
        fb_reports = rated_reports = []
        feedback_rating_count = 0
        average_feedback_rating = None

    # 6. Drill ratings
    try:
        dr_res = (
            supabase.table("drill_ratings")
            .select("rating")
            .eq("user_id", user_id)
            .execute()
        )
        drill_ratings_data = dr_res.data or []
        drill_rating_count = len(drill_ratings_data)
        average_drill_rating = _average_ratings([r["rating"] for r in drill_ratings_data])
    except Exception as exc:
        logger.error("pilot_summary: drill_ratings failed | %s", type(exc).__name__)
        drill_rating_count = 0
        average_drill_rating = None

    # 7. Pilot flags
    return_for_second_speech = speech_count >= 2
    completed_one_drill = completed_drill_count >= 1

    # 8. Skill trends (last 5 feedback reports, ordered chronologically)
    skill_trends = _compute_skill_trends(fb_reports[-5:])
    latest_skill_scores: Optional[dict[str, float]] = None
    if fb_reports:
        latest = fb_reports[-1].get("scores") or {}
        if isinstance(latest, dict):
            latest_skill_scores = {k: float(v) for k, v in latest.items() if v is not None}

    # 9. Common issues
    common_issues = _extract_common_issues(fb_reports)

    return PilotSummary(
        speech_count=speech_count,
        analyzed_speech_count=analyzed_count,
        drill_count=drill_count,
        drill_attempt_count=drill_attempt_count,
        completed_drill_count=completed_drill_count,
        rerecord_count=rerecord_count,
        comparison_count=comparison_count,
        feedback_rating_count=feedback_rating_count,
        average_feedback_rating=average_feedback_rating,
        drill_rating_count=drill_rating_count,
        average_drill_rating=average_drill_rating,
        return_for_second_speech=return_for_second_speech,
        completed_one_drill=completed_one_drill,
        latest_skill_scores=latest_skill_scores,
        skill_trends=skill_trends,
        common_issues=common_issues,
    )


# ── GET /pilot ────────────────────────────────────────────────────────────────
# Dev/internal page: current-user-only aggregate view.
# Does NOT expose other users' data or transcripts.

@router.get("/pilot", response_model=PilotAggregate)
async def get_pilot_dashboard(user_id: str = Query(...)) -> PilotAggregate:
    """
    Return pilot aggregate statistics for the current user only.

    This is a dev/internal view for pilot health monitoring.
    No cross-user data is returned; user_id filters all queries.
    """
    supabase = get_supabase()

    # Speeches
    try:
        speeches_res = (
            supabase.table("speeches")
            .select("id, status, parent_speech_id")
            .eq("user_id", user_id)
            .execute()
        )
        speeches = speeches_res.data or []
        speeches_uploaded = len(speeches)
        analyzed_speeches = sum(1 for s in speeches if s.get("status") == "done")
        rerecords = sum(1 for s in speeches if s.get("parent_speech_id"))
    except Exception as exc:
        logger.error("pilot_dashboard: speeches failed | %s", type(exc).__name__)
        speeches_uploaded = analyzed_speeches = rerecords = 0
        speeches = []

    # Drills
    try:
        drills_res = (
            supabase.table("drills")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        drills_assigned = drills_res.count or 0
    except Exception as exc:
        logger.error("pilot_dashboard: drills failed | %s", type(exc).__name__)
        drills_assigned = 0

    # Drill attempts
    try:
        attempts_res = (
            supabase.table("drill_attempts")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        drill_attempts = attempts_res.count or 0
    except Exception as exc:
        logger.error("pilot_dashboard: drill_attempts failed | %s", type(exc).__name__)
        drill_attempts = 0

    # Feedback ratings
    try:
        fb_res = (
            supabase.table("feedback_reports")
            .select("helpful_rating, raw_feedback")
            .in_("speech_id", [s["id"] for s in speeches] if speeches else ["__none__"])
            .execute()
        )
        fb_data = fb_res.data or []
        rated = [r["helpful_rating"] for r in fb_data if r.get("helpful_rating")]
        feedback_ratings = len(rated)
        avg_fb = _average_ratings(rated)
    except Exception as exc:
        logger.error("pilot_dashboard: fb_ratings failed | %s", type(exc).__name__)
        fb_data = []
        feedback_ratings = 0
        avg_fb = None

    # Drill ratings
    try:
        dr_res = (
            supabase.table("drill_ratings")
            .select("rating")
            .eq("user_id", user_id)
            .execute()
        )
        dr_data = dr_res.data or []
        drill_ratings = len(dr_data)
        avg_dr = _average_ratings([r["rating"] for r in dr_data])
    except Exception as exc:
        logger.error("pilot_dashboard: dr_ratings failed | %s", type(exc).__name__)
        drill_ratings = 0
        avg_dr = None

    # Common issues from feedback
    common_issues = _extract_common_issues(fb_data)

    # Drop-off point: where does the user get stuck?
    if drill_attempts == 0 and drills_assigned > 0:
        drop_off = "assigned_drills_not_attempted"
    elif analyzed_speeches == 0 and speeches_uploaded > 0:
        drop_off = "uploaded_not_analyzed"
    elif speeches_uploaded == 0:
        drop_off = "no_speech_yet"
    elif rerecords == 0 and drill_attempts > 0:
        drop_off = "practicing_drills_no_rerecord"
    else:
        drop_off = "active"

    return PilotAggregate(
        total_users=1,  # current user only — no cross-user exposure
        speeches_uploaded=speeches_uploaded,
        analyzed_speeches=analyzed_speeches,
        drills_assigned=drills_assigned,
        drill_attempts=drill_attempts,
        rerecords=rerecords,
        feedback_ratings=feedback_ratings,
        average_feedback_usefulness=avg_fb,
        drill_ratings=drill_ratings,
        average_drill_usefulness=avg_dr,
        common_issues=common_issues,
        common_drop_off=drop_off,
    )
