"""
Job lifecycle helpers for the analysis_jobs table.

All functions accept a Supabase client as the first argument so tests can
inject a mock without touching the singleton.

Status transitions:
  queued → running → succeeded
                   ↘ failed
  failed → queued (via retry_job)
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ── Stale-job classification ──────────────────────────────────────────────────
# update_job_progress touches updated_at at every pipeline stage (DB trigger),
# and a normal analysis finishes in a few minutes. A queued/running job whose
# row hasn't moved for this long means the worker died with it.
STALE_JOB_THRESHOLD = timedelta(minutes=12)

# Error identity for converged stale jobs. The message is user-safe — it is
# shown verbatim by clients that don't map error codes.
STALE_ERROR_CODE = "worker_lost"
STALE_ERROR_MESSAGE = (
    "Analysis stopped before finishing. Your recording is saved. "
    "Try again to continue from the available data."
)

_ACTIVE_JOB_STATUSES = ("queued", "running")
# Speech statuses that may be flipped to error when their job is converged.
# done/error are terminal and must never be downgraded by convergence.
_CONVERGIBLE_SPEECH_STATUSES = ["pending", "transcribing", "analyzing"]


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        ts = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


def is_job_stale(job: dict, now: datetime | None = None) -> bool:
    """
    True when a queued/running job's row hasn't moved past the stale threshold.

    Uses updated_at, falling back to created_at. No timestamp → not stale
    (never claim a worker died without evidence). Terminal statuses are never
    stale.
    """
    if job.get("status") not in _ACTIVE_JOB_STATUSES:
        return False
    ts = _parse_ts(job.get("updated_at")) or _parse_ts(job.get("created_at"))
    if ts is None:
        return False
    return (now or datetime.now(timezone.utc)) - ts > STALE_JOB_THRESHOLD


def converge_stale_job(sb, job: dict, now: datetime | None = None) -> dict | None:
    """
    If the job is stale, mark it failed with the worker_lost error identity and
    bring the owning speech's status in line — exactly what the pipeline does
    on a real failure, so the existing retry flow (failed → queued) applies.

    Touches only the job row and (guardedly) the speech status row. Never
    touches transcripts, argument maps, feedback, drills, or audio, and never
    downgrades a done/error speech. Returns the converged field overrides, or
    None when the job wasn't stale. Best-effort: DB errors return None so
    read paths keep serving the un-converged row.
    """
    if not is_job_stale(job, now):
        return None
    try:
        fail_job(sb, job["id"], STALE_ERROR_MESSAGE, STALE_ERROR_CODE)
        speech_id = job.get("speech_id")
        if speech_id:
            (
                sb.table("speeches")
                .update({"status": "error"})
                .eq("id", speech_id)
                .in_("status", _CONVERGIBLE_SPEECH_STATUSES)
                .execute()
            )
        converged_at = (now or datetime.now(timezone.utc)).isoformat()
        logger.info(
            "converge_stale_job: job_id=%s speech_id=%s last_moved=%s",
            job.get("id"), speech_id, job.get("updated_at") or job.get("created_at"),
        )
        return {
            "status": "failed",
            "error_code": STALE_ERROR_CODE,
            "error_message": STALE_ERROR_MESSAGE,
            "completed_at": converged_at,
            "updated_at": converged_at,
        }
    except Exception as exc:
        logger.warning(
            "converge_stale_job: failed (non-fatal) | job_id=%s | %s",
            job.get("id"), type(exc).__name__,
        )
        return None


def create_job(
    sb,
    user_id: str,
    job_type: str,
    *,
    speech_id: str | None = None,
    drill_id: str | None = None,
    document_id: str | None = None,
) -> dict:
    """Insert a new queued job and return the saved row."""
    row: dict = {
        "user_id": user_id,
        "job_type": job_type,
        "status": "queued",
        "attempt_count": 1,
    }
    if speech_id:
        row["speech_id"] = speech_id
    if drill_id:
        row["drill_id"] = drill_id
    if document_id:
        row["document_id"] = document_id

    result = sb.table("analysis_jobs").insert(row).execute()
    job = result.data[0]
    logger.info(
        "create_job: job_id=%s type=%s speech_id=%s",
        job["id"],
        job_type,
        speech_id,
    )
    return job


def start_job(sb, job_id: str) -> None:
    """Mark a job running and record when it started."""
    sb.table("analysis_jobs").update({
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()


def update_job_progress(sb, job_id: str, step: str, progress: int) -> None:
    """Update current_step and progress (0–100). Best-effort — never raises."""
    try:
        sb.table("analysis_jobs").update({
            "current_step": step,
            "progress": max(0, min(100, progress)),
        }).eq("id", job_id).execute()
    except Exception as exc:
        logger.warning(
            "update_job_progress: failed | job_id=%s | %s",
            job_id,
            type(exc).__name__,
        )


def complete_job(
    sb,
    job_id: str,
    result_json: dict[str, Any] | None = None,
) -> None:
    """Mark job succeeded and record completed_at."""
    payload: dict = {
        "status": "succeeded",
        "progress": 100,
        "current_step": "done",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    if result_json is not None:
        payload["result_json"] = result_json
    sb.table("analysis_jobs").update(payload).eq("id", job_id).execute()
    logger.info("complete_job: job_id=%s", job_id)


def fail_job(
    sb,
    job_id: str,
    error_message: str,
    error_code: str | None = None,
) -> None:
    """Mark job failed with a user-safe error message and record completed_at."""
    payload: dict = {
        "status": "failed",
        "error_message": error_message,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    if error_code:
        payload["error_code"] = error_code
    sb.table("analysis_jobs").update(payload).eq("id", job_id).execute()
    logger.info("fail_job: job_id=%s code=%s msg=%s", job_id, error_code, error_message)


def get_job(sb, job_id: str, user_id: str) -> dict | None:
    """Fetch a single job by ID with ownership check. Returns None if not found."""
    result = (
        sb.table("analysis_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def list_jobs_for_speech(
    sb,
    speech_id: str,
    user_id: str,
    limit: int = 10,
) -> list[dict]:
    """Return jobs for a speech, newest first."""
    result = (
        sb.table("analysis_jobs")
        .select("*")
        .eq("speech_id", speech_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


def retry_job(sb, job_id: str, user_id: str) -> dict:
    """
    Reset a failed job to queued and increment attempt_count.

    Raises ValueError if the job doesn't belong to the user or is not failed.
    The caller is responsible for re-enqueuing the background task.
    """
    existing = get_job(sb, job_id, user_id)
    if not existing:
        raise ValueError("Job not found")
    if existing["status"] != "failed":
        raise ValueError(
            f"Cannot retry job with status '{existing['status']}' — only failed jobs can be retried"
        )

    attempt_count = (existing.get("attempt_count") or 1) + 1
    result = (
        sb.table("analysis_jobs")
        .update({
            "status": "queued",
            "current_step": None,
            "progress": None,
            "error_message": None,
            "error_code": None,
            "started_at": None,
            "completed_at": None,
            "attempt_count": attempt_count,
        })
        .eq("id", job_id)
        .execute()
    )
    updated = result.data[0]
    logger.info("retry_job: job_id=%s attempt_count=%d", job_id, attempt_count)
    return updated
