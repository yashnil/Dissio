"""Assignment API tests.

Identity comes from the verified JWT — simulated here by overriding the
get_current_user_id dependency. Auth-layer rejection (missing token) is covered
by leaving the override off. Role gates use a mocked service-role client.
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.assignments import effective_status, status_rank
from app.services.auth import get_current_user_id

client = TestClient(app)

TEAM_ID = "team-1"
COACH_ID = "coach-1"
STUDENT_ID = "student-1"
OTHER_ID = "student-2"
RECIPIENT_ID = "rec-1"


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


# ── Pure lifecycle logic ────────────────────────────────────────────────────────


def test_effective_status_derivation():
    assert effective_status("assigned", None) == "assigned"
    assert effective_status("started", None) == "started"
    assert effective_status("started", "analyzing") == "processing"
    assert effective_status("started", "done") == "ready_for_review"
    assert effective_status("started", "error") == "failed"
    assert effective_status("reviewed", "done") == "reviewed"
    assert effective_status("revision_requested", "done") == "revision_requested"


def test_status_rank_orders_actionable_first():
    assert status_rank("ready_for_review") < status_rank("processing")
    assert status_rank("processing") < status_rank("reviewed")


# ── Auth layer ──────────────────────────────────────────────────────────────────


def test_missing_auth_rejected():
    # No dependency override and no Authorization header → 401 from the dependency.
    resp = client.get(f"/teams/{TEAM_ID}/review-queue")
    assert resp.status_code == 401


# ── create_assignment ──────────────────────────────────────────────────────────


def test_create_assignment_rejects_student():
    _act_as(STUDENT_ID)
    sb = MagicMock()
    sb.table.return_value = _role_mock("student")
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.post("/assignments", json={"team_id": TEAM_ID, "title": "x", "recipient_user_ids": [STUDENT_ID]})
    assert resp.status_code == 403
    assert "coach" in resp.json()["detail"].lower()


def test_create_assignment_rejects_non_member():
    _act_as("stranger")
    sb = MagicMock()
    sb.table.return_value = _role_mock(None)
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.post("/assignments", json={"team_id": TEAM_ID, "title": "x", "recipient_user_ids": [STUDENT_ID]})
    assert resp.status_code == 403


def test_create_assignment_coach_success_uses_token_identity():
    _act_as(COACH_ID)
    sb = MagicMock()
    role = _role_mock("coach")
    a_insert = MagicMock()
    a_insert.insert.return_value.execute.return_value.data = [{
        "id": "a-1", "team_id": TEAM_ID, "created_by": COACH_ID, "title": "Summary rep",
        "kind": "speech", "speech_type": "summary", "side": None, "judge_type": "flow",
        "topic": None, "goal": None, "success_criteria": [], "due_date": None,
        "created_at": "2026-06-18T00:00:00+00:00",
    }]
    r_insert = MagicMock()
    r_insert.insert.return_value.execute.return_value.data = [{"id": RECIPIENT_ID, "user_id": STUDENT_ID, "status": "assigned"}]
    sb.table.side_effect = [role, a_insert, r_insert]
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.post("/assignments", json={
            "team_id": TEAM_ID, "title": "Summary rep", "kind": "speech",
            "speech_type": "summary", "judge_type": "flow", "recipient_user_ids": [STUDENT_ID],
        })
    assert resp.status_code == 201
    # created_by is the token user, not anything client-supplied.
    assert resp.json()["created_by"] == COACH_ID


# ── start (student owns own — impersonation prevention) ──────────────────────────


def test_start_rejects_other_students_assignment():
    _act_as(STUDENT_ID)
    sb = MagicMock()
    rec = MagicMock()
    rec.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": RECIPIENT_ID, "user_id": OTHER_ID, "status": "assigned"}
    ]
    sb.table.return_value = rec
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.post(f"/assignments/recipients/{RECIPIENT_ID}/start", json={"speech_id": "sp-1"})
    assert resp.status_code == 403


def test_start_sets_started_not_ready():
    _act_as(STUDENT_ID)
    sb = MagicMock()
    rec = MagicMock()
    rec.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": RECIPIENT_ID, "user_id": STUDENT_ID, "status": "assigned"}
    ]
    upd = MagicMock()
    upd.update.return_value.eq.return_value.execute.return_value.data = [
        {"id": RECIPIENT_ID, "user_id": STUDENT_ID, "status": "started", "submission_speech_id": "sp-1", "submitted_at": "t"}
    ]
    sb.table.side_effect = [rec, upd]
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.post(f"/assignments/recipients/{RECIPIENT_ID}/start", json={"speech_id": "sp-1"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "started"  # effective with no analysis yet


# ── review (coach-only) ─────────────────────────────────────────────────────────


def test_review_rejects_student():
    _act_as(STUDENT_ID)
    sb = MagicMock()
    rec = MagicMock()
    rec.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": RECIPIENT_ID, "user_id": STUDENT_ID, "assignments": {"team_id": TEAM_ID}}
    ]
    sb.table.side_effect = [rec, _role_mock("student")]
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.post(f"/assignments/recipients/{RECIPIENT_ID}/review", json={"action": "reviewed"})
    assert resp.status_code == 403


def test_review_invalid_action():
    _act_as(COACH_ID)
    sb = MagicMock()
    rec = MagicMock()
    rec.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": RECIPIENT_ID, "user_id": STUDENT_ID, "assignments": {"team_id": TEAM_ID}}
    ]
    sb.table.return_value = rec
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.post(f"/assignments/recipients/{RECIPIENT_ID}/review", json={"action": "nonsense"})
    assert resp.status_code == 400


# ── review queue only surfaces ready_for_review ──────────────────────────────────


def test_review_queue_excludes_still_processing():
    _act_as(COACH_ID)
    sb = MagicMock()
    role = _role_mock("coach")
    a_mock = MagicMock()
    a_mock.select.return_value.eq.return_value.execute.return_value.data = [{"id": "a1", "title": "Summary rep"}]
    recs = MagicMock()
    recs.select.return_value.in_.return_value.eq.return_value.order.return_value.execute.return_value.data = [
        {"id": "r1", "assignment_id": "a1", "user_id": "s1", "status": "started", "submission_speech_id": "sp1", "submitted_at": "t1", "profiles": None},
        {"id": "r2", "assignment_id": "a1", "user_id": "s2", "status": "started", "submission_speech_id": "sp2", "submitted_at": "t2", "profiles": None},
    ]
    speeches = MagicMock()
    speeches.select.return_value.in_.return_value.execute.return_value.data = [
        {"id": "sp1", "status": "done"}, {"id": "sp2", "status": "analyzing"},
    ]
    sb.table.side_effect = [role, a_mock, recs, speeches]
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.get(f"/teams/{TEAM_ID}/review-queue")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["recipient_id"] == "r1"
    assert data[0]["status"] == "ready_for_review"


def test_review_queue_rejects_student():
    _act_as(STUDENT_ID)
    sb = MagicMock()
    sb.table.return_value = _role_mock("student")
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.get(f"/teams/{TEAM_ID}/review-queue")
    assert resp.status_code == 403


# ── other coach-only reads ───────────────────────────────────────────────────────


def test_readiness_rejects_non_member():
    _act_as("stranger")
    sb = MagicMock()
    sb.table.return_value = _role_mock(None)
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.get(f"/teams/{TEAM_ID}/readiness")
    assert resp.status_code == 403


def test_student_cannot_view_other_student_profile():
    _act_as(OTHER_ID)
    sb = MagicMock()
    sb.table.return_value = _role_mock("student")
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.get(f"/teams/{TEAM_ID}/students/{STUDENT_ID}")
    assert resp.status_code == 403


def test_list_assignments_rejects_non_member():
    _act_as("stranger")
    sb = MagicMock()
    sb.table.return_value = _role_mock(None)
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.get(f"/teams/{TEAM_ID}/assignments")
    assert resp.status_code == 403


# ── for-speech rail permissions ──────────────────────────────────────────────────


def _for_speech_mock(owner_id: str):
    rec = MagicMock()
    rec.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{
        "id": RECIPIENT_ID, "user_id": owner_id, "status": "started", "submission_speech_id": "sp1",
        "coach_feedback": None,
        "assignments": {"id": "a1", "team_id": TEAM_ID, "title": "Summary rep", "kind": "speech", "goal": None, "success_criteria": [], "due_date": None},
    }]
    return rec


def test_for_speech_allows_owner():
    _act_as(STUDENT_ID)
    sb = MagicMock()
    speeches = MagicMock()
    speeches.select.return_value.in_.return_value.execute.return_value.data = [{"id": "sp1", "status": "done"}]
    sb.table.side_effect = [_for_speech_mock(STUDENT_ID), _role_mock(None), speeches]
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.get("/assignments/for-speech/sp1")
    assert resp.status_code == 200
    assert resp.json()["viewer_is_coach"] is False
    assert resp.json()["assignment"]["title"] == "Summary rep"


def test_for_speech_allows_coach():
    _act_as(COACH_ID)
    sb = MagicMock()
    speeches = MagicMock()
    speeches.select.return_value.in_.return_value.execute.return_value.data = [{"id": "sp1", "status": "done"}]
    sb.table.side_effect = [_for_speech_mock(STUDENT_ID), _role_mock("coach"), speeches]
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.get("/assignments/for-speech/sp1")
    assert resp.status_code == 200
    assert resp.json()["viewer_is_coach"] is True


def test_for_speech_rejects_stranger():
    _act_as("stranger")
    sb = MagicMock()
    sb.table.side_effect = [_for_speech_mock(STUDENT_ID), _role_mock(None)]
    with patch("app.api.assignments.get_supabase", return_value=sb):
        resp = client.get("/assignments/for-speech/sp1")
    assert resp.status_code == 403
