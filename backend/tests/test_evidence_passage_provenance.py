"""Phase 12B — passage provenance and source quality gate tests.

Covers:
- generate_card_draft(preferred_passage=...) anchors the saved card body to
  the exact passage the caller already ranked/scored, instead of letting the
  LLM/heuristic independently re-select from the whole article.
- _domain_from_url() normalizes common subdomain variants (www./m./amp.) so
  they count as one domain under the per-domain diversity cap.
- extraction_status_for_length() honestly tiers thin extractions instead of
  labeling any non-empty text "ok" (the GROBID path used to hardcode this).
- source_quality.py's length downgrade now applies even to high/medium
  domains — a trusted domain does not make a thin extraction trustworthy.
- Phase 12A save-integrity behavior (exact quote text, no rewriting) is
  unaffected by all of the above.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.models.research import ArticleMetadata, ExtractedArticle
from app.services.card_cutting import generate_card_draft
from app.services.research_search import _domain_from_url, extraction_status_for_length
from app.services.source_quality import rate_source_quality


# ── generate_card_draft(preferred_passage=...) ───────────────────────────────

class TestGenerateCardDraftPreferredPassage:
    ARTICLE_TEXT = (
        "Introductory throat-clearing about the site and unrelated boilerplate content here. "
        "A comprehensive IMF study found that tariffs increase consumer prices by 3.5 percent nationwide. "
        "The research demonstrates that protectionist policies reduce economic growth significantly overall. "
        "Unrelated closing remarks, navigation links, and newsletter signup text follow after this point."
    ) * 3

    RANKED_PASSAGE = (
        "A comprehensive IMF study found that tariffs increase consumer prices by 3.5 percent nationwide."
    )

    def _make_article(self, text: str | None = None) -> ExtractedArticle:
        return ExtractedArticle(
            url="https://imf.org/report",
            metadata=ArticleMetadata(
                url="https://imf.org/report", title="IMF Trade Report",
                author="IMF Staff", publication="IMF", published_date="2023-09-01",
            ),
            extracted_text=text or self.ARTICLE_TEXT,
            extraction_method="test",
            extraction_confidence=0.85,
            status="ok",
        )

    def test_uses_the_preferred_passage_verbatim_as_body_text(self):
        article = self._make_article()
        with patch("app.services.card_cutting._draft_with_llm") as mock_llm:
            draft = generate_card_draft(
                article=article, topic="trade", claim_goal="tariffs hurt economy",
                user_id="u1", preferred_passage=self.RANKED_PASSAGE,
            )
        assert draft["body_text"] == self.RANKED_PASSAGE

    def test_skips_the_llm_passage_selection_call_entirely(self):
        """No wasted LLM call (and no chance of it re-selecting something
        else) when the caller already knows which passage to cut."""
        article = self._make_article()
        with patch("app.services.card_cutting._draft_with_llm") as mock_llm:
            generate_card_draft(
                article=article, topic="trade", claim_goal="tariffs hurt economy",
                user_id="u1", preferred_passage=self.RANKED_PASSAGE,
            )
        mock_llm.assert_not_called()

    def test_citation_still_reflects_the_source_article(self):
        article = self._make_article()
        with patch("app.services.card_cutting._draft_with_llm"):
            draft = generate_card_draft(
                article=article, topic="trade", claim_goal="tariffs hurt economy",
                user_id="u1", preferred_passage=self.RANKED_PASSAGE,
            )
        assert draft["url"] == "https://imf.org/report"
        assert draft["publication"] == "IMF"
        assert draft["author"] == "IMF Staff"
        assert "IMF Staff" in draft["cite"]

    def test_a_fabricated_preferred_passage_is_ignored_not_trusted(self):
        """preferred_passage must be verified against the source — text that
        was never actually extracted must never become the card body."""
        article = self._make_article()
        with patch("app.services.card_cutting._draft_with_llm", return_value=None):
            draft = generate_card_draft(
                article=article, topic="trade", claim_goal="tariffs hurt economy",
                user_id="u1", preferred_passage="This sentence was never in the source article.",
            )
        assert draft["body_text"] != "This sentence was never in the source article."
        assert draft["body_text"] in article.extracted_text

    def test_absent_preferred_passage_behaves_exactly_as_before(self):
        """Regression: existing callers (URL/paste single-draft path) that
        never pass preferred_passage must see unchanged behavior."""
        article = self._make_article()
        with patch("app.services.card_cutting._draft_with_llm", return_value=None) as mock_llm:
            draft = generate_card_draft(
                article=article, topic="trade", claim_goal="tariffs hurt economy", user_id="u1",
            )
        mock_llm.assert_called_once()
        assert draft["body_text"] in article.extracted_text

    def test_empty_preferred_passage_is_treated_as_absent(self):
        article = self._make_article()
        with patch("app.services.card_cutting._draft_with_llm", return_value=None) as mock_llm:
            draft = generate_card_draft(
                article=article, topic="trade", claim_goal="tariffs hurt economy",
                user_id="u1", preferred_passage="   ",
            )
        mock_llm.assert_called_once()
        assert draft["body_text"] in article.extracted_text


# ── _domain_from_url diversity normalization ─────────────────────────────────

class TestDomainFromUrlNormalization:
    def test_bare_domain_unchanged(self):
        assert _domain_from_url("https://news.example.com/a") == "news.example.com"

    def test_www_prefix_stripped(self):
        assert _domain_from_url("https://www.news.example.com/b") == "news.example.com"

    def test_mobile_prefix_stripped(self):
        assert _domain_from_url("https://m.news.example.com/c") == "news.example.com"

    def test_amp_prefix_stripped(self):
        assert _domain_from_url("https://amp.news.example.com/d") == "news.example.com"

    def test_case_insensitive(self):
        assert _domain_from_url("https://WWW.News.Example.COM/e") == "news.example.com"

    def test_unrelated_subdomain_not_over_normalized(self):
        """Only the specific common prefixes are stripped — a genuinely
        different subdomain (e.g. a distinct blog subdomain) must not be
        silently collapsed into the parent domain."""
        assert _domain_from_url("https://blog.example.com/f") == "blog.example.com"

    def test_malformed_url_falls_back_without_crashing(self):
        assert _domain_from_url("not a url") == "not a url"


class TestDomainDiversityCapAcrossSubdomains:
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

    def test_subdomain_variants_of_the_same_site_share_the_domain_cap(self):
        from app.services.research_search import generate_candidate_cards

        search_results = [
            {"url": "https://news.example.com/a"},
            {"url": "https://www.news.example.com/b"},
            {"url": "https://m.news.example.com/c"},
            {"url": "https://distinct-outlet.org/d"},
        ]

        with patch("app.services.research_search.extract_article") as mock_extract, \
             patch("app.services.research_search.rate_source_quality") as mock_quality, \
             patch("app.services.research_search.generate_card_draft") as mock_draft:
            mock_extract.side_effect = lambda url: self._make_article(url)
            mock_quality.return_value = MagicMock(source_quality="high", credibility_notes="Good source")
            counter = [0]

            def fake_draft(**kwargs):
                counter[0] += 1
                return {
                    "user_id": "u1",
                    "url": kwargs["article"].url,
                    "body_text": self.LONG_TEXT[:200] + f" unique {counter[0]}",
                    "tag": f"Tag {counter[0]}",
                    "cite": "Staff Writer · News Outlet · 2023",
                    "status": "draft",
                    "draft_json": {},
                    "missing_metadata_json": {},
                    "generated_tag": True,
                    "extraction_confidence": 0.85,
                    "card_source_type": "research_search",
                    "highlighted_spans_json": [],
                    "underline_spans_json": [],
                }

            mock_draft.side_effect = fake_draft

            result = generate_candidate_cards(
                search_results=search_results,
                topic="trade",
                claim_to_support="tariffs hurt economic growth",
                side=None,
                user_id="u1",
                max_cards=4,
            )

        skipped_for_domain_limit = [
            s["url"] for s in result.sources_considered if s.get("reason") == "domain limit reached"
        ]
        # Exactly one of the three same-site variants should be capped (2 allowed).
        assert len(skipped_for_domain_limit) == 1
        # The genuinely distinct source must never be skipped for a domain reason.
        assert "https://distinct-outlet.org/d" not in skipped_for_domain_limit


# ── extraction_status_for_length (GROBID + any future extraction path) ──────

class TestExtractionStatusForLength:
    def test_full_length_text_is_ok(self):
        status, error = extraction_status_for_length(600)
        assert status == "ok"
        assert error is None

    def test_short_but_usable_text_is_partial_no_error(self):
        status, error = extraction_status_for_length(350)
        assert status == "partial"
        assert error is None

    def test_below_minimum_is_partial_with_explicit_error(self):
        status, error = extraction_status_for_length(50)
        assert status == "partial"
        assert error is not None
        assert "too short" in error.lower()

    def test_boundary_at_500_is_ok(self):
        status, _ = extraction_status_for_length(500)
        assert status == "ok"


# ── source_quality.py: thin extraction downgrades any domain ────────────────

class TestThinExtractionDowngradesAnyDomain:
    def test_thin_gov_extraction_is_downgraded_from_high(self):
        meta = ArticleMetadata(url="https://cdc.gov/report")
        result = rate_source_quality("https://cdc.gov/report", meta, "Too short.")
        assert result.source_quality == "low"
        assert any("short" in w.lower() for w in result.warnings)

    def test_thin_medium_domain_extraction_is_downgraded(self):
        meta = ArticleMetadata(url="https://nytimes.com/2024/article")
        result = rate_source_quality("https://nytimes.com/2024/article", meta, "Too short.")
        assert result.source_quality == "low"

    def test_full_length_gov_extraction_stays_high(self):
        """Regression: the downgrade only fires for genuinely thin text —
        a normal-length .gov extraction is unaffected."""
        meta = ArticleMetadata(url="https://cdc.gov/report")
        result = rate_source_quality("https://cdc.gov/report", meta, "A" * 500)
        assert result.source_quality == "high"
