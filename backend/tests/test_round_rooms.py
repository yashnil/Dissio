"""Pass 27 — Phase 9A multiplayer room tests.

Endpoint-level tests via direct function call with mocked collaborators —
the established pattern in this repo's round_simulations tests, avoiding a
live Supabase connection (see test_round_api.py).

Covers:
- round_room_service: invite code generation/uniqueness, room creation,
  idempotent join, participant updates.
- round_simulations._load_round_access / _require_general_mutate_access /
  _require_turn_access: the permission layer, including the solo-round
  regression (no room row -> identical to the legacy _verify_owner).
- The new /rooms endpoints: create, get, join, list participants, assign
  role/side (owner-only), leave.
"""
from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock, ANY

from app.services import round_room_service


# ── round_room_service ───────────────────────────────────────────────────────


def _mock_supabase_select_chain(data):
    """A MagicMock whose .table(...).select(...).eq(...).execute() (with any
    number of chained .eq() calls) returns `data`."""
    supabase = MagicMock()
    resp = MagicMock(data=data)
    supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = resp
    supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = resp
    supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = resp
    return supabase


class TestGenerateInviteCode:
    def test_returns_code_when_free(self):
        supabase = _mock_supabase_select_chain([])
        code = round_room_service.generate_invite_code(supabase)
        assert len(code) == 8
        assert code.isupper() or code.isdigit() or code.isalnum()

    def test_retries_on_collision(self):
        supabase = MagicMock()
        taken = MagicMock(data=[{"id": "existing"}])
        free = MagicMock(data=[])
        supabase.table.return_value.select.return_value.eq.return_value.execute.side_effect = [taken, free]
        code = round_room_service.generate_invite_code(supabase)
        assert code
        assert supabase.table.return_value.select.return_value.eq.return_value.execute.call_count == 2

    def test_raises_after_10_collisions(self):
        supabase = MagicMock()
        taken = MagicMock(data=[{"id": "existing"}])
        supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = taken
        with pytest.raises(RuntimeError):
            round_room_service.generate_invite_code(supabase)


class TestCreateRoomService:
    def test_creates_room_and_owner_participant(self):
        supabase = _mock_supabase_select_chain([])
        room, participant = round_room_service.create_room(
            supabase, round_id="r1", owner_user_id="u1", student_side="pro", title="My room",
        )
        assert room["round_id"] == "r1"
        assert room["owner_user_id"] == "u1"
        assert room["status"] == "waiting"
        assert room["invite_code"]
        assert participant["room_id"] == room["id"]
        assert participant["user_id"] == "u1"
        assert participant["role"] == "owner"
        assert participant["side"] == "pro"
        assert participant["status"] == "joined"


class TestJoinRoomService:
    def test_first_join_inserts_observer(self):
        supabase = _mock_supabase_select_chain([])
        room = {"id": "room-1"}
        participant = round_room_service.join_room(supabase, room, user_id="u2")
        assert participant["room_id"] == "room-1"
        assert participant["user_id"] == "u2"
        assert participant["role"] == "observer"
        assert participant["side"] is None
        assert participant["status"] == "joined"

    def test_repeat_join_for_already_joined_user_is_a_noop(self):
        existing = {"id": "p1", "room_id": "room-1", "user_id": "u2", "status": "joined", "role": "observer"}
        supabase = _mock_supabase_select_chain([existing])
        result = round_room_service.join_room(supabase, {"id": "room-1"}, user_id="u2")
        assert result == existing
        supabase.table.return_value.insert.assert_not_called()

    def test_rejoin_after_leaving_flips_status_back_to_joined(self):
        existing = {"id": "p1", "room_id": "room-1", "user_id": "u2", "status": "left", "role": "observer"}
        supabase = _mock_supabase_select_chain([existing])
        result = round_room_service.join_room(supabase, {"id": "room-1"}, user_id="u2")
        assert result["status"] == "joined"
        assert result["joined_at"] is not None


class TestUpdateParticipantService:
    def test_applies_role_and_side(self):
        supabase = MagicMock()
        participant = {"id": "p1", "role": "observer", "side": None}
        updated = round_room_service.update_participant(supabase, participant, role="debater_a", side="pro")
        assert updated["role"] == "debater_a"
        assert updated["side"] == "pro"

    def test_none_arguments_leave_fields_unchanged(self):
        supabase = MagicMock()
        participant = {"id": "p1", "role": "debater_a", "side": "pro"}
        updated = round_room_service.update_participant(supabase, participant)
        assert updated["role"] == "debater_a"
        assert updated["side"] == "pro"


# ── round_simulations permission layer ──────────────────────────────────────


def _round_row(round_id="r1", user_id="owner-1"):
    return {"id": round_id, "user_id": user_id}


