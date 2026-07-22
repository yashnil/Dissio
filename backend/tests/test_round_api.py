"""Pass 16 — Round simulation API module tests.

These are import/structure tests since the API requires a live Supabase connection.
Tests verify: module importable, router has correct prefix, all expected routes exist.
"""
from __future__ import annotations
import pytest
from unittest.mock import patch, MagicMock, ANY


def test_round_simulations_api_importable():
    from app.api import round_simulations
    assert hasattr(round_simulations, "router")


def test_router_prefix():
    from app.api.round_simulations import router
    assert router.prefix == "/round-simulations"


def test_router_tags():
    from app.api.round_simulations import router
    assert "round_simulations" in router.tags


def test_router_has_expected_routes():
    from app.api.round_simulations import router
    prefix = router.prefix  # "/round-simulations"
    full_paths = {r.path for r in router.routes}
    # Paths include the router prefix; strip it to get relative paths
    relative = {p[len(prefix):] for p in full_paths if p.startswith(prefix)}
    assert "" in relative or "/" in relative  # list rounds
    assert "/{round_id}" in relative
    assert "/{round_id}/start" in relative
    assert "/{round_id}/speeches/student" in relative
    assert "/{round_id}/speeches/opponent" in relative
    assert "/{round_id}/advance-phase" in relative
    assert "/{round_id}/decision" in relative
    assert "/{round_id}/drills" in relative
    assert "/{round_id}/flow" in relative
    assert "/{round_id}/crossfire/question" in relative
    assert "/{round_id}/crossfire/answer" in relative
    assert "/{round_id}/rejudge" in relative


def test_main_includes_round_simulations_router():
    """Verify that main.py registers the round_simulations router."""
    from app.main import app
    prefixes = [r.path for r in app.routes]
    assert any("round-simulations" in p for p in prefixes)


def test_round_simulation_models_importable():
    from app.models.round_simulation import (
        RoundSimulation,
        RoundSimulationConfig,
        RoundPhaseType,
        RoundSide,
        RoundSpeech,
        RoundArgument,
        RoundDecision,
        RoundFlowEvent,
        RoundEvidenceUse,
        OpponentRoundPlan,
        CrossfireExchange,
    )


def test_round_speech_model_defaults_is_fallback_false():
    """RoundSpeech.is_fallback must default False so existing rows/tests are unaffected."""
    from app.models.round_simulation import RoundSpeech
    s = RoundSpeech(
        id="s1", round_id="r1", phase="first_constructive", speaker_side="pro",
        is_ai=True, created_at="2026-01-01T00:00:00Z",
    )
    assert s.is_fallback is False


def test_load_speech_maps_is_fallback_true():
    """_load_speech must surface a persisted fallback flag so the UI can disclose
    that a speech was a deterministic template, not a generated AI response."""
    from app.api.round_simulations import _load_speech
    row = {
        "id": "s1", "round_id": "r1", "phase": "first_constructive",
        "speaker_side": "con", "is_ai": True, "is_fallback": True,
        "created_at": "2026-01-01T00:00:00Z",
    }
    speech = _load_speech(row)
    assert speech.is_fallback is True


def test_load_speech_defaults_is_fallback_false_when_column_missing():
    """Rows written before the is_fallback column existed must not be misread as fallback."""
    from app.api.round_simulations import _load_speech
    row = {
        "id": "s2", "round_id": "r1", "phase": "first_constructive",
        "speaker_side": "pro", "is_ai": False,
        "created_at": "2026-01-01T00:00:00Z",
    }
    speech = _load_speech(row)
    assert speech.is_fallback is False


