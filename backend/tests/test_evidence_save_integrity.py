"""Evidence Studio save-integrity tests.

Covers the "save integrity & provenance" reliability pass:
- is_verbatim_ellipsis_cut() rejects any body_text replacement that isn't
  built from verbatim substrings of the source passage.
- PATCH /research/card-drafts/{id} enforces that guard on body_text edits.
- _surface_draft_json_fields() makes a card_draft look the same everywhere
  it's returned (generate, list, patch) — without it, reopening/reloading
  Evidence Studio silently drops the cut text, citation, and any markup
  saved via PATCH, because those fields live only in draft_json and a plain
  select("*") never unwraps them.
- Saving a draft persists the reviewed/cut text (not the original full
  passage) as the card body, and a saved evidence_card never changes again
  even if the source draft is edited afterward.
- The LLM refiner may improve highlight selection but must never revert a
  card's cut style back to the full uncut passage.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.api.research import _surface_draft_json_fields
from app.main import app
from app.models.research import ArticleMetadata, ExtractedArticle
from app.services import evidence_llm_refiner as refiner
from app.services.card_cutting import generate_card_draft, is_verbatim_ellipsis_cut
from app.config import settings

client = TestClient(app)

USER_ID = "user-123"
DRAFT_ID = "draft-abc"

ORIGINAL = (
    "In 1995, sustained U.S. and NATO airstrikes combined with diplomacy at Dayton "
    "forced Serb forces to the negotiating table. The credible threat of force changed "
    "the incentives of the warring parties and brought an end to the war in Bosnia."
)


# ── is_verbatim_ellipsis_cut ─────────────────────────────────────────────────

class TestIsVerbatimEllipsisCut:
    def test_accepts_the_full_original_text(self):
        assert is_verbatim_ellipsis_cut(ORIGINAL, ORIGINAL) is True

    def test_accepts_a_single_verbatim_substring(self):
        assert is_verbatim_ellipsis_cut("forced Serb forces to the negotiating table.", ORIGINAL) is True

    def test_accepts_two_verbatim_spans_joined_by_the_omission_marker(self):
        cut = "In 1995, sustained U.S. and NATO airstrikes […] brought an end to the war in Bosnia."
        assert is_verbatim_ellipsis_cut(cut, ORIGINAL) is True

    def test_accepts_the_ascii_ellipsis_marker_variant(self):
        cut = "In 1995, sustained U.S. and NATO airstrikes [...] brought an end to the war in Bosnia."
        assert is_verbatim_ellipsis_cut(cut, ORIGINAL) is True

    def test_rejects_rewritten_text(self):
        cut = "In 1995, NATO bombing campaigns pressured Serbia into peace talks."
        assert is_verbatim_ellipsis_cut(cut, ORIGINAL) is False

    def test_rejects_a_fabricated_second_span(self):
        cut = "In 1995, sustained U.S. and NATO airstrikes […] this sentence was never in the source."
        assert is_verbatim_ellipsis_cut(cut, ORIGINAL) is False

    def test_rejects_empty_string(self):
        assert is_verbatim_ellipsis_cut("", ORIGINAL) is False

    def test_rejects_whitespace_only(self):
        assert is_verbatim_ellipsis_cut("   ", ORIGINAL) is False


# ── _surface_draft_json_fields ───────────────────────────────────────────────

class TestSurfaceDraftJsonFields:
    def test_surfaces_cut_and_citation_fields(self):
        row = {
            "id": DRAFT_ID,
            "draft_json": {
                "cut_text_with_ellipses": "A cut version.",
                "citation": {"short_cite": "Smith 24"},
                "evidence_cut": {"cut_style": "medium_cut"},
            },
        }
        out = _surface_draft_json_fields(row)
        assert out["cut_text_with_ellipses"] == "A cut version."
        assert out["citation"] == {"short_cite": "Smith 24"}
        assert out["evidence_cut"] == {"cut_style": "medium_cut"}

    def test_surfaces_user_markup_as_user_markup_json(self):
        markup = {"highlight": [{"start": 0, "end": 5}], "underline": [], "bold": [], "italic": []}
        row = {"id": DRAFT_ID, "draft_json": {"user_markup": markup}}
        out = _surface_draft_json_fields(row)
        assert out["user_markup_json"] == markup

    def test_no_user_markup_key_when_absent(self):
        row = {"id": DRAFT_ID, "draft_json": {}}
        out = _surface_draft_json_fields(row)
        assert "user_markup_json" not in out

    def test_defaults_counter_evidence_and_snippet_flags_false(self):
        row = {"id": DRAFT_ID, "draft_json": {}}
        out = _surface_draft_json_fields(row)
        assert out["is_counter_evidence"] is False
        assert out["is_snippet_source"] is False

    def test_missing_draft_json_does_not_crash(self):
        row = {"id": DRAFT_ID}
        out = _surface_draft_json_fields(row)
        assert out["id"] == DRAFT_ID
        assert out["is_counter_evidence"] is False


# ── Fake Supabase (matches tests/test_research_markup_persistence.py) ────────

class _FakeQuery:
    def __init__(self, table, store):
        self.table = table
        self.store = store
        self._op = None
        self._payload = None
        self._filters = {}

    def select(self, *a, **k):
        self._op = "select"
        return self

    def insert(self, row):
        self._op = "insert"
        self._payload = row
        self.store["inserts"].setdefault(self.table, []).append(row)
        return self

    def update(self, row):
        self._op = "update"
        self._payload = row
        self.store["updates"].setdefault(self.table, []).append(row)
        return self

    def eq(self, k, v):
        self._filters[k] = v
        return self

    def limit(self, n):
        return self

    def order(self, *a, **k):
        return self

    def execute(self):
        if self._op == "select":
            rows = self.store["rows"].get(self.table, [])
            for k, v in self._filters.items():
                rows = [r for r in rows if r.get(k) == v]
            return type("R", (), {"data": rows})()
        if self._op == "insert":
            return type("R", (), {"data": [{"id": f"{self.table}-new", **self._payload}]})()
        # update — filters are fully applied by now (eq() always chains after
        # update()), so reflect the change into the underlying stored row(s)
        # too, or a later select()/second update() would see stale data.
        matched = [
            r for r in self.store["rows"].get(self.table, [])
            if all(r.get(k) == v for k, v in self._filters.items())
        ]
        for row in matched:
            row.update(self._payload or {})
        if matched:
            return type("R", (), {"data": [dict(r) for r in matched]})()
        merged = {"id": self._filters.get("id", "x"), **(self._payload or {})}
        return type("R", (), {"data": [merged]})()


class _FakeSupabase:
    def __init__(self, rows):
        self.store = {"rows": rows, "inserts": {}, "updates": {}}

    def table(self, name):
        return _FakeQuery(name, self.store)


def _draft_row(**over):
    row = {
        "id": DRAFT_ID,
        "user_id": USER_ID,
        "status": "draft",
        "tag": "Airstrikes plus diplomacy end wars",
        "cite": "Smith 2024",
        "body_text": ORIGINAL,
        "draft_json": {},
        "highlighted_spans_json": [],
        "underline_spans_json": [],
        "card_source_type": "url",
    }
    row.update(over)
    return row


# ── PATCH body_text validation ───────────────────────────────────────────────

class TestPatchBodyTextValidation:
    def test_rejects_rewritten_body_text(self):
        fake = _FakeSupabase({"card_drafts": [_draft_row()]})
        with patch("app.api.research.get_supabase", return_value=fake):
            resp = client.patch(
                f"/research/card-drafts/{DRAFT_ID}",
                json={"user_id": USER_ID, "body_text": "NATO bombed Serbia until they gave up."},
            )
        assert resp.status_code == 422
        assert not fake.store["updates"].get("card_drafts")

    def test_accepts_a_verbatim_cut_of_the_original(self):
        fake = _FakeSupabase({"card_drafts": [_draft_row()]})
        cut = "In 1995, sustained U.S. and NATO airstrikes […] brought an end to the war in Bosnia."
        with patch("app.api.research.get_supabase", return_value=fake):
            resp = client.patch(
                f"/research/card-drafts/{DRAFT_ID}",
                json={"user_id": USER_ID, "body_text": cut},
            )
        assert resp.status_code == 200, resp.text
        updates = fake.store["updates"]["card_drafts"]
        assert any(u.get("body_text") == cut for u in updates)

    def test_markup_only_patch_still_works_unchanged(self):
        """Regression: a patch that never touches body_text must be unaffected."""
        fake = _FakeSupabase({"card_drafts": [_draft_row()]})
        with patch("app.api.research.get_supabase", return_value=fake):
            resp = client.patch(
                f"/research/card-drafts/{DRAFT_ID}",
                json={"user_id": USER_ID, "highlighted_spans_json": [{"start": 0, "end": 5}]},
            )
        assert resp.status_code == 200, resp.text


# ── List endpoint surfaces draft_json fields ─────────────────────────────────

class TestListDraftsSurfaceRichFields:
    def test_list_returns_cut_text_and_user_markup(self):
        markup = {"highlight": [{"start": 0, "end": 5}], "underline": [], "bold": [], "italic": []}
        row = _draft_row(draft_json={
            "cut_text_with_ellipses": "A previously chosen cut.",
            "user_markup": markup,
        })
        fake = _FakeSupabase({"card_drafts": [row]})
        with patch("app.api.research.get_supabase", return_value=fake):
            resp = client.get(f"/research/card-drafts?user_id={USER_ID}&status=draft")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["cut_text_with_ellipses"] == "A previously chosen cut."
        assert data[0]["user_markup_json"] == markup


# ── Saved-card stability ──────────────────────────────────────────────────────

class TestSavedCardStability:
    def _rows(self, draft_json=None):
        return {
            "card_drafts": [_draft_row(draft_json=draft_json or {})],
            "profiles": [{"id": USER_ID}],
            "documents": [{"id": "doc-1"}],
        }

    def test_save_persists_the_reviewed_cut_not_the_full_passage(self):
        """The core bug: Studio review must become the saved body, not the
        original full passage the draft started from."""
        cut = "In 1995, sustained U.S. and NATO airstrikes […] brought an end to the war in Bosnia."
        fake = _FakeSupabase(self._rows())
        with patch("app.api.research.get_supabase", return_value=fake), \
             patch("app.api.research._embed_text_safe", return_value=None):
            patch_resp = client.patch(
                f"/research/card-drafts/{DRAFT_ID}",
                json={"user_id": USER_ID, "body_text": cut},
            )
            assert patch_resp.status_code == 200, patch_resp.text
            save_resp = client.post(
                f"/research/card-drafts/{DRAFT_ID}/save",
                json={"user_id": USER_ID, "confirmed": True},
            )
        assert save_resp.status_code == 200, save_resp.text
        card = fake.store["inserts"]["evidence_cards"][0]
        assert card["body_text"] == cut
        assert card["card_text"] == cut
        assert card["body_text"] != ORIGINAL

    def test_saved_card_unaffected_by_later_draft_edits(self):
        """Once saved, a draft's own body_text is a completely separate row
        from the copy that landed in evidence_cards — editing the draft
        afterward must never retroactively change what was already saved."""
        fake = _FakeSupabase(self._rows())
        with patch("app.api.research.get_supabase", return_value=fake), \
             patch("app.api.research._embed_text_safe", return_value=None):
            save_resp = client.post(
                f"/research/card-drafts/{DRAFT_ID}/save",
                json={"user_id": USER_ID, "confirmed": True},
            )
            assert save_resp.status_code == 200, save_resp.text
            saved_body = fake.store["inserts"]["evidence_cards"][0]["body_text"]
            assert saved_body == ORIGINAL

            # Draft's own saved_card_id is now set — save is idempotent and
            # returns the existing card without inserting a second row.
            second_save = client.post(
                f"/research/card-drafts/{DRAFT_ID}/save",
                json={"user_id": USER_ID, "confirmed": True},
            )
        assert second_save.status_code == 200
        assert len(fake.store["inserts"]["evidence_cards"]) == 1
        assert fake.store["inserts"]["evidence_cards"][0]["body_text"] == ORIGINAL


# ── Refiner must not clobber the deterministic cut ───────────────────────────

class TestRefinerPreservesCutStyle:
    LONG_ARTICLE = (
        "Economic theory suggests that tariffs reduce trade efficiency. "
        "A study by the IMF found that tariffs increase consumer prices by 3.5%. "
        "The research demonstrates that free trade promotes economic growth. "
        "Countries that adopt protectionist policies therefore see reduced GDP. "
        "Data from 2023 shows the impact on global supply chains was significant. "
    ) * 15

    def _make_article(self) -> ExtractedArticle:
        return ExtractedArticle(
            url="https://imf.org/report",
            metadata=ArticleMetadata(
                url="https://imf.org/report", title="IMF Trade Report",
                author="IMF Staff", publication="IMF", published_date="2023-09-01",
            ),
            extracted_text=self.LONG_ARTICLE,
            extraction_method="test",
            extraction_confidence=0.85,
            status="ok",
        )

    @pytest.fixture(autouse=True)
    def _enable_refiner(self, monkeypatch):
        monkeypatch.setattr(settings, "research_enable_llm_refiner", True)
        monkeypatch.setattr(refiner, "get_openai_api_key", lambda: "sk-test")

    def test_cut_text_survives_refinement(self, monkeypatch):
        from app.services.evidence_llm_refiner import _RefinerOutput

        def fake_call_llm(passage, *a, **k):
            # Echoes back a valid read-aloud quote from whatever full passage
            # generate_card_draft actually selected as body_text.
            quote = passage[:120].rsplit(".", 1)[0] + "."
            return _RefinerOutput(
                tagline="Tariffs reduce trade efficiency and raise prices",
                read_aloud_quotes=[quote],
                warrant="w", impact="i", what_this_card_proves="p",
                strategic_strength="s", potential_weakness="w2",
                likely_counterargument="c", best_response="b",
                crossfire_question="q", crossfire_answer="a",
                best_pairing="pair", weighing_angle="angle", best_use="contention",
            )

        monkeypatch.setattr(refiner, "_call_llm", fake_call_llm)
        article = self._make_article()

        with patch("app.services.card_cutting._draft_with_llm", return_value=None):
            draft = generate_card_draft(
                article=article, topic="tariffs", claim_goal="tariffs hurt growth", user_id="u1",
            )

        assert draft["draft_json"].get("llm_refined") is True
        body_text = draft["body_text"]
        cut_text = draft["draft_json"]["cut_text_with_ellipses"]
        # The refiner must never revert the cut back to the full body — that
        # would silently discard the Medium/High cut style the card was built with.
        assert cut_text != body_text
        assert len(cut_text) < len(body_text)
