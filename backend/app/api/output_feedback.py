import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/output-feedback", tags=["output_feedback"])

VALID_TARGET_TYPES = {"speech_report", "drill_feedback", "evidence_check"}
VALID_CATEGORIES = {
    "incorrect_issue",
    "generic_feedback",
    "evidence_mismatch",
    "confusing_wording",
    "technical_bug",
    "other",
}


class OutputFeedbackCreate(BaseModel):
    target_type: str
    target_id: Optional[str] = None
    category: str
    comment: Optional[str] = None


class OutputFeedbackRow(BaseModel):
    id: str
    user_id: str
    target_type: str
    target_id: Optional[str] = None
    category: str
    comment: Optional[str] = None
    created_at: str


@router.post("", response_model=OutputFeedbackRow, status_code=201)
async def create_output_feedback(
    body: OutputFeedbackCreate, user_id: str = Query(...)
) -> OutputFeedbackRow:
    """Submit a confusion/quality report about an AI output surface."""
    if body.target_type not in VALID_TARGET_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid target_type. Must be one of: {', '.join(sorted(VALID_TARGET_TYPES))}",
        )
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}",
        )

    supabase = get_supabase()
    row: dict = {
        "user_id": user_id,
        "target_type": body.target_type,
        "category": body.category,
    }
    if body.target_id:
        row["target_id"] = body.target_id
    if body.comment:
        row["comment"] = body.comment

    try:
        result = supabase.table("output_feedback").insert(row).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to save feedback")
        logger.info(
            "create_output_feedback: saved | user=%s target=%s/%s category=%s",
            user_id, body.target_type, body.target_id, body.category,
        )
        return result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("create_output_feedback: failed | exc_type=%s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Failed to save feedback report") from exc