_UNSET = object()


class TestLoadRoundAccess:
    def _call(self, round_id="r1", user_id="owner-1", round_row=_UNSET, room=None, participant=None):
        from app.api import round_simulations as mod
        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            MagicMock(data=_round_row(round_id, "owner-1") if round_row is _UNSET else round_row)
        )
        with patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant):
            return mod._load_round_access(round_id, user_id, supabase)

    def test_solo_round_owner_gets_access_identical_to_legacy_verify_owner(self):
        """No room row at all -- the exact solo-round shape. Must succeed for
        the owner, exactly like the old _verify_owner did."""
        access = self._call(user_id="owner-1", room=None)
        assert access.is_owner is True
        assert access.room is None
        assert access.round_row["user_id"] == "owner-1"

    def test_solo_round_non_owner_gets_403(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            self._call(user_id="someone-else", room=None)
        assert exc_info.value.status_code == 403

    def test_missing_round_is_404(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            self._call(round_row=None)
        assert exc_info.value.status_code == 404

    def test_multiplayer_joined_participant_gets_access(self):
        room = {"id": "room-1"}
        participant = {"id": "p1", "user_id": "u2", "status": "joined", "role": "debater_a", "side": "pro"}
        access = self._call(user_id="u2", room=room, participant=participant)
        assert access.is_owner is False
        assert access.room == room
        assert access.participant == participant

    def test_multiplayer_non_participant_gets_403(self):
        from fastapi import HTTPException
        room = {"id": "room-1"}
        with pytest.raises(HTTPException) as exc_info:
            self._call(user_id="stranger", room=room, participant=None)
        assert exc_info.value.status_code == 403

    def test_multiplayer_invited_but_not_joined_gets_403(self):
        from fastapi import HTTPException
        room = {"id": "room-1"}
        participant = {"id": "p1", "user_id": "u2", "status": "invited", "role": "observer", "side": None}
        with pytest.raises(HTTPException) as exc_info:
            self._call(user_id="u2", room=room, participant=participant)
        assert exc_info.value.status_code == 403

    def test_owner_gets_access_even_when_a_room_exists(self):
        room = {"id": "room-1"}
        owner_participant = {"id": "p0", "user_id": "owner-1", "status": "joined", "role": "owner", "side": "pro"}
        access = self._call(user_id="owner-1", room=room, participant=owner_participant)
        assert access.is_owner is True
        assert access.room == room


class TestRequireGeneralMutateAccess:
    def _access(self, is_owner, room=None, participant=None):
        from app.api import round_simulations as mod
        return mod._RoundAccess(round_row={"id": "r1"}, room=room, participant=participant, is_owner=is_owner)

    def test_owner_always_passes(self):
        from app.api import round_simulations as mod
        mod._require_general_mutate_access(self._access(is_owner=True))  # must not raise

    def test_joined_debater_passes(self):
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined"}
        mod._require_general_mutate_access(
            self._access(is_owner=False, room={"id": "room-1"}, participant=participant)
        )  # must not raise

    def test_observer_rejected(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        participant = {"role": "observer", "status": "joined"}
        with pytest.raises(HTTPException) as exc_info:
            mod._require_general_mutate_access(
                self._access(is_owner=False, room={"id": "room-1"}, participant=participant)
            )
        assert exc_info.value.status_code == 403

    def test_coach_rejected(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        participant = {"role": "coach", "status": "joined"}
        with pytest.raises(HTTPException):
            mod._require_general_mutate_access(
                self._access(is_owner=False, room={"id": "room-1"}, participant=participant)
            )


class TestRequireTurnAccess:
    def _access(self, is_owner, room=None, participant=None):
        from app.api import round_simulations as mod
        return mod._RoundAccess(round_row={"id": "r1"}, room=room, participant=participant, is_owner=is_owner)

    def test_solo_round_no_room_is_a_noop(self):
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        mod._require_turn_access(self._access(is_owner=True, room=None), RoundSide.PRO)  # must not raise

    def test_participant_on_matching_side_passes(self):
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "pro"}
        mod._require_turn_access(
            self._access(is_owner=False, room={"id": "room-1"}, participant=participant), RoundSide.PRO,
        )  # must not raise

    def test_partner_on_matching_side_also_passes(self):
        """Two participants can share the human-controlled side (partners)."""
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "debater_b", "status": "joined", "side": "pro"}
        mod._require_turn_access(
            self._access(is_owner=False, room={"id": "room-1"}, participant=participant), RoundSide.PRO,
        )  # must not raise

    def test_wrong_side_rejected(self):
        from fastapi import HTTPException
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "con"}
        with pytest.raises(HTTPException) as exc_info:
            mod._require_turn_access(
                self._access(is_owner=False, room={"id": "room-1"}, participant=participant), RoundSide.PRO,
            )
        assert exc_info.value.status_code == 403

    def test_observer_rejected(self):
        from fastapi import HTTPException
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "observer", "status": "joined", "side": None}
        with pytest.raises(HTTPException):
            mod._require_turn_access(
                self._access(is_owner=False, room={"id": "room-1"}, participant=participant), RoundSide.PRO,
            )

    def test_owner_without_matching_side_is_rejected_not_bypassed(self):
        """The core anti-spoofing guarantee: room ownership alone does not
        grant turn permission. The owner must also hold the assigned side."""
        from fastapi import HTTPException
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        owner_participant = {"role": "owner", "status": "joined", "side": "con"}
        with pytest.raises(HTTPException) as exc_info:
            mod._require_turn_access(
                self._access(is_owner=True, room={"id": "room-1"}, participant=owner_participant), RoundSide.PRO,
            )
        assert exc_info.value.status_code == 403


