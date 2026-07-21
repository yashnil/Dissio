/**
 * Judge Adaptation model tests (Phase 7A) — pure, no DOM.
 *
 * Contract under test:
 *  - raw source types/IDs are an internal mapping, never a visible label
 *  - exact source text, user notes, and coaching stay distinct fields
 *  - unsupported/contradicted evidence is never safe to adapt
 *  - judge profiles carry debate-native priorities
 */

import {
  MATERIAL_KIND_LABELS,
  materialSourceType,
  normalizeCardMaterial,
  normalizeArgumentMaterial,
  normalizeFrontlineMaterial,
  deriveMaterialWarnings,
  isMaterialSafeToAdapt,
  filterMaterials,
  sortMaterialsByRecency,
  JUDGE_PRIORITIES,
  judgePriorities,
  deriveAdaptationReadiness,
  adaptationRequestBody,
  ADAPTATION_INTEGRITY_RULES,
  type SelectedMaterial,
} from "@/lib/judgeAdaptationModel";
import type { Argument, Frontline, LibrarySearchResult } from "@/types/library";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function cardRow(over: Partial<LibrarySearchResult> = {}): LibrarySearchResult {
  return {
    card_id: "card-uuid-1",
    tag: "Carbon pricing cuts emissions 20%",
    cite: "Smith 2026, Brookings",
    body_preview: "Exact quoted source sentence…",
    side: "pro",
    card_status: "active",
    support_verdict: "supported",
    user_notes: "Read slowly in front of lay judges",
    resolution_id: "res-1",
    argument_title: "C1: Emissions",
    tags: ["economy"],
    saved_at: "2026-07-08T00:00:00Z",
    ...over,
  };
}

function argRow(over: Partial<Argument> = {}): Argument {
  return {
    id: "arg-uuid-1", user_id: "u1", resolution_id: "res-1", side: "con",
    title: "Jobs turn", summary: "Carbon pricing displaces manufacturing jobs.",
    argument_type: "contention" as Argument["argument_type"],
    created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-09T00:00:00Z",
    ...over,
  };
}

function flRow(over: Partial<Frontline> = {}): Frontline {
  return {
    id: "fl-uuid-1", user_id: "u1", resolution_id: "res-1", side: "pro",
    title: "AT: Jobs turn", opponent_claim: "Carbon pricing kills jobs",
    created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-05T00:00:00Z",
    ...over,
  };
}

// ── Source mapping ────────────────────────────────────────────────────────────

describe("materialSourceType — internal API vocabulary stays internal", () => {
  it("maps picker kinds to backend source types", () => {
    expect(materialSourceType("card")).toBe("evidence");
    expect(materialSourceType("argument")).toBe("argument");
    expect(materialSourceType("frontline")).toBe("frontline");
  });

  it("visible kind labels are human, not implementation terms", () => {
    expect(Object.values(MATERIAL_KIND_LABELS)).toEqual([
      "Evidence card", "Argument", "Frontline",
    ]);
  });
});

// ── Normalization ─────────────────────────────────────────────────────────────

describe("material normalization", () => {
  it("card: exact text, notes, verdict, and cite land in distinct fields", () => {
    const m = normalizeCardMaterial(cardRow());
    expect(m.title).toBe("Carbon pricing cuts emissions 20%");
    expect(m.exactText).toBe("Exact quoted source sentence…");
    expect(m.userNotes).toBe("Read slowly in front of lay judges");
    expect(m.supportVerdict).toBe("supported");
    expect(m.cite).toContain("Smith 2026");
    expect(m.contextText).toBe("Supports: C1: Emissions");
  });

  it("untitled card gets a human fallback label, never an ID", () => {
    const m = normalizeCardMaterial(cardRow({ tag: undefined }));
    expect(m.title).toBe("Untitled card");
    expect(m.title).not.toContain("uuid");
  });

  it("argument: debate-native type label + summary context, no exact text", () => {
    const m = normalizeArgumentMaterial(argRow());
    expect(m.typeLabel).toBe("Contention");
    expect(m.exactText).toBeNull();
    expect(m.contextText).toContain("displaces manufacturing");
  });

  it("frontline: shows what it answers", () => {
    const m = normalizeFrontlineMaterial(flRow());
    expect(m.contextText).toContain("Carbon pricing kills jobs");
    expect(m.side).toBe("pro");
  });
});

// ── Integrity ─────────────────────────────────────────────────────────────────

describe("evidence integrity", () => {
  it("unsupported/contradicted cards warn and are never safe to adapt", () => {
    const bad = normalizeCardMaterial(cardRow({ support_verdict: "unsupported" }));
    expect(deriveMaterialWarnings(bad)).toContainEqual(expect.stringContaining("does not support"));
    expect(isMaterialSafeToAdapt(bad)).toBe(false);

    const contradicted = normalizeCardMaterial(cardRow({ support_verdict: "contradicted" }));
    expect(isMaterialSafeToAdapt(contradicted)).toBe(false);
  });

  it("flagged status and missing citation surface as warnings", () => {
    const m = normalizeCardMaterial(cardRow({ card_status: "flagged", cite: undefined }));
    expect(deriveMaterialWarnings(m)).toEqual(
      expect.arrayContaining(["Flagged for review", "No citation on file"]),
    );
  });

  it("supported cards and non-card materials are safe", () => {
    expect(isMaterialSafeToAdapt(normalizeCardMaterial(cardRow()))).toBe(true);
    expect(isMaterialSafeToAdapt(normalizeArgumentMaterial(argRow()))).toBe(true);
  });

  it("integrity rules keep quoted text and claims immutable", () => {
    expect(ADAPTATION_INTEGRITY_RULES.mustNotChange).toContain("Quoted source text");
    expect(ADAPTATION_INTEGRITY_RULES.mustNotChange).toContain("What the evidence claims");
    expect(ADAPTATION_INTEGRITY_RULES.canChange).toContain("Delivery and pacing");
  });
});

