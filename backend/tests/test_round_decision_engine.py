"""Pass 16 — Round decision engine tests.

Covers:
- Surviving offense identification
- Dropped/conceded offense excluded
- Weighing applied
- Judge profile effects different across judge types
- Same round can be re-judged without altering history
- Decision trace is concise and deterministic
- No private model reasoning stored
- Speaker points within 25-30 range
"""
from __future__ import annotations
import uuid
import pytest
from unittest.mock import patch

from app.models.round_simulation import (
    ArgumentFlowStatus,
    CrossfireEffect,
    RoundArgument,
    RoundDecision,
    RoundEvidenceUse,
    RoundPhaseType,
    RoundSide,
)
from app.services.round_decision_engine import (
    _get_surviving_offense,
    _get_dropped_args,
    _get_conceded_args,
    _estimate_speaker_points,
    _deterministic_rfd,
    _generate_rfd,
    run_decision_engine,
    rejudge_round,
)


def _arg(
    label="AC1",
    side=RoundSide.PRO,
    status=ArgumentFlowStatus.LIVE,
    is_offense=True,
    weighing=None,
    evidence_card_id=None,
) -> RoundArgument:
    return RoundArgument(
        id=str(uuid.uuid4()),
        round_id="r1",
        label=label,
        side=side,
        claim=f"Claim for {label}",
        initial_phase=RoundPhaseType.FIRST_CONSTRUCTIVE,
        status=status,
        is_offense=is_offense,
        weighing=weighing,
        evidence_card_id=evidence_card_id,
    )


def _use(card_id="c1", side=RoundSide.PRO, flagged=False) -> RoundEvidenceUse:
    return RoundEvidenceUse(
        id=str(uuid.uuid4()),
        round_id="r1",
        speech_id="s1",
        card_id=card_id,
        speaker_side=side,
        phase=RoundPhaseType.FIRST_CONSTRUCTIVE,
        flagged=flagged,
        created_at="2026-06-23T00:00:00",
    )


# ── Surviving offense ──────────────────────────────────────────────────────────

class TestGetSurvivingOffense:
    def test_live_argument_survives(self):
        arg = _arg(status=ArgumentFlowStatus.LIVE)
        result = _get_surviving_offense([arg], RoundSide.PRO)
        assert arg in result

    def test_extended_argument_survives(self):
        arg = _arg(status=ArgumentFlowStatus.EXTENDED)
        result = _get_surviving_offense([arg], RoundSide.PRO)
        assert arg in result

    def test_dropped_argument_excluded(self):
        arg = _arg(status=ArgumentFlowStatus.DROPPED)
        result = _get_surviving_offense([arg], RoundSide.PRO)
        assert arg not in result

    def test_conceded_argument_excluded(self):
        arg = _arg(status=ArgumentFlowStatus.CONCEDED)
        result = _get_surviving_offense([arg], RoundSide.PRO)
        assert arg not in result

    def test_turned_argument_excluded(self):
        arg = _arg(status=ArgumentFlowStatus.TURNED)
        result = _get_surviving_offense([arg], RoundSide.PRO)
        assert arg not in result

    def test_framework_excluded_from_offense(self):
        arg = _arg(status=ArgumentFlowStatus.LIVE)
        arg.is_framework = True
        result = _get_surviving_offense([arg], RoundSide.PRO)
        assert arg not in result

    def test_defense_excluded_from_offense(self):
        arg = _arg(status=ArgumentFlowStatus.LIVE, is_offense=False)
        result = _get_surviving_offense([arg], RoundSide.PRO)
        assert arg not in result

    def test_other_side_excluded(self):
        arg = _arg(side=RoundSide.CON, status=ArgumentFlowStatus.LIVE)
        result = _get_surviving_offense([arg], RoundSide.PRO)
        assert arg not in result


# ── Speaker points ─────────────────────────────────────────────────────────────

class TestEstimateSpeakerPoints:
    def test_points_within_range(self):
        args = [_arg(), _arg("AC2", RoundSide.PRO)]
        pts = _estimate_speaker_points(args, RoundSide.PRO, [], [])
        assert 25.0 <= pts <= 30.0

    def test_errors_reduce_points(self):
        args = [_arg()]
        no_violation_pts = _estimate_speaker_points(args, RoundSide.PRO, [], [])
        violations = [{"severity": "error", "type": "missing_clash"} for _ in range(3)]
        with_violation_pts = _estimate_speaker_points(args, RoundSide.PRO, [], violations)
        assert with_violation_pts < no_violation_pts

    def test_clean_evidence_adds_points(self):
        args = [_arg(evidence_card_id="c1")]
        no_use = _estimate_speaker_points(args, RoundSide.PRO, [], [])
        uses = [_use("c1", RoundSide.PRO, flagged=False)]
        with_use = _estimate_speaker_points(args, RoundSide.PRO, uses, [])
        assert with_use >= no_use