def test_round_decision_loads_old_row_missing_crossfire_effects_column():
    """Phase 8D added crossfire_effects to RoundDecision. Decision rows written
    before that migration/field existed have no such key at all — model_validate
    must default to an empty list rather than raising, so old rounds still load."""
    from app.models.round_simulation import RoundDecision
    old_row = {
        "id": "d1", "round_id": "r1", "judge_type": "flow", "winner": "pro",
        "reason_for_decision": "Pro wins.", "decision_trace": {},
        "created_at": "2026-01-01T00:00:00Z",
    }
    decision = RoundDecision.model_validate(old_row)
    assert decision.crossfire_effects == []


def _cx_exchange(**overrides):
    from app.models.round_simulation import CrossfireExchange, RoundPhaseType, RoundSide
    defaults = dict(
        id="ex-1", round_id="r1", phase=RoundPhaseType.FIRST_CROSSFIRE, sequence=1,
        questioner_side=RoundSide.CON, question="Why?", created_at="2026-01-01T00:00:00Z",
    )
    defaults.update(overrides)
    return CrossfireExchange(**defaults)


def test_find_pending_crossfire_exchange_returns_latest_unanswered():
    """Guards Phase 8B idempotency fix: GET /crossfire/question must reuse a
    still-open question instead of generating a duplicate on refresh/re-render."""
    from app.api.round_simulations import _find_pending_crossfire_exchange
    answered = _cx_exchange(id="ex-1", sequence=1, answer="I answered.")
    unanswered = _cx_exchange(id="ex-2", sequence=2, answer=None)
    result = _find_pending_crossfire_exchange([answered, unanswered])
    assert result is not None
    assert result.id == "ex-2"


def test_find_pending_crossfire_exchange_returns_none_when_all_answered():
    from app.api.round_simulations import _find_pending_crossfire_exchange
    answered = _cx_exchange(id="ex-1", sequence=1, answer="I answered.")
    assert _find_pending_crossfire_exchange([answered]) is None


def test_find_pending_crossfire_exchange_returns_none_when_empty():
    from app.api.round_simulations import _find_pending_crossfire_exchange
    assert _find_pending_crossfire_exchange([]) is None


# ── Phase 8C — student-asks-AI crossfire direction ────────────────────────────


def test_student_question_route_returns_crossfire_exchange_model():
    """Phase 8C: the student-question endpoint must return a full CrossfireExchange
    (like the AI-asks endpoints), not the old bespoke {id, question, answer,
    created_at} dict, so the frontend can merge it into round state uniformly."""
    from app.api.round_simulations import router
    route = next(r for r in router.routes if r.path.endswith("/crossfire/student-question"))  # type: ignore[attr-defined]
    assert route.response_model.__name__ == "CrossfireExchange"


def test_crossfire_exchange_model_dump_matches_known_db_columns():
    """Regression guard for the Phase 8C persistence bug: the student-question
    endpoint used to hand-build an insert dict with typo'd/nonexistent column
    names (target_argument_label, concession, status), so every write silently
    failed against PostgREST and was swallowed by a bare except. Building the
    insert from a real CrossfireExchange model, as the AI-asks endpoints already
    did, structurally prevents that class of bug — this locks in the column set."""
    known_db_columns = {
        "id", "round_id", "phase", "sequence", "questioner_side", "question",
        "answer", "target_argument", "exchange_type", "concession_extracted",
        "contradiction", "evasion_detected", "evidence_challenge",
        "strategic_significance", "follow_up_to", "created_at",
    }
    exchange = _cx_exchange()
    assert set(exchange.model_dump().keys()) == known_db_columns


def test_generate_ai_answer_used_by_student_question_endpoint():
    """Phase 8C: the student-question endpoint must call the real, tested
    crossfire_simulator.generate_ai_answer instead of a duplicate local
    implementation that never ran concession detection or used exchange history."""
    import inspect
    from app.api import round_simulations
    assert "generate_ai_answer" in dir(round_simulations)
    src = inspect.getsource(round_simulations.submit_student_crossfire_question)
    assert "generate_ai_answer(" in src


def test_local_duplicate_ai_crossfire_answer_removed():
    """The old untested duplicate implementation must not silently reappear."""
    from app.api import round_simulations
    assert not hasattr(round_simulations, "_generate_ai_crossfire_answer")


