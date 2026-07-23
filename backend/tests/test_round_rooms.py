"""Pass 27/28 — Phase 9A/9B multiplayer room tests.

Endpoint-level tests via direct function call with mocked collaborators —
the established pattern in this repo's round_simulations tests, avoiding a
live Supabase connection (see test_round_api.py).

Covers:
- round_room_service: invite code generation/uniqueness, room creation,
  idempotent join, participant updates.
- round_simulations._load_round_access / _require_general_mutate_access /
  _require_turn_access / _require_coach_or_owner_access: the permission
  layer, including the solo-round regression (no room row -> identical to
  the legacy _verify_owner).
- _participant_turn_state / _build_turn_context (Phase 9B): the pure
  turn-contract predicate and the API-exposed TurnContext it builds.
- The /rooms endpoints: create, get, join, list participants, assign
  role/side (owner-only), leave.
- Phase 9B participant access expansion: report/replay/drills/annotations
  read access, start/load-preparation/drill-generation/drill-attempt-submit
  general-mutate access, annotations/finding-rating coach-or-owner access.
"""
from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock, ANY

from app.services.drill_attempt_scoring import DrillScoringError

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

    def test_applies_speaker_slot(self):
        supabase = MagicMock()
        participant = {"id": "p1", "role": "debater_a", "side": "pro", "speaker_slot": None}
        updated = round_room_service.update_participant(supabase, participant, speaker_slot="first")
        assert updated["speaker_slot"] == "first"

    def test_none_speaker_slot_leaves_it_unchanged(self):
        supabase = MagicMock()
        participant = {"id": "p1", "role": "debater_a", "side": "pro", "speaker_slot": "second"}
        updated = round_room_service.update_participant(supabase, participant)
        assert updated["speaker_slot"] == "second"


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

    def test_closed_room_rejects_even_the_owner(self):
        """Phase 9E: closing a room blocks all further mutation, full stop --
        not even the owner who closed it can keep mutating."""
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        with pytest.raises(HTTPException) as exc_info:
            mod._require_general_mutate_access(
                self._access(is_owner=True, room={"id": "room-1", "status": "closed"})
            )
        assert exc_info.value.status_code == 400

    def test_closed_room_rejects_a_joined_debater(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined"}
        with pytest.raises(HTTPException) as exc_info:
            mod._require_general_mutate_access(
                self._access(is_owner=False, room={"id": "room-1", "status": "closed"}, participant=participant)
            )
        assert exc_info.value.status_code == 400


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

    def test_closed_room_rejects_a_matching_participant(self):
        from fastapi import HTTPException
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "pro"}
        with pytest.raises(HTTPException) as exc_info:
            mod._require_turn_access(
                self._access(is_owner=False, room={"id": "room-1", "status": "closed"}, participant=participant),
                RoundSide.PRO,
            )
        assert exc_info.value.status_code == 400


class TestRequireCoachOrOwnerAccess:
    """Phase 9B: annotations/finding-ratings are owner-or-coach only."""

    def _access(self, is_owner, room=None, participant=None):
        from app.api import round_simulations as mod
        return mod._RoundAccess(round_row={"id": "r1"}, room=room, participant=participant, is_owner=is_owner)

    def test_owner_always_passes(self):
        from app.api import round_simulations as mod
        mod._require_coach_or_owner_access(self._access(is_owner=True))  # must not raise

    def test_coach_participant_passes(self):
        from app.api import round_simulations as mod
        participant = {"role": "coach", "status": "joined"}
        mod._require_coach_or_owner_access(
            self._access(is_owner=False, room={"id": "room-1"}, participant=participant)
        )  # must not raise

    def test_debater_rejected(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined"}
        with pytest.raises(HTTPException) as exc_info:
            mod._require_coach_or_owner_access(
                self._access(is_owner=False, room={"id": "room-1"}, participant=participant)
            )
        assert exc_info.value.status_code == 403

    def test_observer_rejected(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        participant = {"role": "observer", "status": "joined"}
        with pytest.raises(HTTPException):
            mod._require_coach_or_owner_access(
                self._access(is_owner=False, room={"id": "room-1"}, participant=participant)
            )

    def test_non_member_rejected(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        with pytest.raises(HTTPException):
            mod._require_coach_or_owner_access(
                self._access(is_owner=False, room={"id": "room-1"}, participant=None)
            )

    def test_closed_room_rejects_the_owner(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        with pytest.raises(HTTPException) as exc_info:
            mod._require_coach_or_owner_access(
                self._access(is_owner=True, room={"id": "room-1", "status": "closed"})
            )
        assert exc_info.value.status_code == 400


class TestParticipantTurnState:
    """Pure predicate shared by _require_turn_access and _build_turn_context."""

    def test_none_expected_side_is_never_allowed(self):
        from app.api import round_simulations as mod
        allowed, reason = mod._participant_turn_state(None, None, True, None)
        assert allowed is False
        assert reason

    def test_solo_room_none_is_always_allowed(self):
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        allowed, reason = mod._participant_turn_state(None, None, True, RoundSide.PRO)
        assert allowed is True
        assert reason is None

    def test_matching_side_allowed(self):
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "pro"}
        allowed, reason = mod._participant_turn_state({"id": "room-1"}, participant, False, RoundSide.PRO)
        assert allowed is True
        assert reason is None

    def test_wrong_side_names_both_sides_in_reason(self):
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "con"}
        allowed, reason = mod._participant_turn_state({"id": "room-1"}, participant, False, RoundSide.PRO)
        assert allowed is False
        assert "con" in reason and "pro" in reason

    def test_coach_and_observer_have_distinct_reasons(self):
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        coach = {"role": "coach", "status": "joined", "side": None}
        observer = {"role": "observer", "status": "joined", "side": None}
        _, coach_reason = mod._participant_turn_state({"id": "room-1"}, coach, False, RoundSide.PRO)
        _, observer_reason = mod._participant_turn_state({"id": "room-1"}, observer, False, RoundSide.PRO)
        assert "coach" in coach_reason.lower()
        assert "observer" in observer_reason.lower()

    def test_not_joined_rejected(self):
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "invited", "side": "pro"}
        allowed, _ = mod._participant_turn_state({"id": "room-1"}, participant, False, RoundSide.PRO)
        assert allowed is False

    # ── Phase 9C: speaker slot ──────────────────────────────────────────────

    def test_matching_slot_allowed(self):
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "pro", "speaker_slot": "first"}
        allowed, reason = mod._participant_turn_state(
            {"id": "room-1"}, participant, False, RoundSide.PRO, "first",
        )
        assert allowed is True
        assert reason is None

    def test_wrong_slot_rejected(self):
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "pro", "speaker_slot": "second"}
        allowed, reason = mod._participant_turn_state(
            {"id": "room-1"}, participant, False, RoundSide.PRO, "first",
        )
        assert allowed is False
        assert "second" in reason and "first" in reason

    def test_flex_participant_slot_matches_any_required_slot(self):
        """Backward compatibility: speaker_slot=None (every pre-9C
        participant, and any participant the owner never assigned a slot
        to) must not be locked out once phases start requiring a slot."""
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "pro", "speaker_slot": None}
        allowed_first, _ = mod._participant_turn_state(
            {"id": "room-1"}, participant, False, RoundSide.PRO, "first",
        )
        allowed_second, _ = mod._participant_turn_state(
            {"id": "room-1"}, participant, False, RoundSide.PRO, "second",
        )
        assert allowed_first is True
        assert allowed_second is True

    def test_assigned_slot_matches_when_phase_has_no_slot_requirement(self):
        """Crossfire etc. (expected_speaker_slot=None) has no requirement at
        all, regardless of the participant's own assigned slot."""
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "pro", "speaker_slot": "second"}
        allowed, reason = mod._participant_turn_state(
            {"id": "room-1"}, participant, False, RoundSide.PRO, None,
        )
        assert allowed is True
        assert reason is None

    def test_wrong_side_rejected_regardless_of_slot(self):
        from app.models.round_simulation import RoundSide
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "con", "speaker_slot": "first"}
        allowed, reason = mod._participant_turn_state(
            {"id": "room-1"}, participant, False, RoundSide.PRO, "first",
        )
        assert allowed is False
        assert "con" in reason and "pro" in reason


