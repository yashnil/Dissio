"""Pass 16 — Round flow tracker tests.

Covers:
- Status transitions (introduced → answered, extended, dropped, turned, etc.)
- Append-only event application
- Transcript extraction (labels, responses, extensions, drops)
- Status reconstruction from events
- Late speech argument detection
- Evidence card reference tracking
"""
from __future__ import annotations
import pytest
from unittest.mock import patch

from app.models.round_simulation import (
    ArgumentFlowStatus,
    RoundArgument,
    RoundFlowEvent,
    RoundPhaseType,
    RoundSide,
)
from app.services.round_flow_tracker import (
    _extract_argument_labels,
    _extract_extensions,
    _extract_responses,
    apply_crossfire_concession,
    apply_event,
    reconstruct_flow_status,
)


# ── apply_event transitions ────────────────────────────────────────────────────

class TestApplyEvent:
    def test_introduce(self):
        s = apply_event(ArgumentFlowStatus.INTRODUCED, "introduce")
        assert s == ArgumentFlowStatus.INTRODUCED

    def test_answer_introduced(self):
        s = apply_event(ArgumentFlowStatus.INTRODUCED, "answer")
        assert s == ArgumentFlowStatus.ANSWERED

    def test_answer_extended(self):
        s = apply_event(ArgumentFlowStatus.EXTENDED, "answer")
        assert s == ArgumentFlowStatus.ANSWERED

    def test_extend_introduced(self):
        s = apply_event(ArgumentFlowStatus.INTRODUCED, "extend")
        assert s == ArgumentFlowStatus.EXTENDED

    def test_extend_answered(self):
        s = apply_event(ArgumentFlowStatus.ANSWERED, "extend")
        assert s == ArgumentFlowStatus.LIVE

    def test_extend_live(self):
        s = apply_event(ArgumentFlowStatus.LIVE, "extend")
        assert s == ArgumentFlowStatus.LIVE

    def test_drop_introduced(self):
        s = apply_event(ArgumentFlowStatus.INTRODUCED, "drop")
        assert s == ArgumentFlowStatus.DROPPED

    def test_drop_live(self):
        s = apply_event(ArgumentFlowStatus.LIVE, "drop")
        assert s == ArgumentFlowStatus.DROPPED

    def test_turn_introduced(self):
        s = apply_event(ArgumentFlowStatus.INTRODUCED, "turn")
        assert s == ArgumentFlowStatus.TURNED

    def test_concede_live(self):
        s = apply_event(ArgumentFlowStatus.LIVE, "concede")
        assert s == ArgumentFlowStatus.CONCEDED

    def test_indict_extended(self):
        s = apply_event(ArgumentFlowStatus.EXTENDED, "indict")
        assert s == ArgumentFlowStatus.MITIGATED

    def test_mitigate_answered(self):
        s = apply_event(ArgumentFlowStatus.ANSWERED, "mitigate")
        assert s == ArgumentFlowStatus.MITIGATED

    def test_unknown_event_returns_current(self):
        s = apply_event(ArgumentFlowStatus.LIVE, "nonexistent_event")
        assert s == ArgumentFlowStatus.LIVE

    def test_unknown_status_returns_current(self):
        s = apply_event(ArgumentFlowStatus.DROPPED, "extend")
        assert s == ArgumentFlowStatus.DROPPED


# ── Transcript extraction ──────────────────────────────────────────────────────

class TestExtractArgumentLabels:
    def test_extracts_AC_labels(self):
        labels = _extract_argument_labels("We read AC1 and AC2 in the constructive.")
        assert "AC1" in labels
        assert "AC2" in labels

    def test_extracts_NC_labels(self):
        labels = _extract_argument_labels("NC1 is our framework. NC2 is our contention.")
        assert "NC1" in labels
        assert "NC2" in labels

    def test_extracts_contention_number(self):
        labels = _extract_argument_labels("Contention 1 is economic harms.")
        assert any("1" in l for l in labels)

    def test_empty_transcript(self):
        labels = _extract_argument_labels("")
        assert labels == []

    def test_no_labels(self):
        labels = _extract_argument_labels("This is a plain speech with no argument labels.")
        assert labels == []

    def test_deduplication(self):
        labels = _extract_argument_labels("AC1 is important. Extend AC1 through the flow.")
        assert labels.count("AC1") == 1