// ── Picker filtering ──────────────────────────────────────────────────────────

describe("filterMaterials + sortMaterialsByRecency", () => {
  const all: SelectedMaterial[] = [
    normalizeCardMaterial(cardRow()),
    normalizeArgumentMaterial(argRow()),
    normalizeFrontlineMaterial(flRow({ resolution_id: "res-2" })),
  ];

  it("filters by kind", () => {
    expect(filterMaterials(all, { kind: "argument" })).toHaveLength(1);
    expect(filterMaterials(all, { kind: "all" })).toHaveLength(3);
  });

  it("filters by side and resolution", () => {
    expect(filterMaterials(all, { side: "con" }).map((m) => m.kind)).toEqual(["argument"]);
    expect(filterMaterials(all, { resolutionId: "res-2" }).map((m) => m.kind)).toEqual(["frontline"]);
  });

  it("search matches titles, cites, and context", () => {
    expect(filterMaterials(all, { query: "brookings" })).toHaveLength(1);
    expect(filterMaterials(all, { query: "kills jobs" }).map((m) => m.kind)).toEqual(["frontline"]);
    expect(filterMaterials(all, { query: "zzz-no-match" })).toHaveLength(0);
  });

  it("recency sorts newest first", () => {
    const sorted = sortMaterialsByRecency(all);
    expect(sorted[0].kind).toBe("argument"); // 07-09
    expect(sorted[2].kind).toBe("frontline"); // 07-05
  });
});

// ── Judge profiles ────────────────────────────────────────────────────────────

describe("judge priorities (plan §13.3)", () => {
  it("all five judge types have debate-native priorities", () => {
    expect(judgePriorities("lay")).toEqual(["Clarity", "Story", "Real-world consequence"]);
    expect(judgePriorities("parent")).toContain("Common sense");
    expect(judgePriorities("flow")).toEqual(["Line-by-line", "Drops", "Weighing"]);
    expect(judgePriorities("technical")).toContain("Comparative warrants");
    expect(judgePriorities("coach")).toContain("Skill growth");
    expect(Object.keys(JUDGE_PRIORITIES)).toHaveLength(5);
  });

  it("unknown/custom types return empty rather than invented priorities", () => {
    expect(judgePriorities("custom")).toEqual([]);
  });
});

// ── Readiness + request body ──────────────────────────────────────────────────

describe("deriveAdaptationReadiness", () => {
  const card = normalizeCardMaterial(cardRow());

  it("no material selected → useful empty-state reason", () => {
    const r = deriveAdaptationReadiness(null, "lay");
    expect(r.state).toBe("no-material");
  });

  it("unsafe material blocks generation with an explanation", () => {
    const bad = normalizeCardMaterial(cardRow({ support_verdict: "contradicted" }));
    const r = deriveAdaptationReadiness(bad, "lay");
    expect(r.state).toBe("unsafe-material");
    if (r.state === "unsafe-material") {
      expect(r.reason).toContain("Fix the evidence");
    }
  });

  it("material without judge → prompts judge selection", () => {
    expect(deriveAdaptationReadiness(card, null).state).toBe("no-judge");
  });

  it("material + judge → ready", () => {
    expect(deriveAdaptationReadiness(card, "flow").state).toBe("ready");
  });
});

describe("adaptationRequestBody", () => {
  it("builds the existing API contract from the picked material", () => {
    const card = normalizeCardMaterial(cardRow());
    expect(adaptationRequestBody("u1", "lay", card)).toEqual({
      user_id: "u1",
      judge_type: "lay",
      source_type: "evidence",
      source_id: "card-uuid-1",
    });
  });

  it("frontlines/arguments map to their own source types", () => {
    expect(adaptationRequestBody("u1", "flow", normalizeFrontlineMaterial(flRow())).source_type).toBe("frontline");
    expect(adaptationRequestBody("u1", "flow", normalizeArgumentMaterial(argRow())).source_type).toBe("argument");
  });
});

// ── Phase 7B: result/compare normalization, checklist, history, notes ────────

import {
  normalizeAdaptationResult,
  deriveUnchangedItems,
  deriveNextPracticeAction,
  deriveIntegrityChecklist,
  normalizeComparisonResult,
  formatHistoryEntry,
  formatNoteLabel,
} from "@/lib/judgeAdaptationModel";
import type {
  AdaptationRisk, JudgeAdaptationResult, JudgeComparisonResult,
} from "@/types/judgeAdaptation";

function risk(over: Partial<AdaptationRisk> = {}): AdaptationRisk {
  return {
    category: "jargon_overflow", level: "medium",
    description: "Too much technical vocabulary for this judge.",
    how_to_mitigate: "Replace jargon with plain terms.",
    ...over,
  };
}

