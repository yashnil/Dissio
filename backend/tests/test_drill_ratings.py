"""Tests for the drill rating endpoint."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

USER_ID = "aaaaaaaa-0000-0000-0000-000000000001"
DRILL_ID = "dddddddd-0000-0000-0000-000000000001"

RATING_ROW = {
    "id": "rrrrrrrr-0000-0000-0000-000000000001",
    "user_id": USER_ID,
    "drill_id": DRILL_ID,
    "drill_attempt_id": None,
    "rating": "helpful",
    "comment": None,
    "created_at": "2026-06-09T12:00:00Z",
}


def _drill_exists_mock():
    mock = MagicMock()
    mock.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": DRILL_ID}
    ]
    return mock


def test_rate_drill_helpful():
    """POST /drills/{id}/rating returns the saved rating row."""
    mock_supabase = MagicMock()
    drill_mock = _drill_exists_mock()
    upsert_mock = MagicMock()
    upsert_mock.table.return_value.upsert.return_value.execute.return_value.data = [RATING_ROW]

    mock_supabase.table.side_effect = [
        drill_mock,  # ownership check
        upsert_mock.table.return_value,  # upsert
    ]
    mock_supabase.table.return_value = drill_mock

    with patch("app.api.drills.get_supabase", return_value=mock_supabase), \
         patch("app.api.drills.track_product_event"):
        # Re-build a more precise mock using side_effect chain
        pass

    # Simpler: use a single mock that handles all table() calls
    mock_sb = MagicMock()
    # Ownership check
    mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"id": DRILL_ID}]
    # Upsert
    mock_sb.table.return_value.upsert.return_value.execute.return_value.data = [RATING_ROW]

    with patch("app.api.drills.get_supabase", return_value=mock_sb), \
         patch("app.api.drills.track_product_event"):
        response = client.post(
            f"/drills/{DRILL_ID}/rating?user_id={USER_ID}",
            json={"rating": "helpful"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["rating"] == "helpful"
    assert data["drill_id"] == DRILL_ID


def test_rate_drill_invalid_rating():
    """Returns 400 for invalid rating value."""
    mock_sb = MagicMock()
    with patch("app.api.drills.get_supabase", return_value=mock_sb):
        response = client.post(
            f"/drills/{DRILL_ID}/rating?user_id={USER_ID}",
            json={"rating": "not_a_valid_choice"},
        )
    assert response.status_code == 400


def test_rate_drill_not_found():
    """Returns 404 when drill does not belong to user."""
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []

    with patch("app.api.drills.get_supabase", return_value=mock_sb):
        response = client.post(
            f"/drills/{DRILL_ID}/rating?user_id={USER_ID}",
            json={"rating": "somewhat"},
        )
    assert response.status_code == 404


def test_get_drill_rating_returns_none_when_unrated():
    """GET /drills/{id}/rating returns null when no rating exists."""
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []

    with patch("app.api.drills.get_supabase", return_value=mock_sb):
        response = client.get(f"/drills/{DRILL_ID}/rating?user_id={USER_ID}")

    assert response.status_code == 200
    assert response.json() is None


def test_get_drill_rating_returns_existing():
    """GET /drills/{id}/rating returns existing rating row."""
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [RATING_ROW]

    with patch("app.api.drills.get_supabase", return_value=mock_sb):
        response = client.get(f"/drills/{DRILL_ID}/rating?user_id={USER_ID}")

    assert response.status_code == 200
    data = response.json()
    assert data["rating"] == "helpful"
