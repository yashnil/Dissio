"""Phase 12C — extraction health, wasted-work reduction, and failure clarity.

Covers:
- build_fallback_extracted_article() gives GROBID and Firecrawl identical,
  length-honest status/error tiering (the fix already applied to GROBID in
  Phase 12B, now shared and applied to Firecrawl too).
- The research_source_id reload path recomputes status from stored text
  length instead of truthiness, so a thin saved source doesn't silently
  read back as full-quality "ok".
- Duplicate chunks are rejected before the expensive LLM role-classification
  call, not after — no wasted LLM spend on content already ruled out.
- A new, honest no-card failure reason when every candidate passage was a
  near-duplicate of another.
- Phase 12A save-integrity and Phase 12B passage-provenance behavior are
  unaffected (re-verified here, not just re-run).
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.models.research import ArticleMetadata, ExtractedArticle
from app.services.card_cutting import generate_card_draft, is_verbatim_ellipsis_cut
from app.services.research_search import (
    build_fallback_extracted_article,
    extraction_status_for_length,
)


# ── build_fallback_extracted_article: GROBID + Firecrawl parity ─────────────

class TestBuildFallbackExtractedArticle:
    def test_full_length_text_is_ok(self):
        article = build_fallback_extracted_article(
            url="https://example.com/p.pdf", metadata=ArticleMetadata(url="https://example.com/p.pdf"),
            extracted_text="A" * 600, extraction_method="grobid", extraction_confidence=0.85,
        )
        assert article.status == "ok"
        assert article.error is None

    def test_thin_grobid_text_is_partial_not_ok(self):
        """The exact scenario the Phase 12B GROBID fix targeted: an
        abstract-only parse must not be labeled "ok"."""
        article = build_fallback_extracted_article(
            url="https://example.com/p.pdf", metadata=ArticleMetadata(url="https://example.com/p.pdf"),
            extracted_text="A" * 250, extraction_method="grobid", extraction_confidence=0.85,
        )
        assert article.status == "partial"

    def test_thin_firecrawl_text_is_partial_not_ok(self):
        """Firecrawl gets the identical honesty treatment as GROBID — this
        is the Phase 12C fix: previously Firecrawl hardcoded status="ok"."""
        article = build_fallback_extracted_article(
            url="https://example.com/a", metadata=ArticleMetadata(url="https://example.com/a"),
            extracted_text="B" * 210, extraction_method="firecrawl", extraction_confidence=0.6,
        )
        assert article.status == "partial"
        assert article.error is None  # above the hard floor, just below the "ok" tier

    def test_below_hard_floor_firecrawl_text_has_explicit_error(self):
        article = build_fallback_extracted_article(
            url="https://example.com/a", metadata=ArticleMetadata(url="https://example.com/a"),
            extracted_text="C" * 60, extraction_method="firecrawl", extraction_confidence=0.6,
        )
        assert article.status == "partial"
        assert article.error is not None
        assert "too short" in article.error.lower()

    def test_grobid_and_firecrawl_agree_at_the_same_length(self):
        """Two different extractors, same text length, must produce the
        same status — extraction method identity shouldn't matter, only
        how much usable text actually came back."""
        common_text = "D" * 300
        grobid_article = build_fallback_extracted_article(
            url="https://a.com/x", metadata=ArticleMetadata(url="https://a.com/x"),
            extracted_text=common_text, extraction_method="grobid", extraction_confidence=0.85,
        )
        firecrawl_article = build_fallback_extracted_article(
            url="https://b.com/y", metadata=ArticleMetadata(url="https://b.com/y"),
            extracted_text=common_text, extraction_method="firecrawl", extraction_confidence=0.6,
        )
        assert grobid_article.status == firecrawl_article.status == "partial"

    def test_extraction_confidence_is_untouched_by_status_tiering(self):
        """Confidence is a method-quality signal, not a length signal —
        the helper must not conflate them."""
        article = build_fallback_extracted_article(
            url="https://example.com/a", metadata=ArticleMetadata(url="https://example.com/a"),
            extracted_text="E" * 60, extraction_method="firecrawl", extraction_confidence=0.6,
        )
        assert article.extraction_confidence == 0.6


class TestExtractionStatusForLengthConsistency:
    """Sanity check that the shared helper (already unit-tested in Phase
    12B) is what build_fallback_extracted_article actually delegates to."""

    def test_matches_direct_helper_call(self):
        status, error = extraction_status_for_length(150)
        article = build_fallback_extracted_article(
            url="https://x.com", metadata=ArticleMetadata(url="https://x.com"),
            extracted_text="F" * 150, extraction_method="firecrawl", extraction_confidence=0.6,
        )
        assert article.status == status
        assert article.error == error


# ── research_source_id reload status honesty ─────────────────────────────────

class TestReloadedSourceStatusHonesty:
    """create_card_draft's research_source_id branch (backend/app/api/research.py)
    must recompute status from the stored text length, not just truthiness."""

    def test_thin_reloaded_source_is_partial_not_ok(self):
        import asyncio
        from app.api.research import create_card_draft
        from app.models.research import CardDraftRequest

        thin_text = "G" * 210
        fake_row = {
            "id": "src-1", "url": "https://example.com/thin", "title": "Thin Source",
            "author": None, "publication": None, "published_date": None,
            "extracted_text": thin_text, "extraction_metadata_json": {"confidence": 0.7},
            "source_quality": "medium",
        }
        fake_sb = MagicMock()
        fake_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = \
            MagicMock(data=[fake_row])
        fake_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{"id": "draft-1"}])
        fake_sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])

        captured = {}

        def fake_generate_card_draft(article, **kwargs):
            captured["status"] = article.status
            captured["error"] = article.error
            return {
                "user_id": "u1", "url": article.url, "topic": "t", "claim_goal": "c", "side": None,
                "tag": "Tag", "cite": "Cite", "body_text": thin_text,
                "highlighted_spans_json": [], "underline_spans_json": [],
                "author": None, "publication": None, "title": None, "published_date": None,
                "warrant_summary": None, "impact_summary": None, "source_quality": "medium",
                "credibility_notes": None, "extraction_confidence": 0.7, "generated_tag": True,
                "missing_metadata_json": {}, "draft_json": {}, "card_source_type": "url",
                "status": "draft", "slot_id": "", "slot_label": "",
            }

        with patch("app.api.research.get_supabase", return_value=fake_sb), \
             patch("app.api.research.generate_card_draft", side_effect=fake_generate_card_draft):
            body = CardDraftRequest(user_id="u1", research_source_id="src-1", topic="t", claim_goal="c")
            asyncio.run(create_card_draft(body))

        assert captured["status"] == "partial"

    def test_full_length_reloaded_source_is_ok(self):
        import asyncio
        from app.api.research import create_card_draft
        from app.models.research import CardDraftRequest

        full_text = "H" * 600
        fake_row = {
            "id": "src-2", "url": "https://example.com/full", "title": "Full Source",
            "author": "A. Writer", "publication": "Outlet", "published_date": "2024-01-01",
            "extracted_text": full_text, "extraction_metadata_json": {"confidence": 0.8},
            "source_quality": "high",
        }
        fake_sb = MagicMock()
        fake_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = \
            MagicMock(data=[fake_row])
        fake_sb.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[{"id": "draft-2"}])
        fake_sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])

        captured = {}

        def fake_generate_card_draft(article, **kwargs):
            captured["status"] = article.status
            return {
                "user_id": "u1", "url": article.url, "topic": "t", "claim_goal": "c", "side": None,
                "tag": "Tag", "cite": "Cite", "body_text": full_text,
                "highlighted_spans_json": [], "underline_spans_json": [],
                "author": None, "publication": None, "title": None, "published_date": None,
                "warrant_summary": None, "impact_summary": None, "source_quality": "high",
                "credibility_notes": None, "extraction_confidence": 0.8, "generated_tag": True,
                "missing_metadata_json": {}, "draft_json": {}, "card_source_type": "url",
                "status": "draft", "slot_id": "", "slot_label": "",
            }

        with patch("app.api.research.get_supabase", return_value=fake_sb), \
             patch("app.api.research.generate_card_draft", side_effect=fake_generate_card_draft):
            body = CardDraftRequest(user_id="u1", research_source_id="src-2", topic="t", claim_goal="c")
            asyncio.run(create_card_draft(body))

        assert captured["status"] == "ok"


# ── Duplicate rejection happens before the expensive LLM classification ─────

class TestDuplicateRejectedBeforeClassification:
    LONG_TEXT = (
        "A comprehensive study by the IMF found that tariffs increase consumer prices by 3.5 percent. "
        "The research demonstrates that protectionist policies reduce economic growth significantly. "
        "Data from 2023 confirms the impact on global supply chains was substantial and lasting. "
        "Countries adopting high tariffs therefore see reduced GDP growth rates over time. "
    ) * 8

    def _make_article(self, url: str) -> ExtractedArticle:
        return ExtractedArticle(
            url=url,
            metadata=ArticleMetadata(
                url=url, title="Trade Study", author="Staff Writer",
                publication="News Outlet", published_date="2023-09-01",
            ),
            extracted_text=self.LONG_TEXT,
            extraction_method="test",
            extraction_confidence=0.85,
            status="ok",
        )

    def test_llm_classification_is_never_called_for_a_duplicate_chunk(self):
        """Two URLs return byte-identical article text. The second URL's
        chunks are exact/near-duplicates of the first's already-accepted
        chunk — _classify_role_with_llm must never be reached for them."""
        from app.services.research_search import generate_candidate_cards

        search_results = [
            {"url": "https://a.example.com/1"},
            {"url": "https://b.example.com/2"},
        ]

        from app.services.research_search import EvidenceRoleOutput

        with patch("app.services.research_search.extract_article") as mock_extract, \
             patch("app.services.research_search.rate_source_quality") as mock_quality, \
             patch("app.services.research_search.generate_card_draft") as mock_draft, \
             patch("app.services.research_search._classify_role_with_llm") as mock_classify:
            mock_extract.side_effect = lambda url: self._make_article(url)
            mock_quality.return_value = MagicMock(source_quality="high", credibility_notes="Good source")
            mock_classify.return_value = EvidenceRoleOutput(
                evidence_role="direct_support",
                debate_usefulness_score=8.0,
                best_supported_claim="Tariffs hurt economic growth",
                safe_tag_scope="Tariffs hurt economic growth",
            )
            def fake_draft(*, article, preferred_passage=None, **kwargs):
                # Mirrors production: body_text tracks the actual ranked
                # chunk (Phase 12B's preferred_passage), so existing_bodies
                # accumulates the REAL accepted chunk — otherwise this test
                # would compare the second URL's real chunk against an
                # unrelated fixed string and the dedup check would (falsely)
                # never trigger, making the test meaningless either way.
                return {
                    "user_id": "u1", "url": article.url,
                    "body_text": preferred_passage or self.LONG_TEXT[:200],
                    "tag": "Tag", "cite": "Cite",
                    "status": "draft", "draft_json": {}, "missing_metadata_json": {},
                    "generated_tag": True, "extraction_confidence": 0.85,
                    "card_source_type": "research_search",
                    "highlighted_spans_json": [], "underline_spans_json": [],
                }
            mock_draft.side_effect = fake_draft

            generate_candidate_cards(
                search_results=search_results, topic="trade",
                claim_to_support="tariffs hurt economic growth",
                side=None, user_id="u1", max_cards=4, use_llm=True,
            )

        # Exactly one classification call — the first URL's first chunk.
        # The second URL's chunks are near-identical to the already-accepted
        # body and must be rejected as duplicates before ever reaching
        # classification.
        assert mock_classify.call_count <= 1


# ── No-card reason: duplicate-dominant scenario ──────────────────────────────
#
# determine_failure_reason() (search_trace.py) is the authoritative source of
# no_card_reason text — build_search_trace() always populates failure_detail,
# and the generate-cards endpoint only falls back to its own legacy cascade
# when failure_detail is empty (which it practically never is). So the real
# fix belongs here, not in a second copy of the cascade.

class TestDuplicateDominantFailureReason:
    def _base_kwargs(self, **overrides):
        kwargs = dict(
            sources_found=3, sources_attempted=3, sources_extracted=3,
            passages_considered=3, filtered_no_support=0, filtered_low_quality=0,
            rejected_by_source_quality=0, rejected_by_missing_best_claim=0,
            counter_evidence_count=0, candidates_generated=0, tavily_errors=[],
        )
        kwargs.update(overrides)
        return kwargs

    def test_reason_code_and_message_when_dedup_is_the_only_cause(self):
        from app.services.search_trace import determine_failure_reason

        reason, detail, _, recovery = determine_failure_reason(
            **self._base_kwargs(passages_deduplicated=3),
        )
        assert reason == "duplicate_passages_only"
        assert "duplicate" in detail.lower()
        assert "3" in detail
        assert recovery  # honest, non-empty next steps

    def test_generic_reason_when_dedup_is_zero(self):
        """Regression: without any dedup signal, the existing generic
        catch-all (claim_not_supported) must still fire unchanged."""
        from app.services.search_trace import determine_failure_reason

        reason, _, _, _ = determine_failure_reason(
            **self._base_kwargs(passages_deduplicated=0),
        )
        assert reason == "claim_not_supported"

    def test_no_relevant_passages_still_takes_priority_over_dedup(self):
        """If passages were BOTH deduplicated and explicitly filtered as not
        relevant, the more specific no_relevant_passages stage still wins —
        dedup is only diagnosed when it's the sole explanation."""
        from app.services.search_trace import determine_failure_reason

        reason, _, _, _ = determine_failure_reason(
            **self._base_kwargs(passages_deduplicated=2, filtered_no_support=1),
        )
        assert reason == "no_relevant_passages"

    def test_build_search_trace_forwards_dedup_into_failure_reason(self):
        """End-to-end through the public trace builder, not just the
        internal selector."""
        from app.services.search_trace import build_search_trace

        trace = build_search_trace(
            queries_run=["tariffs hurt growth"],
            roles_attempted=[],
            sources_found=3, sources_attempted=3, sources_extracted=3,
            passages_considered=3, filtered_no_support=0, filtered_low_quality=0,
            rejected_by_source_quality=0, rejected_by_missing_best_claim=0,
            counter_evidence_count=0, candidates_generated=0, tavily_errors=[],
            possible_lead_urls=[], cards_produced=0,
            passages_deduplicated=3,
        )
        assert trace.failure_reason == "duplicate_passages_only"
        assert "duplicate" in trace.failure_detail.lower()