class TestBuildTurnContext:
    """The API-exposed turn contract surfaced on RoundRoomStateResponse."""

    def _access(self, is_owner, room=None, participant=None):
        from app.api import round_simulations as mod
        return mod._RoundAccess(round_row={"id": "r1"}, room=room, participant=participant, is_owner=is_owner)

    def _config(self, student_side="pro"):
        from app.models.round_simulation import RoundSimulationConfig
        return RoundSimulationConfig(student_side=student_side, speaking_order="first", resolution="Test.")

    def test_deliberation_phase_no_one_can_act(self):
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        ctx = mod._build_turn_context(
            self._access(is_owner=True, room=None), RoundPhaseType.JUDGE_DELIBERATION, self._config(),
        )
        assert ctx.can_submit_current_turn is False
        assert ctx.expected_side is None
        assert ctx.expected_role is None

    def test_completed_phase_no_one_can_act(self):
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        ctx = mod._build_turn_context(self._access(is_owner=True, room=None), RoundPhaseType.COMPLETED, self._config())
        assert ctx.can_submit_current_turn is False

    def test_ai_turn_speech_phase_is_disabled_for_everyone(self):
        """second_constructive: student_side=pro speaks first, so the AI
        (con) speaks second_constructive -- no human submission expected."""
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        participant = {"role": "owner", "status": "joined", "side": "pro"}
        ctx = mod._build_turn_context(
            self._access(is_owner=True, room={"id": "room-1"}, participant=participant),
            RoundPhaseType.SECOND_CONSTRUCTIVE, self._config(student_side="pro"),
        )
        assert ctx.can_submit_current_turn is False
        assert ctx.disabled_reason == "The AI opponent speaks in this phase."
        assert ctx.expected_side.value == "pro"
        assert ctx.expected_role == "debater"

    def test_crossfire_phase_allowed_for_matching_side(self):
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "pro"}
        ctx = mod._build_turn_context(
            self._access(is_owner=False, room={"id": "room-1"}, participant=participant),
            RoundPhaseType.FIRST_CROSSFIRE, self._config(student_side="pro"),
        )
        assert ctx.can_submit_current_turn is True
        assert ctx.disabled_reason is None
        assert ctx.expected_side.value == "pro"

    def test_speech_phase_allowed_for_the_students_own_turn(self):
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        participant = {"role": "owner", "status": "joined", "side": "pro"}
        ctx = mod._build_turn_context(
            self._access(is_owner=True, room={"id": "room-1"}, participant=participant),
            RoundPhaseType.FIRST_CONSTRUCTIVE, self._config(student_side="pro"),
        )
        assert ctx.can_submit_current_turn is True

    def test_solo_round_always_allowed_in_a_student_phase(self):
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        ctx = mod._build_turn_context(
            self._access(is_owner=True, room=None), RoundPhaseType.FIRST_CONSTRUCTIVE, self._config(),
        )
        assert ctx.can_submit_current_turn is True
        assert ctx.disabled_reason is None

    def test_observer_disabled_in_crossfire_with_reason(self):
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        participant = {"role": "observer", "status": "joined", "side": None}
        ctx = mod._build_turn_context(
            self._access(is_owner=False, room={"id": "room-1"}, participant=participant),
            RoundPhaseType.FIRST_CROSSFIRE, self._config(student_side="pro"),
        )
        assert ctx.can_submit_current_turn is False
        assert "observer" in (ctx.disabled_reason or "").lower()

    # ── Phase 9C: speaker slot ──────────────────────────────────────────────

    def test_constructive_phase_expects_first_speaker_slot(self):
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "pro", "speaker_slot": "first"}
        ctx = mod._build_turn_context(
            self._access(is_owner=False, room={"id": "room-1"}, participant=participant),
            RoundPhaseType.FIRST_CONSTRUCTIVE, self._config(student_side="pro"),
        )
        assert ctx.expected_speaker_slot.value == "first"
        assert ctx.viewer_speaker_slot.value == "first"
        assert ctx.can_submit_current_turn is True

    def test_rebuttal_phase_expects_second_speaker_slot(self):
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        participant = {"role": "debater_b", "status": "joined", "side": "pro", "speaker_slot": "second"}
        ctx = mod._build_turn_context(
            self._access(is_owner=False, room={"id": "room-1"}, participant=participant),
            RoundPhaseType.FIRST_REBUTTAL, self._config(student_side="pro"),
        )
        assert ctx.expected_speaker_slot.value == "second"
        assert ctx.can_submit_current_turn is True

    def test_first_speaker_cannot_submit_rebuttal(self):
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        participant = {"role": "debater_a", "status": "joined", "side": "pro", "speaker_slot": "first"}
        ctx = mod._build_turn_context(
            self._access(is_owner=False, room={"id": "room-1"}, participant=participant),
            RoundPhaseType.FIRST_REBUTTAL, self._config(student_side="pro"),
        )
        assert ctx.can_submit_current_turn is False
        assert "second" in (ctx.disabled_reason or "")

    def test_flex_participant_can_submit_any_speech_slot(self):
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        participant = {"role": "owner", "status": "joined", "side": "pro", "speaker_slot": None}
        ctx_constructive = mod._build_turn_context(
            self._access(is_owner=True, room={"id": "room-1"}, participant=participant),
            RoundPhaseType.FIRST_CONSTRUCTIVE, self._config(student_side="pro"),
        )
        ctx_rebuttal = mod._build_turn_context(
            self._access(is_owner=True, room={"id": "room-1"}, participant=participant),
            RoundPhaseType.FIRST_REBUTTAL, self._config(student_side="pro"),
        )
        assert ctx_constructive.can_submit_current_turn is True
        assert ctx_rebuttal.can_submit_current_turn is True

    def test_crossfire_has_no_slot_requirement_even_for_assigned_participant(self):
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        participant = {"role": "debater_b", "status": "joined", "side": "pro", "speaker_slot": "second"}
        ctx = mod._build_turn_context(
            self._access(is_owner=False, room={"id": "room-1"}, participant=participant),
            RoundPhaseType.FIRST_CROSSFIRE, self._config(student_side="pro"),
        )
        assert ctx.expected_speaker_slot is None
        assert ctx.can_submit_current_turn is True

    def test_solo_round_unaffected_by_slot_logic(self):
        from app.models.round_simulation import RoundPhaseType
        from app.api import round_simulations as mod
        ctx = mod._build_turn_context(
            self._access(is_owner=True, room=None), RoundPhaseType.FIRST_REBUTTAL, self._config(student_side="pro"),
        )
        assert ctx.can_submit_current_turn is True
        assert ctx.viewer_speaker_slot is None