function adaptation(over: Partial<JudgeAdaptationResult> = {}): JudgeAdaptationResult {
  return {
    id: "adapt-uuid-1",
    user_id: "u1", judge_type: "lay", source_type: "evidence", source_id: "card-uuid-1",
    original_purpose: "Support C1 with an emissions statistic",
    judge_goal: "Make the statistic land as a real-world story",
    changes: [{ dimension: "vocabulary", adapted: "Say 'one fifth' instead of '20%'", reason: "Plain terms", may_be_omitted: false }],
    risks: [risk()], critical_risks: [],
    what_to_emphasize: ["The real-world consequence"],
    what_to_simplify: ["The methodology detail"],
    what_must_remain_explicit: ["The 20% figure itself"],
    what_can_be_shortened: ["Source credentials"],
    suggested_phrasing: ["One in five tons of carbon — gone."],
    preserved_source_refs: ["ref-1"],
    estimated_seconds: 45,
    rules_version: "1", generated_at: "2026-07-10T00:00:00Z",
    ...over,
  } as JudgeAdaptationResult;
}

describe("normalizeAdaptationResult", () => {
  it("mirrors real backend fields into the view", () => {
    const v = normalizeAdaptationResult(adaptation());
    expect(v.judgeGoal).toContain("real-world story");
    expect(v.emphasize).toEqual(["The real-world consequence"]);
    expect(v.suggestedPhrasing).toHaveLength(1);
    expect(v.estimatedSeconds).toBe(45);
    expect(v.adaptationId).toBe("adapt-uuid-1");
  });

  it("missing/empty backend fields become empty states — never fake text", () => {
    const v = normalizeAdaptationResult(adaptation({
      id: undefined,
      judge_goal: "",
      what_to_emphasize: [],
      suggested_phrasing: undefined as unknown as string[],
      estimated_seconds: 0,
    }));
    expect(v.judgeGoal).toBeNull();
    expect(v.emphasize).toEqual([]);
    expect(v.suggestedPhrasing).toEqual([]);
    expect(v.estimatedSeconds).toBeNull();
    expect(v.adaptationId).toBeNull();
  });

  it("collects delivery notes only from real guide/plan fields", () => {
    const v = normalizeAdaptationResult(adaptation({
      evidence_guide: {
        card_id: "c1", judge_type: "lay", can_be_paraphrased: false, risks: [],
        best_practice_note: "Pause after the statistic.",
        estimated_read_time_seconds: 20,
      },
    }));
    expect(v.deliveryNotes).toContain("Pause after the statistic.");
    expect(v.deliveryNotes).toContainEqual(expect.stringContaining("20s"));
    expect(normalizeAdaptationResult(adaptation()).deliveryNotes).toEqual([]);
  });
});

describe("deriveUnchangedItems", () => {
  it("builds from explicit-keep list and evidence guide limits", () => {
    const items = deriveUnchangedItems(adaptation({
      evidence_guide: {
        card_id: "c1", judge_type: "lay", can_be_paraphrased: false, risks: [],
        support_limit: "Only covers the power sector",
        relevant_qualifier: "Estimates, not measurements",
      },
    }));
    expect(items).toContainEqual(expect.stringContaining("power sector"));
    expect(items).toContainEqual(expect.stringContaining("Estimates"));
    expect(items).toContainEqual(expect.stringContaining("The 20% figure"));
  });

  it("empty when nothing was explicitly kept (empty state upstream)", () => {
    expect(deriveUnchangedItems(adaptation({ what_must_remain_explicit: [] }))).toEqual([]);
  });
});

describe("deriveNextPracticeAction", () => {
  it("critical risk mitigation comes first", () => {
    const v = normalizeAdaptationResult(adaptation({
      critical_risks: [risk({ level: "critical", how_to_mitigate: "Restore the qualifier before use." })],
    }));
    expect(deriveNextPracticeAction(v)).toContain("Restore the qualifier");
  });

  it("phrasing practice when phrasing exists; workout hint otherwise", () => {
    expect(deriveNextPracticeAction(normalizeAdaptationResult(adaptation())))
      .toContain("Practice the suggested phrasing");
    expect(deriveNextPracticeAction(normalizeAdaptationResult(adaptation({ suggested_phrasing: [] }))))
      .toContain("judge workout");
  });
});

describe("deriveIntegrityChecklist", () => {
  const safeCard = normalizeCardMaterial(cardRow());

  it("unsafe evidence collapses the checklist to a single blocked item", () => {
    const bad = normalizeCardMaterial(cardRow({ support_verdict: "contradicted" }));
    const items = deriveIntegrityChecklist(bad, null);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("blocked");
  });

  it("safe card: quote pass, citation pass, verify-before-round always present", () => {
    const items = deriveIntegrityChecklist(safeCard, adaptation());
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i]));
    expect(byLabel["Source quote unchanged"].status).toBe("pass");
    expect(byLabel["Citation preserved"].status).toBe("pass");
    expect(byLabel["Verify before using in round"].status).toBe("verify");
  });

  it("missing citation → warn; no result yet → overstatement stays verify", () => {
    const noCite = normalizeCardMaterial(cardRow({ cite: undefined }));
    const items = deriveIntegrityChecklist(noCite, null);
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i]));
    expect(byLabel["Citation preserved"].status).toBe("warn");
    expect(byLabel["Claim not overstated"].status).toBe("verify");
  });

  it("overstatement risks in the real response flip the claim check to warn", () => {
    const items = deriveIntegrityChecklist(
      safeCard,
      adaptation({ risks: [risk({ category: "causal_overstatement", description: "Causal leap." })] }),
    );
    const claim = items.find((i) => i.label === "Claim not overstated")!;
    expect(claim.status).toBe("warn");
    expect(claim.detail).toBe("Causal leap.");
  });
});

