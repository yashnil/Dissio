from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class FeedbackScores(BaseModel):
    clash: int
    weighing: int
    extensions: int
    drops: int
    judge_adaptation: int


class FeedbackReportRow(BaseModel):
    id: str
    speech_id: str
    overall_score: Optional[int] = None
    scores: FeedbackScores
    summary: Optional[str] = None
    strengths: list[str] = []
    weaknesses: list[str] = []
    raw_feedback: Optional[dict[str, Any]] = None
    created_at: datetime