# ── /rooms endpoints ─────────────────────────────────────────────────────────


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
        mock_update.assert_called_once_with(ANY, target, role="debater_b", side="pro", speaker_slot=None)
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

    # ── Phase 9C: speaker_slot assignment ────────────────────────────────────

    def test_owner_assigns_speaker_slot(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        target = _participant(pid="p2", user_id="u2", role="debater_a", side="pro", speaker_slot=None)
        updated = dict(target, speaker_slot="first")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[target]), \
             patch.object(round_room_service, "update_participant", return_value=updated) as mock_update:
            result = mod.update_room_participant_endpoint(
                "room-1", "p2", UpdateRoomParticipantRequest(speaker_slot="first"), "owner-1",
            )
        mock_update.assert_called_once_with(ANY, target, role=None, side=None, speaker_slot="first")
        assert result.speaker_slot.value == "first"

    def test_non_owner_cannot_assign_speaker_slot(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room):
            with pytest.raises(HTTPException) as exc_info:
                mod.update_room_participant_endpoint(
                    "room-1", "p2", UpdateRoomParticipantRequest(speaker_slot="first"), "u2",
                )
        assert exc_info.value.status_code == 403

    def test_invalid_slot_value_rejected_by_model(self):
        from pydantic import ValidationError
        from app.models.round_simulation import UpdateRoomParticipantRequest
        with pytest.raises(ValidationError):
            UpdateRoomParticipantRequest(speaker_slot="third")

    def test_coach_cannot_be_assigned_a_speaker_slot(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        target = _participant(pid="p2", user_id="u2", role="coach", side=None, speaker_slot=None)
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[target]):
            with pytest.raises(HTTPException) as exc_info:
                mod.update_room_participant_endpoint(
                    "room-1", "p2", UpdateRoomParticipantRequest(speaker_slot="first"), "owner-1",
                )
        assert exc_info.value.status_code == 400
        assert "coach" in exc_info.value.detail.lower() or "observer" in exc_info.value.detail.lower()

    def test_observer_cannot_be_assigned_a_speaker_slot_even_with_role_in_same_request(self):
        """A role change to 'observer' in the SAME request as a slot
        assignment must still be rejected -- validated against the
        *resulting* role, not the target's stale stored role."""
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        target = _participant(pid="p2", user_id="u2", role="debater_a", side="pro", speaker_slot=None)
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[target]):
            with pytest.raises(HTTPException) as exc_info:
                mod.update_room_participant_endpoint(
                    "room-1", "p2",
                    UpdateRoomParticipantRequest(role="observer", speaker_slot="first"), "owner-1",
                )
        assert exc_info.value.status_code == 400

    def test_rejects_slot_without_a_side(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        target = _participant(pid="p2", user_id="u2", role="debater_a", side=None, speaker_slot=None)
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[target]):
            with pytest.raises(HTTPException) as exc_info:
                mod.update_room_participant_endpoint(
                    "room-1", "p2", UpdateRoomParticipantRequest(speaker_slot="first"), "owner-1",
                )
        assert exc_info.value.status_code == 400
        assert "side" in exc_info.value.detail.lower()

    def test_slot_allowed_when_side_assigned_in_the_same_request(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        target = _participant(pid="p2", user_id="u2", role="debater_a", side=None, speaker_slot=None)
        round_row = MagicMock(data={"config_json": {"student_side": "pro"}})
        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = round_row
        updated = dict(target, side="pro", speaker_slot="first")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[target]), \
             patch.object(round_room_service, "update_participant", return_value=updated) as mock_update:
            result = mod.update_room_participant_endpoint(
                "room-1", "p2", UpdateRoomParticipantRequest(side="pro", speaker_slot="first"), "owner-1",
            )
        mock_update.assert_called_once_with(ANY, target, role=None, side="pro", speaker_slot="first")
        assert result.speaker_slot.value == "first"

    def test_duplicate_same_side_same_slot_rejected(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        existing_first_speaker = _participant(pid="p1", user_id="owner-1", role="owner", side="pro", speaker_slot="first")
        target = _participant(pid="p2", user_id="u2", role="debater_a", side="pro", speaker_slot=None)
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[existing_first_speaker, target]):
            with pytest.raises(HTTPException) as exc_info:
                mod.update_room_participant_endpoint(
                    "room-1", "p2", UpdateRoomParticipantRequest(speaker_slot="first"), "owner-1",
                )
        assert exc_info.value.status_code == 400
        assert "already" in exc_info.value.detail.lower()

    def test_different_slots_on_same_side_allowed(self):
        """Two partners on the same side with DIFFERENT slots is exactly
        the feature -- must not be rejected as a conflict."""
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        first_speaker = _participant(pid="p1", user_id="owner-1", role="owner", side="pro", speaker_slot="first")
        target = _participant(pid="p2", user_id="u2", role="debater_a", side="pro", speaker_slot=None)
        updated = dict(target, speaker_slot="second")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[first_speaker, target]), \
             patch.object(round_room_service, "update_participant", return_value=updated) as mock_update:
            result = mod.update_room_participant_endpoint(
                "room-1", "p2", UpdateRoomParticipantRequest(speaker_slot="second"), "owner-1",
            )
        mock_update.assert_called_once()
        assert result.speaker_slot.value == "second"

    def test_reassigning_same_slot_to_same_participant_is_idempotent(self):
        """The conflict check excludes the target's own row, so re-PATCHing
        the same slot the participant already holds must not 400."""
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        target = _participant(pid="p2", user_id="u2", role="debater_a", side="pro", speaker_slot="first")
        updated = dict(target)
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[target]), \
             patch.object(round_room_service, "update_participant", return_value=updated) as mock_update:
            result = mod.update_room_participant_endpoint(
                "room-1", "p2", UpdateRoomParticipantRequest(speaker_slot="first"), "owner-1",
            )
        mock_update.assert_called_once()
        assert result.speaker_slot.value == "first"

    def test_duplicate_slot_on_a_different_side_is_not_a_conflict(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1")
        con_first_speaker = _participant(pid="p1", user_id="u1", role="debater_a", side="con", speaker_slot="first")
        target = _participant(pid="p2", user_id="u2", role="debater_a", side="pro", speaker_slot=None)
        updated = dict(target, speaker_slot="first")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "list_participants", return_value=[con_first_speaker, target]), \
             patch.object(round_room_service, "update_participant", return_value=updated) as mock_update:
            result = mod.update_room_participant_endpoint(
                "room-1", "p2", UpdateRoomParticipantRequest(speaker_slot="first"), "owner-1",
            )
        mock_update.assert_called_once()
        assert result.speaker_slot.value == "first"


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