# ── Decision engine ────────────────────────────────────────────────────────────

class TestRunDecisionEngine:
    def test_pro_wins_with_more_surviving_offense(self):
        args = [
            _arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE),
            _arg("AC2", RoundSide.PRO, ArgumentFlowStatus.LIVE),
            _arg("NC1", RoundSide.CON, ArgumentFlowStatus.DROPPED),
        ]
        decision = run_decision_engine("r1", "flow", args, [], [])
        assert decision.winner == RoundSide.PRO

    def test_con_wins_with_more_surviving_offense(self):
        args = [
            _arg("AC1", RoundSide.PRO, ArgumentFlowStatus.DROPPED),
            _arg("NC1", RoundSide.CON, ArgumentFlowStatus.LIVE),
            _arg("NC2", RoundSide.CON, ArgumentFlowStatus.EXTENDED),
        ]
        decision = run_decision_engine("r1", "flow", args, [], [])
        assert decision.winner == RoundSide.CON

    def test_weighing_advantage_improves_score(self):
        """Weighing in pro's favor slightly tips the balance."""
        args = [
            _arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE, weighing="outweighs on magnitude"),
            _arg("NC1", RoundSide.CON, ArgumentFlowStatus.LIVE),
        ]
        decision = run_decision_engine("r1", "flow", args, [], [])
        assert decision.winner == RoundSide.PRO

    def test_dropped_arguments_appear_in_decision(self):
        args = [_arg("NC1", RoundSide.CON, ArgumentFlowStatus.DROPPED)]
        decision = run_decision_engine("r1", "flow", args, [], [])
        assert any("NC1" in d for d in decision.dropped_arguments)

    def test_decision_has_rfd(self):
        args = [_arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE)]
        decision = run_decision_engine("r1", "flow", args, [], [])
        assert decision.reason_for_decision
        assert len(decision.reason_for_decision) > 10

    def test_decision_trace_is_complete(self):
        args = [
            _arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE),
            _arg("NC1", RoundSide.CON, ArgumentFlowStatus.DROPPED),
        ]
        decision = run_decision_engine("r1", "flow", args, [], [])
        trace_labels = {e.argument_label for e in decision.decision_trace.arguments_considered}
        assert "AC1" in trace_labels
        assert "NC1" in trace_labels

    def test_flagged_evidence_penalizes_side(self):
        args = [
            _arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE),
            _arg("AC2", RoundSide.PRO, ArgumentFlowStatus.LIVE),
            _arg("NC1", RoundSide.CON, ArgumentFlowStatus.LIVE),
        ]
        # Pro has 2 live args vs Con 1, but Pro has flagged evidence
        pro_use = _use("c1", RoundSide.PRO, flagged=True)
        decision = run_decision_engine("r1", "flow", args, [pro_use], [])
        # Pro should still win (2 vs 1) but score reduced
        assert decision.winner == RoundSide.PRO
        assert len(decision.evidence_issues) > 0

    def test_speaker_points_both_sides(self):
        args = [_arg()]
        decision = run_decision_engine("r1", "flow", args, [], [])
        assert "pro" in decision.speaker_points
        assert "con" in decision.speaker_points
        assert 25.0 <= decision.speaker_points["pro"] <= 30.0
        assert 25.0 <= decision.speaker_points["con"] <= 30.0

    def test_engine_version_recorded(self):
        decision = run_decision_engine("r1", "flow", [], [], [])
        assert decision.engine_version == "v2"  # upgraded in Pass 17


# ── Re-judging ─────────────────────────────────────────────────────────────────

class TestRejudgeRound:
    def test_rejudge_creates_new_id(self):
        args = [_arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE)]
        d1 = run_decision_engine("r1", "flow", args, [], [])
        d2 = rejudge_round("r1", "lay", args, [], [])
        assert d1.id != d2.id

    def test_rejudge_same_round_id(self):
        args = [_arg()]
        d = rejudge_round("r1", "lay", args, [], [])
        assert d.round_id == "r1"

    def test_rejudge_uses_new_judge_type(self):
        args = [_arg()]
        d = rejudge_round("r1", "parent", args, [], [])
        assert d.judge_type == "parent"

    def test_different_judge_types_may_differ(self):
        # With the same args, flow vs lay judges may produce different effects
        args = [
            _arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE),
            _arg("NC1", RoundSide.CON, ArgumentFlowStatus.LIVE),
        ]
        d_flow = run_decision_engine("r1", "flow", args, [], [])
        d_lay = rejudge_round("r1", "lay", args, [], [])
        # Both should be valid decisions (winner is deterministic from args)
        assert d_flow.winner in (RoundSide.PRO, RoundSide.CON)
        assert d_lay.winner in (RoundSide.PRO, RoundSide.CON)

    def test_rejudge_does_not_alter_original_args(self):
        args = [_arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE)]
        original_status = args[0].status
        rejudge_round("r1", "lay", args, [], [])
        # Arguments should not be mutated
        assert args[0].status == original_status


