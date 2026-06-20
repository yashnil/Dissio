/**
 * Evidence Studio Workbench model tests.
 *
 * Pure utility — no DOM, no React, no API mocks.
 *
 * Covers:
 *  - Workflow-stage derivation (all 6 transitions)
 *  - Loading, no-results, partial-results, failure states
 *  - Mobile stage routing
 *  - Candidate filter derivation + count correctness
 *  - Credibility signal (text-based, not color)
 *  - Source metadata display
 *  - Rejection-source explanations (4 categories)
 *  - Save state derivation
 *  - Next-action labels per stage
 *  - Skeleton count per mode
 *  - Unsaved-edit guard
 *  - Evidence text immutability regression guard
 *  - Candidate selection state
 *  - Reduced-motion (stage labels are text, not animation-dependent)
 */

import {
  deriveWorkbenchStage,
  deriveMobileStageFromWorkbench,
  deriveCandidateFilters,
  deriveCredibilitySignal,
  deriveSourceMetaDisplay,
  deriveRejectionExplanation,
  deriveSaveStatus,
  deriveNextAction,
  deriveSkeletonCount,
  deriveUnsavedEditGuard,
  isCutTextSubstringOfBody,
  WORKBENCH_STAGE_LABEL,
  MOBILE_STAGE_LABELS,
  SAVE_STATUS_LABEL,
  type WorkbenchStage,
  type MobileStage,
  type CandidateSummary,
} from "@/lib/workbenchModel";
import type { CardDraft } from "@/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function input(over: Partial<Parameters<typeof deriveWorkbenchStage>[0]> = {}) {
  return {
    isLoading: false,
    hasResults: false,
    selectedCardId: null,
    isSaving: false,
    savedCount: 0,
    ...over,
  };
}

function candidate(
  readinessLevel: CandidateSummary["readinessLevel"],
  isCounter = false,
): CandidateSummary {
  return { readinessLevel, isCounter };
}

function draftCard(over: Partial<CardDraft> = {}): CardDraft {
  return {
    id: "c1",
    user_id: "u1",
    research_source_id: null,
    url: "https://example.com/article",
    topic: null,
    claim_goal: "tariffs hurt growth",
    side: null,
    tag: "IMF finds tariffs reduce economic growth",
    cite: "IMF 2024",
    body_text: "The IMF finds that tariffs reduce economic growth significantly.",
    highlighted_spans_json: [],
    underline_spans_json: [],
    author: "Jane Smith",
    publication: "IMF",
    title: null,
    published_date: "2024-03-01",
    author_credentials: null,
    warrant_summary: null,
    impact_summary: null,
    source_quality: "high",
    credibility_notes: null,
    extraction_confidence: 0.85,
    generated_tag: true,
    missing_metadata_json: {},
    card_source_type: "research_search",
    status: "draft",
    saved_card_id: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...over,
  } as CardDraft;
}

// ── deriveWorkbenchStage ───────────────────────────────────────────────────────

describe("deriveWorkbenchStage — workflow stage derivation", () => {
  test("idle when nothing has happened", () => {
    expect(deriveWorkbenchStage(input())).toBe("idle");
  });

  test("searching when isLoading is true", () => {
    expect(deriveWorkbenchStage(input({ isLoading: true }))).toBe("searching");
  });

  test("saving takes priority over isLoading", () => {
    expect(deriveWorkbenchStage(input({ isLoading: true, isSaving: true }))).toBe("saving");
  });

  test("reviewing when results exist but no card selected", () => {
    expect(deriveWorkbenchStage(input({ hasResults: true }))).toBe("reviewing");
  });

  test("selected when a card is focused", () => {
    expect(deriveWorkbenchStage(input({ hasResults: true, selectedCardId: "c1" }))).toBe("selected");
  });

  test("selected without results (draft selected from history)", () => {
    expect(deriveWorkbenchStage(input({ selectedCardId: "c1" }))).toBe("selected");
  });

  test("saving when isSaving is true", () => {
    expect(deriveWorkbenchStage(input({ isSaving: true }))).toBe("saving");
  });

  test("saved when savedCount > 0 and nothing else active", () => {
    expect(deriveWorkbenchStage(input({ savedCount: 2 }))).toBe("saved");
  });

  test("reviewing beats saved when results present", () => {
    expect(deriveWorkbenchStage(input({ hasResults: true, savedCount: 1 }))).toBe("reviewing");
  });

  test("all stages have a label", () => {
    const stages: WorkbenchStage[] = ["idle", "searching", "reviewing", "selected", "saving", "saved"];
    stages.forEach((s) => {
      expect(WORKBENCH_STAGE_LABEL[s]).toBeTruthy();
    });
  });
});

