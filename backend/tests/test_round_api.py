"""Pass 16 — Round simulation API module tests.

These are import/structure tests since the API requires a live Supabase connection.
Tests verify: module importable, router has correct prefix, all expected routes exist.
"""
from __future__ import annotations
import pytest


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
        "strategic_significance", "created_at",
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
