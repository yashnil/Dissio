"""Coach analytics service.

All functions are pure deterministic computations over stored data.
No LLM calls — the weekly report and attention queue are rule-based.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ── Helpers ───────────────────────────────────────────────────────────────────

_ATTENTION_SKILLS = {
    "weighing", "extensions", "drops", "clash",
    "judge_adaptation", "delivery", "warranting", "evidence_use", "organization",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        s = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except (ValueError, AttributeError):
        return None


def _days_ago(dt: datetime | None, now: datetime) -> float | None:
    if dt is None:
        return None
    delta = now - dt
    return delta.total_seconds() / 86_400


def _score_trend(score_deltas: list[dict[str, float]]) -> str:
    """Classify trend from a list of {skill: delta} dicts (newest first).
    Returns 'improving' | 'declining' | 'steady' | 'insufficient'.
    """
    if not score_deltas:
        return "insufficient"
    recent = score_deltas[:3]
    pos = sum(1 for d in recent for v in d.values() if v > 0)
    neg = sum(1 for d in recent for v in d.values() if v < 0)
    if pos > neg:
        return "improving"
    if neg > pos:
        return "declining"
    return "steady"


# ── Attention queue ────────────────────────────────────────────────────────────

ATTENTION_RULES = {
    "no_practice_7d": "No practice in 7+ days",
    "no_practice_14d": "No practice in 14+ days",
    "stalled_mission": "Active mission hasn't progressed in 5+ days",
    "missed_assignment": "Assignment overdue and not submitted",
    "long_review_wait": "Submission waiting for coach review 48+ hours",
    "failed_analysis": "Recent speech analysis failed",
    "score_regression": "Score declined 10+ points this week",
    "no_mission": "No active coaching mission — needs direction",
}


def compute_attention_flags(
    student: dict[str, Any],
    now: datetime,
) -> list[dict[str, str]]:
    """Return a list of {rule, reason, link} attention items for one student."""
    flags: list[dict[str, str]] = []
    sid = student.get("user_id", "")

    # 1. No practice
    last = _parse(student.get("latest_practice_at"))
    days = _days_ago(last, now)
    if days is None or days >= 14:
        flags.append({"rule": "no_practice_14d", "reason": ATTENTION_RULES["no_practice_14d"], "link": f"/team/student?student={sid}"})
    elif days >= 7:
        flags.append({"rule": "no_practice_7d", "reason": ATTENTION_RULES["no_practice_7d"], "link": f"/team/student?student={sid}"})

    # 2. Stalled mission
    mission = student.get("active_mission")
    if mission:
        if mission.get("status") in ("in_progress", "paused"):
            updated = _parse(mission.get("updated_at"))
            mission_days = _days_ago(updated, now)
            if mission_days is not None and mission_days >= 5:
                flags.append({
                    "rule": "stalled_mission",
                    "reason": ATTENTION_RULES["stalled_mission"],
                    "link": f"/missions/{mission['id']}",
                })
    else:
        if student.get("speech_count", 0) >= 2:
            flags.append({"rule": "no_mission", "reason": ATTENTION_RULES["no_mission"], "link": f"/team/student?student={sid}"})

    # 3. Overdue + not submitted assignments
    for rec in student.get("assignment_recipients", []):
        due = _parse(rec.get("due_date"))
        status = rec.get("effective_status", "assigned")
        if due and due < now and status in ("assigned", "started", "processing", "failed"):
            flags.append({
                "rule": "missed_assignment",
                "reason": ATTENTION_RULES["missed_assignment"],
                "link": f"/team/student?student={sid}",
            })
            break  # one flag per student

    # 4. Long-waiting review submissions
    for rec in student.get("assignment_recipients", []):
        if rec.get("effective_status") == "ready_for_review":
            submitted = _parse(rec.get("submitted_at"))
            wait_days = _days_ago(submitted, now)
            if wait_days is not None and wait_days >= 2:
                flags.append({
                    "rule": "long_review_wait",
                    "reason": ATTENTION_RULES["long_review_wait"],
                    "link": f"/team/review?team={rec.get('team_id','')}",
                })
                break

    # 5. Failed analysis
    if any(j.get("status") == "failed" for j in student.get("recent_jobs", [])):
        flags.append({
            "rule": "failed_analysis",
            "reason": ATTENTION_RULES["failed_analysis"],
            "link": f"/team/student?student={sid}",
        })

    return flags


# ── Team summary ──────────────────────────────────────────────────────────────


def compute_team_summary(
    students: list[dict[str, Any]],
    assignments: list[dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Aggregate team-level summary metrics."""
    now = now or _now()

    total = len(students)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    practiced_week = 0
    practiced_month = 0
    no_recent = 0
    pending_reviews = 0
    overdue_assignments = 0

    for s in students:
        last = _parse(s.get("latest_practice_at"))
        if last and last >= week_ago:
            practiced_week += 1
        if last and last >= month_ago:
            practiced_month += 1
        if last is None or (now - last).days >= 7:
            no_recent += 1

        for rec in s.get("assignment_recipients", []):
            eff = rec.get("effective_status", "assigned")
            if eff == "ready_for_review":
                pending_reviews += 1

    for a in assignments:
        due = _parse(a.get("due_date"))
        if due and due < now:
            for r in a.get("recipients", []):
                if r.get("status") in ("assigned", "started", "processing", "failed"):
                    overdue_assignments += 1
                    break

    avg_readiness: float | None = None
    completion_vals: list[float] = []
    for s in students:
        total_rec = len(s.get("assignment_recipients", []))
        reviewed = sum(1 for r in s.get("assignment_recipients", []) if r.get("effective_status") in ("reviewed",))
        if total_rec > 0:
            completion_vals.append(reviewed / total_rec)
    if completion_vals:
        avg_readiness = round(sum(completion_vals) / len(completion_vals) * 100)

    return {
        "total_students": total,
        "practiced_this_week": practiced_week,
        "practiced_this_month": practiced_month,
        "without_recent_session": no_recent,
        "pending_reviews": pending_reviews,
        "overdue_assignments": overdue_assignments,
        "avg_readiness_pct": avg_readiness,
    }