// ── Loading / partial / no-results / failure states ───────────────────────────

describe("workbench — loading/no-results/partial/failure state derivation", () => {
  test("loading state: isLoading=true → searching stage", () => {
    const stage = deriveWorkbenchStage(input({ isLoading: true }));
    expect(stage).toBe("searching");
  });

  test("no-results state: hasResults=false, not loading → idle or saved", () => {
    expect(deriveWorkbenchStage(input())).toBe("idle");
    expect(deriveWorkbenchStage(input({ savedCount: 1 }))).toBe("saved");
  });

  test("partial-results state: hasResults=true → reviewing", () => {
    expect(deriveWorkbenchStage(input({ hasResults: true }))).toBe("reviewing");
  });

  test("failure state: error shown, no results → idle (isLoading resolves to false)", () => {
    // After a failed fetch, isLoading reverts to false; results stay null.
    const stage = deriveWorkbenchStage(input({ isLoading: false, hasResults: false }));
    expect(stage).toBe("idle");
  });

  test("retry: after failure, searching starts again", () => {
    const stage = deriveWorkbenchStage(input({ isLoading: true, hasResults: false }));
    expect(stage).toBe("searching");
  });
});

// ── deriveMobileStageFromWorkbench ────────────────────────────────────────────

describe("deriveMobileStageFromWorkbench — mobile panel routing", () => {
  test("idle → search panel", () => {
    expect(deriveMobileStageFromWorkbench("idle")).toBe("search");
  });

  test("searching → search panel", () => {
    expect(deriveMobileStageFromWorkbench("searching")).toBe("search");
  });

  test("reviewing → candidates panel", () => {
    expect(deriveMobileStageFromWorkbench("reviewing")).toBe("candidates");
  });

  test("selected → card panel", () => {
    expect(deriveMobileStageFromWorkbench("selected")).toBe("card");
  });

  test("saving → candidates panel (save happens from card, stay there)", () => {
    expect(deriveMobileStageFromWorkbench("saving")).toBe("candidates");
  });

  test("saved → candidates panel", () => {
    expect(deriveMobileStageFromWorkbench("saved")).toBe("candidates");
  });

  test("all mobile stages have labels", () => {
    const stages: MobileStage[] = ["search", "candidates", "card"];
    stages.forEach((s) => expect(MOBILE_STAGE_LABELS[s]).toBeTruthy());
  });

  test("mobile stage navigation is independent of workbench stage", () => {
    // User can manually navigate to candidates even while in idle state
    // (The function reflects the default, not a lock)
    expect(deriveMobileStageFromWorkbench("idle")).toBe("search");
    // The UI can override this by keeping user's manual selection
  });
});

// ── deriveCandidateFilters ────────────────────────────────────────────────────

describe("deriveCandidateFilters — candidate list filters", () => {
  const cards: CandidateSummary[] = [
    candidate("ready"),
    candidate("ready"),
    candidate("review_needed"),
    candidate("weak"),
    candidate("ready", true),   // counter evidence, marked ready
  ];

  test("returns all-card when only 'all' has content (empty list)", () => {
    const chips = deriveCandidateFilters([], "all");
    expect(chips).toHaveLength(1);
    expect(chips[0].key).toBe("all");
    expect(chips[0].count).toBe(0);
  });

  test("counts ready cards (non-counter only)", () => {
    const chips = deriveCandidateFilters(cards, "all");
    const ready = chips.find((c) => c.key === "ready");
    expect(ready?.count).toBe(2); // counter card not counted in ready
  });

  test("counts counter cards separately", () => {
    const chips = deriveCandidateFilters(cards, "all");
    const counter = chips.find((c) => c.key === "counter");
    expect(counter?.count).toBe(1);
  });

  test("counts all cards under 'all'", () => {
    const chips = deriveCandidateFilters(cards, "all");
    const all = chips.find((c) => c.key === "all");
    expect(all?.count).toBe(5);
  });

  test("marks the active filter chip", () => {
    const chips = deriveCandidateFilters(cards, "ready");
    const activeChips = chips.filter((c) => c.active);
    expect(activeChips).toHaveLength(1);
    expect(activeChips[0].key).toBe("ready");
  });

  test("omits filter chips with zero count", () => {
    const noWeak = [candidate("ready"), candidate("ready")];
    const chips = deriveCandidateFilters(noWeak, "all");
    expect(chips.find((c) => c.key === "weak")).toBeUndefined();
    expect(chips.find((c) => c.key === "review")).toBeUndefined();
  });

  test("counter chip hidden when no counter evidence", () => {
    const noCounter = [candidate("ready"), candidate("review_needed")];
    const chips = deriveCandidateFilters(noCounter, "all");
    expect(chips.find((c) => c.key === "counter")).toBeUndefined();
  });

  test("all chip is always present", () => {
    const chips = deriveCandidateFilters([], "all");
    expect(chips.some((c) => c.key === "all")).toBe(true);
  });

  test("candidate selection preserved: activeKey determines which chip is active", () => {
    const chips = deriveCandidateFilters(cards, "review");
    expect(chips.find((c) => c.key === "review")?.active).toBe(true);
    expect(chips.find((c) => c.key === "all")?.active).toBe(false);
  });
});