class TestCloseRoomEndpoint:
    """Phase 9E: owner-only room archival. Never deletes the room/round row."""

    def test_owner_can_close_room(self):
        from app.api import round_simulations as mod
        room = _room(owner="owner-1", status="active")
        closed = dict(room, status="closed")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "close_room", return_value=closed) as mock_close, \
             patch.object(mod, "track_product_event"):
            result = mod.close_room_endpoint("room-1", "owner-1")
        mock_close.assert_called_once()
        assert result.status.value == "closed"

    def test_closing_an_already_closed_room_is_idempotent(self):
        from app.api import round_simulations as mod
        room = _room(owner="owner-1", status="closed")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "close_room", return_value=room), \
             patch.object(mod, "track_product_event"):
            result = mod.close_room_endpoint("room-1", "owner-1")
        assert result.status.value == "closed"

    def test_non_owner_cannot_close_room(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        room = _room(owner="owner-1", status="active")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room):
            with pytest.raises(HTTPException) as exc_info:
                mod.close_room_endpoint("room-1", "u2")
        assert exc_info.value.status_code == 403

    def test_unknown_room_is_404(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                mod.close_room_endpoint("room-x", "owner-1")
        assert exc_info.value.status_code == 404

    def test_db_failure_surfaces_as_a_real_error_not_a_fake_success(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        room = _room(owner="owner-1", status="active")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "close_room", side_effect=RuntimeError("db down")):
            with pytest.raises(HTTPException) as exc_info:
                mod.close_room_endpoint("room-1", "owner-1")
        assert exc_info.value.status_code == 500


class TestRotateInviteCodeEndpoint:
    """Phase 9E: owner-only invite rotation. Old code stops resolving."""

    def test_owner_can_rotate_invite_code(self):
        from app.api import round_simulations as mod
        room = _room(owner="owner-1", status="waiting", code="OLDCODE1")
        rotated = dict(room, invite_code="NEWCODE2")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "rotate_invite_code", return_value=rotated) as mock_rotate, \
             patch.object(mod, "track_product_event"):
            result = mod.rotate_invite_code_endpoint("room-1", "owner-1")
        mock_rotate.assert_called_once()
        assert result.invite_code == "NEWCODE2"
        assert result.invite_code != "OLDCODE1"

    def test_old_invite_code_no_longer_resolves_after_rotation(self):
        """Confirms the rotation is real by exercising get_room_by_invite_code
        against a supabase mock that only knows the new code."""
        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
        result = round_room_service.get_room_by_invite_code(supabase, "OLDCODE1")
        assert result is None

    def test_non_owner_cannot_rotate_invite_code(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        room = _room(owner="owner-1", status="waiting")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room):
            with pytest.raises(HTTPException) as exc_info:
                mod.rotate_invite_code_endpoint("room-1", "u2")
        assert exc_info.value.status_code == 403

    def test_closed_room_cannot_rotate_invite_code(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        room = _room(owner="owner-1", status="closed")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room):
            with pytest.raises(HTTPException) as exc_info:
                mod.rotate_invite_code_endpoint("room-1", "owner-1")
        assert exc_info.value.status_code == 400


class TestJoinClosedRoom:
    """Phase 9E: closed rooms reject new joins but stay idempotent for
    participants who already joined before the room closed."""

    def test_new_joiner_rejected_from_closed_room(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import JoinRoomRequest
        room = _room(status="closed", code="CLOSED01")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room_by_invite_code", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                mod.join_room_endpoint(JoinRoomRequest(invite_code="CLOSED01"), "stranger")
        assert exc_info.value.status_code == 400

    def test_already_joined_participant_stays_idempotent_on_a_closed_room(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import JoinRoomRequest
        room = _room(status="closed", code="CLOSED01")
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro", status="joined")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room_by_invite_code", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(round_room_service, "join_room", return_value=participant), \
             patch.object(round_room_service, "list_participants", return_value=[participant]), \
             patch.object(mod, "track_product_event"):
            result = mod.join_room_endpoint(JoinRoomRequest(invite_code="CLOSED01"), "u2")
        assert result.viewer_participant.user_id == "u2"


class TestUpdateParticipantClosedRoom:
    def test_role_change_rejected_on_a_closed_room(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import UpdateRoomParticipantRequest
        room = _room(owner="owner-1", status="closed")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room):
            with pytest.raises(HTTPException) as exc_info:
                mod.update_room_participant_endpoint(
                    "room-1", "p2", UpdateRoomParticipantRequest(role="debater_a"), "owner-1",
                )
        assert exc_info.value.status_code == 400


class TestDeleteRoundBugfix:
    """Phase 9E: _verify_owner(round_id, user_id) was missing the required
    supabase argument -- every call raised TypeError before the ownership
    check ran. Confirms the fix without broadening delete beyond owner-only."""

    def test_owner_can_delete_without_a_typeerror(self):
        import asyncio
        from app.api import round_simulations as mod
        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            MagicMock(data={"id": "r1", "user_id": "owner-1"})
        )
        with patch.object(mod, "get_supabase", return_value=supabase):
            result = asyncio.run(mod.delete_round("r1", "owner-1"))
        assert result["deleted"] is True
        assert result["round_id"] == "r1"

    def test_non_owner_still_rejected(self):
        import asyncio
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
            MagicMock(data={"id": "r1", "user_id": "owner-1"})
        )
        with patch.object(mod, "get_supabase", return_value=supabase):
            with pytest.raises(HTTPException) as exc_info:
                asyncio.run(mod.delete_round("r1", "stranger"))
        assert exc_info.value.status_code == 403


# ── Phase 9B: participant access expansion ──────────────────────────────────
#
# These exercise the real _load_round_access chain (not mocked) against a
# mocked supabase + round_room_service, mirroring TestLoadRoundAccess's
# pattern, so the endpoint-level tests actually prove the access swap, not
# just that some helper was called.


def _configure_round_access(round_row, room=None, participant=None):
    """Returns a MagicMock supabase configured so _load_round_access resolves
    to (round_row, room, participant) when called for round_row['id']."""
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = (
        MagicMock(data=round_row)
    )
    return supabase


def _full_round_row(round_id="r1", user_id="owner-1", status="setup"):
    """A round_simulations row complete enough for _load_simulation to
    validate -- needed by endpoints (start, load-preparation, drills) that
    read sim.config, not just check ownership."""
    return {
        "id": round_id, "user_id": user_id, "status": status,
        "config_json": {
            "student_side": "pro", "speaking_order": "first", "resolution": "Test resolution.",
        },
        "current_phase": "first_constructive", "phase_history": [],
        "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
    }


def _drill(drill_id="drill-1", round_id="r1"):
    from app.models.round_simulation import RoundDrill, RoundDrillSource
    return RoundDrill(
        id=drill_id, round_id=round_id, drill_id="logical-1",
        source=RoundDrillSource(round_id=round_id, speech_phase="first_rebuttal", weakness_description="Dropped C1."),
        skill_target="drops", title="Dropped-Response Recovery Drill",
        prompt="Practice covering all opponent arguments.",
        success_criteria=["Every opponent argument is named and addressed."],
        time_limit_seconds=90, created_at="2026-01-01T00:00:00Z",
    )