describe("normalizeComparisonResult", () => {
  function comparison(over: Partial<JudgeComparisonResult> = {}): JudgeComparisonResult {
    return {
      source_type: "evidence", source_id: "card-uuid-1",
      judge_types: ["lay", "flow"],
      constants: ["The quoted statistic stays verbatim"],
      differences: [{ dimension: "explanation depth", judge_a_value: "Story first", judge_b_value: "Warrant first", why_different: "Lay judges follow narrative." }],
      strategic_risks_by_judge: { flow: [risk({ category: "missing_extension" })] },
      wording_differences: [], time_allocation_differences: [],
      generated_at: "2026-07-10T00:00:00Z",
      ...over,
    };
  }

  it("labels judge columns with names + priorities from real judge types", () => {
    const v = normalizeComparisonResult(comparison());
    expect(v.judgeALabel).toBe("Lay Judge");
    expect(v.judgeBLabel).toBe("Flow Judge");
    expect(v.judgeAPriorities).toContain("Story");
    expect(v.judgeBPriorities).toContain("Weighing");
    expect(v.hasContent).toBe(true);
  });

  it("risk columns come only from real per-judge response data", () => {
    const v = normalizeComparisonResult(comparison());
    expect(v.riskColumns).toHaveLength(1);
    expect(v.riskColumns[0].judgeLabel).toBe("Flow Judge");
  });

  it("an all-empty response reports no content — never fake comparison text", () => {
    const v = normalizeComparisonResult(comparison({
      constants: [], differences: [], strategic_risks_by_judge: {},
    }));
    expect(v.hasContent).toBe(false);
  });
});

describe("history + note labels", () => {
  it("history entries use human labels — never raw IDs", () => {
    const h = formatHistoryEntry({
      id: "adapt-uuid-9", judge_type: "technical", source_type: "evidence",
      risk_count: 2, change_count: 5, created_at: "2026-07-09T00:00:00Z",
    });
    expect(h.judgeLabel).toBe("Technical Judge");
    expect(h.materialKindLabel).toBe("Evidence card");
    expect(h.summary).toBe("5 changes · 2 risks");
    expect(`${h.judgeLabel} ${h.materialKindLabel} ${h.summary}`).not.toContain("uuid");
  });

  it("unknown source types get a safe generic label; null counts stay honest", () => {
    const h = formatHistoryEntry({
      id: "x", judge_type: "lay", source_type: "mystery",
      risk_count: null, change_count: null, created_at: "2026-07-09T00:00:00Z",
    });
    expect(h.materialKindLabel).toBe("Saved material");
    expect(h.summary).toBe("Generated");
  });

  it("note labels show judge + date only", () => {
    expect(formatNoteLabel({ judge_type: "coach", created_at: "2026-07-09T00:00:00Z" }))
      .toContain("Coach Judge");
  });
});

// ── Phase 7C: practice loop, scoring gap, persistence labels, history reopen ─

import {
  derivePracticeSuccessCriteria,
  derivePracticePanelState,
  validatePracticeAttempt,
  PRACTICE_ATTEMPT_MIN_LENGTH,
  canScorePracticeAttempt,
  scoringUnavailableReason,
  describeAttemptDimension,
  attemptScoreTone,
  normalizeAttemptScoreResponse,
  attemptRetrySuggestionOrFallback,
  describeAttemptSaveState,
  formatAttemptHistoryEntry,
  sortAttemptsByRecency,
  canReopenHistoryEntry,
  formatHistoryEntryV2,
  sourceTypeToMaterialKind,
  materialStubFromHistory,
  describeWorkoutPersistence,
  WORKOUT_PERSISTENCE_LABELS,
  type AdaptationHistoryRowV2,
  type AttemptRow,
} from "@/lib/judgeAdaptationModel";

describe("derivePracticeSuccessCriteria — real fields only, 2–4 items", () => {
  it("builds from emphasis, phrasing, explicit-keep, and simplify fields", () => {
    const items = derivePracticeSuccessCriteria(adaptation());
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.length).toBeLessThanOrEqual(4);
    expect(items.some((i) => i.startsWith("Emphasize:"))).toBe(true);
    expect(items.some((i) => i.includes("One in five tons"))).toBe(true);
  });

  it("a sparse result yields fewer criteria — never padded with fake ones", () => {
    const items = derivePracticeSuccessCriteria(adaptation({
      what_to_emphasize: [], what_to_simplify: [], what_must_remain_explicit: [],
      suggested_phrasing: [],
    }));
    expect(items).toEqual([]);
  });

  it("caps at 4 even when the result has more real items", () => {
    const items = derivePracticeSuccessCriteria(adaptation({
      what_to_emphasize: ["a", "b", "c"], what_to_simplify: ["d", "e"],
      what_must_remain_explicit: ["f"], suggested_phrasing: ["g"],
    }));
    expect(items).toHaveLength(4);
  });
});