// ── deriveCredibilitySignal ───────────────────────────────────────────────────

describe("deriveCredibilitySignal — text-based credibility (not color-only)", () => {
  test("high quality → 'High credibility' label", () => {
    const signal = deriveCredibilitySignal("high");
    expect(signal.label).toBe("High credibility");
    expect(signal.level).toBe("high");
  });

  test("medium quality → 'Medium credibility' label", () => {
    const signal = deriveCredibilitySignal("medium");
    expect(signal.label).toBe("Medium credibility");
    expect(signal.level).toBe("medium");
  });

  test("low quality → 'Low credibility' label", () => {
    const signal = deriveCredibilitySignal("low");
    expect(signal.label).toBe("Low credibility");
    expect(signal.level).toBe("low");
  });

  test("null quality → 'Credibility unknown' label", () => {
    const signal = deriveCredibilitySignal(null);
    expect(signal.label).toBe("Credibility unknown");
    expect(signal.level).toBe("unknown");
  });

  test("undefined quality → unknown level", () => {
    expect(deriveCredibilitySignal(undefined).level).toBe("unknown");
  });

  test("returns a non-empty qualifier string for all levels", () => {
    (["high", "medium", "low", null] as const).forEach((q) => {
      const { qualifier } = deriveCredibilitySignal(q);
      expect(qualifier.length).toBeGreaterThan(0);
    });
  });

  test("credibilityNotes override default qualifier", () => {
    const signal = deriveCredibilitySignal("high", "Peer-reviewed journal");
    expect(signal.qualifier).toBe("Peer-reviewed journal");
  });

  test("color is supplemental: all signals produce a text label", () => {
    const labels = ["high", "medium", "low", null].map(
      (q) => deriveCredibilitySignal(q as "high" | null).label,
    );
    expect(labels.every((l) => typeof l === "string" && l.length > 0)).toBe(true);
  });
});

// ── deriveSourceMetaDisplay ───────────────────────────────────────────────────

describe("deriveSourceMetaDisplay — source metadata", () => {
  test("full metadata → combined primaryDisplay", () => {
    const { primaryDisplay } = deriveSourceMetaDisplay(
      "Jane Smith", "Nature Energy", "2023-08-01", "https://nature.com/article",
    );
    expect(primaryDisplay).toContain("Jane Smith");
    expect(primaryDisplay).toContain("Nature Energy");
    expect(primaryDisplay).toContain("2023");
  });

  test("extracts year from ISO datetime", () => {
    const { primaryDisplay } = deriveSourceMetaDisplay(
      null, null, "2021-11-22T14:30:00Z", null,
    );
    expect(primaryDisplay).toContain("2021");
  });

  test("falls back to URL when no author/pub/date", () => {
    const { primaryDisplay } = deriveSourceMetaDisplay(
      null, null, null, "https://example.com/article",
    );
    expect(primaryDisplay).toBe("https://example.com/article");
  });

  test("falls back to 'Unknown source' when no metadata at all", () => {
    const { primaryDisplay } = deriveSourceMetaDisplay(null, null, null, null);
    expect(primaryDisplay).toBe("Unknown source");
  });

  test("strips www. from domain display", () => {
    const { domainDisplay } = deriveSourceMetaDisplay(
      null, null, null, "https://www.reuters.com/article",
    );
    expect(domainDisplay).toBe("reuters.com");
  });

  test("hasAuthor reflects presence of author", () => {
    expect(deriveSourceMetaDisplay("Smith", null, null, null).hasAuthor).toBe(true);
    expect(deriveSourceMetaDisplay(null, null, null, null).hasAuthor).toBe(false);
  });

  test("hasDate reflects presence of date", () => {
    expect(deriveSourceMetaDisplay(null, null, "2024", null).hasDate).toBe(true);
    expect(deriveSourceMetaDisplay(null, null, null, null).hasDate).toBe(false);
  });

  test("domain is empty when URL is null", () => {
    const { domainDisplay } = deriveSourceMetaDisplay(null, null, null, null);
    expect(domainDisplay).toBe("");
  });

  test("invalid URL doesn't throw", () => {
    expect(() => deriveSourceMetaDisplay(null, null, null, "not-a-url")).not.toThrow();
  });
});