# ── Student roster row ────────────────────────────────────────────────────────


def compute_roster_row(student: dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    """Produce a single student roster row with all derived fields."""
    now = now or _now()

    last = _parse(student.get("latest_practice_at"))
    days_inactive = _days_ago(last, now)

    mission = student.get("active_mission")
    mission_skill = mission.get("skill") if mission else None
    mission_status = mission.get("status") if mission else None

    # Most actionable assignment status
    recs = student.get("assignment_recipients", [])
    STATUS_PRIORITY = {
        "ready_for_review": 0, "revision_requested": 1,
        "processing": 2, "started": 3, "failed": 4,
        "assigned": 5, "reviewed": 6,
    }
    sorted_recs = sorted(recs, key=lambda r: STATUS_PRIORITY.get(r.get("effective_status", "assigned"), 99))
    top_status = sorted_recs[0].get("effective_status") if sorted_recs else None

    # Score trend
    deltas = [m.get("score_delta", {}) for m in student.get("completed_missions", []) if m.get("score_delta")]
    trend = _score_trend(deltas[:5])

    # Drill completion
    drills_done = student.get("drill_attempts_count", 0)
    drills_assigned = student.get("drills_assigned_count", 0)

    # Attention flags
    flags = compute_attention_flags(student, now)
    attention_level = "high" if any(f["rule"] in ("no_practice_14d", "stalled_mission") for f in flags) \
                   else "medium" if flags \
                   else "none"

    return {
        "user_id": student.get("user_id"),
        "display_name": student.get("display_name"),
        "last_practice_at": student.get("latest_practice_at"),
        "days_inactive": round(days_inactive) if days_inactive is not None else None,
        "speech_count": student.get("speech_count", 0),
        "active_mission_skill": mission_skill,
        "active_mission_status": mission_status,
        "active_mission_id": mission.get("id") if mission else None,
        "priority_skill": mission_skill,
        "score_trend": trend,
        "top_assignment_status": top_status,
        "drill_attempts_count": drills_done,
        "drills_assigned_count": drills_assigned,
        "attention_level": attention_level,
        "attention_flags": flags,
    }


# ── Weekly report ─────────────────────────────────────────────────────────────


def compute_weekly_report(
    students: list[dict[str, Any]],
    assignments: list[dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Deterministic weekly summary. No LLM calls."""
    now = now or _now()
    week_ago = now - timedelta(days=7)

    speeches_this_week = sum(s.get("speeches_this_week", 0) for s in students)
    drills_this_week = sum(s.get("drill_attempts_this_week", 0) for s in students)

    assignments_completed = 0
    for a in assignments:
        for r in a.get("recipients", []):
            reviewed_at = _parse(r.get("reviewed_at"))
            if reviewed_at and reviewed_at >= week_ago:
                assignments_completed += 1

    participated = [s for s in students if s.get("speeches_this_week", 0) > 0]
    improving = [s for s in students if _score_trend([m.get("score_delta", {}) for m in s.get("completed_missions", [])[:3] if m.get("score_delta")]) == "improving"]
    needs_attention = [s for s in students if compute_attention_flags(s, now)]

    # Common team weakness: skill with the most active missions
    skill_counts: dict[str, int] = {}
    for s in students:
        m = s.get("active_mission")
        if m and m.get("skill"):
            skill_counts[m["skill"]] = skill_counts.get(m["skill"], 0) + 1
    common_weakness = max(skill_counts, key=lambda k: skill_counts[k]) if skill_counts else None

    # Recommended focus for next practice
    focus = _suggest_team_focus(students, common_weakness)

    return {
        "period_start": week_ago.isoformat(),
        "period_end": now.isoformat(),
        "students_participated": len(participated),
        "total_students": len(students),
        "speeches_analyzed": speeches_this_week,
        "drills_completed": drills_this_week,
        "assignments_completed": assignments_completed,
        "students_improving": len(improving),
        "students_needing_attention": len(needs_attention),
        "common_team_weakness": common_weakness,
        "recommended_focus": focus,
        "roster": [
            {
                "user_id": s.get("user_id"),
                "display_name": s.get("display_name"),
                "speeches_this_week": s.get("speeches_this_week", 0),
                "drills_this_week": s.get("drill_attempts_this_week", 0),
                "active_mission_skill": s.get("active_mission", {}).get("skill") if s.get("active_mission") else None,
            }
            for s in students
        ],
    }


def _suggest_team_focus(students: list[dict[str, Any]], common_weakness: str | None) -> str:
    if not students:
        return "Assign students to practice speeches to get personalized recommendations."
    if common_weakness:
        skill_readable = {
            "weighing": "weighing arguments", "extensions": "extending your case",
            "drops": "catching opponent drops", "clash": "clashing with opposition",
            "warranting": "warrant development", "evidence_use": "evidence usage",
            "delivery": "delivery and pacing", "judge_adaptation": "judge adaptation",
            "organization": "speech organization",
        }
        label = skill_readable.get(common_weakness, common_weakness)
        return f"Team-wide focus on {label} — most students are working on this skill."
    no_practice = sum(1 for s in students if not s.get("latest_practice_at"))
    if no_practice > len(students) // 2:
        return "Prioritize getting students to record their first speech this week."
    return "Maintain current practice cadence and focus on individual missions."


# ── Usage summary ─────────────────────────────────────────────────────────────


def compute_usage_summary(
    team_id: str,
    total_students: int,
    speech_count: int,
    evidence_search_count: int,
    drill_count: int,
    assignment_count: int,
    storage_mb: float,
) -> dict[str, Any]:
    """Non-billing usage summary for team owners/coaches."""
    return {
        "team_id": team_id,
        "active_seats": total_students,
        "speeches_analyzed": speech_count,
        "evidence_searches": evidence_search_count,
        "drills_completed": drill_count,
        "assignments_created": assignment_count,
        "storage_used_mb": round(storage_mb, 1),
    }
