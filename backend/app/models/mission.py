"""Pydantic models for the Next Mission coaching loop."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class MissionRow(BaseModel):
    id: str
    user_id: str
    mission_type: str = "skill_focus"
    skill: str
    title: str
    reason: str
    evidence: str
    source_speech_id: Optional[str] = None
    source_report_id: Optional[str] = None
    recommended_drill_id: Optional[str] = None
    priority_score: float
    priority_factors: dict[str, Any] = {}
    status: str = "ready"
    before_score: Optional[dict[str, Any]] = None
    after_score: Optional[dict[str, Any]] = None
    # score_delta is stored as percentage points (0-100 scale) for display clarity
    score_delta: Optional[dict[str, Any]] = None
    remaining_issue: Optional[str] = None
    success_criteria: list[str] = []
    completion_result: Optional[str] = None
    estimated_minutes: int = 10
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class MissionAttemptRow(BaseModel):
    id: str
    mission_id: str
    user_id: str
    attempt_type: str = "drill"
    drill_attempt_id: Optional[str] = None
    speech_id: Optional[str] = None
    score_snapshot: Optional[dict[str, Any]] = None
    criteria_met: list[str] = []
    result: str = "incomplete"
    notes: Optional[str] = None
    created_at: datetime


class StartMissionRequest(BaseModel):
    user_id: str


class CreateAttemptRequest(BaseModel):
    """
    Log a drill or re-record attempt.
    Client submits record IDs only — scores and criteria are computed server-side.
    """
    user_id: str
    attempt_type: str = "drill"
    drill_attempt_id: Optional[str] = None
    speech_id: Optional[str] = None
    notes: Optional[str] = None


class CompleteMissionRequest(BaseModel):
    """
    Complete a mission by providing evidence of a qualifying attempt.

    extra='forbid': any unrecognised field (e.g. after_score, completion_result)
    is rejected with 422 rather than silently ignored.  This prevents clients
    from submitting self-scored outcomes.
    """
    model_config = ConfigDict(extra="forbid")

    user_id: str
    # Backend finds and validates the latest qualifying attempt for this drill.
    # The attempt must: belong to owner, target mission skill, occur after
    # mission creation, contain an authoritative score/result, and not have
    # been used to complete a different mission.
    drill_id: Optional[str] = None
    # Backend validates: speech belongs to owner, parent_speech_id matches
    # mission source speech, and a completed feedback report exists.
    rerecord_speech_id: Optional[str] = None


class PauseMissionRequest(BaseModel):
    user_id: str
    note: Optional[str] = None
