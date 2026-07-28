"""Phase 10E — backend-mediated Broadcast notify-then-refetch.

Capability audit (see docs/REALTIME_CROSSFIRE_PHASE10_PLAN.md's Phase 10E
section for the full writeup): the installed `realtime` Python package's
sync channel (`realtime._sync.channel.SyncRealtimeChannel`) is an empty
stub with no send method, and its async channel's `send_broadcast` only
works over an already-`subscribe()`d websocket -- neither fits a
synchronous, per-request FastAPI handler with no long-lived connection.
Instead this module calls Supabase Realtime's REST broadcast endpoint
(`POST {SUPABASE_URL}/realtime/v1/api/broadcast`) directly with the
service-role key, verified working (202 Accepted) against Dissio's local
self-hosted Realtime server. This is a plain, short-lived HTTP POST, not a
channel subscription -- no socket is held open, and it fits directly into
the existing synchronous request/response handlers.

Broadcast is notify-only: the payload never carries round content (speech
text, crossfire answers, evidence, coach notes) and is never the authority
for permissions. Every event just means "something changed for this room,
refetch via the existing authenticated HTTP API" -- the backend remains
the sole source of truth, exactly as every prior Full Round phase has
required. Emission is always best-effort: a failure here must never fail,
slow, or retry against the mutation that already succeeded, matching the
existing track_product_event/sync_room_status convention in this codebase.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT_S = 3.0

# Every event type this module will ever send. Deliberately an allowlist,
# not a free-form string, so a future typo or an accidentally-broadened
# call site can never send an unrecognized event; enforced identically on
# the frontend by roomModel.ts's isSafeBroadcastEventType (kept in sync by
# hand -- these are the only 7 events either side should ever see).
SAFE_BROADCAST_EVENT_TYPES = frozenset(
    {
        "crossfire_ready_changed",
        "crossfire_answer_submitted",
        "crossfire_question_submitted",
        "crossfire_followup_requested",
        "phase_advanced",
        "room_closed",
        "participant_updated",
    }
)


def room_channel_topic(room_id: str) -> str:
    """Channel name is the room's UUID only -- never the invite code (see
    docs/REALTIME_AUTHORIZATION_PHASE10C.md §7: invite codes are rotatable
    join credentials, not durable resource identifiers). Must stay
    byte-identical to the frontend's roomModel.ts roomBroadcastChannelTopic,
    since both ends key off the same string."""
    return f"room:{room_id}"


def emit_room_event(room_id: str, event_type: str, phase: Optional[str] = None) -> None:
    """Best-effort notify-only broadcast to a room's channel. Never raises.

    Payload is deliberately minimal and non-sensitive: event_type, a
    server timestamp, and (only when the caller has one) the round's
    current phase -- phase names are workflow structure, not private
    content, and are already visible to every joined participant via the
    existing HTTP API. No participant identity, speech text, crossfire
    answers, evidence, or coach-note content is ever included.
    """
    if event_type not in SAFE_BROADCAST_EVENT_TYPES:
        logger.error("emit_room_event: rejected unrecognized event_type=%r", event_type)
        return
    if not settings.supabase_url or not settings.supabase_service_role_key:
        logger.debug("emit_room_event: skipped, Supabase not configured")
        return

    payload: Dict[str, Any] = {
        "event_type": event_type,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    if phase is not None:
        payload["phase"] = phase

    try:
        httpx.post(
            settings.supabase_url.rstrip("/") + "/realtime/v1/api/broadcast",
            json={
                "messages": [
                    {
                        "topic": room_channel_topic(room_id),
                        "event": "notify",
                        "payload": payload,
                    }
                ]
            },
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "apikey": settings.supabase_service_role_key,
                "Content-Type": "application/json",
            },
            timeout=_TIMEOUT_S,
        )
    except Exception as exc:
        logger.warning(
            "emit_room_event: broadcast failed | room_id=%s event=%s | %s",
            room_id, event_type, exc,
        )