# ── /rooms endpoints ─────────────────────────────────────────────────────────


def _room(room_id="room-1", round_id="r1", owner="owner-1", status="waiting", code="ABCD1234"):
    return {
        "id": room_id, "round_id": round_id, "owner_user_id": owner, "title": None,
        "status": status, "invite_code": code,
        "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
    }


def _participant(pid="p1", room_id="room-1", user_id="owner-1", role="owner", side="pro", status="joined"):
    return {
        "id": pid, "room_id": room_id, "user_id": user_id, "display_name": None,
        "role": role, "side": side, "status": status, "joined_at": "2026-01-01T00:00:00Z",
        "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
    }


class TestCreateRoomEndpoint:
    def test_requires_round_id_or_config(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import CreateRoomRequest
        with patch.object(mod, "get_supabase", return_value=MagicMock()):
            with pytest.raises(HTTPException) as exc_info:
                mod.create_room_endpoint(CreateRoomRequest(), "u1")
        assert exc_info.value.status_code == 400

    def test_rejects_both_round_id_and_config(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import CreateRoomRequest, RoundSimulationConfig
        req = CreateRoomRequest(
            round_id="r1",
            config=RoundSimulationConfig(student_side="pro", speaking_order="first", resolution="Test."),
        )
        with patch.object(mod, "get_supabase", return_value=MagicMock()):
            with pytest.raises(HTTPException) as exc_info:
                mod.create_room_endpoint(req, "u1")
        assert exc_info.value.status_code == 400

    def test_wraps_existing_owned_round(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import CreateRoomRequest
        req = CreateRoomRequest(round_id="r1")
        row = {"id": "r1", "user_id": "u1", "config_json": {"student_side": "pro"}}
        room = _room()
        participant = _participant(user_id="u1")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(mod, "_verify_owner", return_value=row), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=None), \
             patch.object(round_room_service, "create_room", return_value=(room, participant)) as mock_create, \
             patch.object(round_room_service, "list_participants", return_value=[participant]), \
             patch.object(mod, "track_product_event"):
            result = mod.create_room_endpoint(req, "u1")
        mock_create.assert_called_once_with(ANY, "r1", "u1", "pro", title=None)
        assert result.room.id == "room-1"
        assert result.viewer_participant.user_id == "u1"

    def test_rejects_round_that_already_has_a_room(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import CreateRoomRequest
        req = CreateRoomRequest(round_id="r1")
        row = {"id": "r1", "user_id": "u1", "config_json": {"student_side": "pro"}}
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(mod, "_verify_owner", return_value=row), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=_room()):
            with pytest.raises(HTTPException) as exc_info:
                mod.create_room_endpoint(req, "u1")
        assert exc_info.value.status_code == 400

    def test_creates_new_round_from_config(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import CreateRoomRequest, RoundSimulationConfig
        req = CreateRoomRequest(
            config=RoundSimulationConfig(student_side="con", speaking_order="first", resolution="Test."),
        )
        room = _room()
        participant = _participant(user_id="u1", side="con")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "create_room", return_value=(room, participant)) as mock_create, \
             patch.object(round_room_service, "list_participants", return_value=[participant]), \
             patch.object(mod, "track_product_event"):
            result = mod.create_room_endpoint(req, "u1")
        mock_create.assert_called_once_with(ANY, ANY, "u1", "con", title=None)
        assert result.viewer_participant.side == "con"


class TestGetRoomEndpoint:
    def test_owner_can_read(self):
        from app.api import round_simulations as mod
        room = _room()
        participant = _participant()
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None), \
             patch.object(round_room_service, "list_participants", return_value=[participant]):
            result = mod.get_room_endpoint("room-1", "owner-1")
        assert result.room.id == "room-1"

    def test_joined_participant_can_read(self):
        from app.api import round_simulations as mod
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(round_room_service, "list_participants", return_value=[participant]):
            result = mod.get_room_endpoint("room-1", "u2")
        assert result.viewer_participant.user_id == "u2"

    def test_unauthorized_user_cannot_read(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        room = _room()
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                mod.get_room_endpoint("room-1", "stranger")
        assert exc_info.value.status_code == 403

    def test_unknown_room_is_404(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                mod.get_room_endpoint("room-x", "u1")
        assert exc_info.value.status_code == 404


class TestJoinRoomEndpoint:
    def test_valid_code_joins_and_is_idempotent(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import JoinRoomRequest
        room = _room(code="JOINME12")
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room_by_invite_code", return_value=room), \
             patch.object(round_room_service, "join_room", return_value=participant) as mock_join, \
             patch.object(round_room_service, "list_participants", return_value=[participant]), \
             patch.object(mod, "track_product_event"):
            result1 = mod.join_room_endpoint(JoinRoomRequest(invite_code="joinme12"), "u2")
            result2 = mod.join_room_endpoint(JoinRoomRequest(invite_code="joinme12"), "u2")
        assert mock_join.call_count == 2  # service layer owns idempotency, not the route
        assert result1.viewer_participant.user_id == "u2"
        assert result2.viewer_participant.user_id == "u2"

    def test_invalid_code_is_404(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import JoinRoomRequest
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room_by_invite_code", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                mod.join_room_endpoint(JoinRoomRequest(invite_code="NOPE0000"), "u2")
        assert exc_info.value.status_code == 404

    def test_blank_code_is_400(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import JoinRoomRequest
        with patch.object(mod, "get_supabase", return_value=MagicMock()):
            with pytest.raises(HTTPException) as exc_info:
                mod.join_room_endpoint(JoinRoomRequest(invite_code="   "), "u2")
        assert exc_info.value.status_code == 400


class TestUpdateRoomParticipantEndpoint:
    def test_owner_can_assign_role_and_side(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        target = _participant(pid="p2", user_id="u2", role="observer", side=None)
        round_row = MagicMock(data={"config_json": {"student_side": "pro"}})
        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = round_row
        updated = dict(target, role="debater_b", side="pro")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[target]), \
             patch.object(round_room_service, "update_participant", return_value=updated) as mock_update:
            result = mod.update_room_participant_endpoint(
                "room-1", "p2", UpdateRoomParticipantRequest(role="debater_b", side="pro"), "owner-1",
            )
        mock_update.assert_called_once_with(ANY, target, role="debater_b", side="pro")
        assert result.role == "debater_b"
        assert result.side == "pro"

    def test_non_owner_cannot_assign_roles(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room):
            with pytest.raises(HTTPException) as exc_info:
                mod.update_room_participant_endpoint(
                    "room-1", "p2", UpdateRoomParticipantRequest(role="debater_b"), "u2",
                )
        assert exc_info.value.status_code == 403

    def test_rejects_assigning_the_ai_controlled_side(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        target = _participant(pid="p2", user_id="u2", role="observer", side=None)
        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            MagicMock(data={"config_json": {"student_side": "pro"}})
        )
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[target]):
            with pytest.raises(HTTPException) as exc_info:
                mod.update_room_participant_endpoint(
                    "room-1", "p2", UpdateRoomParticipantRequest(side="con"), "owner-1",
                )
        assert exc_info.value.status_code == 400

    def test_rejects_reassigning_ownership(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        target = _participant(pid="p2", user_id="u2", role="observer", side=None)
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[target]):
            with pytest.raises(HTTPException) as exc_info:
                mod.update_room_participant_endpoint(
                    "room-1", "p2", UpdateRoomParticipantRequest(role="owner"), "owner-1",
                )
        assert exc_info.value.status_code == 400

    def test_unknown_participant_is_404(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[]):
            with pytest.raises(HTTPException) as exc_info:
                mod.update_room_participant_endpoint(
                    "room-1", "does-not-exist", UpdateRoomParticipantRequest(role="debater_a"), "owner-1",
                )
        assert exc_info.value.status_code == 404


class TestLeaveRoomEndpoint:
    def test_participant_can_leave(self):
        from app.api import round_simulations as mod
        room = _room()
        participant = _participant(pid="p2", user_id="u2")
        left = dict(participant, status="left")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(round_room_service, "leave_room", return_value=left):
            result = mod.leave_room_endpoint("room-1", "u2")
        assert result.status == "left"

    def test_non_participant_cannot_leave(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        room = _room()
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                mod.leave_room_endpoint("room-1", "stranger")
        assert exc_info.value.status_code == 404
