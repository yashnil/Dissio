from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

USER_ID = "bbbbbbbb-0000-0000-0000-000000000002"


def test_get_user_progress_success():
    """Returns aggregated progress metrics."""
    mock_supabase = MagicMock()

    # Create separate mock chains for each query
    speeches_mock = MagicMock()
    speeches_mock.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "s1", "status": "done"},
        {"id": "s2", "status": "done"},
        {"id": "s3", "status": "pending"},
    ]

    drills_mock = MagicMock()
    drills_mock.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "d1", "status": "completed"},
        {"id": "d2", "status": "attempted"},
        {"id": "d3", "status": "assigned"},
    ]

    attempts_mock = MagicMock()
    attempts_mock.select.return_value.eq.return_value.execute.return_value.count = 5

    incomplete_mock = MagicMock()
    incomplete_mock.select.return_value.eq.return_value.neq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        {
            "id": "d2",
            "speech_id": "s2",
            "title": "Impact Weighing Sprint",
            "skill_target": "weighing",
            "difficulty": "beginner",
            "status": "attempted",
            "speeches": {"title": "My First Speech"},
        },
    ]

    feedback_mock = MagicMock()
    feedback_mock.select.return_value.eq.return_value.execute.return_value.data = [
        {"scores": {"clash": 10, "weighing": 12, "extensions": 15, "drops": 18, "judge_adaptation": 14}},
        {"scores": {"clash": 14, "weighing": 16, "extensions": 17, "drops": 16, "judge_adaptation": 18}},
    ]

    # Set up table() to return different mocks in sequence
    mock_supabase.table.side_effect = [
        speeches_mock,
        drills_mock,
        attempts_mock,
        incomplete_mock,
        feedback_mock,
    ]

    with patch("app.api.users.get_supabase", return_value=mock_supabase):
        response = client.get(f"/users/{USER_ID}/progress")

    assert response.status_code == 200
    data = response.json()
    assert data["speech_count"] == 3
    assert data["feedback_ready_count"] == 2
    assert data["drills_assigned_count"] == 3
    assert data["drills_completed_count"] == 1
    assert data["drill_attempts_count"] == 5
    assert abs(data["drill_completion_rate"] - (1 / 3)) < 0.001
    assert len(data["incomplete_drills"]) == 1
    assert data["incomplete_drills"][0]["title"] == "Impact Weighing Sprint"
    assert data["skill_averages"] is not None
    assert data["skill_averages"]["clash"] == 12.0  # (10 + 14) / 2


def test_get_user_progress_no_data():
    """Returns zero counts when user has no data."""
    mock_supabase = MagicMock()

    speeches_mock = MagicMock()
    speeches_mock.select.return_value.eq.return_value.execute.return_value.data = []

    drills_mock = MagicMock()
    drills_mock.select.return_value.eq.return_value.execute.return_value.data = []

    attempts_mock = MagicMock()
    attempts_mock.select.return_value.eq.return_value.execute.return_value.count = 0

    incomplete_mock = MagicMock()
    incomplete_mock.select.return_value.eq.return_value.neq.return_value.order.return_value.limit.return_value.execute.return_value.data = []

    feedback_mock = MagicMock()
    feedback_mock.select.return_value.eq.return_value.execute.return_value.data = []

    mock_supabase.table.side_effect = [
        speeches_mock,
        drills_mock,
        attempts_mock,
        incomplete_mock,
        feedback_mock,
    ]

    with patch("app.api.users.get_supabase", return_value=mock_supabase):
        response = client.get(f"/users/{USER_ID}/progress")

    assert response.status_code == 200
    data = response.json()
    assert data["speech_count"] == 0
    assert data["feedback_ready_count"] == 0
    assert data["drills_assigned_count"] == 0
    assert data["drills_completed_count"] == 0
    assert data["drill_attempts_count"] == 0
    assert data["drill_completion_rate"] is None
    assert data["incomplete_drills"] == []
    assert data["skill_averages"] is None


def test_get_user_progress_partial_completion():
    """Correctly calculates drill completion rate."""
    mock_supabase = MagicMock()

    speeches_mock = MagicMock()
    speeches_mock.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "s1", "status": "done"},
    ]

    drills_mock = MagicMock()
    drills_mock.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "d1", "status": "completed"},
        {"id": "d2", "status": "completed"},
        {"id": "d3", "status": "attempted"},
        {"id": "d4", "status": "attempted"},
        {"id": "d5", "status": "assigned"},
        {"id": "d6", "status": "assigned"},
    ]

    attempts_mock = MagicMock()
    attempts_mock.select.return_value.eq.return_value.execute.return_value.count = 10

    incomplete_mock = MagicMock()
    incomplete_mock.select.return_value.eq.return_value.neq.return_value.order.return_value.limit.return_value.execute.return_value.data = []

    feedback_mock = MagicMock()
    feedback_mock.select.return_value.eq.return_value.execute.return_value.data = []

    mock_supabase.table.side_effect = [
        speeches_mock,
        drills_mock,
        attempts_mock,
        incomplete_mock,
        feedback_mock,
    ]

    with patch("app.api.users.get_supabase", return_value=mock_supabase):
        response = client.get(f"/users/{USER_ID}/progress")

    assert response.status_code == 200
    data = response.json()
    assert data["drills_assigned_count"] == 6
    assert data["drills_completed_count"] == 2
    assert abs(data["drill_completion_rate"] - (2 / 6)) < 0.001  # ~0.333