describe("derivePracticePanelState", () => {
  it("no result yet → no-result state (panel doesn't render)", () => {
    expect(derivePracticePanelState(null, null).state).toBe("no-result");
    expect(derivePracticePanelState(normalizeCardMaterial(cardRow()), null).state).toBe("no-result");
  });

  it("unsafe material blocks practice even with a result present", () => {
    const bad = normalizeCardMaterial(cardRow({ support_verdict: "contradicted" }));
    const s = derivePracticePanelState(bad, adaptation());
    expect(s.state).toBe("unsafe-material");
  });

  it("safe material + real result → ready", () => {
    const s = derivePracticePanelState(normalizeCardMaterial(cardRow()), adaptation());
    expect(s.state).toBe("ready");
  });

  it("unsupported/contradicted evidence is blocked BEFORE any score submission — client-side gate matches what the component checks", () => {
    for (const verdict of ["unsupported", "contradicted"] as const) {
      const bad = normalizeCardMaterial(cardRow({ support_verdict: verdict }));
      const result = adaptation();
      const panelState = derivePracticePanelState(bad, result);
      // This mirrors PracticePanel's `scorable` computation exactly — proves
      // the UI can never reach a submit action for unsafe material.
      const scorable = canScorePracticeAttempt(result) && panelState.state === "ready";
      expect(scorable).toBe(false);
    }
  });
});

describe("validatePracticeAttempt", () => {
  it("rejects empty and too-short attempts with a helpful reason", () => {
    expect(validatePracticeAttempt("").valid).toBe(false);
    expect(validatePracticeAttempt("too short").valid).toBe(false);
    expect(validatePracticeAttempt("too short").reason).toContain(String(PRACTICE_ATTEMPT_MIN_LENGTH));
  });

  it("accepts an attempt at or above the minimum length", () => {
    const long = "One in five tons of carbon — gone. That's what this policy actually does for real families.";
    expect(long.length).toBeGreaterThanOrEqual(PRACTICE_ATTEMPT_MIN_LENGTH);
    expect(validatePracticeAttempt(long)).toEqual({ valid: true, reason: null });
  });

  it("trims whitespace before validating", () => {
    expect(validatePracticeAttempt("   \n\t  ").valid).toBe(false);
  });
});

describe("canScorePracticeAttempt / scoringUnavailableReason", () => {
  it("scoring requires a persisted adaptation (real id)", () => {
    expect(canScorePracticeAttempt(adaptation())).toBe(true);
    expect(canScorePracticeAttempt(adaptation({ id: undefined }))).toBe(false);
  });

  it("the unavailable reason is honest, not a fake score", () => {
    expect(scoringUnavailableReason()).toContain("wasn't saved");
  });
});

describe("attempt score normalization — real fields only", () => {
  const rawResponse = {
    attempt_id: "attempt-uuid-1",
    overall_fit: 72,
    dimensions: [
      { dimension: "judge_fit", score: 90, explanation: "No jargon detected." },
      { dimension: "clarity", score: 40, explanation: "Too short to judge clarity." },
    ],
    what_improved: ["judge fit: No jargon detected."],
    what_still_needs_work: ["clarity: Too short to judge clarity."],
    integrity_warnings: [],
    next_retry_suggestion: "Focus on clarity next time.",
    saved: true,
    scoring_version: "v1_heuristic",
  };

  it("mirrors real backend fields into the view", () => {
    const v = normalizeAttemptScoreResponse(rawResponse);
    expect(v.attemptId).toBe("attempt-uuid-1");
    expect(v.overallFit).toBe(72);
    expect(v.overallTone).toBe("amber");
    expect(v.dimensions).toHaveLength(2);
    expect(v.saved).toBe(true);
    expect(v.scoringVersion).toBe("v1_heuristic");
  });

  it("missing/malformed fields produce empty states, never fake feedback", () => {
    const v = normalizeAttemptScoreResponse({});
    expect(v.overallFit).toBe(0);
    expect(v.dimensions).toEqual([]);
    expect(v.whatImproved).toEqual([]);
    expect(v.whatStillNeedsWork).toEqual([]);
    expect(v.integrityWarnings).toEqual([]);
    expect(v.nextRetrySuggestion).toBeNull();
    expect(v.saved).toBe(false);
  });

  it("an empty-string retry suggestion is treated as none, not a blank line", () => {
    const v = normalizeAttemptScoreResponse({ ...rawResponse, next_retry_suggestion: "   " });
    expect(v.nextRetrySuggestion).toBeNull();
  });
});

describe("dimension labels + score tone bands", () => {
  it("every documented dimension has a debate-readable label", () => {
    for (const key of ["judge_fit", "clarity", "evidence_preservation", "weighing_adaptation",
      "technical_precision", "risk_avoidance", "delivery_focus"]) {
      const label = describeAttemptDimension(key);
      expect(label).not.toBe(key);
      expect(label.toLowerCase()).not.toContain("_");
    }
  });

  it("unknown dimension keys fall back to a readable version, not a crash", () => {
    expect(describeAttemptDimension("future_dimension")).toBe("future dimension");
  });

  it("tone bands: >=75 green, >=55 amber, else red — text-labeled, not color-only", () => {
    expect(attemptScoreTone(90)).toBe("green");
    expect(attemptScoreTone(75)).toBe("green");
    expect(attemptScoreTone(60)).toBe("amber");
    expect(attemptScoreTone(55)).toBe("amber");
    expect(attemptScoreTone(30)).toBe("red");
  });
});

