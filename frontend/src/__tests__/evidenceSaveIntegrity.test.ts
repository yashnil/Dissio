/**
 * Evidence Studio save-integrity tests (frontend half).
 *
 * Covers the "what you reviewed is what gets saved" contract:
 * - buildDraftReviewPatch always carries the reviewed cut text forward as
 *   body_text, so a saved card's highlight offsets (computed against the cut
 *   text) are never applied to a different, longer body_text after save.
 * - Only the user's OWN highlight/underline additions are merged into the
 *   saved span columns — the AI baseline is never duplicated in.
 * - No raw ids ever appear in the patch payload sent to the backend.
 */

import { buildDraftReviewPatch } from "@/components/evidence/EvidenceStudioCard";
import type { MarkupState } from "@/components/evidence/CardMarkupToolbar";
import type { CardDraft, SelectedSpan } from "@/types";

function span(start: number, end: number, text: string, rationale?: string): SelectedSpan {
  return { start, end, text, sentence_index: 0, rationale };
}

function emptyMarkup(overrides: Partial<MarkupState> = {}): MarkupState {
  return { highlightSpans: [], underlineSpans: [], boldSpans: [], italicSpans: [], ...overrides };
}

const BASE_CARD: Pick<CardDraft, "highlighted_spans_json" | "underline_spans_json" | "body_text"> = {
  highlighted_spans_json: [],
  underline_spans_json: [],
  body_text: "The original full passage from the source article.",
};

describe("buildDraftReviewPatch", () => {
  it("always sends the reviewed cut text as body_text", () => {
    const patch = buildDraftReviewPatch(BASE_CARD, "A shorter reviewed cut.", emptyMarkup());
    expect(patch.body_text).toBe("A shorter reviewed cut.");
  });

  it("omits body_text when the cut is empty", () => {
    const patch = buildDraftReviewPatch(BASE_CARD, "", emptyMarkup());
    expect(patch.body_text).toBeUndefined();
  });

  it("omits body_text when the cut is whitespace-only", () => {
    const patch = buildDraftReviewPatch(BASE_CARD, "   ", emptyMarkup());
    expect(patch.body_text).toBeUndefined();
  });

  it("trims the reviewed cut text", () => {
    const patch = buildDraftReviewPatch(BASE_CARD, "  cut with padding  ", emptyMarkup());
    expect(patch.body_text).toBe("cut with padding");
  });

  it("keeps only user-added highlight spans, dropping AI-baseline spans", () => {
    const markup = emptyMarkup({
      highlightSpans: [
        span(0, 5, "AI baseline", "ai"),
        span(10, 20, "llm pick", "llm_highlight"),
        span(30, 40, "my pick", "user"),
      ],
    });
    const patch = buildDraftReviewPatch(BASE_CARD, "cut text", markup);
    expect(patch.highlighted_spans_json).toHaveLength(1);
    expect(patch.highlighted_spans_json[0]).toMatchObject({ start: 30, end: 40, type: "highlight" });
  });

  it("merges new user highlights onto the card's existing saved spans", () => {
    const card = { ...BASE_CARD, highlighted_spans_json: [{ start: 1, end: 2, type: "highlight" as const }] };
    const markup = emptyMarkup({ highlightSpans: [span(30, 40, "my pick", "user")] });
    const patch = buildDraftReviewPatch(card, "cut text", markup);
    expect(patch.highlighted_spans_json).toHaveLength(2);
  });

  it("keeps only user-added underline spans", () => {
    const markup = emptyMarkup({
      underlineSpans: [span(0, 5, "not mine", "ai"), span(10, 15, "mine", "user")],
    });
    const patch = buildDraftReviewPatch(BASE_CARD, "cut text", markup);
    expect(patch.underline_spans_json).toHaveLength(1);
    expect(patch.underline_spans_json[0]).toMatchObject({ start: 10, end: 15, type: "underline" });
  });

  it("always includes user_markup_json (bold/italic ride here — no dedicated columns)", () => {
    const markup = emptyMarkup({ boldSpans: [span(0, 4, "bold", "user")] });
    const patch = buildDraftReviewPatch(BASE_CARD, "cut text", markup);
    expect(patch.user_markup_json.bold).toHaveLength(1);
  });

  it("never includes a raw id field anywhere in the payload", () => {
    const markup = emptyMarkup({
      highlightSpans: [span(0, 5, "mine", "user")],
      underlineSpans: [span(6, 10, "mine too", "user")],
      boldSpans: [span(0, 4, "bold", "user")],
    });
    const patch = buildDraftReviewPatch(BASE_CARD, "cut text", markup);
    const serialized = JSON.stringify(patch);
    expect(serialized).not.toMatch(/"id"\s*:/);
    expect(serialized).not.toMatch(/\bcard-[a-f0-9-]{8,}\b/);
  });
});