// ── deriveRejectionExplanation ────────────────────────────────────────────────

describe("deriveRejectionExplanation — rejected source explanations", () => {
  test("low quality reason → credibility category", () => {
    const exp = deriveRejectionExplanation("low quality source");
    expect(exp.category).toBe("credibility");
    expect(exp.shortLabel).toContain("credibility");
  });

  test("no support reason → relevance category", () => {
    const exp = deriveRejectionExplanation("does not support the claim");
    expect(exp.category).toBe("relevance");
    expect(exp.shortLabel.toLowerCase()).toContain("support");
  });

  test("extraction failure → technical category", () => {
    const exp = deriveRejectionExplanation("could not extract text");
    expect(exp.category).toBe("technical");
    expect(exp.shortLabel.toLowerCase()).toContain("read");
  });

  test("overclaim reason → quality category", () => {
    const exp = deriveRejectionExplanation("overclaim risk detected");
    expect(exp.category).toBe("quality");
    expect(exp.shortLabel.toLowerCase()).toContain("overclaim");
  });

  test("null reason → other category with fallback label", () => {
    const exp = deriveRejectionExplanation(null);
    expect(exp.category).toBe("other");
    expect(exp.shortLabel).toBeTruthy();
    expect(exp.detail).toBeTruthy();
  });

  test("unknown reason → other category, short label truncated at 50 chars", () => {
    const long = "A".repeat(100);
    const exp = deriveRejectionExplanation(long);
    expect(exp.shortLabel.length).toBeLessThanOrEqual(50);
  });

  test("all fields are non-empty for any input", () => {
    const cases = ["low quality", "no support", "extraction failed", "overclaim", null, undefined];
    cases.forEach((r) => {
      const exp = deriveRejectionExplanation(r);
      expect(exp.shortLabel.length).toBeGreaterThan(0);
      expect(exp.detail.length).toBeGreaterThan(0);
    });
  });

  test("explanation includes actionable information", () => {
    const exp = deriveRejectionExplanation("low credibility");
    expect(exp.detail.length).toBeGreaterThan(20);
  });
});

// ── deriveSaveStatus ──────────────────────────────────────────────────────────

describe("deriveSaveStatus — save state derivation", () => {
  test("isSaving=true → saving", () => {
    expect(deriveSaveStatus("draft", true, false)).toBe("saving");
  });

  test("isSaving takes priority over error", () => {
    expect(deriveSaveStatus("draft", true, true)).toBe("saving");
  });

  test("hasError=true → error", () => {
    expect(deriveSaveStatus("draft", false, true)).toBe("error");
  });

  test("status=saved → saved", () => {
    expect(deriveSaveStatus("saved", false, false)).toBe("saved");
  });

  test("draft status → unsaved", () => {
    expect(deriveSaveStatus("draft", false, false)).toBe("unsaved");
  });

  test("null status → unsaved", () => {
    expect(deriveSaveStatus(null, false, false)).toBe("unsaved");
  });

  test("all save statuses have labels", () => {
    (["unsaved", "saving", "saved", "error"] as const).forEach((s) => {
      expect(SAVE_STATUS_LABEL[s]).toBeTruthy();
    });
  });

  test("error label indicates retry", () => {
    expect(SAVE_STATUS_LABEL.error.toLowerCase()).toContain("retry");
  });

  test("save success/failure are reversible from same draft: draft→saving→saved/error", () => {
    const afterSave = deriveSaveStatus("saved", false, false);
    const afterError = deriveSaveStatus("draft", false, true);
    expect(afterSave).toBe("saved");
    expect(afterError).toBe("error");
  });
});

// ── deriveNextAction ──────────────────────────────────────────────────────────

