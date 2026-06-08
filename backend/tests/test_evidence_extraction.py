"""Tests for the evidence_extraction service.

All tests are pure — no LLM calls (generate_summaries=False).
Validates heuristic tag/author/year extraction and the safety rule
that missing metadata fields are None (never invented).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from app.services.document_parsing import TextChunk
from app.services.evidence_extraction import (
    ExtractedCard,
    _extract_from_chunk,
    extract_evidence_cards,
    _MIN_CARD_CHARS,
)


def _make_chunk(text: str, index: int = 0, heading: str | None = None) -> TextChunk:
    return TextChunk(chunk_text=text, chunk_index=index, heading=heading)


# ── _extract_from_chunk ────────────────────────────────────────────────────────

class TestExtractFromChunk:
    def test_returns_none_for_short_chunk(self):
        chunk = _make_chunk("Short.")
        assert _extract_from_chunk(chunk) is None

    def test_extracts_author_and_year(self):
        text = (
            "Smith 2023 — The United States defense industrial base faces significant "
            "capacity constraints. Foreign Affairs reports that production shortfalls "
            "in key munitions categories reached crisis levels by 2022."
        )
        card = _extract_from_chunk(_make_chunk(text))
        assert card is not None
        assert card.author == "Smith"
        assert card.year == 2023

    def test_extracts_year_without_author(self):
        text = (
            "Research published in 2022 demonstrates that military basing costs have "
            "increased by 40 percent over the prior decade, creating fiscal pressure "
            "on domestic defense investment priorities across all service branches."
        )
        card = _extract_from_chunk(_make_chunk(text))
        assert card is not None
        assert card.year == 2022
        assert card.author is None

    def test_attribution_complete_requires_author_and_year(self):
        # Author + year → complete
        text_complete = (
            "Jones 2021 — Military forward presence generates significant alliance "
            "stability benefits that cannot be replicated by over-the-horizon force "
            "posture, according to this comprehensive review of deterrence scholarship."
        )
        card = _extract_from_chunk(_make_chunk(text_complete))
        assert card is not None
        assert card.attribution_complete is True

    def test_attribution_incomplete_without_author(self):
        text_no_author = (
            "Studies from 2020 indicate that alliance credibility depends on forward "
            "presence, but the specific mechanism by which presence affects deterrence "
            "stability remains contested in the scholarly literature on coercive diplomacy."
        )
        card = _extract_from_chunk(_make_chunk(text_no_author))
        assert card is not None
        assert card.attribution_complete is False

    def test_attribution_incomplete_without_year(self):
        text_no_year = (
            "Thompson argues that deterrence theory requires physical presence to be "
            "credible and that offshore balancing cannot substitute for forward deployed "
            "forces when adversaries are testing alliance commitments in real time."
        )
        card = _extract_from_chunk(_make_chunk(text_no_year))
        assert card is not None
        assert card.attribution_complete is False

    def test_heading_used_as_tag(self):
        chunk = _make_chunk(
            "This argument is that military presence deters aggression. "
            "Studies consistently show that forward deployed forces reduce conflict "
            "probability by signaling resolve to potential adversaries in the region.",
            heading="TAG: Deterrence Solves",
        )
        card = _extract_from_chunk(chunk)
        assert card is not None
        assert card.tag and "Deterrence" in card.tag

    def test_no_invented_source(self):
        # Text with no recognizable source — source should be None
        text = (
            "The policy under review would have significant consequences for regional "
            "stability and alliance credibility, as demonstrated by the historical "
            "record of deterrence success since 1945 in the context of alliances."
        )
        card = _extract_from_chunk(_make_chunk(text))
        # source may or may not be detected — but should never be invented
        if card is not None:
            # Any detected source must appear verbatim in the text
            if card.source:
                assert card.source.lower() in text.lower()

    def test_card_text_equals_chunk_text(self):
        text = (
            "Chang 2022 — Economic interdependence reduces conflict risk. The mechanism "
            "is that trade relationships create mutual vulnerabilities that make conflict "
            "costly for both sides, deterring aggression through material incentives."
        )
        card = _extract_from_chunk(_make_chunk(text))
        assert card is not None
        assert card.card_text == text.strip()


# ── extract_evidence_cards ─────────────────────────────────────────────────────

class TestExtractEvidenceCards:
    def test_extracts_multiple_cards(self):
        chunks = [
            _make_chunk(
                "Smith 2022 — Military bases impose significant fiscal costs. "
                "The Congressional Budget Office estimates forward presence costs "
                "exceed 150 billion dollars annually when all factors are included.",
                index=0,
            ),
            _make_chunk("Too short.", index=1),
            _make_chunk(
                "Jones 2023 — Regional stability depends on credible deterrence. "
                "The Brookings Institution finds that alliance guarantees backed by "
                "physical presence reduce conflict probability by 30 percent on average.",
                index=2,
            ),
        ]
        cards = extract_evidence_cards(chunks, generate_summaries=False)
        assert len(cards) == 2

    def test_skips_short_chunks(self):
        chunks = [
            _make_chunk("Too short.", index=0),
            _make_chunk("Also short.", index=1),
        ]
        cards = extract_evidence_cards(chunks, generate_summaries=False)
        assert cards == []

    def test_empty_chunk_list(self):
        cards = extract_evidence_cards([], generate_summaries=False)
        assert cards == []

    def test_never_invents_author_in_missing_case(self):
        text = (
            "Economic costs of military basing are substantial and growing. "
            "The infrastructure maintenance burden alone accounts for a significant "
            "portion of the defense budget each year according to published accounts."
        )
        cards = extract_evidence_cards([_make_chunk(text)], generate_summaries=False)
        if cards:
            # author may be None but must never be a made-up name
            if cards[0].author:
                assert cards[0].author.lower() in text.lower() or \
                       any(w in text for w in cards[0].author.split())

    def test_card_chunk_index_matches(self):
        chunks = [
            _make_chunk(
                "Smith 2020 — Long body text about deterrence stability and military "
                "presence providing meaningful benefits that exceed alternative strategies.",
                index=5,
            )
        ]
        cards = extract_evidence_cards(chunks, generate_summaries=False)
        assert cards
        assert cards[0].chunk_index == 5

    def test_all_returned_cards_meet_min_length(self):
        # Even if a chunk barely meets the threshold, returned card_text should be substantial
        chunks = [
            _make_chunk("x " * 60 + "long enough paragraph text here for extraction.", index=i)
            for i in range(3)
        ]
        cards = extract_evidence_cards(chunks, generate_summaries=False)
        for card in cards:
            assert len(card.card_text) >= _MIN_CARD_CHARS
