/**
 * Tournament Prep model tests — pure derivations, no DOM.
 *
 * Truthfulness contract under test:
 *  - entry always offers an action (no dead end)
 *  - no evidence => not ready; partial => partial; concrete coverage => improved
 *  - readiness never turns green from unknown data
 *  - next action picks the most important missing item
 */

import {
  derivePrepEntryState,
  sortWorkspacesByRecency,
  deriveArgumentCoverage,
  deriveEvidenceCoverage,
  deriveFrontlineReadiness,
  deriveTournamentReadiness,
  derivePrepNextAction,
  dimensionTone,
  describeSideFocus,
  sortGapsBySeverity,
} from "@/lib/prepModel";
import type {
  DimensionScore, PrepGap, PrepReadinessReport, PrepTask, PrepWorkout, PrepWorkspace,
} from "@/types/prep";
import type { Argument, Resolution } from "@/types/library";

// ── Factories ─────────────────────────────────────────────────────────────────

function resolution(over: Partial<Resolution> = {}): Resolution {
  return {
    id: "r1", user_id: "u1", title: "Resolved: Test policy.", normalized_title: "resolved test policy",
    event_type: "pf", is_active: true,
    created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

function workspace(over: Partial<PrepWorkspace> = {}): PrepWorkspace {
  return {
    id: "w1", user_id: "u1", resolution_id: "r1", side: "both",
    created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

function arg(side: "pro" | "con", id: string): Argument {
  return {
    id, user_id: "u1", resolution_id: "r1", side, title: `Arg ${id}`,
    argument_type: "advantage" as Argument["argument_type"],
    created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
  };
}

function dim(score: number | undefined, name = "argument_coverage"): DimensionScore {
  return { dimension: name, score, weight: 1, explanation: `${name} explanation`, contributing_gaps: [] };
}

function gap(over: Partial<PrepGap> = {}): PrepGap {
  return {
    gap_category: "missing_response", severity: "medium",
    title: "Missing response to economy turn", reason: "No frontline covers the economy turn.",
    is_deterministic: true, resolved: false,
    recommended_action: "Write a frontline for the economy turn.",
    ...over,
  };
}

function report(over: Partial<PrepReadinessReport> = {}): PrepReadinessReport {
  const d = (s?: number) => dim(s);
  return {
    user_id: "u1", resolution_id: "r1", side: "both",
    generated_at: "2026-07-09T00:00:00Z",
    dimensions: {
      argument_coverage: dim(85, "argument_coverage"),
      evidence_quality: dim(85, "evidence_quality"),
      evidence_freshness: dim(85, "evidence_freshness"),
      frontline_readiness: dim(85, "frontline_readiness"),
      source_diversity: dim(85, "source_diversity"),
      speech_stage_readiness: dim(85, "speech_stage_readiness"),
      weighing_preparation: dim(85, "weighing_preparation"),
    },
    gaps: [], critical_gaps: [], stale_cards: [], unsafe_cards: [],
    strongest_arguments: [], weakest_frontlines: [], blockfile_coverage: [],
    freshness_assessments: [], next_recommended_actions: [],
    total_cards: 12, total_arguments: 6, total_frontlines: 4, total_blockfiles: 2,
    ...over,
  } as PrepReadinessReport;
  void d;
}

// ── Entry state ───────────────────────────────────────────────────────────────

describe("derivePrepEntryState — no dead ends", () => {
  it("no resolutions → empty state (create form + evidence links, not a redirect)", () => {
    expect(derivePrepEntryState([], [])).toBe("empty");
  });

  it("resolutions but no prep → start-prep state", () => {
    expect(derivePrepEntryState([resolution()], [])).toBe("resolutions-only");
  });

  it("existing workspaces → continue state", () => {
    expect(derivePrepEntryState([resolution()], [workspace()])).toBe("has-prep");
  });

  it("recent workspaces sort newest first", () => {
    const old = workspace({ id: "old", updated_at: "2026-07-01T00:00:00Z" });
    const fresh = workspace({ id: "new", updated_at: "2026-07-08T00:00:00Z" });
    expect(sortWorkspacesByRecency([old, fresh]).map((w) => w.id)).toEqual(["new", "old"]);
  });
});

// ── Argument coverage ─────────────────────────────────────────────────────────

describe("deriveArgumentCoverage", () => {
  it("zero arguments on a focused side → red critical gap naming the side", () => {
    const c = deriveArgumentCoverage([arg("pro", "a1")], "both");
    expect(c.tone).toBe("red");
    expect(c.missingSides).toEqual(["CON"]);
    expect(c.explanation).toContain("No CON arguments");
  });

  it("partial coverage (1–2 per focused side) → amber", () => {
    const c = deriveArgumentCoverage([arg("pro", "a1"), arg("pro", "a2")], "pro");
    expect(c.tone).toBe("amber");
    expect(c.explanation).toContain("2 PRO");
  });

  it("3+ arguments on every focused side → green with counts as evidence", () => {
    const c = deriveArgumentCoverage(
      [arg("pro", "a1"), arg("pro", "a2"), arg("pro", "a3")],
      "pro",
    );
    expect(c.tone).toBe("green");
    expect(c.explanation).toContain("3 PRO");
  });

  it("CON-only focus ignores missing PRO coverage", () => {
    const c = deriveArgumentCoverage(
      [arg("con", "c1"), arg("con", "c2"), arg("con", "c3")],
      "con",
    );
    expect(c.tone).toBe("green");
    expect(c.missingSides).toEqual([]);
  });
});

// ── Evidence coverage ─────────────────────────────────────────────────────────

describe("deriveEvidenceCoverage", () => {
  it("no report → neutral unknown, never ready", () => {
    const c = deriveEvidenceCoverage(null);
    expect(c.tone).toBe("neutral");
    expect(c.cardCount).toBeNull();
  });

  it("zero cards → red with the concrete count", () => {
    const c = deriveEvidenceCoverage(report({ total_cards: 0 }));
    expect(c.tone).toBe("red");
    expect(c.explanation).toContain("0 evidence cards");
  });

  it("unsafe cards → red naming the count", () => {
    const c = deriveEvidenceCoverage(report({ unsafe_cards: ["c1", "c2"] }));
    expect(c.tone).toBe("red");
    expect(c.explanation).toContain("2 flagged unsafe");
  });

  it("stale cards → amber (partial readiness)", () => {
    const c = deriveEvidenceCoverage(report({
      stale_cards: [{ card_id: "c1", freshness_state: "stale", claim_type: "empirical", rule_applied: "r", explanation: "old", has_newer_corroboration: false, assessed_at: "2026-07-09" }],
    }));
    expect(c.tone).toBe("amber");
    expect(c.explanation).toContain("1 assessed stale");
  });

  it("cards with clean scan → green with count as evidence", () => {
    const c = deriveEvidenceCoverage(report());
    expect(c.tone).toBe("green");
    expect(c.explanation).toContain("12 cards");
  });
});

// ── Frontline readiness ───────────────────────────────────────────────────────

describe("deriveFrontlineReadiness", () => {
  it("no report → neutral, not a guess", () => {
    expect(deriveFrontlineReadiness(null).tone).toBe("neutral");
  });

  it("zero frontlines → red: expected responses unanswered", () => {
    const f = deriveFrontlineReadiness(report({ total_frontlines: 0 }));
    expect(f.tone).toBe("red");
    expect(f.explanation).toContain("unanswered");
  });

  it("weak frontlines or response gaps → amber needs-work with counts", () => {
    const f = deriveFrontlineReadiness(report({
      weakest_frontlines: ["f1"],
      gaps: [gap({ gap_category: "frontline_underdeveloped" })],
    }));
    expect(f.tone).toBe("amber");
    expect(f.label).toBe("Needs work");
    expect(f.explanation).toContain("1 flagged weakest");
  });

  it("frontlines with no gaps → green", () => {
    expect(deriveFrontlineReadiness(report()).tone).toBe("green");
  });
});

// ── Tournament readiness ──────────────────────────────────────────────────────

describe("deriveTournamentReadiness — never green from unknown data", () => {
  it("no report → neutral not-started", () => {
    const r = deriveTournamentReadiness(null);
    expect(r.overall.tone).toBe("neutral");
    expect(r.dimensions).toEqual([]);
  });

  it("unscored dimensions render neutral, and cap the overall below green", () => {
    const rep = report();
    rep.dimensions.speech_stage_readiness = dim(undefined, "speech_stage_readiness");
    const r = deriveTournamentReadiness(rep);
    const speech = r.dimensions.find((d) => d.key === "speech_stage_readiness")!;
    expect(speech.tone).toBe("neutral");
    expect(speech.score).toBeNull();
    expect(r.overall.tone).toBe("amber"); // unknown data can never be green
    expect(r.overall.explanation).toContain("no data yet");
  });

  it("all dimensions scored 80+ with zero critical gaps → green, decomposed", () => {
    const r = deriveTournamentReadiness(report());
    expect(r.overall.tone).toBe("green");
    expect(r.dimensions).toHaveLength(7);
    expect(r.dimensions.every((d) => d.explanation.length > 0)).toBe(true);
  });

  it("critical gaps force red and name the first gap", () => {
    const r = deriveTournamentReadiness(report({
      critical_gaps: [gap({ severity: "critical", title: "No CON case at all" })],
    }));
    expect(r.overall.tone).toBe("red");
    expect(r.overall.explanation).toContain("No CON case at all");
  });

  it("a low-scored dimension makes the overall red and names it", () => {
    const rep = report();
    rep.dimensions.frontline_readiness = dim(20, "frontline_readiness");
    const r = deriveTournamentReadiness(rep);
    expect(r.overall.tone).toBe("red");
    expect(r.overall.explanation).toContain("Frontline readiness");
  });

  it("dimensionTone: null/unknown is neutral; bands are 80/50", () => {
    expect(dimensionTone(null)).toBe("neutral");
    expect(dimensionTone(undefined)).toBe("neutral");
    expect(dimensionTone(85)).toBe("green");
    expect(dimensionTone(60)).toBe("amber");
    expect(dimensionTone(30)).toBe("red");
  });
});

// ── Next action ───────────────────────────────────────────────────────────────

describe("derivePrepNextAction — most important missing item first", () => {
  const task = (priority: number, id = `t${priority}`): PrepTask => ({
    id, workspace_id: "w1", user_id: "u1", task_type: "build_frontline",
    title: `Task p${priority}`, priority, status: "pending",
    is_auto_generated: true,
    created_at: "2026-07-09T00:00:00Z", updated_at: "2026-07-09T00:00:00Z",
  });
  const workout = (status: PrepWorkout["status"], id = "wo1"): PrepWorkout => ({
    id, workspace_id: "w1", user_id: "u1", workout_type: "frontline_speed",
    title: "Frontline speed drill", prompt: "Answer in 60s", success_criteria: [],
    time_limit_seconds: 60, status,
    created_at: "2026-07-09T00:00:00Z", updated_at: "2026-07-09T00:00:00Z",
  });

  it("no report → generate report", () => {
    const a = derivePrepNextAction({ report: null, tasks: [], workouts: [] });
    expect(a.kind).toBe("generate-report");
  });

  it("critical gap beats tasks and workouts", () => {
    const a = derivePrepNextAction({
      report: report({ gaps: [gap({ severity: "critical", title: "Zero evidence for C1" })] }),
      tasks: [task(1)],
      workouts: [workout("not_started")],
    });
    expect(a.kind).toBe("fix-gap");
    expect(a.title).toBe("Zero evidence for C1");
  });

  it("resolved gaps are skipped", () => {
    const a = derivePrepNextAction({
      report: report({ gaps: [gap({ severity: "critical", resolved: true })] }),
      tasks: [task(2)],
      workouts: [],
    });
    expect(a.kind).toBe("do-task");
  });

  it("highest-priority pending task comes before workouts", () => {
    const a = derivePrepNextAction({
      report: report(),
      tasks: [task(3, "low"), task(1, "high")],
      workouts: [workout("not_started")],
    });
    expect(a.kind).toBe("do-task");
    expect(a.title).toBe("Task p1");
  });

  it("unstarted workout when no gaps or pending tasks", () => {
    const a = derivePrepNextAction({ report: report(), tasks: [], workouts: [workout("not_started")] });
    expect(a.kind).toBe("do-workout");
  });

  it("non-critical gap surfaces when nothing else remains", () => {
    const a = derivePrepNextAction({
      report: report({ gaps: [gap({ severity: "low", title: "Diversify sources" })] }),
      tasks: [], workouts: [],
    });
    expect(a.kind).toBe("fix-gap");
    expect(a.title).toBe("Diversify sources");
  });

  it("everything clear → refresh guidance, never fake completion", () => {
    const a = derivePrepNextAction({ report: report(), tasks: [], workouts: [workout("completed")] });
    expect(a.kind).toBe("refresh");
    expect(a.description).toContain("Refresh the report");
  });
});

// ── Misc ──────────────────────────────────────────────────────────────────────

describe("labels + sorting", () => {
  it("side focus labels are debate-native", () => {
    expect(describeSideFocus("pro")).toBe("PRO");
    expect(describeSideFocus("con")).toBe("CON");
    expect(describeSideFocus("both")).toBe("PRO + CON");
  });

  it("gaps sort critical → info", () => {
    const sorted = sortGapsBySeverity([
      gap({ severity: "low", title: "low" }),
      gap({ severity: "critical", title: "crit" }),
      gap({ severity: "high", title: "high" }),
    ]);
    expect(sorted.map((g) => g.severity)).toEqual(["critical", "high", "low"]);
  });
});

// ── Phase 6B: working-surface helpers ────────────────────────────────────────

import {
  groupCardsByArgument,
  deriveCardWarnings,
  cardVerdictTone,
  groupArgumentsBySide,
  describeArgumentType,
  filterFrontlinesForResolution,
  groupFrontlinesBySide,
  mapGapToTarget,
} from "@/lib/prepModel";
import type { Frontline, LibrarySearchResult } from "@/types/library";

function card(over: Partial<LibrarySearchResult> = {}): LibrarySearchResult {
  return {
    card_id: "card-uuid-1",
    tag: "Carbon pricing cuts emissions 20%",
    cite: "Smith 2026, Brookings",
    body_preview: "Exact source excerpt…",
    side: "pro",
    card_status: "active",
    tags: ["economy"],
    saved_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

function frontline(over: Partial<Frontline> = {}): Frontline {
  return {
    id: "fl-1", user_id: "u1", resolution_id: "r1", side: "pro",
    title: "AT: Economy turn", opponent_claim: "Carbon pricing kills jobs",
    created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

describe("groupCardsByArgument", () => {
  it("groups by argument title, then side bucket, then Unsorted — titles, never IDs", () => {
    const groups = groupCardsByArgument([
      card({ card_id: "c1", argument_id: "arg-uuid", argument_title: "C1: Emissions" }),
      card({ card_id: "c2", side: "con", argument_title: undefined }),
      card({ card_id: "c3", side: undefined, argument_title: undefined }),
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "C1: Emissions",
      "CON — no argument assigned",
      "Unsorted",
    ]);
    // Labels never leak raw IDs.
    for (const g of groups) {
      expect(g.label).not.toContain("uuid");
    }
  });

  it("sorts cards newest-first within a group", () => {
    const groups = groupCardsByArgument([
      card({ card_id: "old", argument_title: "C1", saved_at: "2026-06-01T00:00:00Z" }),
      card({ card_id: "new", argument_title: "C1", saved_at: "2026-07-05T00:00:00Z" }),
    ]);
    expect(groups[0].cards.map((c) => c.card_id)).toEqual(["new", "old"]);
  });

  it("empty input → no groups (empty state upstream)", () => {
    expect(groupCardsByArgument([])).toEqual([]);
  });
});

describe("deriveCardWarnings + cardVerdictTone", () => {
  it("flags unsupported/contradicted/partial verdicts and flagged status", () => {
    expect(deriveCardWarnings(card({ support_verdict: "unsupported" }))).toContainEqual(
      expect.stringContaining("does not support"),
    );
    expect(deriveCardWarnings(card({ support_verdict: "contradicted" }))).toContainEqual(
      expect.stringContaining("contradicted"),
    );
    expect(deriveCardWarnings(card({ card_status: "flagged" }))).toContainEqual(
      "Flagged for review",
    );
  });

  it("missing citation is a provenance warning", () => {
    expect(deriveCardWarnings(card({ cite: undefined }))).toContain("No citation on file");
  });

  it("clean supported card has no warnings", () => {
    expect(deriveCardWarnings(card({ support_verdict: "supported" }))).toEqual([]);
  });

  it("verdict tones: supported green, partial amber, bad red, unverified neutral (never green)", () => {
    expect(cardVerdictTone("supported")).toBe("green");
    expect(cardVerdictTone("partially_supported")).toBe("amber");
    expect(cardVerdictTone("unsupported")).toBe("red");
    expect(cardVerdictTone("contradicted")).toBe("red");
    expect(cardVerdictTone(undefined)).toBe("neutral");
  });
});

describe("groupArgumentsBySide + describeArgumentType", () => {
  it("splits PRO/CON and keeps unassigned separate", () => {
    const g = groupArgumentsBySide([
      arg("pro", "p1"), arg("con", "c1"),
      { ...arg("pro", "n1"), side: "neutral" as Argument["side"] },
    ]);
    expect(g.pro.map((a) => a.id)).toEqual(["p1"]);
    expect(g.con.map((a) => a.id)).toEqual(["c1"]);
    expect(g.other.map((a) => a.id)).toEqual(["n1"]);
  });

  it("missing-side detection still works through deriveArgumentCoverage", () => {
    const c = deriveArgumentCoverage([arg("con", "c1")], "both");
    expect(c.missingSides).toEqual(["PRO"]);
    expect(c.tone).toBe("red");
  });

  it("argument types render debate-native labels", () => {
    expect(describeArgumentType("contention")).toBe("Contention");
    expect(describeArgumentType("response")).toBe("Response");
    expect(describeArgumentType("framework")).toBe("Framework");
    expect(describeArgumentType("weird_future_type")).toBe("Argument");
  });
});

describe("frontline grouping", () => {
  it("filters to the workspace's resolution by saved metadata", () => {
    const kept = filterFrontlinesForResolution(
      [frontline({ id: "a" }), frontline({ id: "b", resolution_id: "other-res" })],
      "r1",
    );
    expect(kept.map((f) => f.id)).toEqual(["a"]);
  });

  it("groups by side with a General bucket for unassigned", () => {
    const g = groupFrontlinesBySide([
      frontline({ id: "p", side: "pro" }),
      frontline({ id: "c", side: "con" }),
      frontline({ id: "n", side: undefined }),
    ]);
    expect(g.pro).toHaveLength(1);
    expect(g.con).toHaveLength(1);
    expect(g.other).toHaveLength(1);
  });
});

describe("mapGapToTarget — gaps route to the place they can be fixed", () => {
  it("evidence gaps → Evidence Studio with add-evidence action", () => {
    for (const cat of ["missing_claim_support", "weak_source", "stale_evidence", "missing_counterevidence"]) {
      const t = mapGapToTarget({ gap_category: cat as PrepGap["gap_category"] });
      expect(t.section).toBe("evidence");
      expect(t.href).toBe("/evidence");
    }
  });

  it("frontline gaps → Library with write-frontline action", () => {
    for (const cat of ["missing_response", "frontline_underdeveloped"]) {
      const t = mapGapToTarget({ gap_category: cat as PrepGap["gap_category"] });
      expect(t.section).toBe("frontlines");
      expect(t.href).toBe("/library");
      expect(t.actionLabel).toBe("Write frontline");
    }
  });

  it("missing argument → Library add-argument", () => {
    const t = mapGapToTarget({ gap_category: "missing_argument" });
    expect(t.section).toBe("arguments");
    expect(t.actionLabel).toBe("Add argument");
  });

  it("speech-stage gaps → practice", () => {
    for (const cat of ["missing_summary_extension", "missing_final_focus_extension", "missing_weighing"]) {
      const t = mapGapToTarget({ gap_category: cat as PrepGap["gap_category"] });
      expect(t.section).toBe("practice");
      expect(t.href).toBe("/session");
    }
  });

  it("unknown categories get a fallback destination with an explanation", () => {
    const t = mapGapToTarget({ gap_category: "future_category" as PrepGap["gap_category"] });
    expect(t.href).toBe("/evidence");
    expect(t.explanation).toContain("No exact target");
  });
});

// ── Phase 6C: item-level deep links + frontline response depth ───────────────

import {
  libraryItemHref,
  libraryItemA11yLabel,
  describeResponseType,
  frontlineResponseWarning,
} from "@/lib/prepModel";

describe("libraryItemHref / libraryItemA11yLabel", () => {
  it("builds item-level Library URLs (IDs in params only)", () => {
    expect(libraryItemHref("card", "c-1")).toBe("/library?card=c-1");
    expect(libraryItemHref("argument", "a-1")).toBe("/library?argument=a-1");
    expect(libraryItemHref("frontline", "f-1")).toBe("/library?frontline=f-1");
  });

  it("URL-encodes IDs safely", () => {
    expect(libraryItemHref("card", "a b/c")).toBe("/library?card=a%20b%2Fc");
  });

  it("a11y labels use human titles, never IDs", () => {
    expect(libraryItemA11yLabel("card", "Carbon pricing cuts emissions"))
      .toBe("Selected evidence card: Carbon pricing cuts emissions");
    expect(libraryItemA11yLabel("frontline", null)).toBe("Selected frontline: untitled");
    expect(libraryItemA11yLabel("argument", "  ")).toBe("Selected argument: untitled");
  });
});

describe("mapGapToTarget — exact entity refs", () => {
  it("gap with card_id → exact card link", () => {
    const t = mapGapToTarget({ gap_category: "weak_source", card_id: "c-9" });
    expect(t.href).toBe("/library?card=c-9");
    expect(t.actionLabel).toBe("Open card");
  });

  it("gap with frontline_id → exact frontline link", () => {
    const t = mapGapToTarget({ gap_category: "frontline_underdeveloped", frontline_id: "f-9" });
    expect(t.href).toBe("/library?frontline=f-9");
    expect(t.actionLabel).toBe("Open frontline");
  });

  it("gap with argument_id → exact argument link", () => {
    const t = mapGapToTarget({ gap_category: "missing_argument", argument_id: "a-9" });
    expect(t.href).toBe("/library?argument=a-9");
    expect(t.actionLabel).toBe("Open argument");
  });

  it("category-matching ref wins over other refs", () => {
    const t = mapGapToTarget({
      gap_category: "missing_response",
      frontline_id: "f-1",
      card_id: "c-1",
    });
    expect(t.href).toBe("/library?frontline=f-1");
  });

  it("frontline gap without a frontline ref falls back to another ref", () => {
    const t = mapGapToTarget({ gap_category: "missing_response", argument_id: "a-2" });
    expect(t.href).toBe("/library?argument=a-2");
  });

  it("gap without any entity ref keeps the Phase 6B section fallback", () => {
    const t = mapGapToTarget({ gap_category: "missing_response" });
    expect(t.href).toBe("/library");
    expect(t.actionLabel).toBe("Write frontline");
    const e = mapGapToTarget({ gap_category: "stale_evidence" });
    expect(e.href).toBe("/evidence");
  });

  it("action labels never contain raw IDs", () => {
    const t = mapGapToTarget({ gap_category: "weak_source", card_id: "ce0a11-uuid-visible?" });
    expect(t.actionLabel).not.toContain("uuid");
    expect(t.explanation).not.toContain("uuid");
  });
});

describe("frontline response depth helpers", () => {
  it("response types render debate-native labels", () => {
    expect(describeResponseType("no_link")).toBe("No link");
    expect(describeResponseType("uniqueness_takeout")).toBe("Uniqueness takeout");
    expect(describeResponseType("evidence_indictment")).toBe("Evidence indictment");
    expect(describeResponseType("future_type")).toBe("future type");
  });

  it("evidence-based response with zero linked cards → unsupported warning", () => {
    expect(frontlineResponseWarning({ is_analytical: false }, 0)).toContain("No linked evidence");
  });

  it("analytical responses never warn about missing cards", () => {
    expect(frontlineResponseWarning({ is_analytical: true }, 0)).toBeNull();
  });

  it("linked evidence present → no warning", () => {
    expect(frontlineResponseWarning({ is_analytical: false }, 2)).toBeNull();
  });

  it("unknown count stays silent — never warn without evidence", () => {
    expect(frontlineResponseWarning({ is_analytical: false }, null)).toBeNull();
  });
});
