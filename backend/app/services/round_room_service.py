"""Pass 27 — Phase 9A multiplayer room data access.

Pure data-access helpers for round_rooms / round_room_participants. No
permission decisions live here — those are enforced in
app.api.round_simulations (_load_round_access / _require_*), which is also
where the "no room row -> solo round, unaffected" fast path lives.
"""

from __future__ import annotations

import logging
import secrets
import string
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_invite_code(supabase: Any, length: int = 8) -> str:
    """Generate a short, unique invite code. Mirrors teams.py's convention."""
    chars = string.ascii_uppercase + string.digits
    for _ in range(10):
        code = "".join(secrets.choice(chars) for _ in range(length))
        existing = (
            supabase.table("round_rooms").select("id").eq("invite_code", code).execute()
        )
        if not existing.data:
            return code
    raise RuntimeError("Failed to generate a unique invite code after 10 attempts.")


def create_room(
    supabase: Any,
    round_id: str,
    owner_user_id: str,
    student_side: str,
    title: Optional[str] = None,
    owner_display_name: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Create a room wrapping round_id, and auto-join the owner as a participant.

    Returns (room_row, owner_participant_row).
    """
    now = _now()
    room_row = {
        "id": str(uuid.uuid4()),
        "round_id": round_id,
        "owner_user_id": owner_user_id,
        "title": title,
        "status": "waiting",
        "invite_code": generate_invite_code(supabase),
        "created_at": now,
        "updated_at": now,
    }
    supabase.table("round_rooms").insert(room_row).execute()

    participant_row = {
        "id": str(uuid.uuid4()),
        "room_id": room_row["id"],
        "user_id": owner_user_id,
        "display_name": owner_display_name,
        "role": "owner",
        "side": student_side,
        "status": "joined",
        "joined_at": now,
        "created_at": now,
        "updated_at": now,
    }
    supabase.table("round_room_participants").insert(participant_row).execute()
    return room_row, participant_row


def get_room(supabase: Any, room_id: str) -> Optional[Dict[str, Any]]:
    resp = supabase.table("round_rooms").select("*").eq("id", room_id).execute()
    rows = resp.data or []
    return rows[0] if rows else None


def get_room_by_round_id(supabase: Any, round_id: str) -> Optional[Dict[str, Any]]:
    resp = supabase.table("round_rooms").select("*").eq("round_id", round_id).execute()
    rows = resp.data or []
    return rows[0] if rows else None


def get_room_by_invite_code(supabase: Any, invite_code: str) -> Optional[Dict[str, Any]]:
    resp = (
        supabase.table("round_rooms")
        .select("*")
        .eq("invite_code", invite_code.strip().upper())
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def list_participants(supabase: Any, room_id: str) -> List[Dict[str, Any]]:
    resp = (
        supabase.table("round_room_participants")
        .select("*")
        .eq("room_id", room_id)
        .order("created_at")
        .execute()
    )
    return resp.data or []


def get_participant(supabase: Any, room_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    resp = (
        supabase.table("round_room_participants")
        .select("*")
        .eq("room_id", room_id)
        .eq("user_id", user_id)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def join_room(
    supabase: Any,
    room: Dict[str, Any],
    user_id: str,
    display_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Idempotent join: repeat calls for an already-joined user are a no-op
    that returns the existing row unchanged."""
    existing = get_participant(supabase, room["id"], user_id)
    now = _now()
    if existing:
        if existing.get("status") == "joined":
            return existing
        update = {"status": "joined", "joined_at": now, "updated_at": now}
        supabase.table("round_room_participants").update(update).eq(
            "id", existing["id"]
        ).execute()
        existing.update(update)
        return existing

    row = {
        "id": str(uuid.uuid4()),
        "room_id": room["id"],
        "user_id": user_id,
        "display_name": display_name,
        "role": "observer",
        "side": None,
        "status": "joined",
        "joined_at": now,
        "created_at": now,
        "updated_at": now,
    }
    supabase.table("round_room_participants").insert(row).execute()
    return row


def update_participant(
    supabase: Any,
    participant: Dict[str, Any],
    role: Optional[str] = None,
    side: Optional[str] = None,
) -> Dict[str, Any]:
    """Apply role and/or side to a participant. A None argument here means
    "leave unchanged" (this endpoint assigns roles/sides — it does not
    support clearing a side back to null in Phase 9A)."""
    update: Dict[str, Any] = {"updated_at": _now()}
    if role is not None:
        update["role"] = role
    if side is not None:
        update["side"] = side
    supabase.table("round_room_participants").update(update).eq(
        "id", participant["id"]
    ).execute()
    participant.update(update)
    return participant


def leave_room(supabase: Any, participant: Dict[str, Any]) -> Dict[str, Any]:
    update = {"status": "left", "updated_at": _now()}
    supabase.table("round_room_participants").update(update).eq(
        "id", participant["id"]
    ).execute()
    participant.update(update)
    return participant


def sync_room_status(supabase: Any, room_id: str, status: str) -> None:
    """Best-effort room status sync. Never raises — callers wrap this in the
    same try/except pattern as other best-effort side effects in this file's
    consumers (mastery emission, XP, product events)."""
    try:
        supabase.table("round_rooms").update(
            {"status": status, "updated_at": _now()}
        ).eq("id", room_id).execute()
    except Exception as exc:
        logger.warning("sync_room_status failed | room_id=%s status=%s | %s", room_id, status, exc)