class TestExtractExtensions:
    def test_extend_keyword(self):
        exts = _extract_extensions("We extend AC1 through the flow.", ["AC1", "AC2"])
        assert "AC1" in exts

    def test_stands_uncontested(self):
        exts = _extract_extensions("AC2 stands uncontested.", ["AC1", "AC2"])
        assert "AC2" in exts

    def test_goes_unanswered(self):
        exts = _extract_extensions("AC1 goes unanswered.", ["AC1"])
        assert "AC1" in exts

    def test_no_extension_returns_empty(self):
        exts = _extract_extensions("We address the flow.", ["AC1"])
        assert "AC1" not in exts

    def test_only_known_labels(self):
        exts = _extract_extensions("Extend AC3 through the flow.", ["AC1", "AC2"])
        assert exts == []  # AC3 not in known labels


class TestExtractResponses:
    def test_finds_referenced_argument(self):
        responses = _extract_responses("Turn to NC1 — this argument is flawed.", ["NC1", "NC2"])
        assert "NC1" in responses

    def test_case_insensitive(self):
        responses = _extract_responses("On nc1 their evidence is outdated.", ["NC1"])
        assert "NC1" in responses

    def test_unknown_label_not_found(self):
        responses = _extract_responses("On NC3 their evidence fails.", ["NC1", "NC2"])
        assert responses == []


# ── reconstruct_flow_status ────────────────────────────────────────────────────

class TestReconstructFlowStatus:
    def _event(self, arg_id, status, ts="2026-06-23T00:00:00"):
        import uuid
        return RoundFlowEvent(
            id=str(uuid.uuid4()),
            round_id="r1",
            phase=RoundPhaseType.FIRST_CONSTRUCTIVE,
            event_type="introduce",
            argument_id=arg_id,
            side=RoundSide.PRO,
            description="",
            new_status=status,
            created_at=ts,
        )

    def test_reconstruction_returns_latest_status(self):
        arg_id = "arg1"
        events = [
            self._event(arg_id, ArgumentFlowStatus.INTRODUCED, "2026-06-23T00:01:00"),
            self._event(arg_id, ArgumentFlowStatus.ANSWERED, "2026-06-23T00:02:00"),
            self._event(arg_id, ArgumentFlowStatus.EXTENDED, "2026-06-23T00:03:00"),
        ]
        status_map = reconstruct_flow_status(events)
        assert status_map[arg_id] == ArgumentFlowStatus.EXTENDED

    def test_reconstruction_chronological_order(self):
        arg_id = "arg2"
        events = [
            self._event(arg_id, ArgumentFlowStatus.DROPPED, "2026-06-23T00:03:00"),
            self._event(arg_id, ArgumentFlowStatus.INTRODUCED, "2026-06-23T00:01:00"),
        ]
        status_map = reconstruct_flow_status(events)
        # Latest by timestamp = DROPPED
        assert status_map[arg_id] == ArgumentFlowStatus.DROPPED

    def test_empty_events(self):
        status_map = reconstruct_flow_status([])
        assert status_map == {}

    def test_multiple_arguments(self):
        events = [
            self._event("arg_a", ArgumentFlowStatus.LIVE, "2026-06-23T00:01:00"),
            self._event("arg_b", ArgumentFlowStatus.DROPPED, "2026-06-23T00:02:00"),
        ]
        status_map = reconstruct_flow_status(events)
        assert status_map["arg_a"] == ArgumentFlowStatus.LIVE
        assert status_map["arg_b"] == ArgumentFlowStatus.DROPPED


# ── apply_crossfire_concession (Phase 8D) ───────────────────────────────────────


def _arg(label: str, side: RoundSide, status: ArgumentFlowStatus, arg_id: str = "arg-1") -> RoundArgument:
    return RoundArgument(
        id=arg_id, round_id="r-1", label=label, side=side, claim=f"Claim for {label}",
        initial_phase=RoundPhaseType.FIRST_CONSTRUCTIVE, status=status,
    )