# ── Phase 12A / 12B guarantees unaffected ────────────────────────────────────

class TestPriorPhaseGuaranteesUnaffected:
    def test_verbatim_ellipsis_cut_check_still_rejects_rewrites(self):
        original = "Tariffs increase consumer prices according to the IMF study."
        assert is_verbatim_ellipsis_cut("Tariffs raise prices, the IMF found.", original) is False
        assert is_verbatim_ellipsis_cut(original, original) is True

    def test_preferred_passage_still_anchors_the_saved_body(self):
        article = ExtractedArticle(
            url="https://imf.org/report",
            metadata=ArticleMetadata(url="https://imf.org/report", title="IMF Report"),
            extracted_text=(
                "Boilerplate navigation text here. "
                "A comprehensive IMF study found that tariffs increase consumer prices nationwide. "
                "Unrelated closing remarks follow after this point."
            ),
            extraction_method="test", extraction_confidence=0.85, status="ok",
        )
        ranked_passage = "A comprehensive IMF study found that tariffs increase consumer prices nationwide."
        with patch("app.services.card_cutting._draft_with_llm") as mock_llm:
            draft = generate_card_draft(
                article=article, topic="trade", claim_goal="tariffs hurt economy",
                user_id="u1", preferred_passage=ranked_passage,
            )
        assert draft["body_text"] == ranked_passage
        mock_llm.assert_not_called()
