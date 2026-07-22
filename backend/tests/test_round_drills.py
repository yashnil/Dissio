"""Pass 16 — Post-round drill generation tests.

Covers:
- Drills generated from dropped arguments
- Drills generated from evidence violations
- Drills linked to specific round/phase/argument
- Max drill limit respected
- Skill targets are valid
- Success criteria present
- Drills do not fabricate evidence
"""
from __future__ import annotations
import uuid
import pytest
from unittest.mock import patch, MagicMock

from app.models.round_simulation import (
    ArgumentFlowStatus,
    RoundArgument,
    RoundDrillAttempt,
    RoundEvidenceUse,
    RoundPhaseType,
    RoundSide,
)
from app.services.round_drill_generator import (
    _DRILL_TEMPLATES,
    _choose_drill_types,
    generate_post_round_drills,
    load_round_drill_attempts,
    save_round_drill_attempt,
)


def _arg(
    label="AC1",
    side=RoundSide.PRO,
    status=ArgumentFlowStatus.LIVE,
) -> RoundArgument:
    return RoundArgument(
        id=str(uuid.uuid4()),
        round_id="r1",
        label=label,
        side=side,
        claim=f"Claim for {label}",
        initial_phase=RoundPhaseType.FIRST_CONSTRUCTIVE,
        status=status,
    )


def _use(side=RoundSide.PRO, flagged=False, violations=None) -> RoundEvidenceUse:
    return RoundEvidenceUse(
        id=str(uuid.uuid4()),
        round_id="r1",
        speech_id="s1",
        card_id=str(uuid.uuid4()),
        speaker_side=side,
        phase=RoundPhaseType.FIRST_CONSTRUCTIVE,
        flagged=flagged,
        violations=violations or [],
        created_at="2026-06-23T00:00:00",
    )


# ── _choose_drill_types ────────────────────────────────────────────────────────

class TestChooseDrillTypes:
    def test_dropped_response_for_live_opponent_arg(self):
        opponent_arg = _arg("NC1", RoundSide.CON, ArgumentFlowStatus.LIVE)
        types = _choose_drill_types([opponent_arg], [], None, RoundSide.PRO, [])
        assert "dropped_response" in types

    def test_evidence_explanation_for_flagged_evidence(self):
        flagged = _use(RoundSide.PRO, flagged=True, violations=["missing_citation"])
        types = _choose_drill_types([], [flagged], None, RoundSide.PRO, [])
        assert "evidence_explanation" in types

    def test_weighing_drill_when_no_weighing_success(self):
        types = _choose_drill_types([], [], None, RoundSide.PRO, [])
        assert "weighing" in types

    def test_summary_extension_for_legality_violation(self):
        violations = [{"type": "dropped_offense", "description": "Offense dropped."}]
        types = _choose_drill_types([], [], None, RoundSide.PRO, violations)
        assert "summary_extension" in types

    def test_max_5_types_returned(self):
        args = [
            _arg("NC1", RoundSide.CON, ArgumentFlowStatus.LIVE),
            _arg("NC2", RoundSide.CON, ArgumentFlowStatus.EXTENDED),
        ]
        flagged = _use(RoundSide.PRO, flagged=True)
        types = _choose_drill_types(args, [flagged], None, RoundSide.PRO, [])
        assert len(types) <= 5


# ── generate_post_round_drills ─────────────────────────────────────────────────

