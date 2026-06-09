"""
Internal product analytics: best-effort event tracking for pilot readiness.

Failures here MUST NEVER break user flows.
All public functions swallow exceptions and log server-side only.
"""

import logging
from typing import Any, Optional

from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)


def track_product_event(
    user_id: str,
    event_name: str,
    speech_id: Optional[str] = None,
    drill_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    """
    Insert a product analytics event. Best-effort — never raises.

    Args:
        user_id:    UUID of the acting user.
        event_name: Slug identifier (e.g. "speech_analyzed", "drill_rated").
        speech_id:  Optional FK to speeches table.
        drill_id:   Optional FK to drills table.
        metadata:   Optional additional payload.
    """
    try:
        supabase = get_supabase()
        row: dict[str, Any] = {
            "user_id": user_id,
            "event_name": event_name,
            "metadata_json": metadata or {},
        }
        if speech_id:
            row["speech_id"] = speech_id
        if drill_id:
            row["drill_id"] = drill_id

        supabase.table("product_events").insert(row).execute()
        logger.debug(
            "track_product_event: %s | user=%s speech=%s drill=%s",
            event_name, user_id, speech_id, drill_id,
        )
    except Exception as exc:
        logger.error(
            "track_product_event: failed silently | event=%s user=%s | exc_type=%s",
            event_name, user_id, type(exc).__name__,
        )
