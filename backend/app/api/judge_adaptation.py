"""Pass 15 — Judge Adaptation API.

All endpoints under /judge-adaptation prefix.
Ownership enforced at application level.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.judge_adaptation import (
    AdaptationNoteRow,
    CoachAssignWorkoutRequest,
    CustomJudgeProfileCreate,
    JudgeAdaptationAttemptRow,
    JudgeAdaptationAttemptScoreRequest,
    JudgeAdaptationAttemptScoreResponse,
    JudgeAdaptationAttemptTrends,
    JudgeAdaptationRequest,
    JudgeAdaptationResult,
    JudgeComparisonRequest,
    JudgeComparisonResult,
    JudgeProfile,
    JudgeReadinessReport,
    JudgeWorkoutCreate,
    JudgeWorkoutRow,
    SaveAdaptationNoteRequest,
    SaveOwnWorkoutRequest,
)
from app.services.adaptation_risk_checker import check_all_risks
from app.services.judge_attempt_scorer import MIN_ATTEMPT_LENGTH, score_practice_attempt
from app.services.judge_attempt_trends import aggregate_attempt_trends
from app.services.judge_adaptation_service import generate_adaptation
from app.services.judge_comparison import compare_profiles
from app.services.judge_profiles import get_all_builtin_profiles, get_builtin_profile
from app.services.judge_readiness_scorer import score_judge_readiness
from app.services.judge_workout_generator import generate_judge_workout
from app.services.product_events import track_product_event
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/judge-adaptation", tags=["judge_adaptation"])


def _now() -> str:
    from datetime import datetime
    return datetime.utcnow().isoformat()


def _http(exc: Exception) -> HTTPException:
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


# ── Judge profiles ────────────────────────────────────────────────────────────

@router.get("/profiles", response_model=list[JudgeProfile])
def list_profiles(user_id: Optional[str] = Query(None)) -> list[JudgeProfile]:
    """List all available judge profiles (built-in + user's custom profiles)."""
    profiles = get_all_builtin_profiles()
    if user_id:
        try:
            sb = get_supabase()
            result = sb.table("judge_profiles").select("*").eq("user_id", user_id).execute()
            for row in result.data or []:
                from app.models.judge_adaptation import JudgePreferences
                prefs = {k: row.get(k, 3) for k in [
                    "jargon_tolerance", "speed_tolerance", "evidence_detail_preference",
                    "line_by_line_expectation", "extension_strictness", "weighing_expectation",
                    "narrative_preference", "real_world_explanation", "technical_rule_sensitivity",
                    "intervention_tolerance", "organization_preference",
                    "source_qualification_importance", "persuasion_vs_flow_emphasis",
                ]}
                profiles.append(JudgeProfile(
                    id=row["id"],
                    judge_type=row.get("base_type", "custom"),
                    name=row["name"],
                    description=row.get("description") or "",
                    preferences=JudgePreferences(**prefs),
                    is_builtin=False,
                    user_id=row["user_id"],
                    team_id=row.get("team_id"),
                ))
        except Exception as exc:
            logger.warning("list_profiles: custom load failed: %s", exc)
    return profiles


@router.get("/profiles/{judge_type}", response_model=JudgeProfile)
def get_profile(judge_type: str) -> JudgeProfile:
    profile = get_builtin_profile(judge_type)  # type: ignore[arg-type]
    if not profile:
        raise HTTPException(status_code=404, detail=f"Profile '{judge_type}' not found")
    return profile


@router.post("/profiles/custom", response_model=JudgeProfile)
def create_custom_profile(body: CustomJudgeProfileCreate) -> JudgeProfile:
    sb = get_supabase()
    prefs = body.preferences.model_dump()
    payload = {
        "user_id": body.user_id,
        "name": body.name,
        "base_type": body.base_type,
        "description": body.description,
        **prefs,
    }
    if body.team_id:
        payload["team_id"] = body.team_id
    try:
        result = sb.table("judge_profiles").insert(payload).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Insert failed")
        row = result.data[0]
        return JudgeProfile(
            id=row["id"],
            judge_type=body.base_type,
            name=body.name,
            description=body.description or "",
            preferences=body.preferences,
            is_builtin=False,
            user_id=body.user_id,
        )
    except Exception as exc:
        raise _http(exc) from exc


# ── Adaptation ────────────────────────────────────────────────────────────────

@router.post("/adapt", response_model=JudgeAdaptationResult)
def adapt(body: JudgeAdaptationRequest) -> JudgeAdaptationResult:
    """Generate an adaptation plan for a source + judge type."""
    try:
        result = generate_adaptation(
            user_id=body.user_id,
            judge_type=body.judge_type,
            source_type=body.source_type,
            source_id=body.source_id,
            workspace_id=body.workspace_id,
        )
    except Exception as exc:
        logger.error("adapt: %s", exc)
        raise HTTPException(status_code=500, detail=f"Adaptation failed: {exc}") from exc

    # Persist adaptation result
    try:
        sb = get_supabase()
        payload = {
            "user_id": body.user_id,
            "judge_type": body.judge_type,
            "source_type": body.source_type,
            f"source_{body.source_type}_id": body.source_id,
            "result_json": result.model_dump(),
            "risk_count": len(result.risks),
            "change_count": len(result.changes),
            "workspace_id": body.workspace_id,
        }
        insert = sb.table("judge_adaptations").insert(payload).execute()
        if insert.data:
            result.id = insert.data[0].get("id")
    except Exception as exc:
        logger.warning("adapt: persist failed: %s", exc)

    track_product_event(
        body.user_id,
        "adaptations_generated",
        metadata={
            "judge_type": body.judge_type,
            "source_type": body.source_type,
            "risk_count": len(result.risks),
        },
    )

    track_product_event(
        body.user_id,
        "judge_profiles_selected",
        metadata={"judge_type": body.judge_type},
    )

    return result


# ── Comparison ────────────────────────────────────────────────────────────────

@router.post("/compare", response_model=JudgeComparisonResult)
def compare(body: JudgeComparisonRequest) -> JudgeComparisonResult:
    """Compare the same material across two or more judge profiles."""
    if len(body.judge_types) < 2:
        raise HTTPException(status_code=400, detail="At least 2 judge types required")

    try:
        result = compare_profiles(
            body.judge_types,
            body.source_type,
            body.source_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    track_product_event(
        body.user_id,
        "comparisons_run",
        metadata={
            "judge_types": list(body.judge_types),
            "source_type": body.source_type,
        },
    )

    return result


# ── Risks ─────────────────────────────────────────────────────────────────────

@router.post("/risks")
def detect_risks(
    user_id: str = Query(...),
    judge_type: str = Query(...),
    card_id: Optional[str] = Query(None),
) -> dict:
    """Run risk checks for a card + judge type combination."""
    card: dict = {}
    if card_id:
        try:
            sb = get_supabase()
            result = sb.table("evidence_cards").select("*").eq("id", card_id).limit(1).execute()
            if result.data and result.data[0].get("user_id") == user_id:
                card = result.data[0]
        except Exception as exc:
            logger.warning("detect_risks: card load: %s", exc)

    risks = check_all_risks(
        judge_type,  # type: ignore[arg-type]
        card_id=card_id,
        tag=card.get("tag"),
        original_body=card.get("body_text"),
        support_verdict=card.get("support_verdict"),
    )

    track_product_event(
        user_id,
        "adaptation_risks_found",
        metadata={"count": len(risks), "judge_type": judge_type},
    )

    return {
        "risks": [r.model_dump() for r in risks],
        "critical_count": sum(1 for r in risks if r.level == "critical"),
        "total": len(risks),
    }


# ── Workouts ──────────────────────────────────────────────────────────────────

@router.post("/workouts/generate", response_model=JudgeWorkoutCreate)
def generate_workout(
    user_id: str = Query(...),
    judge_type: str = Query(...),
    source_type: str = Query(...),
    source_id: str = Query(...),
    workspace_id: Optional[str] = Query(None),
) -> JudgeWorkoutCreate:
    """Generate a judge-specific workout from source material."""
    card: dict = {}
    if source_type == "evidence":
        try:
            sb = get_supabase()
            r = sb.table("evidence_cards").select("*").eq("id", source_id).limit(1).execute()
            if r.data and r.data[0].get("user_id") == user_id:
                card = r.data[0]
        except Exception as exc:
            logger.warning("generate_workout: card load: %s", exc)

    workout = generate_judge_workout(
        judge_type,  # type: ignore[arg-type]
        source_type,
        card=card,
        user_id=user_id,
        workspace_id=workspace_id,
    )

    if not workout:
        raise HTTPException(status_code=400, detail="Could not generate workout for this source type")

    track_product_event(
        user_id,
        "judge_workouts_generated",
        metadata={"judge_type": judge_type, "workout_type": workout.workout_type},
    )

    return workout


@router.post("/workouts/assign")
def assign_workout(body: CoachAssignWorkoutRequest) -> dict:
    """Coach assigns a judge workout to a student."""
    now = _now()
    payload = {
        "assigned_by": body.assigned_by,
        "assigned_to": body.assigned_to,
        "team_id": body.team_id,
        "workout_type": body.workout_type,
        "judge_type": body.judge_type,
        "title": body.title,
        "prompt": body.prompt,
        "instructions": body.instructions,
        "success_criteria": body.success_criteria,
        "time_limit_seconds": body.time_limit_seconds,
        "source_card_id": body.source_card_id,
        "source_card_tag": body.source_card_tag,
        "source_card_body_snapshot": body.source_card_body_snapshot,
        "status": "assigned",
    }
    try:
        sb = get_supabase()
        result = sb.table("judge_workout_assignments").insert(payload).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Assignment insert failed")
        track_product_event(
            body.assigned_by,
            "coach_assignments_created",
            metadata={"assigned_to": body.assigned_to, "judge_type": body.judge_type},
        )
        return {"id": result.data[0]["id"], "status": "assigned"}
    except Exception as exc:
        raise _http(exc) from exc


@router.patch("/workouts/{assignment_id}/complete")
def complete_workout(
    assignment_id: str,
    user_id: str = Query(...),
    student_notes: Optional[str] = Query(None),
) -> dict:
    """Student marks a judge workout complete."""
    sb = get_supabase()
    existing = sb.table("judge_workout_assignments").select("assigned_to,judge_type").eq("id", assignment_id).limit(1).execute()
    if not existing.data or existing.data[0]["assigned_to"] != user_id:
        raise HTTPException(status_code=404, detail="Assignment not found or not authorized")
    update_payload: dict = {"status": "completed", "completed_at": _now()}
    if student_notes:
        update_payload["student_notes"] = student_notes
    sb.table("judge_workout_assignments").update(update_payload).eq("id", assignment_id).execute()
    track_product_event(
        user_id,
        "judge_workouts_completed",
        metadata={"assignment_id": assignment_id},
    )
    # Emit mastery evidence for judge_adaptation skill (best-effort, non-fatal)
    try:
        from app.services.mastery_integration import emit_from_judge_adaptation
        judge_type = existing.data[0].get("judge_type", "unknown")
        # Default to 70/100 when there is no explicit scoring
        emit_from_judge_adaptation(
            supabase=sb,
            user_id=user_id,
            exercise_id=assignment_id,
            adaptation_score=70.0,
            judge_type=judge_type,
        )
    except Exception:
        pass
    return {"ok": True, "note": "Judge readiness updated. Evidence freshness and quality are unchanged."}


@router.post("/workouts/save")
def save_own_workout(body: SaveOwnWorkoutRequest) -> dict:
    """
    Student saves a generated workout preview for themselves (Phase 7C).

    Persists into the same judge_workout_assignments table coach assignments
    use, with assigned_by == assigned_to == the caller — so GET /workouts
    (already filtered by assigned_to) returns it alongside any coach-assigned
    workouts with no separate endpoint needed.
    """
    payload = {
        "assigned_by": body.user_id,
        "assigned_to": body.user_id,
        "workout_type": body.workout_type,
        "judge_type": body.judge_type,
        "title": body.title,
        "prompt": body.prompt,
        "instructions": body.instructions,
        "success_criteria": body.success_criteria,
        "time_limit_seconds": body.time_limit_seconds,
        "source_card_id": body.source_card_id,
        "source_card_tag": body.source_card_tag,
        "source_card_body_snapshot": body.source_card_body_snapshot,
        "status": "assigned",
    }
    try:
        sb = get_supabase()
        result = sb.table("judge_workout_assignments").insert(payload).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Workout save failed")
        track_product_event(
            body.user_id,
            "judge_workouts_self_saved",
            metadata={"judge_type": body.judge_type},
        )
        return {"id": result.data[0]["id"], "status": "assigned"}
    except HTTPException:
        raise
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/workouts", response_model=list[dict])
def list_workouts(user_id: str = Query(...)) -> list[dict]:
    """List all judge workout assignments for a student."""
    sb = get_supabase()
    result = (
        sb.table("judge_workout_assignments")
        .select("*")
        .eq("assigned_to", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


# ── Notes ─────────────────────────────────────────────────────────────────────

@router.post("/notes", response_model=AdaptationNoteRow)
def save_note(body: SaveAdaptationNoteRequest) -> AdaptationNoteRow:
    """Save a note on an adaptation."""
    # Verify adaptation ownership
    sb = get_supabase()
    existing = sb.table("judge_adaptations").select("user_id").eq("id", body.adaptation_id).limit(1).execute()
    if not existing.data or existing.data[0]["user_id"] != body.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        result = sb.table("judge_adaptation_notes").insert({
            "adaptation_id": body.adaptation_id,
            "user_id": body.user_id,
            "judge_type": body.judge_type,
            "note_text": body.note_text,
        }).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Note insert failed")
        row = result.data[0]
        track_product_event(body.user_id, "adaptation_notes_saved")
        return AdaptationNoteRow(
            id=row["id"],
            adaptation_id=row["adaptation_id"],
            user_id=row["user_id"],
            judge_type=row["judge_type"],
            note_text=row["note_text"],
            created_at=row.get("created_at", _now()),
        )
    except Exception as exc:
        raise _http(exc) from exc


@router.get("/notes/{adaptation_id}", response_model=list[AdaptationNoteRow])
def list_notes(adaptation_id: str, user_id: str = Query(...)) -> list[AdaptationNoteRow]:
    sb = get_supabase()
    existing = sb.table("judge_adaptations").select("user_id").eq("id", adaptation_id).limit(1).execute()
    if not existing.data or existing.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = sb.table("judge_adaptation_notes").select("*").eq("adaptation_id", adaptation_id).execute()
    return [
        AdaptationNoteRow(
            id=r["id"],
            adaptation_id=r["adaptation_id"],
            user_id=r["user_id"],
            judge_type=r["judge_type"],
            note_text=r["note_text"],
            created_at=r.get("created_at", _now()),
        )
        for r in result.data or []
    ]


# ── Practice attempts (Phase 7D) ────────────────────────────────────────────────

# source_type -> (FK column on judge_adaptations, verdict lookup table, its card-id column)
_EVIDENCE_SOURCE_TYPE = "evidence"


def _load_adaptation_for_scoring(sb, adaptation_id: str, user_id: str) -> dict:
    """Fetch the adaptation and verify it belongs to user_id. Raises 403/404."""
    res = (
        sb.table("judge_adaptations")
        .select("id, user_id, judge_type, source_type, source_evidence_id, "
                "source_argument_id, source_frontline_id, result_json")
        .eq("id", adaptation_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Adaptation not found")
    row = res.data[0]
    if row["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return row


def _card_support_verdict(sb, card_id: str, user_id: str) -> str | None:
    """Best-effort lookup of a card's saved support verdict. Never raises —
    an unavailable verdict is treated as unknown, not as a block."""
    try:
        res = (
            sb.table("library_card_metadata")
            .select("support_verdict")
            .eq("card_id", card_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0].get("support_verdict")
    except Exception as exc:
        logger.warning("score_attempt: verdict lookup failed | %s", type(exc).__name__)
    return None


@router.post("/score-attempt", response_model=JudgeAdaptationAttemptScoreResponse)
def score_attempt(body: JudgeAdaptationAttemptScoreRequest) -> JudgeAdaptationAttemptScoreResponse:
    """
    Score a pasted practice-delivery attempt against its adaptation
    (Phase 7D). Deterministic v1 heuristic scoring — no LLM call. Verifies
    ownership, rejects too-short attempts, and refuses to score evidence
    already known to be unsupported/contradicted (adapting delivery can't
    make bad evidence safe). Persists the attempt + score on success.
    """
    attempt_text = body.attempt_text.strip()
    if len(attempt_text) < MIN_ATTEMPT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Practice attempt is too short — add at least {MIN_ATTEMPT_LENGTH} characters.",
        )

    sb = get_supabase()
    adaptation = _load_adaptation_for_scoring(sb, body.adaptation_id, body.user_id)

    # Source/adaptation consistency check where practical — the request's
    # judge_type/source_type/source_id should match what the adaptation was
    # actually generated for.
    if adaptation["source_type"] != body.source_type:
        raise HTTPException(status_code=400, detail="Source type does not match this adaptation")
    fk_col = {
        "evidence": "source_evidence_id",
        "argument": "source_argument_id",
        "frontline": "source_frontline_id",
    }.get(body.source_type)
    if fk_col and adaptation.get(fk_col) and adaptation[fk_col] != body.source_id:
        raise HTTPException(status_code=400, detail="Source does not match this adaptation")

    card_verdict: str | None = None
    if body.source_type == _EVIDENCE_SOURCE_TYPE:
        card_verdict = _card_support_verdict(sb, body.source_id, body.user_id)
        if card_verdict in ("unsupported", "contradicted"):
            raise HTTPException(
                status_code=400,
                detail="This card's verdict says it doesn't support its claim — fix the evidence "
                       "in your Library before practicing its delivery.",
            )

    result_json = adaptation.get("result_json") or {}
    dimensions, what_improved, what_still_needs_work, integrity_warnings, next_retry_suggestion = (
        score_practice_attempt(
            judge_type=body.judge_type,
            source_type=body.source_type,
            attempt_text=attempt_text,
            result_json=result_json,
            card_support_verdict=card_verdict,
        )
    )
    overall_fit = round(sum(d.score for d in dimensions) / len(dimensions)) if dimensions else 0

    score_json = {
        "dimensions": [d.model_dump() for d in dimensions],
        "what_improved": what_improved,
        "what_still_needs_work": what_still_needs_work,
        "integrity_warnings": integrity_warnings,
        "next_retry_suggestion": next_retry_suggestion,
        "scoring_version": "v1_heuristic",
    }

    try:
        insert = sb.table("judge_adaptation_attempts").insert({
            "adaptation_id": body.adaptation_id,
            "user_id": body.user_id,
            "judge_type": body.judge_type,
            "source_type": body.source_type,
            "source_id": body.source_id,
            "attempt_text": attempt_text,
            "score_json": score_json,
            "overall_fit": overall_fit,
        }).execute()
        if not insert.data:
            raise HTTPException(status_code=500, detail="Attempt save failed")
        attempt_id = insert.data[0]["id"]
        saved = True
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("score_attempt: persist failed | %s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Attempt save failed") from exc

    track_product_event(
        body.user_id,
        "judge_practice_attempt_scored",
        metadata={"judge_type": body.judge_type, "overall_fit": overall_fit},
    )

    return JudgeAdaptationAttemptScoreResponse(
        attempt_id=attempt_id,
        overall_fit=overall_fit,
        dimensions=dimensions,
        what_improved=what_improved,
        what_still_needs_work=what_still_needs_work,
        integrity_warnings=integrity_warnings,
        next_retry_suggestion=next_retry_suggestion,
        saved=saved,
    )


@router.get("/adaptations/{adaptation_id}/attempts", response_model=list[JudgeAdaptationAttemptRow])
def list_attempts(adaptation_id: str, user_id: str = Query(...)) -> list[JudgeAdaptationAttemptRow]:
    """List a user's own practice attempts for one adaptation, newest first."""
    sb = get_supabase()
    existing = sb.table("judge_adaptations").select("user_id").eq("id", adaptation_id).limit(1).execute()
    if not existing.data or existing.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    result = (
        sb.table("judge_adaptation_attempts")
        .select("id, adaptation_id, user_id, judge_type, source_type, source_id, "
                "attempt_text, score_json, overall_fit, created_at")
        .eq("adaptation_id", adaptation_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [
        JudgeAdaptationAttemptRow(
            id=r["id"],
            adaptation_id=r["adaptation_id"],
            user_id=r["user_id"],
            judge_type=r["judge_type"],
            source_type=r["source_type"],
            source_id=r.get("source_id"),
            attempt_text=r["attempt_text"],
            score_json=r.get("score_json") or {},
            overall_fit=r.get("overall_fit"),
            created_at=r.get("created_at", _now()),
        )
        for r in result.data or []
    ]


ATTEMPT_TRENDS_WINDOW = 100


@router.get("/attempt-trends", response_model=JudgeAdaptationAttemptTrends)
def get_attempt_trends(user_id: str = Query(...)) -> JudgeAdaptationAttemptTrends:
    """
    Entry-level improvement summary across ALL of a user's scored practice
    attempts (Phase 7E). Ownership is implicit — the query is scoped to
    user_id directly (RLS-equivalent filter, matching every other endpoint
    in this router). Bounded to the most recent ATTEMPT_TRENDS_WINDOW
    attempts; aggregates never fabricate data beyond what was persisted, and
    every field is a real zero/None/empty-list when there's nothing to show.

    No join to judge_adaptations is needed — judge_type, overall_fit, and
    score_json are already denormalized onto each attempt row.
    """
    sb = get_supabase()
    result = (
        sb.table("judge_adaptation_attempts")
        .select("judge_type, overall_fit, score_json, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(ATTEMPT_TRENDS_WINDOW)
        .execute()
    )
    trends = aggregate_attempt_trends(result.data or [])
    return JudgeAdaptationAttemptTrends(**trends)


# ── History ───────────────────────────────────────────────────────────────────

_HISTORY_SOURCE_COLUMNS: dict[str, tuple[str, str]] = {
    # source_type -> (row FK column, lookup table)
    "evidence": ("source_evidence_id", "evidence_cards"),
    "argument": ("source_argument_id", "arguments"),
    "frontline": ("source_frontline_id", "frontlines"),
}
# Column holding the human label on each lookup table.
_HISTORY_LABEL_COLUMN: dict[str, str] = {
    "evidence_cards": "tag",
    "arguments": "title",
    "frontlines": "title",
}


def _attach_history_labels(sb, rows: list[dict]) -> None:
    """
    Batch-resolve a readable material label per row (bounded to this page —
    never one query per row). Rows whose source no longer exists, or whose
    source_type isn't labelable yet, get material_label=None; callers must
    treat that as truthful "unknown", not an error.
    """
    for source_type, (fk_col, table) in _HISTORY_SOURCE_COLUMNS.items():
        ids = list({r[fk_col] for r in rows if r.get("source_type") == source_type and r.get(fk_col)})
        if not ids:
            continue
        label_col = _HISTORY_LABEL_COLUMN[table]
        try:
            res = sb.table(table).select(f"id, {label_col}").in_("id", ids).execute()
        except Exception as exc:
            logger.warning("get_history: label lookup failed | table=%s | %s", table, type(exc).__name__)
            continue
        labels = {row["id"]: row.get(label_col) for row in (res.data or [])}
        for r in rows:
            if r.get("source_type") == source_type and r.get(fk_col):
                r["material_label"] = labels.get(r[fk_col])


@router.get("/history")
def get_history(
    user_id: str = Query(...),
    source_id: Optional[str] = Query(None),
    judge_type: Optional[str] = Query(None),
    limit: int = Query(10, le=50),
) -> list[dict]:
    """
    Retrieve adaptation history for a user.

    Includes result_json (the full persisted JudgeAdaptationResult, so a
    history entry can be reopened without regenerating it) and a batch-
    resolved material_label (the saved card/argument/frontline's real title
    — never a raw ID). Both are best-effort: a lookup failure never breaks
    the list, it just leaves material_label null for that row.
    """
    sb = get_supabase()
    query = sb.table("judge_adaptations").select(
        "id,judge_type,source_type,source_evidence_id,source_argument_id,"
        "source_frontline_id,risk_count,change_count,result_json,created_at"
    ).eq("user_id", user_id)
    if judge_type:
        query = query.eq("judge_type", judge_type)
    result = query.order("created_at", desc=True).limit(limit).execute()
    rows = result.data or []
    for r in rows:
        r.setdefault("material_label", None)
    try:
        _attach_history_labels(sb, rows)
    except Exception as exc:
        logger.warning("get_history: label attach failed (non-fatal) | %s", type(exc).__name__)
    return rows


# ── Judge readiness score ─────────────────────────────────────────────────────

@router.post("/readiness-score", response_model=JudgeReadinessReport)
def compute_readiness_score(body: JudgeAdaptationRequest) -> JudgeReadinessReport:
    """
    Compute judge readiness score for source + judge type.
    Separate dimension from evidence quality and freshness.
    """
    risks = check_all_risks(
        body.judge_type,
    )
    result = score_judge_readiness(
        body.judge_type,
        body.source_type,
        body.source_id,
        body.user_id,
        risks=risks,
    )
    return result
