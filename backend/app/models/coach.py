"""Pydantic models for Coach Command Center API responses."""

from typing import Any
from pydantic import BaseModel


class AssignmentTemplateRow(BaseModel):
    id: str
    team_id: str | None = None
    created_by: str | None = None
    title: str
    description: str | None = None
    kind: str = "speech"
    speech_type: str | None = None
    target_skill: str | None = None
    success_criteria: list[str] = []
    goal: str | None = None
    duration_minutes: int | None = None
    due_offset_days: int = 7
    is_built_in: bool = False
    created_at: str | None = None


class AssignmentTemplateCreate(BaseModel):
    team_id: str
    title: str
    description: str | None = None
    kind: str = "speech"
    speech_type: str | None = None
    target_skill: str | None = None
    success_criteria: list[str] = []
    goal: str | None = None
    duration_minutes: int | None = None
    due_offset_days: int = 7


class AssignTemplateRequest(BaseModel):
    team_id: str
    recipient_user_ids: list[str]
    due_date: str | None = None


class AttentionFlag(BaseModel):
    rule: str
    reason: str
    link: str


class RosterRow(BaseModel):
    user_id: str
    display_name: str | None = None
    last_practice_at: str | None = None
    days_inactive: int | None = None
    speech_count: int = 0
    active_mission_skill: str | None = None
    active_mission_status: str | None = None
    active_mission_id: str | None = None
    priority_skill: str | None = None
    score_trend: str = "insufficient"
    top_assignment_status: str | None = None
    drill_attempts_count: int = 0
    drills_assigned_count: int = 0
    attention_level: str = "none"
    attention_flags: list[AttentionFlag] = []


class TeamSummary(BaseModel):
    total_students: int
    practiced_this_week: int
    practiced_this_month: int
    without_recent_session: int
    pending_reviews: int
    overdue_assignments: int
    avg_readiness_pct: int | None = None


class CommandCenterResponse(BaseModel):
    team_id: str
    team_name: str
    invite_code: str
    summary: TeamSummary
    roster: list[RosterRow]
    attention_queue: list[RosterRow]
    onboarding_done: bool = False


class WeeklyReportRosterItem(BaseModel):
    user_id: str
    display_name: str | None = None
    speeches_this_week: int = 0
    drills_this_week: int = 0
    active_mission_skill: str | None = None


class WeeklyReportResponse(BaseModel):
    period_start: str
    period_end: str
    students_participated: int
    total_students: int
    speeches_analyzed: int
    drills_completed: int
    assignments_completed: int
    students_improving: int
    students_needing_attention: int
    common_team_weakness: str | None = None
    recommended_focus: str
    roster: list[WeeklyReportRosterItem]


class UsageSummaryResponse(BaseModel):
    team_id: str
    active_seats: int
    speeches_analyzed: int
    evidence_searches: int
    drills_completed: int
    assignments_created: int
    storage_used_mb: float


class CoachNote(BaseModel):
    id: str
    team_id: str
    coach_id: str
    student_id: str
    note: str
    created_at: str


class CoachNoteCreate(BaseModel):
    note: str


class RichStudentProfile(BaseModel):
    student_id: str
    display_name: str | None = None
    speech_count: int
    feedback_ready_count: int
    speeches: list[dict[str, Any]] = []
    assignments: list[dict[str, Any]] = []
    active_mission: dict[str, Any] | None = None
    completed_missions: list[dict[str, Any]] = []
    drill_attempts_count: int = 0
    drills_assigned_count: int = 0
    coach_notes: list[CoachNote] = []
    attention_flags: list[AttentionFlag] = []
    roster_row: RosterRow | None = None
