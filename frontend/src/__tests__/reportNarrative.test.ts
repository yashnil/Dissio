/**
 * Report narrative model tests — pure utility, no DOM, no React.
 *
 * Covers:
 *  - deriveDecisiveMoment: no issues, high-severity preference, all fields
 *  - deriveStrongestSequence: empty, full chain, offense bonus, confidence
 *  - deriveCriticalBreakdown: no issues, skill mapping, drill linking
 *  - deriveWeaknessDrillLinks: empty, source_weakness, issue matching
 *  - hasDecisiveMoment / hasCompleteChain: gating helpers
 *  - drillNarrativeTitle: known + unknown skill targets
 *  - ISSUE_TO_SKILL: map coverage
 *  - Report loading/empty/partial/failure states
 *  - Weakness → drill linkage correctness
 */

import {
  deriveDecisiveMoment,
  deriveStrongestSequence,
  deriveCriticalBreakdown,
  deriveWeaknessDrillLinks,
  deriveIssueExcerpt,
  hasDecisiveMoment,
  hasCompleteChain,
  drillNarrativeTitle,
  ISSUE_TO_SKILL,
} from "@/lib/reportNarrative";
import type { FeedbackReport, ArgumentItem, Drill, DebateIssue } from "@/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function issue(over: Partial<DebateIssue>): DebateIssue {
  return {
    issue_type: "no_weighing",
    severity: "medium",
    title: "No impact weighing",
    explanation: "You did not compare your impacts to the opponent's.",
    why_it_matters: "Without weighing, the judge has no reason to prefer your impacts.",
    recommendation: "Add a weighing block comparing magnitude and timeframe.",
    affected_argument_labels: ["C1", "C2"],
    recommended_drill_type: "weighing",
    ...over,
  };
}

function fb(over: Partial<FeedbackReport["raw_feedback"]> = {}): FeedbackReport {
  return {
    id: "f1",
    speech_id: "s1",
    overall_score: 72,
    scores: { clash: 14, weighing: 9, extensions: 16, drops: 18, judge_adaptation: 12 },
    summary: "Solid case, weak weighing.",
    strengths: ["Clear contention structure"],
    weaknesses: ["No comparative weighing"],
    raw_feedback: { structured_issues: [issue({})], ...over },
    created_at: "2026-06-01T00:00:00Z",
  } as unknown as FeedbackReport;
}

function arg(over: Partial<ArgumentItem>): ArgumentItem {
  return {
    id: "arg_1",
    label: "C1",
    claim: "Carbon pricing works",
    warrant: "Market mechanism realigns incentives",
    evidence: "Smith 2023",
    impact: "Saves 10M lives by 2050",
    argument_type: "offense",
    issues: [],
    confidence: 0.85,
    ...over,
  };
}

function drill(over: Partial<Drill>): Drill {
  return {
    id: "d1",
    speech_id: "s1",
    title: "Weighing sprint",
    description: "Practice comparing impact magnitude",
    prompt: "Compare two impacts on magnitude and timeframe",
    skill_target: "weighing",
    difficulty: "intermediate",
    status: "assigned",
    order: 1,
    success_criteria: ["Uses magnitude comparison", "References timeframe"],
    instructions: "1. Pick two impacts\n2. Compare them",
    source_weakness: "No impact weighing found",
    time_limit_seconds: 120,
    created_at: "2026-06-01T00:00:00Z",
    ...over,
  } as Drill;
}

// ── deriveDecisiveMoment ──────────────────────────────────────────────────────

