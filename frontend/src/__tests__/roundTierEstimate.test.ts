/**
 * Tests for the post-round training-tier estimate + next-focus advice.
 * Pure functions only, same convention as roundModel.test.ts.
 */

import {
  estimateRoundTier,
  nextFocusAdvice,
  tierReasons,
  ROUND_TIER_BADGE_CLASS,
  ROUND_TIER_LABELS,
} from "@/lib/roundTierEstimate";
import type { RoundArgument, RoundDecision, RoundDrill } from "@/types/round";

const makeDecision = (overrides: Partial<RoundDecision> = {}): RoundDecision => ({
  id: "d1",
  round_id: "r1",
  judge_type: "flow",
  engine_version: "v1",
  winner: "pro",
  reason_for_decision: "Test RFD",
  voting_issues: [],
  speaker_points: { pro: 27.5, con: 27.0 },
  decisive_concessions: [],
  dropped_arguments: [],
  evidence_issues: [],
  weighing_comparison: "",
  legality_issues: [],
  adaptation_successes: [],
  adaptation_failures: [],
  decision_trace: {
    arguments_considered: [],
    surviving_voters: [],
    weighing_comparison: "",
    judge_profile_effects: [],
    confidence: "decisive",
  },
  crossfire_effects: [],
  created_at: "2026-06-23T00:00:00",
  ...overrides,
});

const makeArg = (
  label: string,
  side: "pro" | "con",
  status: RoundArgument["status"] = "live",
): RoundArgument => ({
  id: `arg-${label}`,
  round_id: "r1",
  label,
  side,
  claim: `Claim for ${label}`,
  initial_phase: "first_constructive",
  status,
  responses: [],
  extensions: [],
  concessions: [],
  is_offense: true,
  is_turn: false,
  is_framework: false,
});

const makeDrill = (overrides: Partial<RoundDrill> = {}): RoundDrill => ({
  id: "drill-1",
  round_id: "r1",
  drill_id: "clash-01",
  skill_target: "clash",
  title: "Practice clash",
  prompt: "Respond to this argument.",
  success_criteria: [],
  time_limit_seconds: 120,
  source: { round_id: "r1", speech_phase: "first_constructive", weakness_description: "..." },
  created_at: "2026-06-23T00:00:00",
  ...overrides,
});

describe("estimateRoundTier", () => {
  it("scores a clean win with no drops or issues as competitive_varsity", () => {
    const decision = makeDecision({ winner: "pro", speaker_points: { pro: 29, con: 27 }, weighing_comparison: "Pro wins on magnitude." });
    const estimate = estimateRoundTier(decision, "pro", []);
    expect(estimate.tier).toBe("competitive_varsity");
    expect(estimate.label).toBe(ROUND_TIER_LABELS.competitive_varsity);
  });

  it("scores a loss with several student-side drops as building", () => {
    const decision = makeDecision({ winner: "con", speaker_points: { pro: 26, con: 28 } });
    const args = [
      makeArg("AC1", "pro", "dropped"),
      makeArg("AC2", "pro", "dropped"),
      makeArg("AC3", "pro", "dropped"),
    ];
    const estimate = estimateRoundTier(decision, "pro", args);
    expect(estimate.tier).toBe("building");
  });

  it("only counts drops on the student's own side", () => {
    const decision = makeDecision({ winner: "pro", speaker_points: { pro: 28, con: 26 } });
    const conDrops = [makeArg("NC1", "con", "dropped"), makeArg("NC2", "con", "dropped")];
    const estimate = estimateRoundTier(decision, "pro", conDrops);
    // Opponent drops shouldn't drag the student's own tier down.
    expect(estimate.tier).not.toBe("building");
  });

  it("keeps the internal score within 0-100", () => {
    const decision = makeDecision({
      winner: "con",
      speaker_points: { pro: 20, con: 30 },
      adaptation_failures: ["a", "b", "c", "d", "e"],
      evidence_issues: ["x", "y", "z", "w"],
    });
    const args = Array.from({ length: 10 }, (_, i) => makeArg(`AC${i}`, "pro", "dropped"));
    const estimate = estimateRoundTier(decision, "pro", args);
    expect(estimate.score).toBeGreaterThanOrEqual(0);
    expect(estimate.score).toBeLessThanOrEqual(100);
  });

  it("never includes a round or decision id in the label or summary", () => {
    const decision = makeDecision({ id: "11111111-2222-3333-4444-555555555555" });
    const estimate = estimateRoundTier(decision, "pro", []);
    expect(estimate.label).not.toContain(decision.id);
    expect(estimate.summary).not.toContain(decision.id);
  });
});

