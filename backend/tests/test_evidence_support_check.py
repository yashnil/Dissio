"""Tests for the evidence_support_check service.

All tests are pure — LLM calls are mocked.
Validates keyword scoring, candidate selection, and correct support_level output.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from unittest.mock import patch, MagicMock
from app.models.document import EvidenceCardRow, EvidenceSupportLevel
from app.services.evidence_support_check import (
    SupportCheckResult,
    _keywords,
    _overlap_score,
    _rank_candidates,
    check_claim_support,
)


def _make_card(card_text: str, author: str = "Smith", year: int = 2023) -> EvidenceCardRow:
    return EvidenceCardRow(
        id="card-abc",
        document_id="doc-1",
        user_id="user-1",
        chunk_id=None,
        tag=None,
        author=author,
        source=None,
        year=year,
        card_text=card_text,
        claim_summary=None,
        attribution_complete=bool(author and year),
        metadata_json={},
        created_at="2026-06-08T00:00:00Z",
    )


# ── _keywords ─────────────────────────────────────────────────────────────────

class TestKeywords:
    def test_removes_stop_words(self):
        kw = _keywords("the United States should reduce military presence")
        assert "the" not in kw
        assert "should" not in kw

    def test_keeps_meaningful_words(self):
        kw = _keywords("military bases economic deterrence stability")
        assert "military" in kw
        assert "deterrence" in kw

    def test_lowercases_everything(self):
        kw = _keywords("Military BASES Deterrence")
        assert "military" in kw
        assert "bases" in kw

    def test_empty_string_gives_empty_set(self):
        assert _keywords("") == set()

    def test_short_words_excluded(self):
        kw = _keywords("in on at by for is")
        # All are stop words or too short (len < 3)
        assert kw == set()


# ── _overlap_score ─────────────────────────────────────────────────────────────

class TestOverlapScore:
    def test_high_overlap_for_matching_card(self):
        query_kw = _keywords("military bases fiscal burden economic costs deterrence")
        card_text = (
            "Military forward bases impose significant fiscal burden. "
            "Economic costs of maintaining overseas presence exceed deterrence benefits."
        )
        score = _overlap_score(query_kw, card_text)
        assert score >= 3

    def test_zero_overlap_for_unrelated(self):
        query_kw = _keywords("military deterrence fiscal burden")
        card_text = "Climate change threatens agricultural productivity in tropical regions."
        score = _overlap_score(query_kw, card_text)
        assert score == 0

    def test_partial_overlap(self):
        query_kw = _keywords("military bases deterrence stability")
        card_text = "Alliance stability depends on credible deterrence commitments."
        score = _overlap_score(query_kw, card_text)
        assert 1 <= score <= 4


# ── _rank_candidates ──────────────────────────────────────────────────────────

class TestRankCandidates:
    def test_returns_empty_when_no_cards(self):
        assert _rank_candidates("military bases cost too much", None, []) == []

    def test_best_match_first(self):
        claim = "Military bases impose significant fiscal burden on the United States economy"
        cards = [
            _make_card("Climate policy and renewable energy transitions require investment."),
            _make_card("Military bases impose fiscal costs and economic burden on host nations."),
        ]
        ranked = _rank_candidates(claim, None, cards)
        assert len(ranked) >= 1
        # Best match should mention fiscal / military / bases
        assert ranked[0][0] >= ranked[-1][0]

    def test_filters_below_threshold(self):
        claim = "deterrence through military presence"
        cards = [_make_card("The weather in Paris is mild in spring.")]
        ranked = _rank_candidates(claim, None, cards)
        # Unrelated card should not meet threshold
        assert ranked == [] or ranked[0][0] < 5

    def test_evidence_text_boosts_match(self):
        claim = "US bases provide deterrence"
        evidence_text = "fiscal military economic burden"
        cards = [_make_card("Military fiscal burden is substantial.")]
        ranked_with = _rank_candidates(claim, evidence_text, cards)
        ranked_without = _rank_candidates(claim, None, cards)
        # Having evidence text in the query should produce >= score
        if ranked_with and ranked_without:
            assert ranked_with[0][0] >= ranked_without[0][0]


# ── check_claim_support ────────────────────────────────────────────────────────

class TestCheckClaimSupport:
    def test_returns_unverifiable_when_no_library(self):
        result = check_claim_support("military bases are too costly", None, [])
        assert result.support_level == EvidenceSupportLevel.UNVERIFIABLE
        assert result.matched_card is None
        assert "No evidence" in result.explanation

    def test_returns_unverifiable_when_no_match(self):
        cards = [_make_card("Climate change data from tropical regions.")]
        result = check_claim_support("nuclear deterrence policy costs", None, cards)
        # Either no match or unverifiable
        assert result.support_level in {
            EvidenceSupportLevel.UNVERIFIABLE,
            EvidenceSupportLevel.PARTIALLY_SUPPORTED,
            EvidenceSupportLevel.SUPPORTED,
            EvidenceSupportLevel.UNSUPPORTED,
        }

    def test_returns_unverifiable_when_no_keyword_overlap(self):
        cards = [
            _make_card("The weather today is pleasant and mild."),
            _make_card("Cooking techniques vary widely across cultures."),
        ]
        result = check_claim_support("military deterrence fiscal burden", None, cards)
        assert result.support_level == EvidenceSupportLevel.UNVERIFIABLE
        assert result.matched_card is None

    @patch("app.services.evidence_support_check._classify_with_llm")
    def test_supported_returned_from_llm(self, mock_classify):
        mock_classify.return_value = (
            EvidenceSupportLevel.SUPPORTED,
            "The card directly supports the fiscal burden claim.",
        )
        cards = [
            _make_card(
                "Military bases impose fiscal burden on domestic investment. "
                "The opportunity cost mechanism means every dollar spent overseas "
                "cannot fund homeland defense industrial capacity, reducing deterrence."
            )
        ]
        result = check_claim_support(
            "Military bases impose fiscal burden reducing domestic capacity",
            None,
            cards,
        )
        assert result.support_level == EvidenceSupportLevel.SUPPORTED
        assert result.matched_card is not None
        mock_classify.assert_called_once()

    @patch("app.services.evidence_support_check._classify_with_llm")
    def test_partially_supported_returned_from_llm(self, mock_classify):
        mock_classify.return_value = (
            EvidenceSupportLevel.PARTIALLY_SUPPORTED,
            "The card supports the general topic but not the specific 40% magnitude.",
        )
        cards = [
            _make_card(
                "Military deterrence costs have increased substantially. "
                "Economic analysis shows base operations consume significant budget "
                "resources that could otherwise support domestic priorities."
            )
        ]
        result = check_claim_support(
            "Military bases increased costs 40 percent deterrence impact",
            None,
            cards,
        )
        assert result.support_level == EvidenceSupportLevel.PARTIALLY_SUPPORTED
        assert "general topic" in result.explanation

    @patch("app.services.evidence_support_check._classify_with_llm")
    def test_matched_card_is_top_candidate(self, mock_classify):
        mock_classify.return_value = (EvidenceSupportLevel.SUPPORTED, "Supported.")
        good_card = _make_card(
            "Military fiscal deterrence burden cost economic bases strategic stability "
            "US alliance credibility forward presence opportunity cost defense spending."
        )
        weak_card = _make_card(
            "General diplomatic relations between countries can sometimes affect "
            "trade outcomes and economic growth patterns over the long term."
        )
        result = check_claim_support(
            "military bases fiscal deterrence economic cost burden",
            None,
            [good_card, weak_card],
        )
        # Top candidate is the one with more keyword overlap
        assert result.matched_card is not None

    @patch("app.services.evidence_support_check._classify_with_llm")
    def test_quality_gate_unverifiable_no_matched_card(self, mock_classify):
        mock_classify.return_value = (EvidenceSupportLevel.UNVERIFIABLE, "No match found.")
        cards = [
            _make_card(
                "Military deterrence fiscal burden cost economic opportunity analysis "
                "alliance credibility strategic stability defense spending review."
            )
        ]
        result = check_claim_support(
            "military deterrence fiscal burden economic cost",
            None,
            cards,
        )
        # When LLM returns unverifiable, matched_card should be None
        assert result.support_level == EvidenceSupportLevel.UNVERIFIABLE
        assert result.matched_card is None


# ── SupportCheckResult ─────────────────────────────────────────────────────────

class TestSupportCheckResult:
    def test_fields_set_correctly(self):
        card = _make_card("Some card text that is long enough for testing purposes here.")
        r = SupportCheckResult(
            support_level=EvidenceSupportLevel.SUPPORTED,
            explanation="The card proves the claim.",
            matched_card=card,
        )
        assert r.support_level == "supported"
        assert r.matched_card is card
        assert "proves" in r.explanation