describe("deriveDecisiveMoment", () => {
  test("returns null when feedback has no structured issues", () => {
    const f = fb({ structured_issues: undefined });
    expect(deriveDecisiveMoment(f)).toBeNull();
  });

  test("returns null when structured_issues is empty", () => {
    const f = fb({ structured_issues: [] });
    expect(deriveDecisiveMoment(f)).toBeNull();
  });

  test("prefers high-severity issue over medium", () => {
    const f = fb({
      structured_issues: [
        issue({ severity: "medium", title: "Medium issue" }),
        issue({ severity: "high", title: "High issue" }),
      ],
    });
    const result = deriveDecisiveMoment(f)!;
    expect(result.title).toBe("High issue");
    expect(result.severity).toBe("high");
  });

  test("falls back to first issue when no high-severity", () => {
    const f = fb({
      structured_issues: [
        issue({ severity: "low", title: "Low first" }),
        issue({ severity: "medium", title: "Medium second" }),
      ],
    });
    const result = deriveDecisiveMoment(f)!;
    expect(result.title).toBe("Low first");
  });

  test("returns all required fields", () => {
    const result = deriveDecisiveMoment(fb())!;
    expect(result.title).toBeTruthy();
    expect(result.severity).toMatch(/^(high|medium|low)$/);
    expect(result.issueType).toBeTruthy();
    expect(Array.isArray(result.affectedArguments)).toBe(true);
  });

  test("populates why and recommendation from issue fields", () => {
    const result = deriveDecisiveMoment(fb())!;
    expect(result.why).toContain("weighing");
    expect(result.recommendation).toContain("weighing block");
  });

  test("handles missing why_it_matters and recommendation gracefully", () => {
    const f = fb({
      structured_issues: [issue({ why_it_matters: undefined as unknown as string, recommendation: undefined as unknown as string })],
    });
    const result = deriveDecisiveMoment(f)!;
    expect(result.why).toBeNull();
    expect(result.recommendation).toBeNull();
  });

  test("populates affectedArguments from issue labels", () => {
    const result = deriveDecisiveMoment(fb())!;
    expect(result.affectedArguments).toEqual(["C1", "C2"]);
  });

  test("handles missing affected_argument_labels", () => {
    const f = fb({
      structured_issues: [issue({ affected_argument_labels: undefined as unknown as string[] })],
    });
    const result = deriveDecisiveMoment(f)!;
    expect(result.affectedArguments).toEqual([]);
  });
});

// ── deriveStrongestSequence ───────────────────────────────────────────────────

describe("deriveStrongestSequence", () => {
  test("returns null for empty argument list", () => {
    expect(deriveStrongestSequence([])).toBeNull();
  });

  test("returns the single argument when only one exists", () => {
    const result = deriveStrongestSequence([arg({})])!;
    expect(result.label).toBe("C1");
    expect(result.claim).toBe("Carbon pricing works");
  });

  test("prefers complete chain (all 4 CWEI fields)", () => {
    // incomplete (C2): 0.9 + 0.0 (no chain) + 0.15 + 0.1 = 1.15
    // complete   (C1): 0.8 + 0.2 (chain)    + 0.15 + 0.1 = 1.25 → wins
    const incomplete = arg({ label: "C2", evidence: null, confidence: 0.9 });
    const complete = arg({ label: "C1", confidence: 0.8 });
    const result = deriveStrongestSequence([incomplete, complete])!;
    expect(result.label).toBe("C1");
    expect(result.hasFullChain).toBe(true);
  });

  test("prefers offense type over other types at equal chain completeness", () => {
    // defense score: 0.70 + 0.2 (chain) + 0.0 (defense) + 0.1 (no issues) = 1.00
    // offense score: 0.80 + 0.2 (chain) + 0.15 (offense) + 0.1 (no issues) = 1.25
    const defense = arg({ label: "D1", argument_type: "defense", confidence: 0.70 });
    const offense = arg({ label: "C1", argument_type: "offense", confidence: 0.80 });
    const result = deriveStrongestSequence([defense, offense])!;
    expect(result.label).toBe("C1");
  });

  test("hasFullChain is false when evidence is null", () => {
    const result = deriveStrongestSequence([arg({ evidence: null })])!;
    expect(result.hasFullChain).toBe(false);
    expect(result.evidence).toBeNull();
  });

  test("hasFullChain is false when impact is empty string", () => {
    const result = deriveStrongestSequence([arg({ impact: "" })])!;
    expect(result.hasFullChain).toBe(false);
  });

  test("hasFullChain is true when all 4 fields are present", () => {
    const result = deriveStrongestSequence([arg({})])!;
    expect(result.hasFullChain).toBe(true);
  });

  test("assigns confidence from original arg", () => {
    const result = deriveStrongestSequence([arg({ confidence: 0.72 })])!;
    expect(result.confidence).toBe(0.72);
  });

  test("handles null confidence gracefully", () => {
    const result = deriveStrongestSequence([arg({ confidence: null })])!;
    expect(result.confidence).toBeNull();
  });

  test("argument with no issues gets bonus over argument with issues", () => {
    // flawed score: 0.75 + 0.2 (chain) + 0.15 (offense) + 0.0 (has issues) = 1.10
    // clean score:  0.75 + 0.2 (chain) + 0.15 (offense) + 0.1 (no issues) = 1.20
    const flawed = arg({ label: "C1", issues: ["missing_warrant"], confidence: 0.75 });
    const clean = arg({ label: "C2", issues: [], confidence: 0.75 });
    const result = deriveStrongestSequence([flawed, clean])!;
    expect(result.label).toBe("C2");
  });
});