class TestReadTierEndpoints:
    """report / replay / turning-points / flow / evidence-report / drills-get
    / drill-attempts-get / annotations-list: owner or any joined participant
    (any role) can read; a non-member cannot."""

    def test_owner_can_read_report(self):
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=None), \
             patch.object(mod, "export_round_report", return_value={"ok": True}) as mock_export:
            result = mod.get_round_report("r1", False, "owner-1")
        mock_export.assert_called_once()
        assert result == {"ok": True}

    def test_joined_participant_can_read_report(self):
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "export_round_report", return_value={"ok": True}) as mock_export:
            result = mod.get_round_report("r1", False, "u2")
        mock_export.assert_called_once()
        assert result == {"ok": True}

    def test_non_member_cannot_read_report(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        room = _room()
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None), \
             patch.object(mod, "export_round_report") as mock_export:
            with pytest.raises(HTTPException) as exc_info:
                mod.get_round_report("r1", False, "stranger")
        assert exc_info.value.status_code == 403
        mock_export.assert_not_called()

    def test_joined_participant_can_read_replay(self):
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="coach", side=None)
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "get_replay_timeline", return_value=[]) as mock_replay:
            result = mod.get_round_replay("r1", "u2")
        mock_replay.assert_called_once()
        assert result == []

    def test_non_member_cannot_read_replay(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        room = _room()
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None), \
             patch.object(mod, "get_replay_timeline") as mock_replay:
            with pytest.raises(HTTPException) as exc_info:
                mod.get_round_replay("r1", "stranger")
        assert exc_info.value.status_code == 403
        mock_replay.assert_not_called()

    def test_joined_participant_can_view_drills(self):
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "load_round_drills", return_value=[_drill()]) as mock_load:
            result = mod.get_round_drills("r1", "u2")
        mock_load.assert_called_once_with("r1")
        assert result == [_drill()]

    def test_non_member_cannot_view_drills(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        room = _room()
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None), \
             patch.object(mod, "load_round_drills") as mock_load:
            with pytest.raises(HTTPException) as exc_info:
                mod.get_round_drills("r1", "stranger")
        assert exc_info.value.status_code == 403
        mock_load.assert_not_called()

    def test_joined_participant_can_view_drill_attempts(self):
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "load_round_drills", return_value=[_drill(drill_id="drill-1")]), \
             patch.object(mod, "load_round_drill_attempts", return_value=[]) as mock_attempts:
            result = mod.get_round_drill_attempts("r1", "drill-1", "u2")
        mock_attempts.assert_called_once_with("drill-1")
        assert result == []

    def test_joined_participant_can_list_annotations(self):
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "list_coach_annotations", return_value=[]) as mock_list:
            result = mod.list_annotations("r1", "u2", None)
        mock_list.assert_called_once()
        assert result == []


