"""Tests for the output feedback (confusion reporting) endpoint."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

USER_ID = "aaaaaaaa-0000-0000-0000-000000000001"
FEEDBACK_ROW = {
    "id": "ffffffff-0000-0000-0000-000000000001",
    "user_id": USER_ID,
    "target_type": "speech_report",
    "target_id": "ssssssss-0000-0000-0000-000000000001",
    "category": "generic_feedback",
    "comment": "The feedback was too vague.",
    "created_at": "2026-06-09T12:00:00Z",
}


def test_create_output_feedback_success():
    """Returns 201 and the saved row for a valid submission."""
    mock_sb = MagicMock()
    mock_sb.table.return_value.insert.return_value.execute.return_value.data = [FEEDBACK_ROW]

    with patch("app.api.output_feedback.get_supabase", return_value=mock_sb):
        response = client.post(
            f"/output-feedback?user_id={USER_ID}",
            json={
                "target_type": "speech_report",
                "target_id": "ssssssss-0000-0000-0000-000000000001",
                "category": "generic_feedback",
                "comment": "The feedback was too vague.",
            },
        )

    assert response.status_code == 201
    data = response.json()
    assert data["category"] == "generic_feedback"
    assert data["target_type"] == "speech_report"


def test_create_output_feedback_no_comment():
    """Submitting without a comment is valid."""
    row = {**FEEDBACK_ROW, "comment": None}
    mock_sb = MagicMock()
    mock_sb.table.return_value.insert.return_value.execute.return_value.data = [row]

    with patch("app.api.output_feedback.get_supabase", return_value=mock_sb):
        response = client.post(
            f"/output-feedback?user_id={USER_ID}",
            json={"target_type": "drill_feedback", "category": "confusing_wording"},
        )

    assert response.status_code == 201


def test_create_output_feedback_invalid_target_type():
    """Returns 400 for unknown target_type."""
    mock_sb = MagicMock()
    with patch("app.api.output_feedback.get_supabase", return_value=mock_sb):
        response = client.post(
            f"/output-feedback?user_id={USER_ID}",
            json={"target_type": "not_a_surface", "category": "other"},
        )
    assert response.status_code == 400


def test_create_output_feedback_invalid_category():
    """Returns 400 for unknown category."""
    mock_sb = MagicMock()
    with patch("app.api.output_feedback.get_supabase", return_value=mock_sb):
        response = client.post(
            f"/output-feedback?user_id={USER_ID}",
            json={"target_type": "speech_report", "category": "made_up_category"},
        )
    assert response.status_code == 400


def test_create_output_feedback_all_target_types():
    """All valid target types are accepted."""
    for target_type in ("speech_report", "drill_feedback", "evidence_check"):
        mock_sb = MagicMock()
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [{**FEEDBACK_ROW, "target_type": target_type}]

        with patch("app.api.output_feedback.get_supabase", return_value=mock_sb):
            response = client.post(
                f"/output-feedback?user_id={USER_ID}",
                json={"target_type": target_type, "category": "other"},
            )
        assert response.status_code == 201, f"Expected 201 for target_type={target_type}"


def test_create_output_feedback_all_categories():
    """All valid categories are accepted."""
    valid_categories = [
        "incorrect_issue", "generic_feedback", "evidence_mismatch",
        "confusing_wording", "technical_bug", "other",
    ]
    for cat in valid_categories:
        mock_sb = MagicMock()
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [{**FEEDBACK_ROW, "category": cat}]

        with patch("app.api.output_feedback.get_supabase", return_value=mock_sb):
            response = client.post(
                f"/output-feedback?user_id={USER_ID}",
                json={"target_type": "speech_report", "category": cat},
            )
        assert response.status_code == 201, f"Expected 201 for category={cat}"
