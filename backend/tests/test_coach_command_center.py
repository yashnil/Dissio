"""Coach Command Center tests.

Tests cover:
- Team summary calculations
- Attention queue rules
- Assignment template CRUD and auth
- Coach note CRUD and auth
- Weekly report calculations
- Usage summary
- Unrelated-team access rejection
- Command center endpoint integration
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.auth import get_current_user_id
from app.services.coach_analytics import (
    compute_attention_flags,
    compute_roster_row,
    compute_team_summary,
    compute_weekly_report,
    _score_trend,
    _days_ago,
    _parse,
)

client = TestClient(app)

TEAM_ID = "team-cc-1"
COACH_ID = "coach-cc-1"
STUDENT_1 = "student-cc-1"
STUDENT_2 = "student-cc-2"
OTHER_COACH = "coach-other"
TEMPLATE_ID = "tpl-1"

NOW = datetime(2026, 6, 26, 12, 0, 0, tzinfo=timezone.utc)
WEEK_AGO = NOW - timedelta(days=7)
TWO_WEEKS_AGO = NOW - timedelta(days=14)
YESTERDAY = NOW - timedelta(days=1)
TWO_DAYS_AGO = NOW - timedelta(days=2)
SIX_DAYS_AGO = NOW - timedelta(days=6)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _act_as(user_id: str):
    app.dependency_overrides[get_current_user_id] = lambda: user_id


def _role_mock(role: str | None):
    m = MagicMock()
    data = [{"role": role}] if role is not None else []
    m.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = data
    return m


# ── Pure: _parse ──────────────────────────────────────────────────────────────


def test_parse_iso():
    dt = _parse("2026-06-26T12:00:00+00:00")
    assert dt is not None
    assert dt.year == 2026


def test_parse_z_suffix():
    dt = _parse("2026-06-26T12:00:00Z")
    assert dt is not None


def test_parse_none():
    assert _parse(None) is None


def test_parse_invalid():
    assert _parse("not-a-date") is None


# ── Pure: _score_trend ────────────────────────────────────────────────────────


def test_score_trend_improving():
    deltas = [{"weighing": 5.0}, {"clash": 3.0}, {"drops": 2.0}]
    assert _score_trend(deltas) == "improving"


def test_score_trend_declining():
    deltas = [{"weighing": -5.0}, {"clash": -3.0}]
    assert _score_trend(deltas) == "declining"


def test_score_trend_steady():
    deltas = [{"weighing": 5.0}, {"clash": -5.0}]
    assert _score_trend(deltas) == "steady"


def test_score_trend_insufficient():
    assert _score_trend([]) == "insufficient"


# ── Pure: compute_attention_flags ─────────────────────────────────────────────


def _make_student(**kwargs) -> dict:
    defaults = {
        "user_id": STUDENT_1,
        "display_name": "Alice",
        "latest_practice_at": None,
        "speech_count": 0,
        "active_mission": None,
        "completed_missions": [],
        "assignment_recipients": [],
        "recent_jobs": [],
        "drill_attempts_count": 0,
        "drills_assigned_count": 0,
    }
    return {**defaults, **kwargs}


def test_attention_no_practice_14d():
    s = _make_student(latest_practice_at=None, speech_count=5)
    flags = compute_attention_flags(s, NOW)
    rules = [f["rule"] for f in flags]
    assert "no_practice_14d" in rules


def test_attention_no_practice_7d():
    s = _make_student(latest_practice_at=SIX_DAYS_AGO.isoformat(), speech_count=3)
    # 6 days: 7d threshold not met, 14d not met either
    flags = compute_attention_flags(s, NOW)
    rules = [f["rule"] for f in flags]
    assert "no_practice_7d" not in rules  # 6 days < 7
    assert "no_practice_14d" not in rules


def test_attention_exactly_7d():
    s = _make_student(latest_practice_at=(NOW - timedelta(days=7, hours=1)).isoformat(), speech_count=3)
    flags = compute_attention_flags(s, NOW)
    rules = [f["rule"] for f in flags]
    assert "no_practice_7d" in rules


def test_attention_stalled_mission():
    s = _make_student(
        latest_practice_at=YESTERDAY.isoformat(),
        active_mission={
            "id": "m1", "skill": "weighing", "status": "in_progress",
            "updated_at": (NOW - timedelta(days=6)).isoformat(),
        },
    )
    flags = compute_attention_flags(s, NOW)
    rules = [f["rule"] for f in flags]
    assert "stalled_mission" in rules


def test_attention_no_stall_if_recent():
    s = _make_student(
        latest_practice_at=YESTERDAY.isoformat(),
        active_mission={
            "id": "m1", "skill": "weighing", "status": "in_progress",
            "updated_at": YESTERDAY.isoformat(),
        },
    )
    flags = compute_attention_flags(s, NOW)
    rules = [f["rule"] for f in flags]
    assert "stalled_mission" not in rules


def test_attention_overdue_assignment():
    s = _make_student(
        latest_practice_at=YESTERDAY.isoformat(),
        assignment_recipients=[{
            "id": "r1",
            "effective_status": "assigned",
            "due_date": TWO_DAYS_AGO.isoformat(),
            "submitted_at": None,
            "team_id": TEAM_ID,
        }],
    )
    flags = compute_attention_flags(s, NOW)
    rules = [f["rule"] for f in flags]
    assert "missed_assignment" in rules


def test_attention_no_overdue_if_reviewed():
    s = _make_student(
        latest_practice_at=YESTERDAY.isoformat(),
        assignment_recipients=[{
            "id": "r1",
            "effective_status": "reviewed",
            "due_date": TWO_DAYS_AGO.isoformat(),
            "submitted_at": YESTERDAY.isoformat(),
            "team_id": TEAM_ID,
        }],
    )
    flags = compute_attention_flags(s, NOW)
    rules = [f["rule"] for f in flags]
    assert "missed_assignment" not in rules


def test_attention_long_review_wait():
    s = _make_student(
        latest_practice_at=YESTERDAY.isoformat(),
        assignment_recipients=[{
            "id": "r1",
            "effective_status": "ready_for_review",
            "due_date": None,
            "submitted_at": (NOW - timedelta(days=3)).isoformat(),
            "team_id": TEAM_ID,
        }],
    )
    flags = compute_attention_flags(s, NOW)
    rules = [f["rule"] for f in flags]
    assert "long_review_wait" in rules


def test_attention_failed_analysis():
    s = _make_student(
        latest_practice_at=YESTERDAY.isoformat(),
        recent_jobs=[{"status": "failed"}],
    )
    flags = compute_attention_flags(s, NOW)
    rules = [f["rule"] for f in flags]
    assert "failed_analysis" in rules


def test_attention_no_mission_with_speeches():
    s = _make_student(latest_practice_at=YESTERDAY.isoformat(), speech_count=3)
    flags = compute_attention_flags(s, NOW)
    rules = [f["rule"] for f in flags]
    assert "no_mission" in rules


def test_attention_no_mission_no_speeches_no_flag():
    s = _make_student(speech_count=0)
    flags = compute_attention_flags(s, NOW)
    rules = [f["rule"] for f in flags]
    # With 0 speeches, no "no_mission" flag
    assert "no_mission" not in rules


# ── Pure: compute_team_summary ────────────────────────────────────────────────


def test_team_summary_all_zeros():
    summary = compute_team_summary([], [], NOW)
    assert summary["total_students"] == 0
    assert summary["practiced_this_week"] == 0
    assert summary["avg_readiness_pct"] is None


def test_team_summary_practiced_week():
    students = [
        _make_student(user_id=STUDENT_1, latest_practice_at=YESTERDAY.isoformat()),
        _make_student(user_id=STUDENT_2, latest_practice_at=TWO_WEEKS_AGO.isoformat()),
    ]
    summary = compute_team_summary(students, [], NOW)
    assert summary["total_students"] == 2
    assert summary["practiced_this_week"] == 1
    assert summary["without_recent_session"] == 1


def test_team_summary_pending_reviews():
    students = [
        _make_student(
            user_id=STUDENT_1,
            latest_practice_at=YESTERDAY.isoformat(),
            assignment_recipients=[{"effective_status": "ready_for_review"}],
        ),
    ]
    summary = compute_team_summary(students, [], NOW)
    assert summary["pending_reviews"] == 1


def test_team_summary_overdue():
    assignments = [{
        "id": "a1",
        "due_date": TWO_DAYS_AGO.isoformat(),
        "recipients": [{"status": "assigned"}],
    }]
    summary = compute_team_summary([], assignments, NOW)
    assert summary["overdue_assignments"] == 1


def test_team_summary_avg_readiness():
    students = [
        _make_student(
            user_id=STUDENT_1,
            assignment_recipients=[
                {"effective_status": "reviewed"},
                {"effective_status": "assigned"},
            ],
        ),
    ]
    summary = compute_team_summary(students, [], NOW)
    assert summary["avg_readiness_pct"] == 50


# ── Pure: compute_roster_row ──────────────────────────────────────────────────


def test_roster_row_basic():
    s = _make_student(
        latest_practice_at=YESTERDAY.isoformat(),
        speech_count=3,
        active_mission={"id": "m1", "skill": "weighing", "status": "in_progress", "updated_at": YESTERDAY.isoformat()},
    )
    row = compute_roster_row(s, NOW)
    assert row["active_mission_skill"] == "weighing"
    assert row["days_inactive"] == 1
    assert row["attention_level"] in ("none", "medium", "high")


def test_roster_row_high_attention():
    s = _make_student(latest_practice_at=None, speech_count=5)
    row = compute_roster_row(s, NOW)
    assert row["attention_level"] == "high"


def test_roster_row_no_mission_populated():
    s = _make_student(latest_practice_at=YESTERDAY.isoformat(), speech_count=0)
    row = compute_roster_row(s, NOW)
    assert row["active_mission_skill"] is None
    assert row["active_mission_id"] is None


# ── Pure: compute_weekly_report ───────────────────────────────────────────────


def test_weekly_report_empty():
    report = compute_weekly_report([], [], NOW)
    assert report["total_students"] == 0
    assert report["students_participated"] == 0
    assert report["common_team_weakness"] is None


def test_weekly_report_speeches_this_week():
    students = [
        {**_make_student(user_id=STUDENT_1), "speeches_this_week": 2, "drill_attempts_this_week": 1},
        {**_make_student(user_id=STUDENT_2), "speeches_this_week": 0, "drill_attempts_this_week": 0},
    ]
    report = compute_weekly_report(students, [], NOW)
    assert report["speeches_analyzed"] == 2
    assert report["drills_completed"] == 1
    assert report["students_participated"] == 1
    assert report["total_students"] == 2


def test_weekly_report_common_weakness():
    students = [
        {**_make_student(user_id=STUDENT_1), "speeches_this_week": 0, "drill_attempts_this_week": 0,
         "active_mission": {"skill": "weighing"}},
        {**_make_student(user_id=STUDENT_2), "speeches_this_week": 0, "drill_attempts_this_week": 0,
         "active_mission": {"skill": "weighing"}},
    ]
    report = compute_weekly_report(students, [], NOW)
    assert report["common_team_weakness"] == "weighing"


# ── API: command center auth ───────────────────────────────────────────────────


def _mock_sb_coach(student_ids: list[str] | None = None):
    """Minimal supabase mock that returns coach role and empty data."""
    sb = MagicMock()
    student_ids = student_ids or []

    def _table(name):
        t = MagicMock()
        # role check
        t.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "coach"}]
        # team info
        if name == "teams":
            t.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
                {"id": TEAM_ID, "name": "Test Team", "invite_code": "ABC123"}
            ]
        # members
        if name == "team_members":
            m1 = MagicMock()
            m1.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "coach"}]
            m1.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"user_id": uid} for uid in student_ids]
            return m1
        return t

    sb.table.side_effect = _table
    return sb


def test_command_center_requires_auth():
    r = client.get(f"/teams/{TEAM_ID}/command-center")
    assert r.status_code in (401, 403)


def test_command_center_student_forbidden():
    _act_as(STUDENT_1)

    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "student"}]

    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.get(f"/teams/{TEAM_ID}/command-center")
    assert r.status_code == 403


def test_command_center_unrelated_team_rejected():
    _act_as(OTHER_COACH)

    sb = MagicMock()
    # Returns None (not a member)
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []

    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.get(f"/teams/{TEAM_ID}/command-center")
    assert r.status_code == 403


# ── API: assignment templates ─────────────────────────────────────────────────


def test_list_templates_no_team_returns_builtins():
    _act_as(COACH_ID)
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "coach"}]
    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.get("/assignment-templates")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 6
    assert all(t["is_built_in"] for t in data)


def test_list_templates_with_team_includes_both():
    _act_as(COACH_ID)
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "coach"}]
    sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = [
        {"id": TEMPLATE_ID, "team_id": TEAM_ID, "created_by": COACH_ID,
         "title": "My Template", "description": None, "kind": "speech",
         "speech_type": None, "target_skill": "weighing", "success_criteria": [],
         "goal": None, "duration_minutes": None, "due_offset_days": 7,
         "is_built_in": False, "created_at": "2026-06-26T00:00:00+00:00"},
    ]
    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.get(f"/assignment-templates?team_id={TEAM_ID}")
    assert r.status_code == 200
    data = r.json()
    # At least 6 built-ins + 1 team template
    assert len(data) >= 7


def test_create_template_coach_only():
    _act_as(STUDENT_1)
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "student"}]
    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.post("/assignment-templates", json={
            "team_id": TEAM_ID, "title": "My Template", "kind": "speech",
        })
    assert r.status_code == 403


def test_create_template_empty_title():
    _act_as(COACH_ID)
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "coach"}]
    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.post("/assignment-templates", json={
            "team_id": TEAM_ID, "title": "  ", "kind": "speech",
        })
    assert r.status_code == 400


def test_delete_builtin_rejected():
    _act_as(COACH_ID)
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "coach"}]
    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.delete("/assignment-templates/builtin-warranting")
    assert r.status_code == 400


def test_assign_from_builtin_no_recipients():
    _act_as(COACH_ID)
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "coach"}]
    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.post("/assignment-templates/builtin-warranting/assign", json={
            "team_id": TEAM_ID, "recipient_user_ids": [],
        })
    assert r.status_code == 400


# ── API: coach notes ──────────────────────────────────────────────────────────


def test_add_note_requires_coach():
    _act_as(STUDENT_1)
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "student"}]
    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.post(f"/teams/{TEAM_ID}/students/{STUDENT_2}/notes", json={"note": "Good work"})
    assert r.status_code == 403


def test_add_note_empty_body():
    _act_as(COACH_ID)
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "coach"}]
    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.post(f"/teams/{TEAM_ID}/students/{STUDENT_2}/notes", json={"note": "  "})
    assert r.status_code == 400


# ── API: weekly report ────────────────────────────────────────────────────────


def test_weekly_report_student_forbidden():
    _act_as(STUDENT_1)
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "student"}]
    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.get(f"/teams/{TEAM_ID}/weekly-report")
    assert r.status_code == 403


# ── API: usage summary ────────────────────────────────────────────────────────


def test_usage_summary_student_forbidden():
    _act_as(STUDENT_1)
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"role": "student"}]
    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.get(f"/teams/{TEAM_ID}/usage-summary")
    assert r.status_code == 403


# ── API: rich student profile ─────────────────────────────────────────────────


def test_rich_profile_unrelated_coach_rejected():
    _act_as(OTHER_COACH)
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.get(f"/teams/{TEAM_ID}/students/{STUDENT_1}/profile")
    assert r.status_code == 403


def test_rich_profile_requires_student_on_team():
    _act_as(COACH_ID)
    call_count = 0

    def _role_for(table_name):
        m = MagicMock()
        nonlocal call_count

        def role_chain(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # First call: coach membership check → coach
                m2 = MagicMock()
                m2.execute.return_value.data = [{"role": "coach"}]
                return m2
            else:
                # Second call: student membership check → not on team
                m2 = MagicMock()
                m2.execute.return_value.data = []
                return m2

        m.select.return_value.eq.return_value.eq.return_value.limit.return_value = MagicMock(side_effect=role_chain)
        return m

    sb = MagicMock()
    sb.table.side_effect = lambda name: _role_for(name) if name == "team_members" else MagicMock()

    with patch("app.api.coach.get_supabase", return_value=sb):
        r = client.get(f"/teams/{TEAM_ID}/students/not-a-member/profile")

    assert r.status_code in (403, 404)
