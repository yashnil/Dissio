"""
Pass 34 — Phase 10E: backend-mediated Broadcast notify-then-refetch.

Three independent parts:

1. Unit tests for app.services.round_broadcast (mocked httpx.post, no real
   network) -- always run.
2. Endpoint-level tests proving every emit_room_event call site: (a) fires
   only after its mutation already succeeded, with the expected safe
   payload; (b) never lets a broadcast failure affect the mutation's own
   result; (c) is never called from a pure read endpoint -- always run, no
   DB required, same patch.object(mod, "get_supabase", ...) convention as
   test_round_rooms.py.
3. A live test for the Pass 34 realtime.messages Realtime Authorization
   policy. PostgREST does not expose the `realtime` schema
   (PGRST_DB_SCHEMAS=public,graphql_public), so this can't reuse the
   HTTP-based live-RLS pattern from test_pass31_round_content_rls.py --
   instead it shells out to `docker exec supabase_db_dissio psql` (the same
   container scripts/setup_local_test_env.sh manages) to insert a probe row
   and evaluate RLS under a simulated authenticated session, exactly
   mirroring the manual verification used to write the policy. Gracefully
   SKIPs -- never fails -- when Docker or that specific container isn't
   reachable, matching every other live-test file's convention in this repo.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from unittest.mock import ANY, MagicMock, patch

import pytest

from app.services import round_room_service

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

MIGRATIONS_DIR = ROOT.parent / "supabase" / "migrations"
MIGRATION_FILE = "20260726000000_pass34_round_room_broadcast_authorization.sql"

DB_CONTAINER = "supabase_db_dissio"


# ═══════════════════════════════════════════════════════════════════════════
# 1. round_broadcast.py unit tests -- mocked httpx, no network, always run.
# ═══════════════════════════════════════════════════════════════════════════


class TestRoomChannelTopic:
    def test_uses_room_id_only(self):
        from app.services.round_broadcast import room_channel_topic
        assert room_channel_topic("abc-123") == "room:abc-123"

    def test_never_special_cases_invite_code_shaped_input(self):
        # No format-detection exists here -- callers are responsible for
        # always passing a room UUID, never an invite code (see
        # docs/REALTIME_AUTHORIZATION_PHASE10C.md §7).
        from app.services.round_broadcast import room_channel_topic
        assert room_channel_topic("ABCD1234") == "room:ABCD1234"


class TestEmitRoomEvent:
    def _configure(self, monkeypatch):
        from app.services import round_broadcast as mod
        monkeypatch.setattr(mod.settings, "supabase_url", "http://127.0.0.1:54321")
        monkeypatch.setattr(mod.settings, "supabase_service_role_key", "test-service-key")
        return mod

    def test_posts_to_broadcast_endpoint_with_minimal_payload(self, monkeypatch):
        mod = self._configure(monkeypatch)
        with patch.object(mod.httpx, "post") as mock_post:
            mod.emit_room_event("room-1", "crossfire_ready_changed", phase="first_crossfire")
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        assert args[0] == "http://127.0.0.1:54321/realtime/v1/api/broadcast"
        message = kwargs["json"]["messages"][0]
        assert message["topic"] == "room:room-1"
        assert message["event"] == "notify"
        assert message["payload"]["event_type"] == "crossfire_ready_changed"
        assert message["payload"]["phase"] == "first_crossfire"
        assert kwargs["headers"]["Authorization"] == "Bearer test-service-key"

    def test_omits_phase_key_entirely_when_not_given(self, monkeypatch):
        mod = self._configure(monkeypatch)
        with patch.object(mod.httpx, "post") as mock_post:
            mod.emit_room_event("room-1", "room_closed")
        payload = mock_post.call_args.kwargs["json"]["messages"][0]["payload"]
        assert set(payload.keys()) == {"event_type", "ts"}

    def test_payload_never_contains_anything_beyond_the_allowlisted_keys(self, monkeypatch):
        """Static shape guard: no speech/answer/evidence/note text, no
        participant identity -- only event_type/ts/phase can ever appear."""
        mod = self._configure(monkeypatch)
        with patch.object(mod.httpx, "post") as mock_post:
            mod.emit_room_event("room-1", "crossfire_answer_submitted", phase="grand_crossfire")
        payload = mock_post.call_args.kwargs["json"]["messages"][0]["payload"]
        assert set(payload.keys()) <= {"event_type", "ts", "phase"}

    def test_unknown_event_type_is_rejected_without_posting(self, monkeypatch):
        mod = self._configure(monkeypatch)
        with patch.object(mod.httpx, "post") as mock_post:
            mod.emit_room_event("room-1", "totally_made_up_event")
        mock_post.assert_not_called()

    def test_httpx_failure_never_raises(self, monkeypatch):
        mod = self._configure(monkeypatch)
        with patch.object(mod.httpx, "post", side_effect=RuntimeError("network down")):
            mod.emit_room_event("room-1", "phase_advanced", phase="first_rebuttal")  # must not raise

    def test_skips_silently_when_supabase_not_configured(self, monkeypatch):
        from app.services import round_broadcast as mod
        monkeypatch.setattr(mod.settings, "supabase_url", "")
        monkeypatch.setattr(mod.settings, "supabase_service_role_key", "")
        with patch.object(mod.httpx, "post") as mock_post:
            mod.emit_room_event("room-1", "room_closed")
        mock_post.assert_not_called()

    def test_every_call_site_event_type_is_in_the_allowlist(self):
        """Cross-checks every emit_room_event(...) call site in
        round_simulations.py against SAFE_BROADCAST_EVENT_TYPES -- if a
        future call site introduces a new event string without adding it to
        the allowlist, that call would silently no-op in production
        (test_unknown_event_type_is_rejected_without_posting above proves
        why); this test turns that into a loud CI failure instead."""
        from app.services.round_broadcast import SAFE_BROADCAST_EVENT_TYPES
        source = (ROOT / "app" / "api" / "round_simulations.py").read_text()
        calls = re.findall(r'emit_room_event\([^,]*,\s*"([a-z_]+)"', source)
        assert len(calls) >= 8, f"expected at least 8 emit_room_event call sites, found {len(calls)}"
        for event_type in calls:
            assert event_type in SAFE_BROADCAST_EVENT_TYPES, event_type


# ═══════════════════════════════════════════════════════════════════════════
# 2. Endpoint-level wiring tests -- mocked get_supabase/round_room_service,
#    same convention as test_round_rooms.py. No DB required, always run.
# ═══════════════════════════════════════════════════════════════════════════


def _room(room_id="room-1", round_id="r1", owner="owner-1", status="waiting", code="ABCD1234"):
    return {
        "id": room_id, "round_id": round_id, "owner_user_id": owner, "title": None,
        "status": status, "invite_code": code,
        "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
    }


def _participant(
    pid="p1", room_id="room-1", user_id="owner-1", role="owner", side="pro", status="joined",
    speaker_slot=None,
):
    return {
        "id": pid, "room_id": room_id, "user_id": user_id, "display_name": None,
        "role": role, "side": side, "speaker_slot": speaker_slot, "status": status,
        "joined_at": "2026-01-01T00:00:00Z",
        "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
    }


def _full_round_row(round_id="r1", user_id="owner-1", status="setup"):
    return {
        "id": round_id, "user_id": user_id, "status": status,
        "config_json": {
            "student_side": "pro", "speaking_order": "first", "resolution": "Test resolution.",
        },
        "current_phase": "first_constructive", "phase_history": [],
        "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
    }


def _crossfire_round_row(round_id="r1", user_id="owner-1", phase="first_crossfire", status="active"):
    row = _full_round_row(round_id=round_id, user_id=user_id, status=status)
    row["current_phase"] = phase
    return row


def _configure_round_access(round_row):
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
        MagicMock(data=round_row)
    )
    return supabase


class TestCrossfireReadyEmission:
    def test_emits_after_successful_readiness_write(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import SetCrossfireReadyRequest
        round_row = _crossfire_round_row()
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        supabase = _configure_round_access(round_row)
        req = SetCrossfireReadyRequest(ready=True)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(round_room_service, "list_participants", return_value=[participant]), \
             patch.object(mod, "emit_room_event") as mock_emit:
            result = mod.set_crossfire_ready_endpoint("room-1", req, "u2")
        mock_emit.assert_called_once_with("room-1", "crossfire_ready_changed", phase="first_crossfire")
        assert result.viewer_participant.is_ready is True

    def test_mutation_succeeds_even_when_the_real_broadcast_http_call_raises(self, monkeypatch):
        """Doesn't mock emit_room_event itself -- lets the real function run
        with a monkeypatched httpx.post that raises, proving the endpoint's
        own return value is unaffected by a genuine transport failure."""
        from app.services import round_broadcast as bmod
        monkeypatch.setattr(bmod.settings, "supabase_url", "http://127.0.0.1:54321")
        monkeypatch.setattr(bmod.settings, "supabase_service_role_key", "test-service-key")
        from app.api import round_simulations as mod
        from app.models.round_simulation import SetCrossfireReadyRequest
        round_row = _crossfire_round_row()
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        supabase = _configure_round_access(round_row)
        req = SetCrossfireReadyRequest(ready=True)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(round_room_service, "list_participants", return_value=[participant]), \
             patch.object(bmod.httpx, "post", side_effect=RuntimeError("network down")):
            result = mod.set_crossfire_ready_endpoint("room-1", req, "u2")
        assert result.viewer_participant.is_ready is True


class TestCrossfireAnswerEmission:
    def _exchange(self, answer=None):
        from app.models.round_simulation import CrossfireExchange
        return CrossfireExchange(
            id="ex-1", round_id="r1", phase="first_crossfire", sequence=0,
            questioner_side="con", question="Why does that hold?",
            answer=answer, target_argument="general",
            created_at="2026-01-01T00:00:00Z",
        )

    def test_multiplayer_answer_emits_after_successful_write(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import CrossfireSubmitRequest
        round_row = _crossfire_round_row(user_id="owner-1")
        room = _room(owner="owner-1")
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        supabase = _configure_round_access(round_row)
        pending = self._exchange()
        updated = pending.model_copy(update={"answer": "My answer."})
        supabase.table.return_value.update.return_value.eq.return_value.is_.return_value.execute.return_value = (
            MagicMock(data=[updated.model_dump()])
        )
        req = CrossfireSubmitRequest(round_id="r1", phase="first_crossfire", typed_response="My answer.")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "load_crossfire_exchanges", return_value=[pending]), \
             patch.object(mod, "load_round_arguments", return_value=[]), \
             patch.object(mod, "process_crossfire_response", return_value=updated), \
             patch.object(mod, "track_product_event"), \
             patch.object(mod, "emit_room_event") as mock_emit:
            mod.submit_crossfire_answer("r1", req, "u2")
        mock_emit.assert_called_once_with("room-1", "crossfire_answer_submitted", phase="first_crossfire")

    def test_solo_round_never_emits_no_room_to_notify(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import CrossfireSubmitRequest
        round_row = _crossfire_round_row(user_id="owner-1")
        supabase = _configure_round_access(round_row)
        pending = self._exchange()
        updated = pending.model_copy(update={"answer": "My answer."})
        supabase.table.return_value.update.return_value.eq.return_value.is_.return_value.execute.return_value = (
            MagicMock(data=[updated.model_dump()])
        )
        req = CrossfireSubmitRequest(round_id="r1", phase="first_crossfire", typed_response="My answer.")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=None), \
             patch.object(mod, "load_crossfire_exchanges", return_value=[pending]), \
             patch.object(mod, "load_round_arguments", return_value=[]), \
             patch.object(mod, "process_crossfire_response", return_value=updated), \
             patch.object(mod, "track_product_event"), \
             patch.object(mod, "emit_room_event") as mock_emit:
            mod.submit_crossfire_answer("r1", req, "owner-1")
        mock_emit.assert_not_called()

    def test_409_duplicate_answer_never_emits(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import CrossfireSubmitRequest
        round_row = _crossfire_round_row(user_id="owner-1")
        room = _room(owner="owner-1")
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        supabase = _configure_round_access(round_row)
        pending = self._exchange()
        updated = pending.model_copy(update={"answer": "My answer."})
        supabase.table.return_value.update.return_value.eq.return_value.is_.return_value.execute.return_value = (
            MagicMock(data=[])
        )
        req = CrossfireSubmitRequest(round_id="r1", phase="first_crossfire", typed_response="My answer.")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "load_crossfire_exchanges", return_value=[pending]), \
             patch.object(mod, "load_round_arguments", return_value=[]), \
             patch.object(mod, "process_crossfire_response", return_value=updated), \
             patch.object(mod, "emit_room_event") as mock_emit:
            with pytest.raises(HTTPException):
                mod.submit_crossfire_answer("r1", req, "u2")
        mock_emit.assert_not_called()


class TestAdvancePhaseEmission:
    def test_multiplayer_advance_emits_target_phase(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import AdvancePhaseRequest
        round_row = _full_round_row(round_id="r1", user_id="owner-1", status="active")
        room = _room(owner="owner-1")
        participant = _participant(pid="p1", user_id="owner-1", role="owner", side="pro")
        supabase = _configure_round_access(round_row)
        req = AdvancePhaseRequest(round_id="r1")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "emit_room_event") as mock_emit:
            mod.advance_phase("r1", req, "owner-1")
        mock_emit.assert_called_once_with("room-1", "phase_advanced", phase="second_constructive")

    def test_solo_round_never_emits(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import AdvancePhaseRequest
        round_row = _full_round_row(round_id="r1", user_id="owner-1", status="active")
        supabase = _configure_round_access(round_row)
        req = AdvancePhaseRequest(round_id="r1")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=None), \
             patch.object(mod, "emit_room_event") as mock_emit:
            mod.advance_phase("r1", req, "owner-1")
        mock_emit.assert_not_called()


class TestRoomLifecycleEmission:
    def test_close_room_emits_room_closed_with_no_phase(self):
        from app.api import round_simulations as mod
        room = _room(owner="owner-1", status="active")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "close_room", return_value={**room, "status": "closed"}), \
             patch.object(mod, "track_product_event"), \
             patch.object(mod, "emit_room_event") as mock_emit:
            mod.close_room_endpoint("room-1", "owner-1")
        mock_emit.assert_called_once_with("room-1", "room_closed")

    def test_leave_room_emits_participant_updated(self):
        from app.api import round_simulations as mod
        room = _room(owner="owner-1")
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(round_room_service, "leave_room", return_value={**participant, "status": "left"}), \
             patch.object(mod, "emit_room_event") as mock_emit:
            mod.leave_room_endpoint("room-1", "u2")
        mock_emit.assert_called_once_with("room-1", "participant_updated")

    def test_update_participant_emits_participant_updated(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        target = _participant(pid="p2", user_id="u2", role="observer", side=None)
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[target]), \
             patch.object(round_room_service, "update_participant", return_value={**target, "role": "debater_a"}), \
             patch.object(mod, "emit_room_event") as mock_emit:
            mod.update_room_participant_endpoint(
                "room-1", "p2", UpdateRoomParticipantRequest(role="debater_a"), "owner-1",
            )
        mock_emit.assert_called_once_with("room-1", "participant_updated")


class TestNoEmissionOnReads:
    def test_get_room_does_not_emit(self):
        from app.api import round_simulations as mod
        room = _room(owner="owner-1")
        participant = _participant()
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None), \
             patch.object(round_room_service, "list_participants", return_value=[participant]), \
             patch.object(mod, "emit_room_event") as mock_emit:
            mod.get_room_endpoint("room-1", "owner-1")
        mock_emit.assert_not_called()

    def test_list_participants_does_not_emit(self):
        from app.api import round_simulations as mod
        room = _room(owner="owner-1")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None), \
             patch.object(round_room_service, "list_participants", return_value=[]), \
             patch.object(mod, "emit_room_event") as mock_emit:
            mod.list_room_participants_endpoint("room-1", "owner-1")
        mock_emit.assert_not_called()


# ═══════════════════════════════════════════════════════════════════════════
# 3. Live test for the Pass 34 realtime.messages RLS policy (Realtime
#    Authorization). Shells out to `docker exec` since PostgREST doesn't
#    expose the `realtime` schema. Skips cleanly when unavailable.
# ═══════════════════════════════════════════════════════════════════════════


def _docker_psql_available() -> bool:
    if shutil.which("docker") is None:
        return False
    try:
        result = subprocess.run(
            ["docker", "exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-c", "select 1;"],
            capture_output=True, timeout=5, text=True,
        )
        return result.returncode == 0
    except Exception:
        return False


def _psql(sql: str) -> str:
    result = subprocess.run(
        ["docker", "exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A"],
        input=sql, capture_output=True, timeout=10, text=True,
    )
    assert result.returncode == 0, f"psql failed: {result.stderr}"
    return result.stdout


def _extract_count(output: str) -> str:
    """psql -t still prints command-completion tags (SET/RESET/...) for
    non-SELECT statements sharing the session -- find the one line that's
    purely digits, i.e. the actual `select count(*)` result."""
    digit_lines = [line for line in output.splitlines() if re.fullmatch(r"\d+", line.strip())]
    assert digit_lines, f"no numeric result line found in psql output: {output!r}"
    return digit_lines[-1]


_requires_docker_psql = pytest.mark.skipif(
    not _docker_psql_available(),
    reason=(
        f"Live realtime.messages RLS test requires Dissio's local Supabase Postgres "
        f"container ({DB_CONTAINER}) reachable via `docker exec` -- gracefully skipped, "
        f"not failed, on machines/CI without Docker or that specific container running. "
        f"Run: bash scripts/setup_local_test_env.sh"
    ),
)


class TestMigrationStaticAnalysis:
    def _text(self) -> str:
        path = MIGRATIONS_DIR / MIGRATION_FILE
        assert path.exists(), f"{MIGRATION_FILE} not found in {MIGRATIONS_DIR}"
        return path.read_text()

    def test_grants_select_only_not_insert_or_update(self):
        text = self._text()
        assert "for select" in text.lower()
        assert "for insert" not in text.lower()
        assert "for update" not in text.lower()
        assert "for all" not in text.lower()

    def test_scoped_to_room_prefixed_topics_only(self):
        assert "topic like 'room:%'" in self._text()

    def test_never_references_invite_code(self):
        assert "invite_code" not in self._text().lower()

    def test_reuses_existing_participant_helper_not_a_new_one(self):
        assert "current_user_is_round_room_participant" in self._text()
        assert "create or replace function" not in self._text().lower()

    def test_granted_to_authenticated_not_anon_or_public(self):
        text_lower = self._text().lower()
        assert "to authenticated" in text_lower
        assert "to anon" not in text_lower
        assert "to public" not in text_lower


@_requires_docker_psql
class TestRealtimeMessagesRLSLive:
    """Direct psql probe: insert one row into realtime.messages for a real
    seeded room's topic, then evaluate SELECT visibility under a simulated
    authenticated session for both a member and a non-member -- exactly the
    query shape Realtime Authorization itself runs at private-channel join
    time, independent of the websocket transport."""

    def _room_and_owner(self) -> tuple[str, str]:
        out = _psql(
            "select rr.id, rr.owner_user_id from round_rooms rr "
            "join round_room_participants p on p.room_id = rr.id "
            "and p.user_id = '00000000-0000-0000-0001-000000000001' "
            "and p.status = 'joined' limit 1;"
        )
        line = out.strip().splitlines()[0] if out.strip() else ""
        assert "|" in line, (
            "No seeded room owned by the deterministic test student was found -- "
            "run scripts/setup_local_test_env.sh (which also runs the Pass 31/32/33 "
            "live tests that provision rooms) before this test."
        )
        room_id, owner_id = line.split("|")
        return room_id.strip(), owner_id.strip()

    def test_owner_can_select_own_room_topic_non_member_cannot(self):
        room_id, owner_id = self._room_and_owner()
        non_member_id = "00000000-0000-0000-0002-000000000002"  # COACH_B, unrelated
        topic = f"room:{room_id}"
        probe_id = str(uuid.uuid4())
        try:
            _psql(
                f"insert into realtime.messages (id, topic, event, payload, private, extension) "
                f"values ('{probe_id}', '{topic}', 'notify', "
                f"'{{\"event_type\":\"probe\"}}'::jsonb, true, 'broadcast');"
            )
            owner_count = _extract_count(_psql(
                f"set role authenticated; "
                f"set request.jwt.claims = '{{\"sub\":\"{owner_id}\",\"role\":\"authenticated\"}}'; "
                f"select count(*) from realtime.messages where topic = '{topic}'; "
                f"reset role;"
            ))
            non_member_count = _extract_count(_psql(
                f"set role authenticated; "
                f"set request.jwt.claims = '{{\"sub\":\"{non_member_id}\",\"role\":\"authenticated\"}}'; "
                f"select count(*) from realtime.messages where topic = '{topic}'; "
                f"reset role;"
            ))
        finally:
            _psql(f"set role postgres; delete from realtime.messages where id = '{probe_id}';")

        assert owner_count == "1", f"room owner should see their own room's broadcast row, got count={owner_count!r}"
        assert non_member_count == "0", f"non-member must not see it, got count={non_member_count!r}"