// ── deriveCriticalBreakdown ───────────────────────────────────────────────────

describe("deriveCriticalBreakdown", () => {
  test("returns null when feedback has no structured issues", () => {
    const f = fb({ structured_issues: [] });
    expect(deriveCriticalBreakdown(f, [])).toBeNull();
  });

  test("returns the high-severity issue as the breakdown", () => {
    const f = fb({
      structured_issues: [
        issue({ severity: "medium", title: "Medium" }),
        issue({ severity: "high", title: "Critical", issue_type: "no_weighing" }),
      ],
    });
    const result = deriveCriticalBreakdown(f, [])!;
    expect(result.title).toBe("Critical");
    expect(result.severity).toBe("high");
  });

  test("maps no_weighing issue type to weighing drill skill", () => {
    const f = fb({ structured_issues: [issue({ issue_type: "no_weighing" })] });
    const result = deriveCriticalBreakdown(f, [])!;
    expect(result.linkedDrillSkill).toBe("weighing");
  });

  test("maps missing_warrant to warranting", () => {
    const f = fb({ structured_issues: [issue({ issue_type: "missing_warrant" })] });
    expect(deriveCriticalBreakdown(f, [])!.linkedDrillSkill).toBe("warranting");
  });

  test("maps dropped_argument to drops", () => {
    const f = fb({ structured_issues: [issue({ issue_type: "dropped_argument" })] });
    expect(deriveCriticalBreakdown(f, [])!.linkedDrillSkill).toBe("drops");
  });

  test("links to an assigned drill with matching skill target", () => {
    const f = fb({ structured_issues: [issue({ issue_type: "no_weighing" })] });
    const d = drill({ skill_target: "weighing", status: "assigned" });
    const result = deriveCriticalBreakdown(f, [d])!;
    expect(result.drillId).toBe("d1");
  });

  test("does not link to a completed drill", () => {
    const f = fb({ structured_issues: [issue({ issue_type: "no_weighing" })] });
    const d = drill({ skill_target: "weighing", status: "completed" });
    const result = deriveCriticalBreakdown(f, [d])!;
    expect(result.drillId).toBeNull();
  });

  test("drillId is null when no matching drill exists", () => {
    const f = fb({ structured_issues: [issue({ issue_type: "no_weighing" })] });
    const d = drill({ skill_target: "clash" });
    const result = deriveCriticalBreakdown(f, [d])!;
    expect(result.drillId).toBeNull();
  });

  test("includes explanation field from the issue", () => {
    const result = deriveCriticalBreakdown(fb(), [])!;
    expect(result.explanation).toContain("compare your impacts");
  });
});

// ── deriveWeaknessDrillLinks ──────────────────────────────────────────────────

describe("deriveWeaknessDrillLinks", () => {
  test("returns empty array for no drills", () => {
    expect(deriveWeaknessDrillLinks([], null)).toEqual([]);
  });

  test("returns one entry per drill", () => {
    const drills = [drill({ id: "d1" }), drill({ id: "d2", title: "Clash drill", skill_target: "clash" })];
    const result = deriveWeaknessDrillLinks(drills, null);
    expect(result).toHaveLength(2);
  });

  test("uses source_weakness when available", () => {
    const d = drill({ source_weakness: "No weighing found in your flow" });
    const result = deriveWeaknessDrillLinks([d], null);
    expect(result[0].weakness).toBe("No weighing found in your flow");
  });

  test("falls back to structured issue title when source_weakness is absent", () => {
    const d = drill({ source_weakness: null, skill_target: "weighing" });
    const f = fb({ structured_issues: [issue({ issue_type: "no_weighing", title: "Weighing gap" })] });
    const result = deriveWeaknessDrillLinks([d], f);
    expect(result[0].weakness).toBe("Weighing gap");
  });

  test("uses why_it_matters from matched issue as 'why'", () => {
    const d = drill({ skill_target: "weighing", source_weakness: null });
    const f = fb({ structured_issues: [issue({ issue_type: "no_weighing" })] });
    const result = deriveWeaknessDrillLinks([d], f);
    // The fixture why_it_matters starts with capital W
    expect(result[0].why.toLowerCase()).toContain("without weighing");
  });

  test("falls back to generic why when no matching issue", () => {
    const d = drill({ skill_target: "clash", source_weakness: null });
    const result = deriveWeaknessDrillLinks([d], null);
    expect(result[0].why).toContain("clash");
  });

  test("always includes drillId and drillTitle", () => {
    const d = drill({ id: "drill-x", title: "Test drill" });
    const result = deriveWeaknessDrillLinks([d], null);
    expect(result[0].drillId).toBe("drill-x");
    expect(result[0].drillTitle).toBe("Test drill");
  });

  test("includes skillTarget in each entry", () => {
    const result = deriveWeaknessDrillLinks([drill({ skill_target: "extensions" })], null);
    expect(result[0].skillTarget).toBe("extensions");
  });
});

