"""Tests for the pilot summary and pilot aggregate endpoints."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.pilot import _compute_skill_trends, _average_ratings, _extract_common_issues
from app.main import app

client = TestClient(app)

USER_ID = "aaaaaaaa-0000-0000-0000-000000000001"


# ── Unit tests for helper functions ─────────────────────────────────────────────

def test_average_ratings_all_helpful():
    assert _average_ratings(["helpful", "helpful", "helpful"]) == 1.0


def test_average_ratings_mixed():
    result = _average_ratings(["helpful", "somewhat", "not_helpful"])
    assert abs(result - (1.0 + 0.5 + 0.0) / 3) < 0.001


def test_average_ratings_empty():
    assert _average_ratings([]) is None


def test_average_ratings_ignores_unknown():
    result = _average_ratings(["helpful", "unknown_value"])
    assert result == 1.0  # only "helpful" counts


def test_compute_skill_trends_empty():
    assert _compute_skill_trends([]) is None


def test_compute_skill_trends_single_report():
    reports = [{"scores": {"clash": 10, "weighing": 12, "extensions": 15, "drops": 18, "judge_adaptation": 14}}]
    trends = _compute_skill_trends(reports)
    assert trends is not None
    assert trends.clash.current == 10.0
    assert trends.clash.trend == "no_data"
    assert trends.clash.delta is None


def test_compute_skill_trends_improving():
    reports = [
        {"scores": {"clash": 10, "weighing": 10, "extensions": 10, "drops": 10, "judge_adaptation": 10}},
        {"scores": {"clash": 15, "weighing": 14, "extensions": 12, "drops": 18, "judge_adaptation": 10}},
    ]
    trends = _compute_skill_trends(reports)
    assert trends is not None
    assert trends.clash.trend == "improving"
    assert trends.clash.delta == 5.0
    assert trends.clash.previous == 10.0


def test_compute_skill_trends_needs_attention():
    reports = [
        {"scores": {"clash": 15, "weighing": 15, "extensions": 15, "drops": 15, "judge_adaptation": 15}},
        {"scores": {"clash": 10, "weighing": 15, "extensions": 15, "drops": 15, "judge_adaptation": 15}},
    ]
    trends = _compute_skill_trends(reports)
    assert trends is not None
    assert trends.clash.trend == "needs_attention"
    assert trends.clash.delta == -5.0


def test_compute_skill_trends_stable():
    reports = [
        {"scores": {"clash": 12, "weighing": 12, "extensions": 12, "drops": 12, "judge_adaptation": 12}},
        {"scores": {"clash": 13, "weighing": 12, "extensions": 12, "drops": 12, "judge_adaptation": 12}},
    ]
    trends = _compute_skill_trends(reports)
    assert trends.clash.trend == "stable"


def test_extract_common_issues_ranked():
    reports = [
        {"raw_feedback": {"top_3_priorities": ["weak_warrants", "no_weighing", "drops"]}},
        {"raw_feedback": {"top_3_priorities": ["weak_warrants", "drops"]}},
        {"raw_feedback": {"top_3_priorities": ["weak_warrants"]}},
    ]
    issues = _extract_common_issues(reports)
    assert issues[0] == "weak_warrants"  # most frequent
    assert "drops" in issues


def test_extract_common_issues_empty():
    assert _extract_common_issues([]) == []


def test_extract_common_issues_missing_raw_feedback():
    reports = [{"raw_feedback": None}, {"scores": {}}]
    assert _extract_common_issues(reports) == []


# ── Integration tests for pilot summary endpoint ─────────────────────────────

def _make_supabase_chain_for_pilot(
    speeches=None, drills=None, attempts_count=0,
    comparison_events_count=0, fb_reports=None, drill_ratings=None,
):
    """Build a mock Supabase that handles the pilot summary queries in order."""
    mock_sb = MagicMock()

    speeches = speeches or []
    drills = drills or []
    fb_reports = fb_reports or []
    drill_ratings = drill_ratings or []

    call_count = [0]

    def table_side_effect(name):
        m = MagicMock()
        if name == "speeches":
            m.select.return_value.eq.return_value.execute.return_value.data = speeches
        elif name == "drills":
            m.select.return_value.eq.return_value.execute.return_value.data = drills
        elif name == "drill_attempts":
            m.select.return_value.eq.return_value.execute.return_value.count = attempts_count
        elif name == "product_events":
            m.select.return_value.eq.return_value.eq.return_value.execute.return_value.count = comparison_events_count
        elif name == "feedback_reports":
            m.select.return_value.in_.return_value.order.return_value.execute.return_value.data = fb_reports
        elif name == "drill_ratings":
            m.select.return_value.eq.return_value.execute.return_value.data = drill_ratings
        return m

    mock_sb.table.side_effect = table_side_effect
    return mock_sb


def test_pilot_summary_no_data():
    """Returns all-zero summary for a brand new user."""
    mock_sb = _make_supabase_chain_for_pilot()

    with patch("app.api.pilot.get_supabase", return_value=mock_sb):
        response = client.get(f"/users/{USER_ID}/pilot-summary")

    assert response.status_code == 200
    data = response.json()
    assert data["speech_count"] == 0
    assert data["analyzed_speech_count"] == 0
    assert data["drill_count"] == 0
    assert data["drill_attempt_count"] == 0
    assert data["completed_drill_count"] == 0
    assert data["rerecord_count"] == 0
    assert data["return_for_second_speech"] is False
    assert data["completed_one_drill"] is False
    assert data["average_feedback_rating"] is None
    assert data["skill_trends"] is None
    assert data["common_issues"] == []


def test_pilot_summary_return_for_second_speech():
    """return_for_second_speech is True when speech_count >= 2."""
    speeches = [
        {"id": "s1", "status": "done", "parent_speech_id": None},
        {"id": "s2", "status": "done", "parent_speech_id": "s1"},
    ]
    mock_sb = _make_supabase_chain_for_pilot(speeches=speeches, drills=[], attempts_count=0)

    with patch("app.api.pilot.get_supabase", return_value=mock_sb):
        response = client.get(f"/users/{USER_ID}/pilot-summary")

    assert response.status_code == 200
    data = response.json()
    assert data["return_for_second_speech"] is True
    assert data["rerecord_count"] == 1


def test_pilot_summary_completed_one_drill():
    """completed_one_drill is True when at least one drill is completed."""
    drills = [{"id": "d1", "status": "completed"}, {"id": "d2", "status": "attempted"}]
    mock_sb = _make_supabase_chain_for_pilot(drills=drills)

    with patch("app.api.pilot.get_supabase", return_value=mock_sb):
        response = client.get(f"/users/{USER_ID}/pilot-summary")

    data = response.json()
    assert data["completed_one_drill"] is True
    assert data["completed_drill_count"] == 1


def test_pilot_summary_skill_trends_with_two_reports():
    """skill_trends is populated when two or more feedback reports exist."""
    speeches = [{"id": "s1", "status": "done", "parent_speech_id": None}]
    fb_reports = [
        {"scores": {"clash": 10, "weighing": 10, "extensions": 10, "drops": 10, "judge_adaptation": 10}, "helpful_rating": None, "raw_feedback": {}},
        {"scores": {"clash": 15, "weighing": 14, "extensions": 12, "drops": 18, "judge_adaptation": 10}, "helpful_rating": "helpful", "raw_feedback": {}},
    ]
    mock_sb = _make_supabase_chain_for_pilot(speeches=speeches, fb_reports=fb_reports)

    with patch("app.api.pilot.get_supabase", return_value=mock_sb):
        response = client.get(f"/users/{USER_ID}/pilot-summary")

    data = response.json()
    assert data["skill_trends"] is not None
    assert data["skill_trends"]["clash"]["trend"] == "improving"
    assert data["feedback_rating_count"] == 1
    assert abs(data["average_feedback_rating"] - 1.0) < 0.001


def test_pilot_summary_feedback_rating_average():
    """Average feedback rating is computed correctly across mixed ratings."""
    speeches = [{"id": "s1", "status": "done", "parent_speech_id": None}]
    fb_reports = [
        {"scores": {}, "helpful_rating": "helpful", "raw_feedback": {}},
        {"scores": {}, "helpful_rating": "somewhat", "raw_feedback": {}},
        {"scores": {}, "helpful_rating": "not_helpful", "raw_feedback": {}},
    ]
    mock_sb = _make_supabase_chain_for_pilot(speeches=speeches, fb_reports=fb_reports)

    with patch("app.api.pilot.get_supabase", return_value=mock_sb):
        response = client.get(f"/users/{USER_ID}/pilot-summary")

    data = response.json()
    assert data["feedback_rating_count"] == 3
    expected_avg = (1.0 + 0.5 + 0.0) / 3
    assert abs(data["average_feedback_rating"] - expected_avg) < 0.001