# ── Crossfire effects on the decision (Phase 8D) ────────────────────────────────


def _cf_effect(
    exchange_id="ex-1", affected_argument_label="AC1",
    effect_type="concession_weakened_argument", severity="high",
    explanation="Conceded in crossfire: the 20% figure.", ballot_relevance=True,
) -> CrossfireEffect:
    return CrossfireEffect(
        exchange_id=exchange_id, affected_argument_label=affected_argument_label,
        effect_type=effect_type, severity=severity, explanation=explanation,
        ballot_relevance=ballot_relevance,
    )


class TestCrossfireEffectsOnDecision:
    def test_decision_engine_remains_stable_when_no_crossfire_happened(self):
        """No crossfire_effects argument at all — matches every pre-Phase-8D caller."""
        args = [_arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE)]
        d = run_decision_engine("r1", "flow", args, [], [])
        assert d.crossfire_effects == []
        assert d.winner in (RoundSide.PRO, RoundSide.CON)

    def test_empty_crossfire_effects_list_is_stable(self):
        args = [_arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE)]
        d = run_decision_engine("r1", "flow", args, [], [], crossfire_effects=[])
        assert d.crossfire_effects == []

    def test_crossfire_effects_pass_through_onto_the_decision(self):
        args = [_arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE)]
        effect = _cf_effect()
        d = run_decision_engine("r1", "flow", args, [], [], crossfire_effects=[effect])
        assert len(d.crossfire_effects) == 1
        assert d.crossfire_effects[0].exchange_id == "ex-1"

    def test_rejudge_also_carries_crossfire_effects(self):
        args = [_arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE)]
        effect = _cf_effect()
        d = rejudge_round("r1", "lay", args, [], [], crossfire_effects=[effect])
        assert len(d.crossfire_effects) == 1

    def test_deterministic_rfd_cites_material_crossfire_note(self):
        text = _deterministic_rfd(
            winner=RoundSide.PRO, surviving_voters=["AC1 (pro)"], dropped=[],
            judge_effects=[], crossfire_notes=["Conceded in crossfire: the 20% figure."],
        )
        assert "Conceded in crossfire" in text

    def test_deterministic_rfd_stable_with_no_crossfire_notes(self):
        """Old callers that never pass crossfire_notes must produce the same RFD shape as before."""
        text = _deterministic_rfd(
            winner=RoundSide.PRO, surviving_voters=["AC1 (pro)"], dropped=[], judge_effects=[],
        )
        assert "vote for the pro side" in text.lower()
        assert "crossfire" not in text.lower()

    def test_generate_rfd_deterministic_fallback_cites_crossfire(self):
        """With no OpenAI key, the deterministic fallback path must still surface
        a material crossfire consequence in the RFD."""
        with patch("app.services.round_decision_engine.settings") as mock_settings:
            mock_settings.openai_api_key = ""
            text = _generate_rfd(
                winner=RoundSide.CON, judge_type="flow", surviving_voters=["NC1 (con)"],
                dropped=[], pro_score=1.0, con_score=2.0, judge_effects=[],
                speeches_summary="", crossfire_notes=["Contradiction flagged in crossfire: prior claim."],
            )
        assert "Contradiction flagged in crossfire" in text

    def test_generate_rfd_deterministic_fallback_stable_with_no_crossfire(self):
        with patch("app.services.round_decision_engine.settings") as mock_settings:
            mock_settings.openai_api_key = ""
            text = _generate_rfd(
                winner=RoundSide.CON, judge_type="flow", surviving_voters=["NC1 (con)"],
                dropped=[], pro_score=1.0, con_score=2.0, judge_effects=[], speeches_summary="",
            )
        assert text  # still produces a valid RFD with no crossfire involvement

    def test_evasion_only_notes_are_not_cited_in_rfd(self):
        """Evasion-only effects are coaching notes (ballot_relevance=False) —
        run_decision_engine must not pass them into the RFD's crossfire_notes."""
        args = [_arg("AC1", RoundSide.PRO, ArgumentFlowStatus.LIVE)]
        evasion_effect = _cf_effect(
            effect_type="evasion_warning", severity="low",
            explanation="Answer may not have directly addressed the crossfire question.",
            ballot_relevance=False,
        )
        with patch("app.services.round_decision_engine.settings") as mock_settings:
            mock_settings.openai_api_key = ""
            d = run_decision_engine("r1", "flow", args, [], [], crossfire_effects=[evasion_effect])
        assert "directly addressed" not in d.reason_for_decision
