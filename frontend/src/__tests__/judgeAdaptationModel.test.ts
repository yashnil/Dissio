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