// ── hasDecisiveMoment ─────────────────────────────────────────────────────────

describe("hasDecisiveMoment", () => {
  test("returns false for null feedback", () => {
    expect(hasDecisiveMoment(null)).toBe(false);
  });

  test("returns false when no structured_issues field", () => {
    const f = fb({ structured_issues: undefined });
    expect(hasDecisiveMoment(f)).toBe(false);
  });

  test("returns false when structured_issues is empty", () => {
    const f = fb({ structured_issues: [] });
    expect(hasDecisiveMoment(f)).toBe(false);
  });

  test("returns true when at least one structured issue exists", () => {
    expect(hasDecisiveMoment(fb())).toBe(true);
  });
});

// ── hasCompleteChain ──────────────────────────────────────────────────────────

describe("hasCompleteChain", () => {
  test("returns true when all 4 CWEI fields are present", () => {
    expect(hasCompleteChain(arg({}))).toBe(true);
  });

  test("returns false when evidence is null", () => {
    expect(hasCompleteChain(arg({ evidence: null }))).toBe(false);
  });

  test("returns false when impact is empty string", () => {
    expect(hasCompleteChain(arg({ impact: "" }))).toBe(false);
  });

  test("returns false when claim is empty", () => {
    expect(hasCompleteChain(arg({ claim: "" }))).toBe(false);
  });

  test("returns false when warrant is empty", () => {
    expect(hasCompleteChain(arg({ warrant: "" }))).toBe(false);
  });
});

// ── drillNarrativeTitle ───────────────────────────────────────────────────────

describe("drillNarrativeTitle", () => {
  const cases: [string, string][] = [
    ["weighing",         "Impact weighing drill"],
    ["warranting",       "Warrant-building drill"],
    ["drops",            "Drop prevention drill"],
    ["extensions",       "Extension quality drill"],
    ["evidence",         "Evidence use drill"],
    ["clash",            "Clash drill"],
    ["judge_adaptation", "Judge adaptation drill"],
  ];
  test.each(cases)("%s → %s", (skill, expected) => {
    expect(drillNarrativeTitle(skill)).toBe(expected);
  });

  test("unknown skill target uses humanized snake_case fallback", () => {
    expect(drillNarrativeTitle("my_custom_skill")).toBe("my custom skill drill");
  });
});

// ── ISSUE_TO_SKILL map coverage ───────────────────────────────────────────────

describe("ISSUE_TO_SKILL", () => {
  test("all debate issue types that have a drill mapping are present", () => {
    const expectedKeys = [
      "missing_warrant",
      "weak_evidence",
      "unclear_impact",
      "no_weighing",
      "dropped_argument",
      "weak_extension",
      "no_clash",
    ];
    expectedKeys.forEach((key) => {
      expect(ISSUE_TO_SKILL[key]).toBeTruthy();
    });
  });

  test("all mapped values are valid skill target strings", () => {
    const validSkills = new Set([
      "weighing", "warranting", "drops", "extensions",
      "evidence", "clash", "judge_adaptation",
    ]);
    Object.values(ISSUE_TO_SKILL).forEach((skill) => {
      expect(validSkills.has(skill)).toBe(true);
    });
  });

  test("no_weighing and unclear_impact both map to weighing", () => {
    expect(ISSUE_TO_SKILL["no_weighing"]).toBe("weighing");
    expect(ISSUE_TO_SKILL["unclear_impact"]).toBe("weighing");
  });
});

// ── Report state scenarios ────────────────────────────────────────────────────