# ── request_crossfire_followup (Phase 8E) ───────────────────────────────────────


def _followup_request(round_id="r1", exchange_id="ex-target"):
    from app.models.round_simulation import FollowUpCrossfireRequest
    return FollowUpCrossfireRequest(round_id=round_id, exchange_id=exchange_id)


def _sim(phase="first_crossfire", student_side="pro", judge_type="flow"):
    from app.models.round_simulation import RoundSimulation, RoundSimulationConfig
    config = RoundSimulationConfig(
        student_side=student_side, speaking_order="first", resolution="Test resolution.",
        judge_type=judge_type,
    )
    return RoundSimulation(
        id="r1", user_id="u1", config=config, status="active", current_phase=phase,
        created_at="2026-01-01T00:00:00Z", updated_at="2026-01-01T00:00:00Z",
    )


class TestRequestCrossfireFollowup:
    """Endpoint-level tests via direct function call with mocked collaborators —
    the established pattern in this file avoids a live Supabase connection."""

    def _call(self, req, user_id="u1", sim=None, existing=None, followup_result=None):
        from app.api import round_simulations as mod
        sim = sim or _sim()
        existing = existing if existing is not None else []
        with patch.object(mod, "get_supabase", return_value=MagicMock()), \
             patch.object(mod, "_verify_owner", return_value={"id": "r1", "user_id": user_id}) as mock_verify, \
             patch.object(mod, "_load_simulation", return_value=sim), \
             patch.object(mod, "load_crossfire_exchanges", return_value=existing), \
             patch.object(mod, "load_round_arguments", return_value=[]), \
             patch.object(mod, "generate_followup_question", return_value=followup_result) as mock_gen, \
             patch.object(mod, "save_crossfire_exchange") as mock_save, \
             patch.object(mod, "track_product_event"):
            result = mod.request_crossfire_followup(req.round_id, req, user_id)
        return result, mock_verify, mock_gen, mock_save

    def test_rejects_outside_crossfire_phase(self):
        from fastapi import HTTPException
        req = _followup_request()
        with pytest.raises(HTTPException) as exc_info:
            self._call(req, sim=_sim(phase="first_constructive"))
        assert exc_info.value.status_code == 400
        assert "crossfire" in exc_info.value.detail.lower()

    def test_rejects_missing_target_exchange(self):
        from fastapi import HTTPException
        req = _followup_request(exchange_id="does-not-exist")
        with pytest.raises(HTTPException) as exc_info:
            self._call(req, existing=[_cx_exchange(id="ex-other")])
        assert exc_info.value.status_code == 404

    def test_rejects_exchange_the_student_asked(self):
        """Only the AI-asks-student direction has real diagnostics."""
        from fastapi import HTTPException
        target = _cx_exchange(
            id="ex-target", questioner_side="pro", answer="An answer.", evasion_detected=True,
        )
        req = _followup_request()
        with pytest.raises(HTTPException) as exc_info:
            self._call(req, sim=_sim(student_side="pro"), existing=[target])
        assert exc_info.value.status_code == 400
        assert "ai opponent asked you" in exc_info.value.detail.lower()

    def test_rejects_unanswered_exchange(self):
        from fastapi import HTTPException
        target = _cx_exchange(id="ex-target", questioner_side="con", answer=None)
        req = _followup_request()
        with pytest.raises(HTTPException) as exc_info:
            self._call(req, sim=_sim(student_side="pro"), existing=[target])
        assert exc_info.value.status_code == 400
        assert "hasn't been answered" in exc_info.value.detail

    def test_rejects_exchange_without_diagnostic(self):
        from fastapi import HTTPException
        target = _cx_exchange(
            id="ex-target", questioner_side="con", answer="A clean direct answer.",
            evasion_detected=False, contradiction=None,
        )
        req = _followup_request()
        with pytest.raises(HTTPException) as exc_info:
            self._call(req, sim=_sim(student_side="pro"), existing=[target])
        assert exc_info.value.status_code == 400
        assert "doesn't have a diagnostic" in exc_info.value.detail

    def test_accepts_evasion_and_persists_followup_with_correct_sequence(self):
        target = _cx_exchange(
            id="ex-target", questioner_side="con", sequence=2, answer="Let's move on.",
            evasion_detected=True,
        )
        generated = _cx_exchange(id="ex-new", questioner_side="con", sequence=99, question="Follow-up?")
        req = _followup_request()
        result, mock_verify, mock_gen, mock_save = self._call(
            req, sim=_sim(student_side="pro"), existing=[target], followup_result=generated,
        )
        mock_verify.assert_called_once()
        mock_gen.assert_called_once()
        assert result.follow_up_to == "ex-target"
        assert result.sequence == 2  # len(existing) + 1 = 2, not the generator's own guess of 99
        mock_save.assert_called_once()
        saved = mock_save.call_args[0][0]
        assert saved.follow_up_to == "ex-target"

    def test_accepts_contradiction_alone(self):
        target = _cx_exchange(
            id="ex-target", questioner_side="con", answer="Actually the opposite.",
            contradiction="Conflicts with an earlier claim.",
        )
        generated = _cx_exchange(id="ex-new", questioner_side="con", question="Follow-up?")
        req = _followup_request()
        result, *_ = self._call(
            req, sim=_sim(student_side="pro"), existing=[target], followup_result=generated,
        )
        assert result.follow_up_to == "ex-target"

    def test_duplicate_request_returns_existing_followup_without_regenerating(self):
        target = _cx_exchange(id="ex-target", questioner_side="con", answer="Evasive.", evasion_detected=True)
        prior_followup = _cx_exchange(id="ex-followup", questioner_side="con", follow_up_to="ex-target")
        req = _followup_request()
        result, mock_verify, mock_gen, mock_save = self._call(
            req, sim=_sim(student_side="pro"), existing=[target, prior_followup],
        )
        assert result.id == "ex-followup"
        mock_gen.assert_not_called()
        mock_save.assert_not_called()

    def test_ownership_check_is_invoked(self):
        target = _cx_exchange(id="ex-target", questioner_side="con", answer="Evasive.", evasion_detected=True)
        generated = _cx_exchange(id="ex-new", questioner_side="con")
        req = _followup_request()
        _, mock_verify, _, _ = self._call(
            req, user_id="u-real", sim=_sim(student_side="pro"), existing=[target], followup_result=generated,
        )
        mock_verify.assert_called_once_with("r1", "u-real", ANY)

    def test_round_id_mismatch_rejected_before_any_lookup(self):
        from fastapi import HTTPException
        from app.models.round_simulation import FollowUpCrossfireRequest
        from app.api import round_simulations as mod
        req = FollowUpCrossfireRequest(round_id="other-round", exchange_id="ex-1")
        with pytest.raises(HTTPException) as exc_info:
            mod.request_crossfire_followup("r1", req, "u1")
        assert exc_info.value.status_code == 400


def test_round_services_importable():
    from app.services.round_state_machine import (
        get_phase_order,
        next_phase,
        validate_phase_transition,
        phase_speaker,
        student_speaks_in_phase,
    )
    from app.services.round_flow_tracker import (
        apply_event,
        reconstruct_flow_status,
    )
    from app.services.speech_legality_checker import check_speech_legality
    from app.services.round_decision_engine import run_decision_engine
    from app.services.round_drill_generator import generate_post_round_drills
    from app.services.evidence_use_tracker import create_evidence_use_record
    from app.services.opponent_strategy import build_opponent_round_plan
    from app.services.opponent_speech_generator import generate_opponent_speech
    from app.services.crossfire_simulator import generate_crossfire_question
    from app.services.round_prep_connector import get_pre_round_readiness_warnings