class TestGeneralMutateEndpoints:
    """start / load-preparation / generate-drills / submit-drill-attempt: any
    joined debater (not observer/coach) may act; solo owner is unaffected."""

    def test_solo_owner_can_start_round(self):
        from app.api import round_simulations as mod
        round_row = _full_round_row(user_id="owner-1")
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=None):
            result = mod.start_round("r1", "owner-1")
        assert result.status.value == "active"

    def test_joined_debater_can_start_round(self):
        from app.api import round_simulations as mod
        round_row = _full_round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(round_room_service, "sync_room_status"):
            result = mod.start_round("r1", "u2")
        assert result.status.value == "active"

    def test_observer_cannot_start_round(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        round_row = {"id": "r1", "user_id": "owner-1", "status": "setup"}
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant):
            with pytest.raises(HTTPException) as exc_info:
                mod.start_round("r1", "u2")
        assert exc_info.value.status_code == 403

    def test_joined_debater_can_generate_drills(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import GenerateDrillsRequest
        round_row = _full_round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "load_round_arguments", return_value=[]), \
             patch.object(mod, "load_evidence_uses", return_value=[]), \
             patch.object(mod, "generate_post_round_drills", return_value=[]) as mock_gen, \
             patch.object(mod, "save_round_drills"), \
             patch.object(mod, "track_product_event"):
            result = mod.generate_drills_endpoint("r1", GenerateDrillsRequest(round_id="r1"), "u2")
        mock_gen.assert_called_once()
        assert result == []

    def test_coach_cannot_generate_drills(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import GenerateDrillsRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="coach", side=None)
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant):
            with pytest.raises(HTTPException) as exc_info:
                mod.generate_drills_endpoint("r1", GenerateDrillsRequest(round_id="r1"), "u2")
        assert exc_info.value.status_code == 403

    def test_joined_debater_can_submit_drill_attempt(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import SubmitRoundDrillAttemptRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="debater_b", side="pro")
        supabase = _configure_round_access(round_row)
        req = SubmitRoundDrillAttemptRequest(round_id="r1", response_text="My attempt.")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "load_round_drills", return_value=[_drill()]), \
             patch.object(mod, "score_drill_attempt", side_effect=DrillScoringError("no")), \
             patch.object(mod, "load_round_drill_attempts", return_value=[]), \
             patch.object(mod, "save_round_drill_attempt"), \
             patch.object(mod, "award_xp", return_value=True), \
             patch.object(mod, "track_product_event"):
            result = mod.submit_round_drill_attempt("r1", "drill-1", req, "u2")
        assert result.attempt.response_text == "My attempt."

    def test_observer_cannot_submit_drill_attempt(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import SubmitRoundDrillAttemptRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        supabase = _configure_round_access(round_row)
        req = SubmitRoundDrillAttemptRequest(round_id="r1", response_text="My attempt.")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant):
            with pytest.raises(HTTPException) as exc_info:
                mod.submit_round_drill_attempt("r1", "drill-1", req, "u2")
        assert exc_info.value.status_code == 403

    def test_joined_debater_can_create_adaptation_review(self):
        """Stabilization fix: this endpoint used to hard-require solo
        ownership (_verify_owner) even inside a room, unlike every sibling
        general-mutate endpoint -- a joined non-owner debater now works here
        exactly like it already does for decision/rejudge/drills."""
        from app.api import round_simulations as mod
        from app.models.round_simulation import CreateAdaptationReviewRequest
        round_row = _full_round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        supabase = _configure_round_access(round_row)
        req = CreateAdaptationReviewRequest(round_id="r1", judge_type="flow")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "load_round_arguments", return_value=[]), \
             patch.object(mod, "load_evidence_uses", return_value=[]), \
             patch.object(mod, "_analyze_judge_adaptation", return_value=([], [])):
            result = mod.create_adaptation_review("r1", req, "u2")
        assert result.judge_type == "flow"

    def test_observer_cannot_create_adaptation_review(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import CreateAdaptationReviewRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        supabase = _configure_round_access(round_row)
        req = CreateAdaptationReviewRequest(round_id="r1", judge_type="flow")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant):
            with pytest.raises(HTTPException) as exc_info:
                mod.create_adaptation_review("r1", req, "u2")
        assert exc_info.value.status_code == 403

    def test_joined_participant_can_list_adaptation_reviews(self):
        """Read tier: any joined participant, any role -- matches every
        other list/read endpoint (annotations, drills, flow)."""
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        supabase = _configure_round_access(round_row)
        supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
            MagicMock(data=[])
        )
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant):
            result = mod.list_adaptation_reviews("r1", "u2")
        assert result == []

    def test_non_member_cannot_list_adaptation_reviews(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        room = _room()
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                mod.list_adaptation_reviews("r1", "stranger")
        assert exc_info.value.status_code == 403


class TestCoachOrOwnerEndpoints:
    """annotations-create / rate-finding: owner or coach role only."""

    def test_coach_can_create_annotation(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import AddAnnotationRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="coach", side=None)
        supabase = _configure_round_access(round_row)
        fake_annotation = type("Annotation", (), dict(
            id="a1", round_id="r1", coach_id="u2", annotation_type="note",
            target_id="t1", target_type="argument", content="Good job.",
            is_correction=False, finding_id=None, created_at="2026-01-01T00:00:00Z",
            phase=None, note_type=None,
        ))()
        req = AddAnnotationRequest(
            round_id="r1", annotation_type="note", content="Good job.",
            target_id="t1", target_type="argument",
        )
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "add_coach_annotation", return_value=fake_annotation), \
             patch.object(mod, "track_product_event"):
            result = mod.create_annotation("r1", req, "u2")
        assert result["content"] == "Good job."

    def test_debater_cannot_create_annotation(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import AddAnnotationRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        supabase = _configure_round_access(round_row)
        req = AddAnnotationRequest(
            round_id="r1", annotation_type="note", content="Good job.",
            target_id="t1", target_type="argument",
        )
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant):
            with pytest.raises(HTTPException) as exc_info:
                mod.create_annotation("r1", req, "u2")
        assert exc_info.value.status_code == 403

    def test_non_member_cannot_rate_finding(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import RateFindingRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        supabase = _configure_round_access(round_row)
        req = RateFindingRequest(finding_id="f1", rating="useful")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                mod.rate_finding("r1", "f1", req, "stranger")
        assert exc_info.value.status_code == 403


class TestCoachNotes:
    """Phase 9F: coach notes reuse the existing owner-or-coach create /
    any-joined-participant read tiers (already proven above) -- these tests
    cover the new phase/note_type fields threading through, the read side
    for debaters and observers explicitly, left-participant and closed-room
    writes, invalid note_type, and old-style backward compatibility."""

    def _fake_annotation(self, **overrides):
        base = dict(
            id="a1", round_id="r1", coach_id="owner-1", annotation_type="speech_note",
            target_id=None, target_type=None, content="Good weighing in the 2AR.",
            is_correction=False, finding_id=None, created_at="2026-01-01T00:00:00Z",
            phase=None, note_type=None,
        )
        base.update(overrides)
        return type("Annotation", (), base)()

    def test_owner_can_create_note_with_phase_and_note_type(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import AddAnnotationRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(role="owner")
        supabase = _configure_round_access(round_row)
        fake_annotation = self._fake_annotation(phase="first_summary", note_type="flow")
        req = AddAnnotationRequest(
            round_id="r1", annotation_type="speech_note", content="Good weighing in the 2AR.",
            phase="first_summary", note_type="flow",
        )
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "add_coach_annotation", return_value=fake_annotation) as mock_add, \
             patch.object(mod, "track_product_event"):
            result = mod.create_annotation("r1", req, "owner-1")
        mock_add.assert_called_once_with(
            round_id="r1", coach_id="owner-1", annotation_type="speech_note",
            content="Good weighing in the 2AR.", target_id=None, target_type=None,
            is_correction=False, finding_id=None, phase="first_summary", note_type="flow",
        )
        assert result["phase"] == "first_summary"
        assert result["note_type"] == "flow"

    def test_coach_can_create_note(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import AddAnnotationRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="coach", side=None)
        supabase = _configure_round_access(round_row)
        fake_annotation = self._fake_annotation(coach_id="u2", note_type="general")
        req = AddAnnotationRequest(
            round_id="r1", annotation_type="speech_note", content="Good weighing in the 2AR.",
            note_type="general",
        )
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "add_coach_annotation", return_value=fake_annotation), \
             patch.object(mod, "track_product_event"):
            result = mod.create_annotation("r1", req, "u2")
        assert result["note_type"] == "general"

    def test_debater_can_read_notes_but_not_create(self):
        """Debaters are read-only for coach notes (unchanged tier)."""
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import AddAnnotationRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        supabase = _configure_round_access(round_row)

        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "list_coach_annotations", return_value=[self._fake_annotation()]) as mock_list:
            result = mod.list_annotations("r1", "u2", None)
        mock_list.assert_called_once()
        assert len(result) == 1

        req = AddAnnotationRequest(round_id="r1", annotation_type="speech_note", content="x")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant):
            with pytest.raises(HTTPException) as exc_info:
                mod.create_annotation("r1", req, "u2")
        assert exc_info.value.status_code == 403

    def test_observer_can_read_notes_but_not_create(self):
        """Chosen policy (Phase 9F): observers keep read access, never write."""
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import AddAnnotationRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        supabase = _configure_round_access(round_row)

        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "list_coach_annotations", return_value=[self._fake_annotation()]):
            result = mod.list_annotations("r1", "u2", None)
        assert len(result) == 1

        req = AddAnnotationRequest(round_id="r1", annotation_type="speech_note", content="x")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant):
            with pytest.raises(HTTPException) as exc_info:
                mod.create_annotation("r1", req, "u2")
        assert exc_info.value.status_code == 403

    def test_non_member_cannot_create_or_read_notes(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import AddAnnotationRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        supabase = _configure_round_access(round_row)

        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                mod.list_annotations("r1", "stranger", None)
        assert exc_info.value.status_code == 403

        req = AddAnnotationRequest(round_id="r1", annotation_type="speech_note", content="x")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                mod.create_annotation("r1", req, "stranger")
        assert exc_info.value.status_code == 403

    def test_left_participant_cannot_create_note(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import AddAnnotationRequest
        round_row = _round_row(user_id="owner-1")
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="coach", side=None, status="left")
        supabase = _configure_round_access(round_row)
        req = AddAnnotationRequest(round_id="r1", annotation_type="speech_note", content="x")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant):
            with pytest.raises(HTTPException) as exc_info:
                mod.create_annotation("r1", req, "u2")
        assert exc_info.value.status_code == 403

    def test_closed_room_blocks_new_notes_even_for_the_owner(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        from app.models.round_simulation import AddAnnotationRequest
        round_row = _round_row(user_id="owner-1")
        room = _room(status="closed")
        participant = _participant(role="owner")
        supabase = _configure_round_access(round_row)
        req = AddAnnotationRequest(round_id="r1", annotation_type="speech_note", content="x")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant):
            with pytest.raises(HTTPException) as exc_info:
                mod.create_annotation("r1", req, "owner-1")
        assert exc_info.value.status_code == 400

    def test_closed_room_still_allows_reading_existing_notes(self):
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        room = _room(status="closed")
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "list_coach_annotations", return_value=[self._fake_annotation()]):
            result = mod.list_annotations("r1", "u2", None)
        assert len(result) == 1

    def test_invalid_note_type_rejected(self):
        from app.services.coach_round_review import add_coach_annotation
        with pytest.raises(ValueError):
            add_coach_annotation(
                round_id="r1", coach_id="owner-1", annotation_type="speech_note",
                content="x", note_type="not-a-real-type",
            )

    def test_old_style_note_without_phase_or_note_type_still_round_trips(self):
        """Backward compatibility: a caller that omits phase/note_type
        entirely (pre-9F behavior) still creates successfully and reads back
        with both fields None."""
        from app.services.coach_round_review import add_coach_annotation, list_coach_annotations
        from unittest.mock import MagicMock as _MM
        supabase = _MM()
        inserted = {}

        def _capture_insert(row):
            inserted.update(row)
            return _MM(execute=lambda: _MM(data=[row]))

        supabase.table.return_value.insert.side_effect = _capture_insert
        with patch("app.services.coach_round_review.get_supabase", return_value=supabase):
            annotation = add_coach_annotation(
                round_id="r1", coach_id="owner-1", annotation_type="speech_note", content="x",
            )
        assert annotation.phase is None
        assert annotation.note_type is None
        assert inserted["phase"] is None
        assert inserted["note_type"] is None

        supabase2 = _MM()
        supabase2.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
            _MM(data=[{
                "id": "old-1", "round_id": "r1", "coach_id": "owner-1",
                "annotation_type": "speech_note", "target_id": None, "target_type": None,
                "content": "pre-9F note", "is_correction": False, "finding_id": None,
                "created_at": "2026-01-01T00:00:00Z",
                # no "phase"/"note_type" keys at all -- simulates a row from before this migration
            }])
        )
        with patch("app.services.coach_round_review.get_supabase", return_value=supabase2):
            results = list_coach_annotations(round_id="r1")
        assert len(results) == 1
        assert results[0].phase is None
        assert results[0].note_type is None