class TestGeneratePostRoundDrills:
    def test_drills_generated_with_no_args(self):
        drills = generate_post_round_drills("r1", RoundSide.PRO, [], [], None)
        assert len(drills) > 0

    def test_max_drills_respected(self):
        args = [_arg(f"NC{i}", RoundSide.CON, ArgumentFlowStatus.LIVE) for i in range(5)]
        drills = generate_post_round_drills("r1", RoundSide.PRO, args, [], None, max_drills=3)
        assert len(drills) <= 3

    def test_drill_has_required_fields(self):
        drills = generate_post_round_drills("r1", RoundSide.PRO, [], [], None)
        for d in drills:
            assert d.id
            assert d.round_id == "r1"
            assert d.skill_target
            assert d.title
            assert d.prompt
            assert len(d.success_criteria) > 0
            assert d.time_limit_seconds >= 30

    def test_drill_source_links_round_id(self):
        drills = generate_post_round_drills("r1", RoundSide.PRO, [], [], None)
        for d in drills:
            assert d.source.round_id == "r1"

    def test_drill_for_dropped_arg_links_label(self):
        opponent_arg = _arg("NC1", RoundSide.CON, ArgumentFlowStatus.LIVE)
        drills = generate_post_round_drills("r1", RoundSide.PRO, [opponent_arg], [], None)
        dropped_drills = [d for d in drills if d.skill_target == "drops"]
        if dropped_drills:
            assert dropped_drills[0].source.argument_label == "NC1"

    def test_drill_for_evidence_violation_links_card(self):
        flagged = _use(RoundSide.PRO, flagged=True, violations=["missing_citation"])
        drills = generate_post_round_drills("r1", RoundSide.PRO, [], [flagged], None)
        evidence_drills = [d for d in drills if d.skill_target == "evidence"]
        if evidence_drills:
            assert evidence_drills[0].source.card_id is not None

    def test_skill_targets_are_valid(self):
        # Use the semantic skill_target values, not the template key names
        valid_targets = {
            "drops", "clash", "extensions", "evidence", "weighing",
            "judge_adaptation", "pacing_control",
        }
        drills = generate_post_round_drills("r1", RoundSide.PRO, [], [], None)
        for d in drills:
            assert d.skill_target in valid_targets, f"Unknown skill target: {d.skill_target}"

    def test_no_fabricated_evidence_in_prompt(self):
        """Drill prompts should not contain invented evidence or citations."""
        drills = generate_post_round_drills("r1", RoundSide.PRO, [], [], None)
        for d in drills:
            # Prompts should not reference specific fake studies
            assert "Harvard" not in d.prompt or "practice" in d.prompt.lower()
            assert "fake evidence" not in d.prompt.lower()


# ── Drill template completeness ────────────────────────────────────────────────

class TestDrillTemplates:
    def test_all_templates_have_required_fields(self):
        for name, tmpl in _DRILL_TEMPLATES.items():
            assert "skill_target" in tmpl, f"{name} missing skill_target"
            assert "title" in tmpl, f"{name} missing title"
            assert "prompt" in tmpl, f"{name} missing prompt"
            assert "success_criteria" in tmpl, f"{name} missing success_criteria"
            assert "time_limit_seconds" in tmpl, f"{name} missing time_limit_seconds"

    def test_time_limits_within_range(self):
        for name, tmpl in _DRILL_TEMPLATES.items():
            t = tmpl["time_limit_seconds"]
            assert 30 <= t <= 300, f"{name} time_limit {t} out of range"

    def test_success_criteria_non_empty(self):
        for name, tmpl in _DRILL_TEMPLATES.items():
            assert len(tmpl["success_criteria"]) >= 2, f"{name} needs at least 2 criteria"

    def test_all_skill_targets_are_known(self):
        known_targets = {
            "drops", "clash", "extensions", "evidence", "weighing",
            "judge_adaptation", "pacing_control",
        }
        for name, tmpl in _DRILL_TEMPLATES.items():
            assert tmpl["skill_target"] in known_targets, \
                f"{name} has unknown skill_target {tmpl['skill_target']}"


# ── Round drill attempt persistence (Phase 8G) ──────────────────────────────────


def _attempt(**overrides) -> RoundDrillAttempt:
    defaults = dict(
        id=str(uuid.uuid4()), round_drill_id="drill-1", round_id="r1",
        response_text="My attempt at the drill.", created_at="2026-01-01T00:00:00Z",
    )
    defaults.update(overrides)
    return RoundDrillAttempt(**defaults)


class TestSaveRoundDrillAttempt:
    def test_inserts_into_round_drill_attempts_table(self):
        mock_supabase = MagicMock()
        with patch("app.services.round_drill_generator.get_supabase", return_value=mock_supabase):
            save_round_drill_attempt(_attempt(id="a1"))
        mock_supabase.table.assert_called_with("round_drill_attempts")
        inserted = mock_supabase.table.return_value.insert.call_args[0][0]
        assert inserted["id"] == "a1"
        assert inserted["response_text"] == "My attempt at the drill."

    def test_insert_failure_does_not_raise(self):
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.insert.return_value.execute.side_effect = Exception("db down")
        with patch("app.services.round_drill_generator.get_supabase", return_value=mock_supabase):
            save_round_drill_attempt(_attempt())  # must not raise


