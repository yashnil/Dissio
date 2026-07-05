from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SpeechCreateRequest(BaseModel):
    user_id: str
    title: str
    speech_type: str  # constructive | rebuttal | summary | final_focus | crossfire
    side: Optional[str] = None       # pro | con
    judge_type: Optional[str] = None  # lay | flow | tech | coach
    topic: Optional[str] = None
    # Re-record relationship — set when recording after a drill to track improvement
    parent_speech_id: Optional[str] = None
    source_drill_id: Optional[str] = None


class SpeechUpdateRequest(BaseModel):
    audio_url: str
    duration_seconds: Optional[int] = None


class SpeechArtifactSummary(BaseModel):
    """
    Lightweight, backend-verified artifact presence for a speech.

    Booleans reflect persisted rows (never speech.status). drill_count and
    the latest_job_* fields are null when that data couldn't be looked up —
    clients must treat null as unknown, not as absent/failed.
    """

    has_transcript: bool = False
    has_flow: bool = False
    has_ballot: bool = False
    has_feedback: bool = False
    drill_count: Optional[int] = None
    latest_job_status: Optional[str] = None
    latest_job_current_step: Optional[str] = None
    # Combined error string (message or code) — kept for Phase 5B clients.
    latest_job_error: Optional[str] = None
    # Structured error fields — prefer these for friendly client-side mapping.
    latest_job_error_code: Optional[str] = None
    latest_job_error_message: Optional[str] = None
    # Liveness: when the job row last moved (progress updates touch this).
    latest_job_updated_at: Optional[str] = None


class SpeechRow(BaseModel):
    id: str
    user_id: str
    title: str
    speech_type: str
    side: Optional[str] = None
    judge_type: Optional[str] = None
    topic: Optional[str] = None
    audio_url: Optional[str] = None
    duration_seconds: Optional[int] = None
    status: str
    created_at: datetime
    updated_at: datetime
    # Re-record relationship (nullable — absent on older rows)
    parent_speech_id: Optional[str] = None
    source_drill_id: Optional[str] = None
    # Verified artifact summary — only populated when the list endpoint is
    # called with include_artifacts=true; null otherwise (backward compatible).
    artifact_summary: Optional[SpeechArtifactSummary] = None
