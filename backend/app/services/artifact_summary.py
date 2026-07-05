"""
Batched artifact/readiness summaries for speech list responses.

The dashboard needs to know, per speech, which report artifacts actually
exist — without one request per speech. This module answers that with a
fixed number of batched queries (one per artifact table), regardless of
how many speeches are listed.

Truthfulness contract:
- Booleans reflect persisted rows, never speech.status.
- On failure of a core artifact query we return no summaries at all rather
  than guessing False (a wrong False would downgrade a genuinely ready
  report in the UI). Job/drill lookups are enrichment: their failure only
  nulls those fields.
"""

import logging

from app.services.jobs import converge_stale_job, is_job_stale

logger = logging.getLogger(__name__)

# Tables whose presence defines the core artifact booleans.
_CORE_TABLES = {
    "transcripts": "has_transcript",
    "argument_maps": "has_flow",
    "feedback_reports": "has_ballot",
}


def _empty_summary() -> dict:
    return {
        "has_transcript": False,
        "has_flow": False,
        "has_ballot": False,
        "has_feedback": False,
        "drill_count": None,
        "latest_job_status": None,
        "latest_job_current_step": None,
        "latest_job_error": None,
        "latest_job_error_code": None,
        "latest_job_error_message": None,
        "latest_job_updated_at": None,
    }


def build_artifact_summaries(sb, speech_ids: list[str]) -> dict[str, dict]:
    """
    Return {speech_id: summary} for the given speeches using batched queries.

    Returns {} when a core artifact query fails — callers should then omit
    summaries entirely so clients fall back to status-based display instead
    of trusting wrong booleans.
    """
    if not speech_ids:
        return {}

    summaries: dict[str, dict] = {sid: _empty_summary() for sid in speech_ids}

    # Core artifact presence — one batched query per table.
    for table, flag in _CORE_TABLES.items():
        try:
            res = (
                sb.table(table)
                .select("speech_id")
                .in_("speech_id", speech_ids)
                .execute()
            )
            for row in res.data or []:
                sid = row.get("speech_id")
                if sid in summaries:
                    summaries[sid][flag] = True
        except Exception as exc:
            logger.warning(
                "build_artifact_summaries: core query failed | table=%s | %s",
                table, type(exc).__name__,
            )
            return {}

    # has_feedback mirrors has_ballot: the feedback report row IS the ballot.
    for s in summaries.values():
        s["has_feedback"] = s["has_ballot"]

    # Drill counts — enrichment; failure nulls the count instead of guessing 0.
    try:
        res = (
            sb.table("drills")
            .select("speech_id")
            .in_("speech_id", speech_ids)
            .execute()
        )
        counts: dict[str, int] = {sid: 0 for sid in speech_ids}
        for row in res.data or []:
            sid = row.get("speech_id")
            if sid in counts:
                counts[sid] += 1
        for sid, s in summaries.items():
            s["drill_count"] = counts[sid]
    except Exception as exc:
        logger.warning(
            "build_artifact_summaries: drills query failed | %s", type(exc).__name__
        )

    # Latest analysis job per speech — enrichment; failure nulls job fields.
    try:
        res = (
            sb.table("analysis_jobs")
            .select(
                "id, speech_id, status, current_step, error_code, error_message, "
                "created_at, updated_at"
            )
            .in_("speech_id", speech_ids)
            .eq("job_type", "speech_analysis")
            .order("created_at", desc=True)
            .execute()
        )
        seen: set[str] = set()
        for job in res.data or []:  # newest first; keep only the latest per speech
            sid = job.get("speech_id")
            if sid not in summaries or sid in seen:
                continue
            seen.add(sid)
            # Opportunistic convergence, bounded to the requested speeches:
            # a queued/running job that stopped moving is marked failed
            # (worker_lost) so it stops looking healthy at the API level.
            if is_job_stale(job):
                converged = converge_stale_job(sb, job)
                if converged:
                    job = {**job, **converged}
            summaries[sid]["latest_job_status"] = job.get("status")
            summaries[sid]["latest_job_current_step"] = job.get("current_step")
            summaries[sid]["latest_job_error_code"] = job.get("error_code")
            summaries[sid]["latest_job_error_message"] = job.get("error_message")
            # Kept for backward compatibility with Phase 5B clients.
            summaries[sid]["latest_job_error"] = (
                job.get("error_message") or job.get("error_code")
            )
            # Liveness signal — updated_at moves with every progress step.
            summaries[sid]["latest_job_updated_at"] = (
                job.get("updated_at") or job.get("created_at")
            )
    except Exception as exc:
        logger.warning(
            "build_artifact_summaries: jobs query failed | %s", type(exc).__name__
        )

    return summaries