describe("report hierarchy — loading/empty/partial/failure states", () => {
  test("loading state: null feedback → hasDecisiveMoment is false", () => {
    expect(hasDecisiveMoment(null)).toBe(false);
  });

  test("empty state: feedback with no issues → no decisive moment", () => {
    const f = fb({ structured_issues: [] });
    expect(deriveDecisiveMoment(f)).toBeNull();
    expect(deriveCriticalBreakdown(f, [])).toBeNull();
  });

  test("partial state: feedback with issues but no drills → drillId is null", () => {
    const result = deriveCriticalBreakdown(fb(), [])!;
    expect(result).not.toBeNull();
    expect(result.drillId).toBeNull();
  });

  test("full state: feedback + drills → complete narrative chain", () => {
    const f = fb({ structured_issues: [issue({ issue_type: "no_weighing" })] });
    const d = drill({ skill_target: "weighing" });
    const breakdown = deriveCriticalBreakdown(f, [d])!;
    const links = deriveWeaknessDrillLinks([d], f);
    expect(breakdown.drillId).toBe("d1");
    expect(links[0].weakness).toBeTruthy();
    expect(links[0].why).toBeTruthy();
  });

  test("failure state (null feedback): all narrative functions return safe defaults", () => {
    expect(deriveStrongestSequence([])).toBeNull();
    expect(deriveWeaknessDrillLinks([], null)).toEqual([]);
    expect(hasDecisiveMoment(null)).toBe(false);
  });
});

// ── Weakness → drill linkage ──────────────────────────────────────────────────

describe("weakness → drill linkage correctness", () => {
  test("weighing issue links to weighing drill", () => {
    const f = fb({ structured_issues: [issue({ issue_type: "no_weighing" })] });
    const d = drill({ skill_target: "weighing", status: "assigned" });
    expect(deriveCriticalBreakdown(f, [d])!.drillId).toBe("d1");
  });

  test("dropping issue links to drops drill", () => {
    const f = fb({ structured_issues: [issue({ issue_type: "dropped_argument" })] });
    const d = drill({ skill_target: "drops", status: "assigned" });
    expect(deriveCriticalBreakdown(f, [d])!.drillId).toBe("d1");
  });

  test("multiple drills: only the matching skill target is linked", () => {
    const f = fb({ structured_issues: [issue({ issue_type: "no_weighing" })] });
    const clash_drill = drill({ id: "d-clash", skill_target: "clash", status: "assigned" });
    const weigh_drill = drill({ id: "d-weigh", skill_target: "weighing", status: "assigned" });
    const result = deriveCriticalBreakdown(f, [clash_drill, weigh_drill])!;
    expect(result.drillId).toBe("d-weigh");
  });

  test("drillReason why uses structured issue's why_it_matters", () => {
    const f = fb({
      structured_issues: [
        issue({ issue_type: "no_weighing", why_it_matters: "Rounds are lost on weighing" }),
      ],
    });
    const d = drill({ skill_target: "weighing", source_weakness: null });
    const link = deriveWeaknessDrillLinks([d], f)[0];
    expect(link.why).toBe("Rounds are lost on weighing");
  });
});

// ── deriveIssueExcerpt ────────────────────────────────────────────────────────

describe("deriveIssueExcerpt", () => {
  const explanation = {
    dimension_name: "weighing",
    score: 9,
    score_band: "developing",
    evidence_from_speech: "Our impact is bigger because it affects more people.",
    why_not_higher: "No timeframe or probability comparison.",
    how_to_improve: "Compare magnitude AND timeframe explicitly.",
  };

  test("returns the exact excerpt when a score explanation matches the top issue's skill", () => {
    const f = fb({
      structured_issues: [issue({ issue_type: "no_weighing", severity: "high" })],
      score_explanations: [explanation],
    });
    expect(deriveIssueExcerpt(f)).toBe("Our impact is bigger because it affects more people.");
  });

  test("matches fuzzy dimension names (e.g. 'Impact Weighing')", () => {
    const f = fb({
      structured_issues: [issue({ issue_type: "unclear_impact" })],
      score_explanations: [{ ...explanation, dimension_name: "Impact Weighing" }],
    });
    expect(deriveIssueExcerpt(f)).toBe("Our impact is bigger because it affects more people.");
  });

  test("returns null rather than guessing when no dimension matches", () => {
    const f = fb({
      structured_issues: [issue({ issue_type: "no_clash" })],
      score_explanations: [explanation], // weighing only — no clash explanation
    });
    expect(deriveIssueExcerpt(f)).toBeNull();
  });

  test("returns null when there are no issues or no explanations", () => {
    expect(deriveIssueExcerpt(fb({ structured_issues: [] }))).toBeNull();
    expect(deriveIssueExcerpt(fb({ score_explanations: [] }))).toBeNull();
  });

  test("returns null for an empty/whitespace excerpt", () => {
    const f = fb({
      structured_issues: [issue({ issue_type: "no_weighing" })],
      score_explanations: [{ ...explanation, evidence_from_speech: "   " }],
    });
    expect(deriveIssueExcerpt(f)).toBeNull();
  });
});