class TestLoadRoundDrillAttempts:
    def test_returns_parsed_attempts(self):
        mock_supabase = MagicMock()
        row = _attempt(id="a1").model_dump()
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
            MagicMock(data=[row])
        )
        with patch("app.services.round_drill_generator.get_supabase", return_value=mock_supabase):
            result = load_round_drill_attempts("drill-1")
        assert len(result) == 1
        assert result[0].id == "a1"

    def test_old_drill_with_no_attempts_returns_empty_list(self):
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
            MagicMock(data=[])
        )
        with patch("app.services.round_drill_generator.get_supabase", return_value=mock_supabase):
            result = load_round_drill_attempts("drill-with-no-attempts")
        assert result == []

    def test_load_failure_returns_empty_list_not_raise(self):
        mock_supabase = MagicMock()
        mock_supabase.table.side_effect = Exception("db down")
        with patch("app.services.round_drill_generator.get_supabase", return_value=mock_supabase):
            result = load_round_drill_attempts("drill-1")
        assert result == []

    def test_score_and_feedback_default_to_none(self):
        """A fresh attempt with no scoring info must not fabricate a score."""
        attempt = _attempt()
        assert attempt.score is None
        assert attempt.feedback is None

    def test_old_attempt_row_with_no_xp_or_mastery_concept_still_loads(self):
        """Phase 8H added XP/mastery emission, but never persisted xp/mastery
        fields onto RoundDrillAttempt itself (they're response-only, on
        RoundDrillAttemptResult). A pre-Phase-8H row, or any row loaded via
        the plain attempts-list endpoint, must validate exactly as before."""
        mock_supabase = MagicMock()
        old_row = {
            "id": "a-old", "round_drill_id": "drill-1", "round_id": "r1",
            "response_text": "An attempt from before XP integration existed.",
            "created_at": "2026-01-01T00:00:00Z",
        }
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
            MagicMock(data=[old_row])
        )
        with patch("app.services.round_drill_generator.get_supabase", return_value=mock_supabase):
            result = load_round_drill_attempts("drill-1")
        assert len(result) == 1
        assert result[0].id == "a-old"
        assert not hasattr(result[0], "xp_awarded")
        assert not hasattr(result[0], "mastery_emitted")


# ── Skill target → mastery skill resolution (Phase 8I) ──────────────────────────

class TestSkillTargetMasteryResolution:
    """Phase 8I: RoundDrill.skill_target values 'evidence' and 'pacing_control'
    must resolve to canonical mastery skill IDs so drill attempts against them
    emit mastery evidence instead of silently no-op'ing. Covers both the
    legacy strings (still on already-persisted round_drills rows) and the
    canonical strings (used going forward), so neither regresses."""

    def test_legacy_evidence_resolves_to_evidence_use(self):
        from app.services.mastery_integration import _to_canonical_skill
        assert _to_canonical_skill("evidence") == "evidence_use"

    def test_legacy_pacing_control_resolves_to_pacing(self):
        from app.services.mastery_integration import _to_canonical_skill
        assert _to_canonical_skill("pacing_control") == "pacing"

    def test_canonical_evidence_use_resolves_to_itself(self):
        from app.services.mastery_integration import _to_canonical_skill
        assert _to_canonical_skill("evidence_use") == "evidence_use"

    def test_canonical_pacing_resolves_to_itself(self):
        from app.services.mastery_integration import _to_canonical_skill
        assert _to_canonical_skill("pacing") == "pacing"

    def test_all_drill_template_skill_targets_resolve(self):
        """Every Full Round drill template's skill_target — including the
        legacy 'evidence'/'pacing_control' values — must resolve to a real
        mastery skill so no drill can silently drop mastery evidence."""
        from app.services.mastery_integration import _to_canonical_skill
        for name, tmpl in _DRILL_TEMPLATES.items():
            resolved = _to_canonical_skill(tmpl["skill_target"])
            assert resolved is not None, (
                f"{name} skill_target {tmpl['skill_target']!r} does not resolve "
                "to a canonical mastery skill"
            )

    def test_emit_from_drill_attempt_routes_legacy_evidence_to_canonical_skill(self):
        from unittest.mock import patch
        from app.services.mastery_integration import emit_from_drill_attempt
        with patch("app.services.mastery_integration._emit_evidence", return_value=True) as mock_emit:
            ok = emit_from_drill_attempt(
                MagicMock(), "user-1", "drill-1", skill_target="evidence", score_pct=80.0,
            )
        assert ok is True
        assert mock_emit.call_args.args[2] == "evidence_use"

    def test_emit_from_drill_attempt_routes_legacy_pacing_control_to_canonical_skill(self):
        from unittest.mock import patch
        from app.services.mastery_integration import emit_from_drill_attempt
        with patch("app.services.mastery_integration._emit_evidence", return_value=True) as mock_emit:
            ok = emit_from_drill_attempt(
                MagicMock(), "user-1", "drill-2", skill_target="pacing_control", score_pct=70.0,
            )
        assert ok is True
        assert mock_emit.call_args.args[2] == "pacing"