class TestApplyCrossfireConcession:
    def test_concedes_the_targeted_argument(self):
        live = _arg("P1", RoundSide.PRO, ArgumentFlowStatus.LIVE, arg_id="arg-1")
        with patch("app.services.round_flow_tracker.load_round_arguments", return_value=[live]), \
             patch("app.services.round_flow_tracker.upsert_argument") as mock_upsert, \
             patch("app.services.round_flow_tracker.append_flow_event") as mock_append:
            result = apply_crossfire_concession(
                round_id="r-1", phase=RoundPhaseType.FIRST_CROSSFIRE,
                argument_label="P1", conceding_side=RoundSide.PRO,
                description="Concession in crossfire: conceded the point.",
            )
        assert result is not None
        assert result.status == ArgumentFlowStatus.CONCEDED
        mock_upsert.assert_called_once()
        mock_append.assert_called_once()
        saved_event = mock_append.call_args[0][0]
        assert saved_event.event_type == "concede"
        assert saved_event.argument_id == "arg-1"

    def test_returns_none_when_no_argument_matches_label_and_side(self):
        live = _arg("P1", RoundSide.PRO, ArgumentFlowStatus.LIVE)
        with patch("app.services.round_flow_tracker.load_round_arguments", return_value=[live]), \
             patch("app.services.round_flow_tracker.upsert_argument") as mock_upsert, \
             patch("app.services.round_flow_tracker.append_flow_event") as mock_append:
            result = apply_crossfire_concession(
                round_id="r-1", phase=RoundPhaseType.FIRST_CROSSFIRE,
                argument_label="P2", conceding_side=RoundSide.PRO,
                description="irrelevant",
            )
        assert result is None
        mock_upsert.assert_not_called()
        mock_append.assert_not_called()

    def test_does_not_match_the_same_label_on_the_wrong_side(self):
        """Guards against cross-side label collisions — a concession on the
        student's side must never touch an opponent argument with the same label."""
        live = _arg("C1", RoundSide.CON, ArgumentFlowStatus.LIVE)
        with patch("app.services.round_flow_tracker.load_round_arguments", return_value=[live]), \
             patch("app.services.round_flow_tracker.upsert_argument") as mock_upsert:
            result = apply_crossfire_concession(
                round_id="r-1", phase=RoundPhaseType.FIRST_CROSSFIRE,
                argument_label="C1", conceding_side=RoundSide.PRO,
                description="irrelevant",
            )
        assert result is None
        mock_upsert.assert_not_called()

    def test_idempotent_when_already_conceded(self):
        already = _arg("P1", RoundSide.PRO, ArgumentFlowStatus.CONCEDED)
        with patch("app.services.round_flow_tracker.load_round_arguments", return_value=[already]), \
             patch("app.services.round_flow_tracker.upsert_argument") as mock_upsert, \
             patch("app.services.round_flow_tracker.append_flow_event") as mock_append:
            result = apply_crossfire_concession(
                round_id="r-1", phase=RoundPhaseType.FIRST_CROSSFIRE,
                argument_label="P1", conceding_side=RoundSide.PRO,
                description="irrelevant",
            )
        assert result is not None
        assert result.status == ArgumentFlowStatus.CONCEDED
        mock_upsert.assert_not_called()
        mock_append.assert_not_called()

    def test_never_touches_an_unrelated_argument(self):
        target = _arg("P1", RoundSide.PRO, ArgumentFlowStatus.LIVE, arg_id="arg-1")
        other = _arg("P2", RoundSide.PRO, ArgumentFlowStatus.LIVE, arg_id="arg-2")
        with patch("app.services.round_flow_tracker.load_round_arguments", return_value=[target, other]), \
             patch("app.services.round_flow_tracker.upsert_argument") as mock_upsert, \
             patch("app.services.round_flow_tracker.append_flow_event"):
            apply_crossfire_concession(
                round_id="r-1", phase=RoundPhaseType.FIRST_CROSSFIRE,
                argument_label="P1", conceding_side=RoundSide.PRO,
                description="irrelevant",
            )
        assert mock_upsert.call_count == 1
        saved_arg = mock_upsert.call_args[0][0]
        assert saved_arg.label == "P1"