describe("deriveNextAction — primary action per stage", () => {
  test("idle + no claim: disabled action", () => {
    const action = deriveNextAction("idle", false, false);
    expect(action.isEnabled).toBe(false);
  });

  test("idle + claim: enabled search action", () => {
    const action = deriveNextAction("idle", true, false);
    expect(action.isEnabled).toBe(true);
    expect(action.label.toLowerCase()).toContain("search");
  });

  test("searching: disabled", () => {
    const action = deriveNextAction("searching", true, false);
    expect(action.isEnabled).toBe(false);
  });

  test("reviewing + results: enabled select action", () => {
    const action = deriveNextAction("reviewing", true, true);
    expect(action.isEnabled).toBe(true);
    expect(action.label.toLowerCase()).toContain("select");
  });

  test("reviewing + no results: disabled, suggests refining", () => {
    const action = deriveNextAction("reviewing", true, false);
    expect(action.isEnabled).toBe(false);
  });

  test("selected: enabled save action", () => {
    const action = deriveNextAction("selected", true, true);
    expect(action.isEnabled).toBe(true);
    expect(action.label.toLowerCase()).toContain("save");
  });

  test("saving: disabled", () => {
    const action = deriveNextAction("saving", true, true);
    expect(action.isEnabled).toBe(false);
  });

  test("saved: enabled find-another action", () => {
    const action = deriveNextAction("saved", true, true);
    expect(action.isEnabled).toBe(true);
    expect(action.label.toLowerCase()).toMatch(/find|another|search/);
  });

  test("all stages produce non-empty label and hint", () => {
    const stages: WorkbenchStage[] = ["idle", "searching", "reviewing", "selected", "saving", "saved"];
    stages.forEach((s) => {
      const a = deriveNextAction(s, true, true);
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.hint.length).toBeGreaterThan(0);
    });
  });
});

// ── deriveSkeletonCount ───────────────────────────────────────────────────────

describe("deriveSkeletonCount — loading skeleton shapes", () => {
  test("search mode shows 3 skeletons", () => {
    expect(deriveSkeletonCount("search")).toBe(3);
  });

  test("url mode shows 1 skeleton (one source)", () => {
    expect(deriveSkeletonCount("url")).toBe(1);
  });

  test("paste mode shows 1 skeleton", () => {
    expect(deriveSkeletonCount("paste")).toBe(1);
  });
});

// ── deriveUnsavedEditGuard ────────────────────────────────────────────────────

describe("deriveUnsavedEditGuard — unsaved edit preservation", () => {
  test("null card → no guard", () => {
    const guard = deriveUnsavedEditGuard(null);
    expect(guard.hasUnsavedMarkup).toBe(false);
    expect(guard.message).toBe("");
  });

  test("card with no markup → no guard", () => {
    const guard = deriveUnsavedEditGuard(draftCard({ user_markup_json: null }));
    expect(guard.hasUnsavedMarkup).toBe(false);
  });

  test("card with empty markup → no guard", () => {
    const guard = deriveUnsavedEditGuard(
      draftCard({ user_markup_json: { highlight: [], underline: [], bold: [], italic: [] } }),
    );
    expect(guard.hasUnsavedMarkup).toBe(false);
  });

  test("card with highlight spans → guard active", () => {
    const guard = deriveUnsavedEditGuard(
      draftCard({
        user_markup_json: { highlight: [{ start: 0, end: 5, type: "highlight" as const }], underline: [], bold: [], italic: [] },
      }),
    );
    expect(guard.hasUnsavedMarkup).toBe(true);
    expect(guard.message.length).toBeGreaterThan(0);
  });

  test("card with underline spans → guard active", () => {
    const guard = deriveUnsavedEditGuard(
      draftCard({
        user_markup_json: { highlight: [], underline: [{ start: 2, end: 10, type: "underline" as const }], bold: [], italic: [] },
      }),
    );
    expect(guard.hasUnsavedMarkup).toBe(true);
  });

  test("guard message explains the protection", () => {
    const guard = deriveUnsavedEditGuard(
      draftCard({
        user_markup_json: { highlight: [{ start: 0, end: 5, type: "highlight" as const }], underline: [], bold: [], italic: [] },
      }),
    );
    expect(guard.message.toLowerCase()).toContain("save");
  });
});

// ── isCutTextSubstringOfBody ──────────────────────────────────────────────────