class TestCoachNoteCount:
    """Phase 9G: coach_note_count on RoundRoomStateResponse -- badge/summary
    surfacing without fetching note bodies. get_room_endpoint's read tier
    (_load_room_access: owner or joined, any role) is exactly notes' read
    tier, so no separate gating logic exists to test here -- only that the
    count is wired through correctly and fails safely."""

    def test_count_coach_annotations_returns_the_query_count(self):
        from app.services.coach_round_review import count_coach_annotations
        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(count=3)
        assert count_coach_annotations(supabase, "r1") == 3

    def test_count_coach_annotations_defaults_to_zero_on_a_null_count(self):
        from app.services.coach_round_review import count_coach_annotations
        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(count=None)
        assert count_coach_annotations(supabase, "r1") == 0

    def test_count_only_selects_id_never_note_bodies(self):
        """Backward compat: the count query doesn't reference phase/note_type
        or content at all, so old rows missing those fields still count fine."""
        from app.services.coach_round_review import count_coach_annotations
        supabase = MagicMock()
        supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(count=2)
        assert count_coach_annotations(supabase, "r1") == 2
        supabase.table.return_value.select.assert_called_once_with("id", count="exact")

    def test_owner_sees_note_count_via_get_room_endpoint(self):
        from app.api import round_simulations as mod
        room = _room()
        participant = _participant()
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None), \
             patch.object(round_room_service, "list_participants", return_value=[participant]), \
             patch.object(mod, "count_coach_annotations", return_value=4):
            result = mod.get_room_endpoint("room-1", "owner-1")
        assert result.coach_note_count == 4

    def test_joined_participant_of_any_role_sees_note_count(self):
        from app.api import round_simulations as mod
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(round_room_service, "list_participants", return_value=[participant]), \
             patch.object(mod, "count_coach_annotations", return_value=1):
            result = mod.get_room_endpoint("room-1", "u2")
        assert result.coach_note_count == 1

    def test_stranger_never_triggers_a_note_count_query(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        room = _room()
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None), \
             patch.object(mod, "count_coach_annotations") as mock_count:
            with pytest.raises(HTTPException) as exc_info:
                mod.get_room_endpoint("room-1", "stranger")
        assert exc_info.value.status_code == 403
        mock_count.assert_not_called()

    def test_closed_room_still_returns_a_real_note_count(self):
        from app.api import round_simulations as mod
        room = _room(status="closed")
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(round_room_service, "list_participants", return_value=[participant]), \
             patch.object(mod, "count_coach_annotations", return_value=5):
            result = mod.get_room_endpoint("room-1", "u2")
        assert result.coach_note_count == 5

    def test_note_count_query_failure_defaults_to_zero_without_breaking_the_response(self):
        from app.api import round_simulations as mod
        room = _room()
        participant = _participant()
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(round_room_service, "get_room", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=None), \
             patch.object(round_room_service, "list_participants", return_value=[participant]), \
             patch.object(mod, "count_coach_annotations", side_effect=RuntimeError("db hiccup")):
            result = mod.get_room_endpoint("room-1", "owner-1")
        assert result.coach_note_count == 0


class _FakeRejudgeDecision:
    """Lightweight stand-in for RoundDecision -- avoids constructing the full
    real model just to prove crossfire_effects/insert plumbing isn't dropped
    (same convention as _FakeFeedback in test_round_api.py)."""
    def __init__(self, crossfire_effects=None):
        self.crossfire_effects = crossfire_effects or []

    def model_dump(self):
        return {"id": "decision-2", "round_id": "r1", "crossfire_effects": self.crossfire_effects}


