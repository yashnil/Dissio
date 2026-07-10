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
