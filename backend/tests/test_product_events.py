"""Tests for the product_events service and analytics event tracking."""

from unittest.mock import MagicMock, patch

import pytest

from app.services.product_events import track_product_event


USER_ID = "aaaaaaaa-0000-0000-0000-000000000001"
SPEECH_ID = "ssssssss-0000-0000-0000-000000000001"
DRILL_ID = "dddddddd-0000-0000-0000-000000000001"


def test_track_product_event_success():
    """Best-effort tracking inserts an event row when the table exists."""
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock()

    with patch("app.services.product_events.get_supabase", return_value=mock_supabase):
        track_product_event(user_id=USER_ID, event_name="speech_created", speech_id=SPEECH_ID)

    mock_supabase.table.assert_called_with("product_events")
    inserted_row = mock_supabase.table.return_value.insert.call_args[0][0]
    assert inserted_row["user_id"] == USER_ID
    assert inserted_row["event_name"] == "speech_created"
    assert inserted_row["speech_id"] == SPEECH_ID
    assert "drill_id" not in inserted_row


def test_track_product_event_with_drill():
    """Drill ID is included when provided."""
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock()

    with patch("app.services.product_events.get_supabase", return_value=mock_supabase):
        track_product_event(user_id=USER_ID, event_name="drill_opened", drill_id=DRILL_ID, metadata={"attempt": 1})

    inserted_row = mock_supabase.table.return_value.insert.call_args[0][0]
    assert inserted_row["drill_id"] == DRILL_ID
    assert inserted_row["metadata_json"] == {"attempt": 1}


def test_track_product_event_never_raises():
    """Exceptions from the database never propagate to the caller."""
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.insert.return_value.execute.side_effect = RuntimeError("DB is down")

    with patch("app.services.product_events.get_supabase", return_value=mock_supabase):
        # Should not raise even when the DB call fails
        track_product_event(user_id=USER_ID, event_name="feedback_rated")


def test_track_product_event_metadata_defaults_to_empty_dict():
    """metadata_json defaults to {} when no metadata supplied."""
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock()

    with patch("app.services.product_events.get_supabase", return_value=mock_supabase):
        track_product_event(user_id=USER_ID, event_name="comparison_viewed")

    inserted_row = mock_supabase.table.return_value.insert.call_args[0][0]
    assert inserted_row["metadata_json"] == {}


def test_track_product_event_skips_none_speech_id():
    """speech_id is omitted from the row when None is passed."""
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.insert.return_value.execute.return_value = MagicMock()

    with patch("app.services.product_events.get_supabase", return_value=mock_supabase):
        track_product_event(user_id=USER_ID, event_name="drill_rated", speech_id=None, drill_id=DRILL_ID)

    inserted_row = mock_supabase.table.return_value.insert.call_args[0][0]
    assert "speech_id" not in inserted_row
    assert inserted_row["drill_id"] == DRILL_ID