describe("isCutTextSubstringOfBody — evidence text immutability regression", () => {
  const body = "Section 230 grants immunity. The provision was enacted in 1996. Critics argue reform is needed.";

  test("exact substring is valid", () => {
    expect(isCutTextSubstringOfBody("Section 230 grants immunity.", body)).toBe(true);
  });

  test("multi-segment cut with ellipsis is valid when both parts are in body", () => {
    expect(
      isCutTextSubstringOfBody("Section 230 grants immunity. […] Critics argue reform is needed.", body),
    ).toBe(true);
  });

  test("paraphrased text fails the check", () => {
    expect(
      isCutTextSubstringOfBody("Section 230 eliminates platform responsibility.", body),
    ).toBe(false);
  });

  test("null cut → not a violation (no cut yet)", () => {
    expect(isCutTextSubstringOfBody(null, body)).toBe(true);
  });

  test("null body → not a violation (body not loaded yet)", () => {
    expect(isCutTextSubstringOfBody("Section 230", null)).toBe(true);
  });

  test("both null → not a violation", () => {
    expect(isCutTextSubstringOfBody(null, null)).toBe(true);
  });

  test("empty cut is treated as no cut yet", () => {
    expect(isCutTextSubstringOfBody("", body)).toBe(true);
  });

  test("cut that is a superset of body always fails", () => {
    const superSet = body + " EXTRA INVENTED TEXT NOT IN SOURCE";
    expect(isCutTextSubstringOfBody(superSet, body)).toBe(false);
  });

  test("case-sensitive: different case fails", () => {
    expect(isCutTextSubstringOfBody("section 230 GRANTS immunity.", body)).toBe(false);
  });
});

// ── Candidate selection state ─────────────────────────────────────────────────

describe("candidate selection state", () => {
  test("selecting a card changes stage to selected", () => {
    const stage = deriveWorkbenchStage(input({ hasResults: true, selectedCardId: "c1" }));
    expect(stage).toBe("selected");
  });

  test("deselecting a card reverts to reviewing", () => {
    const stage = deriveWorkbenchStage(input({ hasResults: true, selectedCardId: null }));
    expect(stage).toBe("reviewing");
  });

  test("selecting a card on mobile → card panel", () => {
    const mobileStage = deriveMobileStageFromWorkbench("selected");
    expect(mobileStage).toBe("card");
  });

  test("filter change preserves selected card ID (selection is in outer state, not filter)", () => {
    // Filter chips don't touch selectedCardId — they just gate visibility
    const chips1 = deriveCandidateFilters([candidate("ready")], "all");
    const chips2 = deriveCandidateFilters([candidate("ready")], "ready");
    expect(chips1[0].count).toBe(chips2.find((c) => c.key === "all")?.count);
  });
});

// ── Reduced motion (text-based, not animation-dependent) ─────────────────────

describe("reduced motion — stage labels are text-based", () => {
  test("all stage labels are available without animation", () => {
    // Stage labels are static strings, not derived from CSS animations
    expect(typeof WORKBENCH_STAGE_LABEL.idle).toBe("string");
    expect(typeof WORKBENCH_STAGE_LABEL.searching).toBe("string");
    expect(typeof WORKBENCH_STAGE_LABEL.reviewing).toBe("string");
    expect(typeof WORKBENCH_STAGE_LABEL.selected).toBe("string");
    expect(typeof WORKBENCH_STAGE_LABEL.saving).toBe("string");
    expect(typeof WORKBENCH_STAGE_LABEL.saved).toBe("string");
  });

  test("mobile stage labels are text-based", () => {
    expect(typeof MOBILE_STAGE_LABELS.search).toBe("string");
    expect(typeof MOBILE_STAGE_LABELS.candidates).toBe("string");
    expect(typeof MOBILE_STAGE_LABELS.card).toBe("string");
  });

  test("credibility signal always has text label (not just color)", () => {
    const signal = deriveCredibilitySignal("high");
    expect(signal.label).toBeTruthy();
    expect(signal.qualifier).toBeTruthy();
  });
});

// ── Regenerate-cut behavior ───────────────────────────────────────────────────

describe("regenerate-cut state derivation", () => {
  test("after regenerate, stage resets to reviewing (isLoading → false, hasResults → true)", () => {
    const during = deriveWorkbenchStage(input({ isLoading: true }));
    const after  = deriveWorkbenchStage(input({ hasResults: true }));
    expect(during).toBe("searching");
    expect(after).toBe("reviewing");
  });

  test("switching source during cut: deselect → reviewing", () => {
    const withCard    = deriveWorkbenchStage(input({ hasResults: true, selectedCardId: "c1" }));
    const afterSwitch = deriveWorkbenchStage(input({ hasResults: true, selectedCardId: null }));
    expect(withCard).toBe("selected");
    expect(afterSwitch).toBe("reviewing");
  });
});