describe("ROUND_TIER_BADGE_CLASS", () => {
  it("has a class for every tier label", () => {
    for (const tier of Object.keys(ROUND_TIER_LABELS) as Array<keyof typeof ROUND_TIER_LABELS>) {
      expect(ROUND_TIER_BADGE_CLASS[tier].length).toBeGreaterThan(0);
    }
  });
});

describe("tierReasons", () => {
  it("leads with the win/loss outcome", () => {
    const won = makeDecision({ winner: "pro" });
    expect(tierReasons(won, "pro", [])[0]).toContain("Won");

    const lost = makeDecision({ winner: "con" });
    expect(tierReasons(lost, "pro", [])[0]).toContain("Lost");
  });

  it("mentions dropped arguments only on the student's own side", () => {
    const decision = makeDecision({ winner: "pro" });
    const args = [makeArg("AC1", "pro", "dropped"), makeArg("NC1", "con", "dropped")];
    const reasons = tierReasons(decision, "pro", args).join(" ");
    expect(reasons).toContain("1 of your argument");
  });

  it("omits a drops line entirely when nothing was dropped", () => {
    const decision = makeDecision({ winner: "pro" });
    const reasons = tierReasons(decision, "pro", []);
    expect(reasons.some((r) => r.includes("dropped"))).toBe(false);
  });

  it("surfaces real adaptation-failure explanations from the backend", () => {
    const decision = makeDecision({
      winner: "pro",
      adaptation_failures: ["Didn't do comparative weighing — flow judges expect this."],
    });
    const reasons = tierReasons(decision, "pro", []);
    expect(reasons).toContain("Didn't do comparative weighing — flow judges expect this.");
  });

  it("never returns more than 3 reasons", () => {
    const decision = makeDecision({
      winner: "pro",
      weighing_comparison: "Pro wins on magnitude.",
      adaptation_failures: ["Failure A", "Failure B", "Failure C"],
    });
    const args = [makeArg("AC1", "pro", "dropped")];
    expect(tierReasons(decision, "pro", args).length).toBeLessThanOrEqual(3);
  });

  it("never includes a raw decision id", () => {
    const decision = makeDecision({ id: "11111111-2222-3333-4444-555555555555" });
    const reasons = tierReasons(decision, "pro", []).join(" ");
    expect(reasons).not.toContain(decision.id);
  });
});

describe("nextFocusAdvice", () => {
  it("prompts drill generation when there are no drills", () => {
    expect(nextFocusAdvice([])).toBe("Generate post-round drills to see a targeted next step.");
  });

  it("surfaces the most common skill target", () => {
    const drills = [
      makeDrill({ id: "d1", skill_target: "evidence" }),
      makeDrill({ id: "d2", skill_target: "evidence" }),
      makeDrill({ id: "d3", skill_target: "clash" }),
    ];
    expect(nextFocusAdvice(drills)).toContain("evidence");
    expect(nextFocusAdvice(drills)).toContain("2 drills");
  });

  it("humanizes underscored skill target names", () => {
    const drills = [makeDrill({ skill_target: "judge_adaptation" })];
    expect(nextFocusAdvice(drills)).toContain("judge adaptation");
    expect(nextFocusAdvice(drills)).not.toContain("judge_adaptation");
  });

  it("never includes a raw drill or round id", () => {
    const drills = [makeDrill({ id: "aaaa-bbbb-cccc-dddd", round_id: "9999-8888-7777" })];
    const advice = nextFocusAdvice(drills);
    expect(advice).not.toContain("aaaa-bbbb-cccc-dddd");
    expect(advice).not.toContain("9999-8888-7777");
  });
});
