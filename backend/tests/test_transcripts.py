from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

SPEECH_ID = "aaaaaaaa-0000-0000-0000-000000000001"
USER_ID = "bbbbbbbb-0000-0000-0000-000000000002"

FAKE_SPEECH_NO_AUDIO = {
    "id": SPEECH_ID,
    "user_id": "bbbbbbbb-0000-0000-0000-000000000002",
    "title": "1AC Round 1",
    "speech_type": "constructive",
    "side": "pro",
    "judge_type": "flow",
    "topic": "Resolved: Test resolution.",
    "audio_url": None,
    "duration_seconds": None,
    "status": "pending",
    "created_at": "2026-05-25T00:00:00+00:00",
    "updated_at": "2026-05-25T00:00:00+00:00",
}

FAKE_SPEECH_WITH_AUDIO = {
    **FAKE_SPEECH_NO_AUDIO,
    "audio_url": "bbbbbbbb-0000-0000-0000-000000000002/aaaaaaaa-0000-0000-0000-000000000001/audio.mp3",
}

FAKE_TRANSCRIPT = {
    "id": "cccccccc-0000-0000-0000-000000000003",
    "speech_id": SPEECH_ID,
    "text": "This is the transcript text.",
    "word_count": 5,
    "created_at": "2026-05-25T00:00:00+00:00",
}


def test_transcribe_no_audio_url():
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        FAKE_SPEECH_NO_AUDIO
    ]
    with patch("app.api.transcripts.get_supabase", return_value=mock_client):
        response = client.post(f"/speeches/{SPEECH_ID}/transcribe?user_id={USER_ID}")
    assert response.status_code == 400
    assert "no audio" in response.json()["detail"].lower()


def test_transcribe_success():
    mock_client = MagicMock()
    # select speech → returns speech with audio
    mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        FAKE_SPEECH_WITH_AUDIO
    ]
    # upsert transcript → returns transcript row
    mock_client.table.return_value.upsert.return_value.execute.return_value.data = [
        FAKE_TRANSCRIPT
    ]

    with patch("app.api.transcripts.get_supabase", return_value=mock_client), patch(
        "app.api.transcripts.transcribe_speech",
        return_value=("This is the transcript text.", 5),
    ):
        response = client.post(f"/speeches/{SPEECH_ID}/transcribe?user_id={USER_ID}")

    assert response.status_code == 200
    body = response.json()
    assert body["speech_id"] == SPEECH_ID
    assert body["text"] == "This is the transcript text."
    assert body["word_count"] == 5


def test_get_transcript_success():
    mock_client = MagicMock()

    # Speech ownership check mock
    speech_mock = MagicMock()
    speech_mock.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"id": SPEECH_ID}]

    # Transcript fetch mock
    transcript_mock = MagicMock()
    transcript_mock.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [FAKE_TRANSCRIPT]

    mock_client.table.side_effect = [speech_mock, transcript_mock]

    with patch("app.api.transcripts.get_supabase", return_value=mock_client):
        response = client.get(f"/speeches/{SPEECH_ID}/transcript?user_id={USER_ID}")
    assert response.status_code == 200
    body = response.json()
    assert body["speech_id"] == SPEECH_ID
    assert body["text"] == "This is the transcript text."


def test_get_transcript_not_found():
    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    with patch("app.api.transcripts.get_supabase", return_value=mock_client):
        response = client.get(f"/speeches/{SPEECH_ID}/transcript?user_id={USER_ID}")
    assert response.status_code == 404


def test_transcribe_storage_error():
    from app.services.transcription import StorageDownloadError

    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        FAKE_SPEECH_WITH_AUDIO
    ]
    with patch("app.api.transcripts.get_supabase", return_value=mock_client), patch(
        "app.api.transcripts.transcribe_speech",
        side_effect=StorageDownloadError("Could not download audio from Supabase Storage."),
    ):
        response = client.post(f"/speeches/{SPEECH_ID}/transcribe?user_id={USER_ID}")
    assert response.status_code == 500
    assert "download" in response.json()["detail"].lower()


def test_transcribe_openai_error():
    from app.services.transcription import OpenAITranscriptionError

    mock_client = MagicMock()
    mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        FAKE_SPEECH_WITH_AUDIO
    ]
    with patch("app.api.transcripts.get_supabase", return_value=mock_client), patch(
        "app.api.transcripts.transcribe_speech",
        side_effect=OpenAITranscriptionError(
            "OpenAI transcription failed. Check API key, billing, or quota."
        ),
    ):
        response = client.post(f"/speeches/{SPEECH_ID}/transcribe?user_id={USER_ID}")
    assert response.status_code == 500
    assert "openai" in response.json()["detail"].lower()