class TestRejudgeEndpoint:
    """Phase 9D audit: rejudge already sits at the general-mutate tier
    (owner or joined non-observer/coach participant) -- these tests close
    the coverage gap (previously only a route-existence check existed)."""

    def _call(self, user_id, round_row=None, room=None, participant=None, crossfire_effects=None):
        from app.api import round_simulations as mod
        from app.models.round_simulation import RejudgeRequest
        round_row = round_row if round_row is not None else _full_round_row(user_id="owner-1", status="completed")
        supabase = _configure_round_access(round_row)
        decision = _FakeRejudgeDecision(crossfire_effects=crossfire_effects)
        req = RejudgeRequest(judge_type="lay")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=room), \
             patch.object(round_room_service, "get_participant", return_value=participant), \
             patch.object(mod, "load_round_arguments", return_value=[]), \
             patch.object(mod, "load_evidence_uses", return_value=[]), \
             patch.object(mod, "_get_prior_speeches_summary", return_value=""), \
             patch.object(mod, "load_crossfire_exchanges", return_value=[]), \
             patch.object(mod, "derive_crossfire_effects", return_value=crossfire_effects or []), \
             patch.object(mod, "rejudge_round", return_value=decision), \
             patch.object(mod, "track_product_event"):
            result = mod.rejudge("r1", req, user_id)
        return result, supabase

    def test_solo_owner_can_rejudge(self):
        result, _ = self._call(user_id="owner-1", room=None, participant=None)
        assert result.crossfire_effects == []

    def test_joined_debater_can_rejudge(self):
        """Confirms today's actual policy: general-mutate tier, not
        owner-only -- a joined debater on the round's side may rejudge."""
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="debater_a", side="pro")
        result, _ = self._call(user_id="u2", room=room, participant=participant)
        assert result.crossfire_effects == []

    def test_coach_cannot_rejudge(self):
        from fastapi import HTTPException
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="coach", side=None)
        with pytest.raises(HTTPException) as exc_info:
            self._call(user_id="u2", room=room, participant=participant)
        assert exc_info.value.status_code == 403

    def test_observer_cannot_rejudge(self):
        from fastapi import HTTPException
        room = _room()
        participant = _participant(pid="p2", user_id="u2", role="observer", side=None)
        with pytest.raises(HTTPException) as exc_info:
            self._call(user_id="u2", room=room, participant=participant)
        assert exc_info.value.status_code == 403

    def test_non_member_cannot_rejudge(self):
        from fastapi import HTTPException
        room = _room()
        with pytest.raises(HTTPException) as exc_info:
            self._call(user_id="stranger", room=room, participant=None)
        assert exc_info.value.status_code == 403

    def test_rejudge_response_includes_crossfire_effects_when_applicable(self):
        effects = [{"exchange_id": "ex-1", "effect_type": "concession_weakened_argument", "severity": "high",
                    "explanation": "Conceded the framework.", "ballot_relevance": True}]
        result, _ = self._call(user_id="owner-1", room=None, participant=None, crossfire_effects=effects)
        assert result.crossfire_effects == effects

    def test_rejudge_inserts_a_new_decision_row_never_deletes_the_prior_one(self):
        """rejudge_round mints a new decision.id and the route only ever
        inserts -- old decisions stay in round_decisions untouched, so they
        still load via the "latest by created_at" query elsewhere."""
        _, supabase = self._call(user_id="owner-1", room=None, participant=None)
        insert_calls = [c for c in supabase.table.return_value.method_calls if c[0] == "insert"]
        assert len(insert_calls) >= 1
        supabase.table.return_value.delete.assert_not_called()
        supabase.table.return_value.update.assert_not_called()


class TestSoloRegressionForNewlyChangedEndpoints:
    """Old solo rounds (no room row at all) must behave exactly as before
    for every endpoint touched in this phase."""

    def test_solo_owner_can_load_preparation(self):
        from app.api import round_simulations as mod
        from app.models.round_simulation import LoadPreparationRequest
        round_row = _full_round_row(user_id="owner-1")
        supabase = _configure_round_access(round_row)
        req = LoadPreparationRequest(round_id="r1")
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=None), \
             patch.object(mod, "build_opponent_round_plan") as mock_plan:
            mock_plan.return_value.model_dump.return_value = {"id": "plan-1"}
            mock_plan.return_value.id = "plan-1"
            result = mod.load_preparation("r1", req, "owner-1")
        assert result["opponent_plan_id"] == "plan-1"

    def test_solo_non_owner_still_rejected_everywhere(self):
        from fastapi import HTTPException
        from app.api import round_simulations as mod
        round_row = _round_row(user_id="owner-1")
        supabase = _configure_round_access(round_row)
        with patch.object(mod, "get_supabase", return_value=supabase), \
             patch.object(round_room_service, "get_room_by_round_id", return_value=None):
            for fn, args in [
                (mod.get_round_report, ("r1", False, "stranger")),
                (mod.get_round_replay, ("r1", "stranger")),
                (mod.get_round_drills, ("r1", "stranger")),
            ]:
                with pytest.raises(HTTPException) as exc_info:
                    fn(*args)
                assert exc_info.value.status_code == 403

    def test_solo_owner_unaffected_by_speaker_slot_requirement(self):
        """Phase 9C: _require_turn_access now accepts an expected_speaker_slot
        argument for every speech phase, but solo rounds (room=None) must
        remain completely unrestricted, exactly like before 9C."""
        from app.api import round_simulations as mod
        access = mod._RoundAccess(
            round_row={"id": "r1", "user_id": "owner-1"}, room=None, participant=None, is_owner=True,
        )
        from app.models.round_simulation import RoundSide
        mod._require_turn_access(access, RoundSide.PRO, "first")   # must not raise
        mod._require_turn_access(access, RoundSide.PRO, "second")  # must not raise


class TestSpeakerSlotForPhase:
    """Phase 9C phase-to-speaker-slot audit, as actual assertions."""

    def test_constructive_and_summary_map_to_first(self):
        from app.models.round_simulation import RoundPhaseType
        from app.services.round_state_machine import speaker_slot_for_phase
        assert speaker_slot_for_phase(RoundPhaseType.FIRST_CONSTRUCTIVE) == "first"
        assert speaker_slot_for_phase(RoundPhaseType.SECOND_CONSTRUCTIVE) == "first"
        assert speaker_slot_for_phase(RoundPhaseType.FIRST_SUMMARY) == "first"
        assert speaker_slot_for_phase(RoundPhaseType.SECOND_SUMMARY) == "first"

    def test_rebuttal_and_final_focus_map_to_second(self):
        from app.models.round_simulation import RoundPhaseType
        from app.services.round_state_machine import speaker_slot_for_phase
        assert speaker_slot_for_phase(RoundPhaseType.FIRST_REBUTTAL) == "second"
        assert speaker_slot_for_phase(RoundPhaseType.SECOND_REBUTTAL) == "second"
        assert speaker_slot_for_phase(RoundPhaseType.FIRST_FINAL_FOCUS) == "second"
        assert speaker_slot_for_phase(RoundPhaseType.SECOND_FINAL_FOCUS) == "second"

    def test_crossfire_and_non_speech_phases_have_no_slot_requirement(self):
        from app.models.round_simulation import RoundPhaseType
        from app.services.round_state_machine import speaker_slot_for_phase
        for phase in (
            RoundPhaseType.FIRST_CROSSFIRE, RoundPhaseType.GRAND_CROSSFIRE, RoundPhaseType.FINAL_CROSSFIRE,
            RoundPhaseType.JUDGE_DELIBERATION, RoundPhaseType.COMPLETED,
        ):
            assert speaker_slot_for_phase(phase) is None


class TestRoundRoomParticipantModelBackwardCompat:
    """Old participant rows persisted before the speaker_slot migration have
    no such key at all in the dict -- model_validate must still succeed and
    default speaker_slot to None (flex), not raise."""

    def test_row_without_speaker_slot_key_validates_with_none_default(self):
        from app.models.round_simulation import RoundRoomParticipant
        old_row = {
            "id": "p1", "room_id": "room-1", "user_id": "u1", "display_name": None,
            "role": "debater_a", "side": "pro", "status": "joined",
            "joined_at": "2026-01-01T00:00:00Z",
            "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
        }
        participant = RoundRoomParticipant.model_validate(old_row)
        assert participant.speaker_slot is None

    def test_row_with_explicit_speaker_slot_validates(self):
        from app.models.round_simulation import RoundRoomParticipant
        row = {
            "id": "p1", "room_id": "room-1", "user_id": "u1", "display_name": None,
            "role": "debater_a", "side": "pro", "speaker_slot": "second", "status": "joined",
            "joined_at": "2026-01-01T00:00:00Z",
            "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
        }
        participant = RoundRoomParticipant.model_validate(row)
        assert participant.speaker_slot.value == "second"
