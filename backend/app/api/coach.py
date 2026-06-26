"""Coach Command Center API.

Provides the unified coach dashboard, assignment templates, enriched student
profile, weekly report, and usage summary. Authorization enforced in-code
(service-role bypasses RLS).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.assignments import (
    _member_role, _require_coach, _require_member,
    _speech_status_map, effective_status, VALID_KINDS,
)
from app.models.coach import (
    AssignmentTemplateCreate, AssignmentTemplateRow, AssignTemplateRequest,
    AttentionFlag, CoachNote, CoachNoteCreate, CommandCenterResponse,
    RichStudentProfile, RosterRow, TeamSummary, UsageSummaryResponse,
    WeeklyReportResponse, WeeklyReportRosterItem,
)
from app.services.auth import get_current_user_id
from app.services.coach_analytics import (
    compute_attention_flags, compute_roster_row, compute_team_summary,
    compute_usage_summary, compute_weekly_report, _parse, _now,
)
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(tags=["coach"])

# ── Built-in templates ────────────────────────────────────────────────────────

_BUILTIN_TEMPLATES: list[dict] = [
    {
        "id": "builtin-warranting",
        "team_id": None, "created_by": None, "is_built_in": True,
        "title": "Constructive Warranting Check",
        "description": "Focus on why each claim is true — not just what it claims.",
        "kind": "speech", "speech_type": "constructive", "target_skill": "warranting",
        "success_criteria": [
            "Each claim has a because-clause explaining why it is true",
            "Warrants reference real-world mechanisms, not circular assertions",
            "At least one piece of evidence per major argument",
        ],
        "goal": "Evaluate and strengthen warrant development in your constructive speech.",
        "duration_minutes": 20, "due_offset_days": 5, "created_at": None,
    },
    {
        "id": "builtin-rebuttal",
        "team_id": None, "created_by": None, "is_built_in": True,
        "title": "Rebuttal Frontline Practice",
        "description": "Practice answering opponent arguments with structured frontlines.",
        "kind": "speech", "speech_type": "rebuttal", "target_skill": "clash",
        "success_criteria": [
            "Directly engages the top 2 opponent arguments",
            "Provides turn or non-unique response before evidence",
            "Extends your strongest case argument",
        ],
        "goal": "Build rebuttal speed and frontline structure.",
        "duration_minutes": 20, "due_offset_days": 5, "created_at": None,
    },
    {
        "id": "builtin-summary-weighing",
        "team_id": None, "created_by": None, "is_built_in": True,
        "title": "Summary Weighing Drill",
        "description": "Collapse arguments and weigh impacts under time pressure.",
        "kind": "speech", "speech_type": "summary", "target_skill": "weighing",
        "success_criteria": [
            "Identifies the 1-2 arguments most likely to win the round",
            "Weighs by magnitude, probability, or timeframe — not just size",
            "Responds to the top opponent argument or concedes strategically",
        ],
        "goal": "Practice concise weighing and strategic argument selection.",
        "duration_minutes": 15, "due_offset_days": 4, "created_at": None,
    },
    {
        "id": "builtin-final-focus",
        "team_id": None, "created_by": None, "is_built_in": True,
        "title": "Final Focus Collapse Exercise",
        "description": "Collapse to the single most important reason you win.",
        "kind": "speech", "speech_type": "final_focus", "target_skill": "drops",
        "success_criteria": [
            "Collapses to no more than two voting issues",
            "Answers or explains away a dropped opponent argument",
            "Ends with a clear judge instruction",
        ],
        "goal": "Develop crisp Final Focus structure and decision-point framing.",
        "duration_minutes": 12, "due_offset_days": 3, "created_at": None,
    },
    {
        "id": "builtin-citation",
        "team_id": None, "created_by": None, "is_built_in": True,
        "title": "Evidence Citation Cleanup",
        "description": "Practice citing evidence with author, year, and qualifier.",
        "kind": "speech", "speech_type": None, "target_skill": "evidence_use",
        "success_criteria": [
            "Every card is cited with author last name and year",
            "Paraphrased claims are distinguished from quoted evidence",
            "No fabricated statistics or unsourced claims",
        ],
        "goal": "Build the habit of clean, verifiable evidence use.",
        "duration_minutes": 20, "due_offset_days": 7, "created_at": None,
    },
    {
        "id": "builtin-readiness",
        "team_id": None, "created_by": None, "is_built_in": True,
        "title": "Tournament Readiness Check",
        "description": "Full-length speech at tournament pace.",
        "kind": "speech", "speech_type": None, "target_skill": None,
        "success_criteria": [
            "Hits the target time within 15 seconds",
            "Addresses all major argument areas from your flow",
            "Delivery is clear and judge-adapted",
        ],
        "goal": "Simulate tournament conditions to gauge readiness.",
        "duration_minutes": 30, "due_offset_days": 7, "created_at": None,
    },
]


# ── Permission guards ─────────────────────────────────────────────────────────


def _is_coach_of(supabase, team_id: str, caller: str) -> bool:
    return _member_role(supabase, team_id, caller) == "coach"


# ── Data loader helpers ───────────────────────────────────────────────────────


def _load_student_data(supabase, team_id: str, student_ids: list[str], now: datetime) -> list[dict]:
    """Load a richer student dict used by command-center and weekly-report."""
    if not student_ids:
        return []

    week_ago = now - timedelta(days=7)

    # profiles
    profiles: dict[str, str | None] = {}
    try:
        rows = supabase.table("profiles").select("id, display_name").in_("id", student_ids).execute().data or []
        profiles = {r["id"]: r.get("display_name") for r in rows}
    except Exception:
        pass

    # speeches
    speeches_by_user: dict[str, list[dict]] = {uid: [] for uid in student_ids}
    try:
        rows = supabase.table("speeches").select("id, user_id, status, created_at").in_("user_id", student_ids).order("created_at", desc=True).execute().data or []
        for r in rows:
            speeches_by_user.setdefault(r["user_id"], []).append(r)
    except Exception:
        pass

    # active missions
    active_missions: dict[str, dict] = {}
    try:
        rows = supabase.table("student_missions").select("id, user_id, skill, status, updated_at").in_("user_id", student_ids).in_("status", ["ready", "in_progress", "paused"]).execute().data or []
        for r in rows:
            active_missions[r["user_id"]] = r
    except Exception:
        pass

    # completed missions (most recent 5 per student for trend)
    completed_by_user: dict[str, list[dict]] = {uid: [] for uid in student_ids}
    try:
        rows = supabase.table("student_missions").select("user_id, skill, score_delta, completed_at").in_("user_id", student_ids).eq("status", "completed").order("completed_at", desc=True).execute().data or []
        for r in rows:
            lst = completed_by_user.setdefault(r["user_id"], [])
            if len(lst) < 5:
                lst.append(r)
    except Exception:
        pass

    # assignment recipients enriched with due_date + effective_status
    recs_by_user: dict[str, list[dict]] = {uid: [] for uid in student_ids}
    try:
        a_rows = supabase.table("assignments").select("id, due_date").eq("team_id", team_id).execute().data or []
        a_due = {a["id"]: a.get("due_date") for a in a_rows}
        a_ids = list(a_due.keys())
        if a_ids:
            r_rows = supabase.table("assignment_recipients").select("id, assignment_id, user_id, status, submission_speech_id, submitted_at, reviewed_at").in_("assignment_id", a_ids).in_("user_id", student_ids).execute().data or []
            s_map = _speech_status_map(supabase, [r.get("submission_speech_id") for r in r_rows])
            for r in r_rows:
                eff = effective_status(r["status"], s_map.get(r.get("submission_speech_id")))
                recs_by_user.setdefault(r["user_id"], []).append({
                    **r,
                    "effective_status": eff,
                    "due_date": a_due.get(r["assignment_id"]),
                    "team_id": team_id,
                })
    except Exception:
        pass

    # drill attempts count + this week count
    drill_attempts_by_user: dict[str, int] = {uid: 0 for uid in student_ids}
    drill_attempts_week_by_user: dict[str, int] = {uid: 0 for uid in student_ids}
    try:
        rows = supabase.table("drill_attempts").select("user_id, created_at").in_("user_id", student_ids).execute().data or []
        for r in rows:
            uid = r["user_id"]
            drill_attempts_by_user[uid] = drill_attempts_by_user.get(uid, 0) + 1
            dt = _parse(r.get("created_at"))
            if dt and dt >= week_ago:
                drill_attempts_week_by_user[uid] = drill_attempts_week_by_user.get(uid, 0) + 1
    except Exception:
        pass

    # recent analysis jobs (for failed-analysis flag)
    jobs_by_user: dict[str, list[dict]] = {uid: [] for uid in student_ids}
    try:
        rows = supabase.table("analysis_jobs").select("user_id, status").in_("user_id", student_ids).in_("status", ["failed"]).order("created_at", desc=True).execute().data or []
        for r in rows:
            jobs_by_user.setdefault(r["user_id"], []).append(r)
    except Exception:
        pass

    # assemble
    result = []
    for uid in student_ids:
        speeches = speeches_by_user.get(uid, [])
        latest_practice = speeches[0]["created_at"] if speeches else None
        speeches_this_week = sum(1 for s in speeches if _parse(s.get("created_at")) and _parse(s["created_at"]) >= week_ago)
        result.append({
            "user_id": uid,
            "display_name": profiles.get(uid),
            "speech_count": len(speeches),
            "feedback_ready_count": sum(1 for s in speeches if s.get("status") == "done"),
            "latest_practice_at": latest_practice,
            "speeches_this_week": speeches_this_week,
            "active_mission": active_missions.get(uid),
            "completed_missions": completed_by_user.get(uid, []),
            "assignment_recipients": recs_by_user.get(uid, []),
            "drill_attempts_count": drill_attempts_by_user.get(uid, 0),
            "drills_assigned_count": 0,  # drills table is per-user; skip for now
            "drill_attempts_this_week": drill_attempts_week_by_user.get(uid, 0),
            "recent_jobs": jobs_by_user.get(uid, []),
        })
    return result


# ── Command Center endpoint ───────────────────────────────────────────────────


@router.get("/teams/{team_id}/command-center", response_model=CommandCenterResponse)
async def command_center(
    team_id: str, caller: str = Depends(get_current_user_id)
) -> CommandCenterResponse:
    """Full coach dashboard: summary, roster, attention queue."""
    supabase = get_supabase()
    _require_coach(supabase, team_id, caller)
    now = _now()

    # Team info
    try:
        team_row = supabase.table("teams").select("id, name, invite_code").eq("id", team_id).limit(1).execute().data
        if not team_row:
            raise HTTPException(status_code=404, detail="Team not found")
        team = team_row[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch team") from exc

    # Student IDs
    try:
        members = supabase.table("team_members").select("user_id").eq("team_id", team_id).eq("role", "student").execute().data or []
        student_ids = [m["user_id"] for m in members]
    except Exception:
        student_ids = []

    students = _load_student_data(supabase, team_id, student_ids, now)

    # Assignment list for summary overdue check
    try:
        a_rows = supabase.table("assignments").select("id, due_date, title").eq("team_id", team_id).execute().data or []
        assignments: list[dict] = []
        if a_rows:
            a_ids = [a["id"] for a in a_rows]
            r_rows = supabase.table("assignment_recipients").select("assignment_id, status, submission_speech_id").in_("assignment_id", a_ids).execute().data or []
            s_map = _speech_status_map(supabase, [r.get("submission_speech_id") for r in r_rows])
            by_a: dict[str, list[dict]] = {}
            for r in r_rows:
                eff = effective_status(r["status"], s_map.get(r.get("submission_speech_id")))
                by_a.setdefault(r["assignment_id"], []).append({"status": eff})
            for a in a_rows:
                assignments.append({"id": a["id"], "due_date": a.get("due_date"), "recipients": by_a.get(a["id"], [])})
    except Exception:
        assignments = []

    # Onboarding state
    onboarding_done = len(student_ids) > 0 and len(assignments) > 0

    roster_rows = [compute_roster_row(s, now) for s in students]
    attention_queue = [r for r in roster_rows if r["attention_level"] != "none"]
    attention_queue.sort(key=lambda r: (0 if r["attention_level"] == "high" else 1, r.get("days_inactive") or 0), reverse=False)

    summary_data = compute_team_summary(students, assignments, now)

    return CommandCenterResponse(
        team_id=team["id"],
        team_name=team["name"],
        invite_code=team["invite_code"],
        summary=TeamSummary(**summary_data),
        roster=[RosterRow(**r) for r in roster_rows],
        attention_queue=[RosterRow(**r) for r in attention_queue],
        onboarding_done=onboarding_done,
    )


# ── Weekly report ─────────────────────────────────────────────────────────────


@router.get("/teams/{team_id}/weekly-report", response_model=WeeklyReportResponse)
async def weekly_report(
    team_id: str, caller: str = Depends(get_current_user_id)
) -> WeeklyReportResponse:
    """On-demand deterministic weekly report. No LLM."""
    supabase = get_supabase()
    _require_coach(supabase, team_id, caller)
    now = _now()

    try:
        members = supabase.table("team_members").select("user_id").eq("team_id", team_id).eq("role", "student").execute().data or []
        student_ids = [m["user_id"] for m in members]
    except Exception:
        student_ids = []

    students = _load_student_data(supabase, team_id, student_ids, now)

    try:
        a_rows = supabase.table("assignments").select("id, due_date").eq("team_id", team_id).execute().data or []
        assignments: list[dict] = []
        if a_rows:
            a_ids = [a["id"] for a in a_rows]
            r_rows = supabase.table("assignment_recipients").select("assignment_id, status, submission_speech_id, reviewed_at").in_("assignment_id", a_ids).execute().data or []
            s_map = _speech_status_map(supabase, [r.get("submission_speech_id") for r in r_rows])
            by_a: dict[str, list[dict]] = {}
            for r in r_rows:
                eff = effective_status(r["status"], s_map.get(r.get("submission_speech_id")))
                by_a.setdefault(r["assignment_id"], []).append({"status": eff, "reviewed_at": r.get("reviewed_at")})
            for a in a_rows:
                assignments.append({"id": a["id"], "due_date": a.get("due_date"), "recipients": by_a.get(a["id"], [])})
    except Exception:
        assignments = []

    report = compute_weekly_report(students, assignments, now)
    return WeeklyReportResponse(
        **{k: v for k, v in report.items() if k != "roster"},
        roster=[WeeklyReportRosterItem(**r) for r in report.get("roster", [])],
    )


# ── Usage summary ─────────────────────────────────────────────────────────────


@router.get("/teams/{team_id}/usage-summary", response_model=UsageSummaryResponse)
async def usage_summary(
    team_id: str, caller: str = Depends(get_current_user_id)
) -> UsageSummaryResponse:
    """Non-billing usage stats for team owners. Coach-only."""
    supabase = get_supabase()
    _require_coach(supabase, team_id, caller)

    try:
        members = supabase.table("team_members").select("user_id").eq("team_id", team_id).eq("role", "student").execute().data or []
        student_ids = [m["user_id"] for m in members]
    except Exception:
        student_ids = []

    speech_count = 0
    drill_count = 0
    if student_ids:
        try:
            sp = supabase.table("speeches").select("id", count="exact").in_("user_id", student_ids).execute()
            speech_count = sp.count or 0
        except Exception:
            pass
        try:
            dr = supabase.table("drill_attempts").select("id", count="exact").in_("user_id", student_ids).execute()
            drill_count = dr.count or 0
        except Exception:
            pass

    assignment_count = 0
    try:
        ac = supabase.table("assignments").select("id", count="exact").eq("team_id", team_id).execute()
        assignment_count = ac.count or 0
    except Exception:
        pass

    # evidence searches: count research jobs
    ev_count = 0
    if student_ids:
        try:
            ev = supabase.table("analysis_jobs").select("id", count="exact").in_("user_id", student_ids).eq("job_type", "evidence_check").execute()
            ev_count = ev.count or 0
        except Exception:
            pass

    data = compute_usage_summary(
        team_id=team_id,
        total_students=len(student_ids),
        speech_count=speech_count,
        evidence_search_count=ev_count,
        drill_count=drill_count,
        assignment_count=assignment_count,
        storage_mb=0.0,
    )
    return UsageSummaryResponse(**data)


# ── Assignment templates ──────────────────────────────────────────────────────


@router.get("/assignment-templates", response_model=list[AssignmentTemplateRow])
async def list_templates(
    team_id: str | None = None, caller: str = Depends(get_current_user_id)
) -> list[AssignmentTemplateRow]:
    """Return built-in templates + optional team-specific templates."""
    built_ins = [AssignmentTemplateRow(**t) for t in _BUILTIN_TEMPLATES]

    if not team_id:
        return built_ins

    supabase = get_supabase()
    role = _member_role(supabase, team_id, caller)
    if role is None:
        raise HTTPException(status_code=403, detail="Not a team member")

    try:
        rows = supabase.table("assignment_templates").select("*").eq("team_id", team_id).order("created_at", desc=True).execute().data or []
        team_templates = [AssignmentTemplateRow(**r) for r in rows]
    except Exception:
        team_templates = []

    return built_ins + team_templates


@router.post("/assignment-templates", response_model=AssignmentTemplateRow, status_code=201)
async def create_template(
    body: AssignmentTemplateCreate, caller: str = Depends(get_current_user_id)
) -> AssignmentTemplateRow:
    """Coach creates a reusable team template."""
    supabase = get_supabase()
    _require_coach(supabase, body.team_id, caller)

    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Template title is required")
    if body.kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail=f"Invalid kind: {body.kind}")

    try:
        row = supabase.table("assignment_templates").insert({
            "team_id": body.team_id,
            "created_by": caller,
            "title": body.title.strip(),
            "description": body.description,
            "kind": body.kind,
            "speech_type": body.speech_type,
            "target_skill": body.target_skill,
            "success_criteria": body.success_criteria,
            "goal": body.goal,
            "duration_minutes": body.duration_minutes,
            "due_offset_days": body.due_offset_days,
        }).execute().data[0]
        return AssignmentTemplateRow(**row)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create template") from exc


@router.delete("/assignment-templates/{template_id}", status_code=204)
async def delete_template(
    template_id: str, caller: str = Depends(get_current_user_id)
) -> None:
    """Delete a team template (coach-only). Cannot delete built-ins."""
    if template_id.startswith("builtin-"):
        raise HTTPException(status_code=400, detail="Built-in templates cannot be deleted")

    supabase = get_supabase()
    row = supabase.table("assignment_templates").select("team_id, created_by").eq("id", template_id).limit(1).execute().data
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    _require_coach(supabase, row[0]["team_id"], caller)

    try:
        supabase.table("assignment_templates").delete().eq("id", template_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to delete template") from exc


@router.post("/assignment-templates/{template_id}/assign", status_code=201)
async def assign_from_template(
    template_id: str, body: AssignTemplateRequest, caller: str = Depends(get_current_user_id)
) -> dict:
    """Create an assignment from a built-in or team template."""
    supabase = get_supabase()
    _require_coach(supabase, body.team_id, caller)

    # Resolve template
    template: dict | None = None
    for t in _BUILTIN_TEMPLATES:
        if t["id"] == template_id:
            template = t
            break

    if template is None:
        try:
            rows = supabase.table("assignment_templates").select("*").eq("id", template_id).limit(1).execute().data
            if rows:
                template = rows[0]
        except Exception:
            pass

    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    if not body.recipient_user_ids:
        raise HTTPException(status_code=400, detail="Select at least one recipient")

    from datetime import date, timedelta as td
    due = body.due_date or (date.today() + td(days=template.get("due_offset_days", 7))).isoformat()

    try:
        a_row = supabase.table("assignments").insert({
            "team_id": body.team_id,
            "created_by": caller,
            "title": template["title"],
            "kind": template["kind"],
            "speech_type": template.get("speech_type"),
            "goal": template.get("goal"),
            "success_criteria": template.get("success_criteria", []),
            "due_date": due,
        }).execute().data[0]
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create assignment") from exc

    rows = [{"assignment_id": a_row["id"], "user_id": uid} for uid in dict.fromkeys(body.recipient_user_ids)]
    try:
        supabase.table("assignment_recipients").insert(rows).execute()
    except Exception:
        pass

    return {"assignment_id": a_row["id"], "title": a_row["title"], "recipient_count": len(rows)}


# ── Coach notes ───────────────────────────────────────────────────────────────


@router.get("/teams/{team_id}/students/{student_id}/notes", response_model=list[CoachNote])
async def list_notes(
    team_id: str, student_id: str, caller: str = Depends(get_current_user_id)
) -> list[CoachNote]:
    supabase = get_supabase()
    _require_coach(supabase, team_id, caller)
    if _member_role(supabase, team_id, student_id) is None:
        raise HTTPException(status_code=404, detail="Student not on this team")

    try:
        rows = supabase.table("coach_notes").select("*").eq("team_id", team_id).eq("student_id", student_id).order("created_at", desc=True).execute().data or []
        return [CoachNote(**r) for r in rows]
    except Exception:
        return []


@router.post("/teams/{team_id}/students/{student_id}/notes", response_model=CoachNote, status_code=201)
async def add_note(
    team_id: str, student_id: str, body: CoachNoteCreate,
    caller: str = Depends(get_current_user_id)
) -> CoachNote:
    supabase = get_supabase()
    _require_coach(supabase, team_id, caller)
    if _member_role(supabase, team_id, student_id) is None:
        raise HTTPException(status_code=404, detail="Student not on this team")

    if not body.note.strip():
        raise HTTPException(status_code=400, detail="Note cannot be empty")

    try:
        row = supabase.table("coach_notes").insert({
            "team_id": team_id,
            "coach_id": caller,
            "student_id": student_id,
            "note": body.note.strip(),
        }).execute().data[0]
        return CoachNote(**row)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to save note") from exc


# ── Rich student profile ──────────────────────────────────────────────────────


@router.get("/teams/{team_id}/students/{student_id}/profile", response_model=RichStudentProfile)
async def rich_student_profile(
    team_id: str, student_id: str, caller: str = Depends(get_current_user_id)
) -> RichStudentProfile:
    """Coach-facing enriched student profile: missions, trends, notes, drills."""
    supabase = get_supabase()
    _require_coach(supabase, team_id, caller)
    if _member_role(supabase, team_id, student_id) is None:
        raise HTTPException(status_code=404, detail="Student not on this team")

    now = _now()
    students = _load_student_data(supabase, team_id, [student_id], now)
    if not students:
        raise HTTPException(status_code=404, detail="Student not found")
    s = students[0]

    # Fetch speeches detail for profile
    try:
        speeches = supabase.table("speeches").select("id, title, speech_type, status, created_at").eq("user_id", student_id).order("created_at", desc=True).limit(10).execute().data or []
    except Exception:
        speeches = []

    # Fetch assignment details
    try:
        a_ids = [a["id"] for a in (supabase.table("assignments").select("id").eq("team_id", team_id).execute().data or [])]
        recs = []
        if a_ids:
            r_rows = supabase.table("assignment_recipients").select("*, assignments(title)").in_("assignment_id", a_ids).eq("user_id", student_id).execute().data or []
            s_map = _speech_status_map(supabase, [r.get("submission_speech_id") for r in r_rows])
            from app.api.assignments import effective_status as es
            for r in r_rows:
                recs.append({
                    "recipient_id": r["id"],
                    "title": r.get("assignments", {}).get("title", "Assignment") if r.get("assignments") else "Assignment",
                    "status": es(r["status"], s_map.get(r.get("submission_speech_id"))),
                    "submission_speech_id": r.get("submission_speech_id"),
                    "coach_feedback": r.get("coach_feedback"),
                    "reviewed_at": r.get("reviewed_at"),
                })
    except Exception:
        recs = []

    # Completed missions
    try:
        cm = supabase.table("student_missions").select("id, skill, status, before_score, after_score, score_delta, completed_at").eq("user_id", student_id).eq("status", "completed").order("completed_at", desc=True).limit(10).execute().data or []
    except Exception:
        cm = []

    # Coach notes
    try:
        notes_rows = supabase.table("coach_notes").select("*").eq("team_id", team_id).eq("student_id", student_id).order("created_at", desc=True).execute().data or []
        notes = [CoachNote(**r) for r in notes_rows]
    except Exception:
        notes = []

    roster = compute_roster_row(s, now)
    flags = [AttentionFlag(**f) for f in roster["attention_flags"]]

    return RichStudentProfile(
        student_id=student_id,
        display_name=s.get("display_name"),
        speech_count=s.get("speech_count", 0),
        feedback_ready_count=s.get("feedback_ready_count", 0),
        speeches=speeches,
        assignments=recs,
        active_mission=s.get("active_mission"),
        completed_missions=cm,
        drill_attempts_count=s.get("drill_attempts_count", 0),
        drills_assigned_count=s.get("drills_assigned_count", 0),
        coach_notes=notes,
        attention_flags=flags,
        roster_row=RosterRow(**roster),
    )