describe("attemptRetrySuggestionOrFallback", () => {
  it("uses the backend's real suggestion when present", () => {
    expect(attemptRetrySuggestionOrFallback({ nextRetrySuggestion: "Focus on clarity." }))
      .toBe("Focus on clarity.");
  });

  it("falls back to a generic line ONLY when the backend explicitly returned none", () => {
    const fallback = attemptRetrySuggestionOrFallback({ nextRetrySuggestion: null });
    expect(fallback).toContain("Try again");
  });
});

describe("describeAttemptSaveState", () => {
  it("distinguishes saved vs unsaved truthfully", () => {
    expect(describeAttemptSaveState(true)).toContain("Saved");
    expect(describeAttemptSaveState(false)).toContain("wasn't saved");
  });
});

describe("attempt history labels", () => {
  function attemptRow(over: Partial<AttemptRow> = {}): AttemptRow {
    return {
      id: "attempt-uuid-9", adaptation_id: "adapt-uuid-1", user_id: "u1",
      judge_type: "lay", source_type: "evidence", source_id: "card-1",
      attempt_text: "One in five tons of carbon is gone thanks to this policy.",
      score_json: {
        dimensions: [
          { dimension: "judge_fit", score: 90, explanation: "clean" },
          { dimension: "clarity", score: 40, explanation: "too short" },
        ],
      },
      overall_fit: 65,
      created_at: "2026-07-21T00:00:00Z",
      ...over,
    };
  }

  it("newest-first sort by created_at", () => {
    const old = attemptRow({ id: "a", created_at: "2026-07-01T00:00:00Z" });
    const fresh = attemptRow({ id: "b", created_at: "2026-07-20T00:00:00Z" });
    expect(sortAttemptsByRecency([old, fresh]).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("surfaces the lowest-scoring dimension as the key weakness", () => {
    const h = formatAttemptHistoryEntry(attemptRow());
    expect(h.keyWeakness).toContain("Clarity");
    expect(h.keyWeakness).toContain("too short");
  });

  it("tone derives from overall_fit; null overall_fit is neutral, not zero", () => {
    expect(formatAttemptHistoryEntry(attemptRow({ overall_fit: 80 })).tone).toBe("green");
    expect(formatAttemptHistoryEntry(attemptRow({ overall_fit: null })).tone).toBe("neutral");
  });

  it("never exposes the raw attempt id or adaptation id in visible fields", () => {
    const h = formatAttemptHistoryEntry(attemptRow());
    expect(h.dateLabel).not.toContain("uuid");
    expect(h.keyWeakness).not.toContain("uuid");
    // id is retained only for internal use (React key / reopen target).
    expect(h.id).toBe("attempt-uuid-9");
  });

  it("no dimensions in score_json → null key weakness, not a fabricated one", () => {
    const h = formatAttemptHistoryEntry(attemptRow({ score_json: {} }));
    expect(h.keyWeakness).toBeNull();
  });
});

describe("evidence integrity checklist — reopened material without exact text", () => {
  it("does not falsely claim the quote is shown when exactText is missing", () => {
    const reopened = materialStubFromHistory({
      source_type: "evidence", material_label: "Carbon pricing cuts emissions",
      created_at: "2026-07-10T00:00:00Z", source_evidence_id: "card-1",
    })!;
    const items = deriveIntegrityChecklist(reopened, null);
    const quote = items.find((i) => i.label === "Source quote unchanged")!;
    expect(quote.status).toBe("verify");
    expect(quote.detail).not.toContain("shown above");
  });

  it("a live card with real exact text still passes truthfully", () => {
    const live = normalizeCardMaterial(cardRow());
    const items = deriveIntegrityChecklist(live, null);
    expect(items.find((i) => i.label === "Source quote unchanged")!.status).toBe("pass");
  });
});

describe("history reopen contract", () => {
  function historyRow(over: Partial<AdaptationHistoryRowV2> = {}): AdaptationHistoryRowV2 {
    return {
      id: "adapt-uuid-1", judge_type: "lay", source_type: "evidence",
      risk_count: 1, change_count: 2, created_at: "2026-07-20T00:00:00Z",
      material_label: "Carbon pricing cuts emissions",
      result_json: { judge_goal: "Make it a story" },
      source_evidence_id: "card-1",
      ...over,
    } as AdaptationHistoryRowV2;
  }

  it("canReopenHistoryEntry requires a real stored judge_goal, not the DB default {}", () => {
    expect(canReopenHistoryEntry(historyRow())).toBe(true);
    expect(canReopenHistoryEntry(historyRow({ result_json: {} }))).toBe(false);
    expect(canReopenHistoryEntry(historyRow({ result_json: null }))).toBe(false);
  });

  it("sourceTypeToMaterialKind only maps the three picker-supported kinds", () => {
    expect(sourceTypeToMaterialKind("evidence")).toBe("card");
    expect(sourceTypeToMaterialKind("argument")).toBe("argument");
    expect(sourceTypeToMaterialKind("frontline")).toBe("frontline");
    expect(sourceTypeToMaterialKind("summary")).toBeNull();
    expect(sourceTypeToMaterialKind("transcript")).toBeNull();
  });

  it("formatHistoryEntryV2 prefers the resolved material label — never an ID", () => {
    const h = formatHistoryEntryV2(historyRow());
    expect(h.materialKindLabel).toBe("Carbon pricing cuts emissions");
    expect(h.materialKindLabel).not.toContain("uuid");
  });

  it("falls back to the kind label when no material_label resolved", () => {
    const h = formatHistoryEntryV2(historyRow({ material_label: null }));
    expect(h.materialKindLabel).toBe("Evidence card");
  });

  it("materialStubFromHistory builds an honest stub — real label, no fabricated exact text", () => {
    const stub = materialStubFromHistory(historyRow())!;
    expect(stub.kind).toBe("card");
    expect(stub.title).toBe("Carbon pricing cuts emissions");
    expect(stub.exactText).toBeNull();
    expect(stub.contextText).toContain("Reopened from history");
  });

  it("returns null when the source type isn't reopenable or the id is missing", () => {
    expect(materialStubFromHistory(historyRow({ source_type: "summary" }))).toBeNull();
    expect(materialStubFromHistory(historyRow({ source_evidence_id: undefined }))).toBeNull();
  });
});

describe("workout persistence labels", () => {
  it("a generated preview (no id) is always preview-only", () => {
    expect(describeWorkoutPersistence({}, "u1")).toBe("preview-only");
  });

  it("assigned_by matching the current user means the student saved it", () => {
    expect(describeWorkoutPersistence({ id: "wo-1", assigned_by: "u1" }, "u1")).toBe("saved-by-you");
  });

  it("assigned_by differing from the current user means a coach assigned it", () => {
    expect(describeWorkoutPersistence({ id: "wo-1", assigned_by: "coach-1" }, "u1")).toBe("coach-assigned");
  });

  it("every persistence state has a human label", () => {
    expect(Object.values(WORKOUT_PERSISTENCE_LABELS).every((l) => l.length > 0)).toBe(true);
  });
});

// ── Phase 7E: attempt trend aggregation + within-adaptation improvement ──────

import {
  normalizeAttemptTrends,
  emptyAttemptTrendsView,
  trendEmptyStateMessage,
  formatScoreDelta,
  scoreDeltaTone,
  hasJudgeTypeComparison,
  strongestJudgeType,
  weakestJudgeType,
  weakestRecurringDimension,
  deriveWithinAdaptationImprovement,
  type AttemptTrendsResponse,
  type JudgeTypeTrend,
} from "@/lib/judgeAdaptationModel";

function rawTrends(over: Partial<AttemptTrendsResponse> = {}): AttemptTrendsResponse {
  return {
    total_attempts: 3,
    latest_attempt_at: "2026-07-21T00:00:00Z",
    latest_overall_fit: 80,
    best_overall_fit: 80,
    average_overall_fit: 65,
    first_overall_fit: 50,
    improvement_from_first: 30,
    attempts_by_judge_type: [
      { judge_type: "lay", count: 2, latest_score: 80, best_score: 80, average_score: 65,
        improvement_from_first: 30, latest_attempt_at: "2026-07-21T00:00:00Z" },
      { judge_type: "flow", count: 1, latest_score: 55, best_score: 55, average_score: 55,
        improvement_from_first: 0, latest_attempt_at: "2026-07-19T00:00:00Z" },
    ],
    weakest_dimensions: [
      { dimension: "clarity", average_score: 40, count: 2, label: "Clarity" },
    ],
    strongest_dimensions: [
      { dimension: "judge_fit", average_score: 90, count: 2, label: "Judge fit" },
    ],
    recent_attempts: [
      { judge_type: "lay", overall_fit: 80, created_at: "2026-07-21T00:00:00Z", weakest_dimension: "Clarity" },
    ],
    ...over,
  };
}

describe("normalizeAttemptTrends", () => {
  it("mirrors real backend fields into the view", () => {
    const v = normalizeAttemptTrends(rawTrends());
    expect(v.totalAttempts).toBe(3);
    expect(v.latestOverallFit).toBe(80);
    expect(v.improvementFromFirst).toBe(30);
    expect(v.hasTrendData).toBe(true);
    expect(v.attemptsByJudgeType).toHaveLength(2);
    expect(v.weakestDimensions).toHaveLength(1);
  });

  it("missing/malformed fields produce empty states, never fake progress", () => {
    const v = normalizeAttemptTrends({});
    expect(v.totalAttempts).toBe(0);
    expect(v.latestOverallFit).toBeNull();
    expect(v.improvementFromFirst).toBeNull();
    expect(v.hasTrendData).toBe(false);
    expect(v.attemptsByJudgeType).toEqual([]);
    expect(v.weakestDimensions).toEqual([]);
    expect(v.recentAttempts).toEqual([]);
  });

  it("a single attempt never claims trend data", () => {
    const v = normalizeAttemptTrends(rawTrends({ total_attempts: 1, improvement_from_first: 0 }));
    expect(v.hasTrendData).toBe(false);
  });

  it("emptyAttemptTrendsView matches normalizing an empty object", () => {
    expect(emptyAttemptTrendsView()).toEqual(normalizeAttemptTrends({}));
  });

  it("empty-state message is truthful and present", () => {
    expect(trendEmptyStateMessage()).toBe("No scored practice attempts yet.");
  });
});

describe("formatScoreDelta / scoreDeltaTone", () => {
  it("formats sign explicitly — never color-only", () => {
    expect(formatScoreDelta(30)).toBe("+30");
    expect(formatScoreDelta(-15)).toBe("-15");
    expect(formatScoreDelta(0)).toBe("±0");
    expect(formatScoreDelta(null)).toBe("—");
  });

  it("tone follows sign; null/zero are neutral", () => {
    expect(scoreDeltaTone(30)).toBe("green");
    expect(scoreDeltaTone(-15)).toBe("red");
    expect(scoreDeltaTone(0)).toBe("neutral");
    expect(scoreDeltaTone(null)).toBe("neutral");
  });
});

describe("strongest/weakest judge type derivation", () => {
  it("requires 2+ judge types before claiming a comparison", () => {
    const v = normalizeAttemptTrends(rawTrends());
    expect(hasJudgeTypeComparison(v)).toBe(true);
    expect(hasJudgeTypeComparison({ attemptsByJudgeType: [v.attemptsByJudgeType[0]] })).toBe(false);
  });

  it("picks the real highest/lowest average_score entries", () => {
    const v = normalizeAttemptTrends(rawTrends());
    expect(strongestJudgeType(v)?.judge_type).toBe("lay");
    expect(weakestJudgeType(v)?.judge_type).toBe("flow");
  });

  it("returns null when no judge type has a real average score", () => {
    const noScores: JudgeTypeTrend[] = [
      { judge_type: "lay", count: 1, latest_score: null, best_score: null, average_score: null, improvement_from_first: null, latest_attempt_at: null },
    ];
    expect(strongestJudgeType({ attemptsByJudgeType: noScores })).toBeNull();
    expect(weakestJudgeType({ attemptsByJudgeType: noScores })).toBeNull();
  });
});

describe("weakestRecurringDimension", () => {
  it("surfaces the backend's real weakest dimension", () => {
    const v = normalizeAttemptTrends(rawTrends());
    expect(weakestRecurringDimension(v)?.dimension).toBe("clarity");
  });

  it("returns null when there's no dimension data yet", () => {
    expect(weakestRecurringDimension({ weakestDimensions: [] })).toBeNull();
  });
});

describe("deriveWithinAdaptationImprovement", () => {
  function attemptRow(over: Partial<AttemptRow> = {}): AttemptRow {
    return {
      id: "attempt-uuid-1", adaptation_id: "adapt-uuid-1", user_id: "u1",
      judge_type: "lay", source_type: "evidence", source_id: "card-1",
      attempt_text: "some real delivery attempt text goes here for testing purposes",
      score_json: { dimensions: [{ dimension: "clarity", score: 40, explanation: "short" }] },
      overall_fit: 60, created_at: "2026-07-21T00:00:00Z",
      ...over,
    };
  }

  it("zero attempts: no trend, all null", () => {
    const imp = deriveWithinAdaptationImprovement([]);
    expect(imp.attemptCount).toBe(0);
    expect(imp.hasTrendData).toBe(false);
    expect(imp.delta).toBeNull();
  });

  it("one attempt: shows the real score but explicitly no trend", () => {
    const imp = deriveWithinAdaptationImprovement([attemptRow({ overall_fit: 55 })]);
    expect(imp.attemptCount).toBe(1);
    expect(imp.hasTrendData).toBe(false);
    expect(imp.firstScore).toBe(55);
    expect(imp.latestScore).toBe(55);
    // first === latest with one attempt, so delta is a real 0 — not a
    // fabricated null. UI must gate "improving" copy on hasTrendData, not
    // on this being non-zero (mirrors the backend's same contract).
    expect(imp.delta).toBe(0);
  });

  it("two attempts: a real first-to-latest delta", () => {
    const older = attemptRow({ id: "a1", overall_fit: 40, created_at: "2026-07-19T00:00:00Z" });
    const newer = attemptRow({ id: "a2", overall_fit: 75, created_at: "2026-07-21T00:00:00Z" });
    const imp = deriveWithinAdaptationImprovement([older, newer]);
    expect(imp.hasTrendData).toBe(true);
    expect(imp.firstScore).toBe(40);
    expect(imp.latestScore).toBe(75);
    expect(imp.delta).toBe(35);
    expect(imp.bestScore).toBe(75);
  });

  it("works regardless of input order (sorts internally)", () => {
    const older = attemptRow({ id: "a1", overall_fit: 40, created_at: "2026-07-19T00:00:00Z" });
    const newer = attemptRow({ id: "a2", overall_fit: 75, created_at: "2026-07-21T00:00:00Z" });
    const imp = deriveWithinAdaptationImprovement([newer, older]);
    expect(imp.firstScore).toBe(40);
    expect(imp.latestScore).toBe(75);
  });

  it("weakest current dimension comes from the latest attempt's own score", () => {
    const older = attemptRow({
      id: "a1", created_at: "2026-07-19T00:00:00Z",
      score_json: { dimensions: [{ dimension: "judge_fit", score: 10, explanation: "bad" }] },
    });
    const newer = attemptRow({
      id: "a2", created_at: "2026-07-21T00:00:00Z",
      score_json: { dimensions: [{ dimension: "clarity", score: 30, explanation: "still short" }] },
    });
    const imp = deriveWithinAdaptationImprovement([older, newer]);
    expect(imp.weakestCurrentDimension).toContain("Clarity");
  });

  it("no raw IDs appear in the derived view's rendered-facing fields", () => {
    const imp = deriveWithinAdaptationImprovement([attemptRow(), attemptRow({ id: "a2" })]);
    expect(imp.weakestCurrentDimension ?? "").not.toContain("uuid");
  });
});
