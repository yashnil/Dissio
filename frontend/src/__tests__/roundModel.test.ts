/**
 * Pass 16 — Round model tests.
 *
 * Covers:
 * - Phase order correctness
 * - next_phase transitions
 * - Phase progress calculation
 * - Flow argument helpers
 * - Decision helpers
 * - Time formatting
 * - Default config
 * - Crossfire/speech phase classification
 */

import {
  FULL_PHASE_ORDER,
  SHORTENED_PHASE_ORDER,
  CROSSFIRE_PHASES,
  SPEECH_PHASES,
  ARGUMENT_STATUS_LABELS,
  ARGUMENT_STATUS_COLORS,
  getPhaseOrder,
  nextPhase,
  phaseProgress,
  isCrossfire,
  isSpeechPhase,
  getProArguments,
  getConArguments,
  getSurvivingOffense,
  getDroppedArguments,
  winnerLabel,
  speakerPoints,
  formatSeconds,
  defaultRoundConfig,
  speechTypeLabel,
  opponentSide,
  sideLabel,
  findPendingCrossfireExchange,
  findAnsweredCrossfireExchanges,
  hasCrossfireDiagnostics,
  isValidCrossfireAnswer,
  isValidCrossfireQuestion,
  upsertCrossfireExchange,
  aiAsksExchanges,
  studentAsksExchanges,
  crossfireExchangeArtifacts,
  CROSSFIRE_EFFECT_LABELS,
  crossfireEffectTone,
  crossfireEffectForExchange,
  crossfireEffectForArgument,
  isCrossfireFollowUp,
  canRequestCrossfireFollowUp,
  crossfireFollowUpReason,
  groupCrossfireExchangesWithFollowUps,
  isValidDrillAttempt,
  hasDrillAttemptScore,
  hasDrillAttemptCredit,
} from "@/lib/roundModel";
import type {
  CrossfireEffect,
  CrossfireExchange,
  RoundArgument,
  RoundDecision,
  RoundDrillAttempt,
  RoundDrillAttemptResult,
} from "@/types/round";

function makeDrillAttemptResult(
  overrides: Partial<RoundDrillAttemptResult> = {},
): RoundDrillAttemptResult {
  return {
    attempt: makeDrillAttempt(),
    xp_awarded: 0,
    mastery_emitted: false,
    ...overrides,
  };
}

function makeDrillAttempt(overrides: Partial<RoundDrillAttempt> = {}): RoundDrillAttempt {
  return {
    id: "attempt-1",
    round_drill_id: "drill-1",
    round_id: "r-1",
    response_text: "My response to the drill.",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeExchange(overrides: Partial<CrossfireExchange> = {}): CrossfireExchange {
  return {
    id: "ex-1",
    round_id: "r-1",
    phase: "first_crossfire",
    sequence: 1,
    questioner_side: "con",
    question: "What is the warrant?",
    target_argument: "P1",
    exchange_type: "question",
    evasion_detected: false,
    strategic_significance: "low",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeEffect(overrides: Partial<CrossfireEffect> = {}): CrossfireEffect {
  return {
    exchange_id: "ex-1",
    affected_argument_label: "P1",
    effect_type: "concession_weakened_argument",
    severity: "high",
    explanation: "Conceded in crossfire: the figure itself.",
    ballot_relevance: true,
    ...overrides,
  };
}

// ── Phase order ────────────────────────────────────────────────────────────────

describe("FULL_PHASE_ORDER", () => {
  it("has 13 phases", () => {
    expect(FULL_PHASE_ORDER).toHaveLength(13);
  });

  it("starts with first_constructive", () => {
    expect(FULL_PHASE_ORDER[0]).toBe("first_constructive");
  });

  it("ends with completed", () => {
    expect(FULL_PHASE_ORDER[FULL_PHASE_ORDER.length - 1]).toBe("completed");
  });

  it("contains judge_deliberation before completed", () => {
    const jd = FULL_PHASE_ORDER.indexOf("judge_deliberation");
    const comp = FULL_PHASE_ORDER.indexOf("completed");
    expect(jd).toBe(comp - 1);
  });
});

describe("SHORTENED_PHASE_ORDER", () => {
  it("does not contain grand_crossfire", () => {
    expect(SHORTENED_PHASE_ORDER).not.toContain("grand_crossfire");
  });

  it("does not contain final_crossfire", () => {
    expect(SHORTENED_PHASE_ORDER).not.toContain("final_crossfire");
  });

  it("still contains first_crossfire", () => {
    expect(SHORTENED_PHASE_ORDER).toContain("first_crossfire");
  });
});

describe("getPhaseOrder", () => {
  it("returns full order by default", () => {
    expect(getPhaseOrder("full")).toEqual(FULL_PHASE_ORDER);
  });

  it("returns shortened order", () => {
    expect(getPhaseOrder("shortened")).toEqual(SHORTENED_PHASE_ORDER);
  });

  it("returns full order for unknown format", () => {
    expect(getPhaseOrder("unknown")).toEqual(FULL_PHASE_ORDER);
  });
});

// ── nextPhase ──────────────────────────────────────────────────────────────────

describe("nextPhase", () => {
  it("returns second_constructive after first_constructive", () => {
    expect(nextPhase("first_constructive", "full")).toBe("second_constructive");
  });

  it("returns null from completed", () => {
    expect(nextPhase("completed", "full")).toBeNull();
  });

  it("returns completed after judge_deliberation", () => {
    expect(nextPhase("judge_deliberation", "full")).toBe("completed");
  });

  it("skips grand_crossfire in shortened format", () => {
    const idx = SHORTENED_PHASE_ORDER.indexOf("second_rebuttal");
    expect(SHORTENED_PHASE_ORDER[idx + 1]).not.toBe("grand_crossfire");
  });
});

// ── phaseProgress ──────────────────────────────────────────────────────────────

describe("phaseProgress", () => {
  it("returns 0 for first phase", () => {
    expect(phaseProgress("first_constructive", "full")).toBe(0);
  });

  it("returns 100 for last phase", () => {
    expect(phaseProgress("completed", "full")).toBe(100);
  });

  it("returns intermediate value for middle phases", () => {
    const progress = phaseProgress("first_summary", "full");
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(100);
  });

  it("returns 0 for unknown phase", () => {
    expect(phaseProgress("unknown_phase" as any, "full")).toBe(0);
  });
});

// ── isCrossfire / isSpeechPhase ────────────────────────────────────────────────

describe("isCrossfire", () => {
  it("returns true for first_crossfire", () => {
    expect(isCrossfire("first_crossfire")).toBe(true);
  });

  it("returns true for grand_crossfire", () => {
    expect(isCrossfire("grand_crossfire")).toBe(true);
  });

  it("returns true for final_crossfire", () => {
    expect(isCrossfire("final_crossfire")).toBe(true);
  });

  it("returns false for first_constructive", () => {
    expect(isCrossfire("first_constructive")).toBe(false);
  });

  it("returns false for first_summary", () => {
    expect(isCrossfire("first_summary")).toBe(false);
  });
});

describe("isSpeechPhase", () => {
  it("returns true for first_constructive", () => {
    expect(isSpeechPhase("first_constructive")).toBe(true);
  });

  it("returns true for first_final_focus", () => {
    expect(isSpeechPhase("first_final_focus")).toBe(true);
  });

  it("returns false for first_crossfire", () => {
    expect(isSpeechPhase("first_crossfire")).toBe(false);
  });
});

// ── Flow argument helpers ──────────────────────────────────────────────────────

const makeArg = (
  label: string,
  side: "pro" | "con",
  status: RoundArgument["status"] = "live",
  is_offense = true,
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
  is_offense,
  is_turn: false,
  is_framework: false,
});

describe("getProArguments", () => {
  it("returns only pro arguments", () => {
    const args = [makeArg("AC1", "pro"), makeArg("NC1", "con")];
    expect(getProArguments(args)).toEqual([args[0]]);
  });
});

describe("getConArguments", () => {
  it("returns only con arguments", () => {
    const args = [makeArg("AC1", "pro"), makeArg("NC1", "con")];
    expect(getConArguments(args)).toEqual([args[1]]);
  });
});

describe("getSurvivingOffense", () => {
  it("returns live pro offense", () => {
    const arg = makeArg("AC1", "pro", "live");
    expect(getSurvivingOffense([arg], "pro")).toContain(arg);
  });

  it("excludes dropped offense", () => {
    const arg = makeArg("AC1", "pro", "dropped");
    expect(getSurvivingOffense([arg], "pro")).not.toContain(arg);
  });

  it("excludes conceded offense", () => {
    const arg = makeArg("AC1", "pro", "conceded");
    expect(getSurvivingOffense([arg], "pro")).not.toContain(arg);
  });

  it("excludes defense arguments", () => {
    const arg = { ...makeArg("AC1", "pro", "live"), is_offense: false };
    expect(getSurvivingOffense([arg], "pro")).not.toContain(arg);
  });

  it("excludes other side", () => {
    const arg = makeArg("NC1", "con", "live");
    expect(getSurvivingOffense([arg], "pro")).not.toContain(arg);
  });
});

describe("getDroppedArguments", () => {
  it("returns dropped arguments regardless of side", () => {
    const proDropped = makeArg("AC1", "pro", "dropped");
    const conDropped = makeArg("NC1", "con", "dropped");
    const live = makeArg("AC2", "pro", "live");
    expect(getDroppedArguments([proDropped, conDropped, live])).toHaveLength(2);
  });
});

// ── Decision helpers ───────────────────────────────────────────────────────────

const makeDecision = (winner: "pro" | "con"): RoundDecision => ({
  id: "d1",
  round_id: "r1",
  judge_type: "flow",
  engine_version: "v1",
  winner,
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
});

describe("winnerLabel", () => {
  it("returns Pro label for pro winner", () => {
    expect(winnerLabel(makeDecision("pro"))).toContain("Pro");
  });

  it("returns Con label for con winner", () => {
    expect(winnerLabel(makeDecision("con"))).toContain("Con");
  });
});

describe("speakerPoints", () => {
  it("returns pro points", () => {
    expect(speakerPoints(makeDecision("pro"), "pro")).toBe(27.5);
  });

  it("returns fallback 27.0 for missing side", () => {
    const d = makeDecision("pro");
    expect(speakerPoints(d, "con")).toBe(27.0);
  });
});

// ── formatSeconds ──────────────────────────────────────────────────────────────

describe("formatSeconds", () => {
  it("formats 0 as 0:00", () => {
    expect(formatSeconds(0)).toBe("0:00");
  });

  it("formats 60 as 1:00", () => {
    expect(formatSeconds(60)).toBe("1:00");
  });

  it("formats 90 as 1:30", () => {
    expect(formatSeconds(90)).toBe("1:30");
  });

  it("formats 245 as 4:05", () => {
    expect(formatSeconds(245)).toBe("4:05");
  });

  it("pads seconds to 2 digits", () => {
    expect(formatSeconds(65)).toBe("1:05");
  });
});

// ── defaultRoundConfig ─────────────────────────────────────────────────────────

describe("defaultRoundConfig", () => {
  it("returns object with required fields", () => {
    const config = defaultRoundConfig();
    expect(config.format).toBe("full");
    expect(config.student_side).toBe("pro");
    expect(config.judge_type).toBe("flow");
    expect(config.opponent_difficulty).toBe("jv");
    expect(config.coaching_hints_enabled).toBe(true);
  });

  it("accepts overrides", () => {
    const config = defaultRoundConfig({ student_side: "con", judge_type: "lay" });
    expect(config.student_side).toBe("con");
    expect(config.judge_type).toBe("lay");
    expect(config.format).toBe("full");  // not overridden
  });

  it("approved lists default to empty", () => {
    const config = defaultRoundConfig();
    expect(config.approved_card_ids).toEqual([]);
    expect(config.approved_blockfile_ids).toEqual([]);
    expect(config.approved_frontline_ids).toEqual([]);
  });
});

// ── speechTypeLabel ────────────────────────────────────────────────────────────

describe("speechTypeLabel", () => {
  it("returns Constructive for first_constructive", () => {
    expect(speechTypeLabel("first_constructive")).toBe("Constructive");
  });

  it("returns Rebuttal for first_rebuttal", () => {
    expect(speechTypeLabel("first_rebuttal")).toBe("Rebuttal");
  });

  it("returns Summary for second_summary", () => {
    expect(speechTypeLabel("second_summary")).toBe("Summary");
  });

  it("returns Final Focus for second_final_focus", () => {
    expect(speechTypeLabel("second_final_focus")).toBe("Final Focus");
  });

  it("returns Speech for unknown phase", () => {
    expect(speechTypeLabel("first_crossfire")).toBe("Speech");
  });
});

// ── ARGUMENT_STATUS_LABELS completeness ───────────────────────────────────────

describe("ARGUMENT_STATUS_LABELS", () => {
  const expected = [
    "introduced", "answered", "conceded", "extended", "underextended",
    "dropped", "turned", "mitigated", "outweighed", "new_in_late_speech",
    "unresolved", "live",
  ];

  expected.forEach((status) => {
    it(`has label for ${status}`, () => {
      expect(ARGUMENT_STATUS_LABELS[status as keyof typeof ARGUMENT_STATUS_LABELS]).toBeTruthy();
    });
  });
});

describe("ARGUMENT_STATUS_COLORS", () => {
  it("has colors for dropped status", () => {
    expect(ARGUMENT_STATUS_COLORS.dropped).toContain("red");
  });

  it("has colors for live status", () => {
    expect(ARGUMENT_STATUS_COLORS.live).toContain("emerald");
  });
});

// ── Crossfire helpers (Phase 8B) ────────────────────────────────────────────────

describe("opponentSide", () => {
  it("returns con for pro", () => {
    expect(opponentSide("pro")).toBe("con");
  });
  it("returns pro for con", () => {
    expect(opponentSide("con")).toBe("pro");
  });
});

describe("sideLabel", () => {
  it("labels pro", () => {
    expect(sideLabel("pro")).toBe("Pro");
  });
  it("labels con", () => {
    expect(sideLabel("con")).toBe("Con");
  });
});

describe("findPendingCrossfireExchange", () => {
  it("returns undefined for an empty list", () => {
    expect(findPendingCrossfireExchange([])).toBeUndefined();
  });

  it("returns undefined when every exchange has an answer", () => {
    const exchanges = [makeExchange({ id: "e1", answer: "Yes." })];
    expect(findPendingCrossfireExchange(exchanges)).toBeUndefined();
  });

  it("returns the exchange with no answer", () => {
    const exchanges = [
      makeExchange({ id: "e1", sequence: 1, answer: "Yes." }),
      makeExchange({ id: "e2", sequence: 2, answer: undefined }),
    ];
    expect(findPendingCrossfireExchange(exchanges)?.id).toBe("e2");
  });

  it("returns the most recent unanswered exchange when multiple exist", () => {
    const exchanges = [
      makeExchange({ id: "e1", sequence: 1, answer: undefined }),
      makeExchange({ id: "e2", sequence: 2, answer: undefined }),
    ];
    expect(findPendingCrossfireExchange(exchanges)?.id).toBe("e2");
  });
});

describe("findAnsweredCrossfireExchanges", () => {
  it("filters out unanswered exchanges", () => {
    const exchanges = [
      makeExchange({ id: "e1", answer: "Yes." }),
      makeExchange({ id: "e2", answer: undefined }),
    ];
    const result = findAnsweredCrossfireExchanges(exchanges);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });

  it("returns an empty array when nothing is answered", () => {
    expect(findAnsweredCrossfireExchanges([makeExchange({ answer: undefined })])).toEqual([]);
  });
});

describe("hasCrossfireDiagnostics", () => {
  it("is false when the backend returned no diagnostics fields", () => {
    expect(hasCrossfireDiagnostics(makeExchange({ answer: "Fine." }))).toBe(false);
  });

  it("is true when a concession was extracted", () => {
    expect(
      hasCrossfireDiagnostics(makeExchange({ concession_extracted: "I concede that point." })),
    ).toBe(true);
  });

  it("is true when a contradiction was flagged", () => {
    expect(hasCrossfireDiagnostics(makeExchange({ contradiction: "Conflicts with prior claim." }))).toBe(
      true,
    );
  });

  it("is true when evasion was detected", () => {
    expect(hasCrossfireDiagnostics(makeExchange({ evasion_detected: true }))).toBe(true);
  });
});

describe("isValidCrossfireAnswer", () => {
  it("rejects empty text", () => {
    expect(isValidCrossfireAnswer("")).toBe(false);
  });
  it("rejects whitespace-only text", () => {
    expect(isValidCrossfireAnswer("   ")).toBe(false);
  });
  it("accepts real text", () => {
    expect(isValidCrossfireAnswer("Our warrant is causal.")).toBe(true);
  });
});

describe("upsertCrossfireExchange", () => {
  it("appends a new exchange to an undefined list", () => {
    const result = upsertCrossfireExchange(undefined, makeExchange({ id: "e1" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });

  it("appends a new exchange to an existing list", () => {
    const existing = [makeExchange({ id: "e1" })];
    const result = upsertCrossfireExchange(existing, makeExchange({ id: "e2" }));
    expect(result.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("replaces an exchange with the same id in place, preserving order", () => {
    const existing = [
      makeExchange({ id: "e1", answer: undefined }),
      makeExchange({ id: "e2", answer: "already answered" }),
    ];
    const updated = makeExchange({ id: "e1", answer: "now answered" });
    const result = upsertCrossfireExchange(existing, updated);
    expect(result.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(result[0].answer).toBe("now answered");
  });

  it("does not mutate the original list", () => {
    const existing = [makeExchange({ id: "e1", answer: undefined })];
    upsertCrossfireExchange(existing, makeExchange({ id: "e1", answer: "answered" }));
    expect(existing[0].answer).toBeUndefined();
  });
});

// ── Bidirectional crossfire (Phase 8C) ──────────────────────────────────────────

describe("isValidCrossfireQuestion", () => {
  it("rejects empty text", () => {
    expect(isValidCrossfireQuestion("")).toBe(false);
  });
  it("rejects whitespace-only text", () => {
    expect(isValidCrossfireQuestion("   ")).toBe(false);
  });
  it("accepts real text", () => {
    expect(isValidCrossfireQuestion("Why does your evidence apply here?")).toBe(true);
  });
});

describe("aiAsksExchanges / studentAsksExchanges", () => {
  const studentSide = "pro" as const;
  const aiAsked = makeExchange({ id: "ai-1", questioner_side: "con" });
  const studentAsked = makeExchange({ id: "student-1", questioner_side: "pro" });
  const mixed = [aiAsked, studentAsked];

  it("aiAsksExchanges returns only exchanges where the opponent is asking", () => {
    const result = aiAsksExchanges(mixed, studentSide);
    expect(result.map((e) => e.id)).toEqual(["ai-1"]);
  });

  it("studentAsksExchanges returns only exchanges where the student is asking", () => {
    const result = studentAsksExchanges(mixed, studentSide);
    expect(result.map((e) => e.id)).toEqual(["student-1"]);
  });

  it("lanes are mutually exclusive and cover every exchange", () => {
    const ai = aiAsksExchanges(mixed, studentSide);
    const student = studentAsksExchanges(mixed, studentSide);
    expect(ai.length + student.length).toBe(mixed.length);
  });

  it("preserves relative order within a lane when multiple exchanges exist", () => {
    const exchanges = [
      makeExchange({ id: "s1", questioner_side: "pro", sequence: 1 }),
      makeExchange({ id: "a1", questioner_side: "con", sequence: 2 }),
      makeExchange({ id: "s2", questioner_side: "pro", sequence: 3 }),
    ];
    expect(studentAsksExchanges(exchanges, "pro").map((e) => e.id)).toEqual(["s1", "s2"]);
    expect(aiAsksExchanges(exchanges, "pro").map((e) => e.id)).toEqual(["a1"]);
  });
});

describe("crossfireExchangeArtifacts", () => {
  const studentSide = "pro" as const;

  it("labels an AI-asked, unanswered exchange as ai_question only", () => {
    const ex = makeExchange({ questioner_side: "con", answer: undefined });
    const artifacts = crossfireExchangeArtifacts(ex, studentSide);
    expect(artifacts.map((a) => a.kind)).toEqual(["ai_question"]);
  });

  it("labels an AI-asked, answered exchange as ai_question then student_answer", () => {
    const ex = makeExchange({ questioner_side: "con", answer: "Our warrant is causal." });
    const artifacts = crossfireExchangeArtifacts(ex, studentSide);
    expect(artifacts.map((a) => a.kind)).toEqual(["ai_question", "student_answer"]);
  });

  it("labels a student-asked, unanswered exchange as student_question only", () => {
    const ex = makeExchange({ questioner_side: "pro", answer: undefined });
    const artifacts = crossfireExchangeArtifacts(ex, studentSide);
    expect(artifacts.map((a) => a.kind)).toEqual(["student_question"]);
  });

  it("labels a student-asked, answered exchange as student_question then ai_answer", () => {
    const ex = makeExchange({ questioner_side: "pro", answer: "We maintain our position." });
    const artifacts = crossfireExchangeArtifacts(ex, studentSide);
    expect(artifacts.map((a) => a.kind)).toEqual(["student_question", "ai_answer"]);
  });

  it("never fabricates an answer artifact when the backend returned none", () => {
    const ex = makeExchange({ questioner_side: "con", answer: undefined });
    const artifacts = crossfireExchangeArtifacts(ex, studentSide);
    expect(artifacts.some((a) => a.kind === "student_answer" || a.kind === "ai_answer")).toBe(false);
  });

  it("carries the exchange id on every artifact for stable list keys, never as visible text", () => {
    const ex = makeExchange({ id: "ex-42", questioner_side: "con", answer: "Fine." });
    const artifacts = crossfireExchangeArtifacts(ex, studentSide);
    expect(artifacts.every((a) => a.exchangeId === "ex-42")).toBe(true);
    artifacts.forEach((a) => expect(a.text).not.toContain("ex-42"));
  });
});

// ── Crossfire effects (Phase 8D) ────────────────────────────────────────────────

describe("CROSSFIRE_EFFECT_LABELS", () => {
  it("labels a real flow-changing consequence as Flow impact", () => {
    expect(CROSSFIRE_EFFECT_LABELS.concession_weakened_argument).toBe("Flow impact");
  });

  it("labels advisory-only consequences as Judge note", () => {
    expect(CROSSFIRE_EFFECT_LABELS.contradiction_warning).toBe("Judge note");
    expect(CROSSFIRE_EFFECT_LABELS.evasion_warning).toBe("Judge note");
  });
});

describe("crossfireEffectTone", () => {
  it("maps high severity to red", () => {
    expect(crossfireEffectTone("high")).toBe("red");
  });
  it("maps medium severity to amber", () => {
    expect(crossfireEffectTone("medium")).toBe("amber");
  });
  it("maps low or unknown severity to neutral, never a bare color-only signal", () => {
    expect(crossfireEffectTone("low")).toBe("neutral");
    expect(crossfireEffectTone("unknown")).toBe("neutral");
  });
});

describe("crossfireEffectForExchange", () => {
  it("returns the effect matching the exchange id", () => {
    const effects = [makeEffect({ exchange_id: "ex-1" }), makeEffect({ exchange_id: "ex-2" })];
    expect(crossfireEffectForExchange(effects, "ex-2")?.exchange_id).toBe("ex-2");
  });

  it("returns undefined — not a fabricated effect — when nothing matches", () => {
    const effects = [makeEffect({ exchange_id: "ex-1" })];
    expect(crossfireEffectForExchange(effects, "ex-999")).toBeUndefined();
  });

  it("returns undefined for an empty effects list (no crossfire happened)", () => {
    expect(crossfireEffectForExchange([], "ex-1")).toBeUndefined();
  });
});

describe("crossfireEffectForArgument", () => {
  it("returns the effect matching the argument label", () => {
    const effects = [makeEffect({ affected_argument_label: "P1" })];
    expect(crossfireEffectForArgument(effects, "P1")?.affected_argument_label).toBe("P1");
  });

  it("returns undefined when no effect targets that argument", () => {
    const effects = [makeEffect({ affected_argument_label: "P1" })];
    expect(crossfireEffectForArgument(effects, "P2")).toBeUndefined();
  });

  it("returns undefined for effects with no argument target (general questions)", () => {
    const effects = [makeEffect({ affected_argument_label: undefined })];
    expect(crossfireEffectForArgument(effects, "P1")).toBeUndefined();
  });
});

// ── Crossfire follow-ups (Phase 8E) ─────────────────────────────────────────────

describe("isCrossfireFollowUp", () => {
  it("is false for an exchange with no follow_up_to", () => {
    const ex = makeExchange({ follow_up_to: undefined });
    expect(isCrossfireFollowUp(ex)).toBe(false);
  });

  it("is true when follow_up_to references a parent exchange", () => {
    const ex = makeExchange({ follow_up_to: "ex-parent" });
    expect(isCrossfireFollowUp(ex)).toBe(true);
  });
});

describe("canRequestCrossfireFollowUp", () => {
  const studentSide = "pro" as const;

  it("is false when the exchange has no diagnostic at all", () => {
    const ex = makeExchange({
      questioner_side: "con", answer: "A clean answer.",
      evasion_detected: false, contradiction: undefined,
    });
    expect(canRequestCrossfireFollowUp(ex, studentSide, [ex])).toBe(false);
  });

  it("is true for an evasive, answered, AI-asked exchange", () => {
    const ex = makeExchange({ questioner_side: "con", answer: "Let's move on.", evasion_detected: true });
    expect(canRequestCrossfireFollowUp(ex, studentSide, [ex])).toBe(true);
  });

  it("is true for a contradictory, answered, AI-asked exchange", () => {
    const ex = makeExchange({
      questioner_side: "con", answer: "The opposite, actually.",
      contradiction: "Conflicts with earlier claim.",
    });
    expect(canRequestCrossfireFollowUp(ex, studentSide, [ex])).toBe(true);
  });

  it("is false for an unanswered exchange even with a diagnostic set", () => {
    const ex = makeExchange({ questioner_side: "con", answer: undefined, evasion_detected: true });
    expect(canRequestCrossfireFollowUp(ex, studentSide, [ex])).toBe(false);
  });

  it("is false when the student asked the question (wrong lane)", () => {
    const ex = makeExchange({ questioner_side: "pro", answer: "An answer.", evasion_detected: true });
    expect(canRequestCrossfireFollowUp(ex, studentSide, [ex])).toBe(false);
  });

  it("is false once a follow-up already exists for this exchange", () => {
    const ex = makeExchange({ id: "ex-1", questioner_side: "con", answer: "Evasive.", evasion_detected: true });
    const followUp = makeExchange({ id: "ex-2", questioner_side: "con", follow_up_to: "ex-1" });
    expect(canRequestCrossfireFollowUp(ex, studentSide, [ex, followUp])).toBe(false);
  });
});

describe("crossfireFollowUpReason", () => {
  it("returns null when there's no diagnostic", () => {
    const ex = makeExchange({ evasion_detected: false, contradiction: undefined });
    expect(crossfireFollowUpReason(ex)).toBeNull();
  });

  it("explains evasion in plain language", () => {
    const ex = makeExchange({ evasion_detected: true });
    expect(crossfireFollowUpReason(ex)).toBe("The answer looked evasive.");
  });

  it("explains contradiction in plain language", () => {
    const ex = makeExchange({ contradiction: "Conflicts with earlier claim." });
    expect(crossfireFollowUpReason(ex)).toBe("The answer contradicted earlier material.");
  });

  it("prefers contradiction over evasion when both are present", () => {
    const ex = makeExchange({ evasion_detected: true, contradiction: "Conflicts with earlier claim." });
    expect(crossfireFollowUpReason(ex)).toBe("The answer contradicted earlier material.");
  });
});

describe("a follow-up exchange is classified as an AI question artifact", () => {
  it("classifies an unanswered follow-up (questioner is the AI) as ai_question", () => {
    const followUp = makeExchange({
      id: "ex-followup", questioner_side: "con", follow_up_to: "ex-parent", answer: undefined,
    });
    const artifacts = crossfireExchangeArtifacts(followUp, "pro");
    expect(artifacts.map((a) => a.kind)).toEqual(["ai_question"]);
  });

  it("classifies an answered follow-up the same as any other answered AI-asked exchange", () => {
    const followUp = makeExchange({
      id: "ex-followup", questioner_side: "con", follow_up_to: "ex-parent", answer: "Fine.",
    });
    const artifacts = crossfireExchangeArtifacts(followUp, "pro");
    expect(artifacts.map((a) => a.kind)).toEqual(["ai_question", "student_answer"]);
  });
});

// ── Transcript grouping (Phase 8F) ──────────────────────────────────────────────

describe("groupCrossfireExchangesWithFollowUps", () => {
  it("returns an empty list for no exchanges", () => {
    expect(groupCrossfireExchangesWithFollowUps([])).toEqual([]);
  });

  it("groups a plain original with no follow-up", () => {
    const original = makeExchange({ id: "ex-1", answer: "An answer." });
    const groups = groupCrossfireExchangesWithFollowUps([original]);
    expect(groups).toHaveLength(1);
    expect(groups[0].original.id).toBe("ex-1");
    expect(groups[0].followUp).toBeUndefined();
  });

  it("nests a follow-up under its original instead of listing it separately", () => {
    const original = makeExchange({ id: "ex-1", sequence: 1, answer: "Let's move on.", evasion_detected: true });
    const followUp = makeExchange({ id: "ex-2", sequence: 2, follow_up_to: "ex-1", answer: "Fine, I'll clarify." });
    const groups = groupCrossfireExchangesWithFollowUps([original, followUp]);
    expect(groups).toHaveLength(1);
    expect(groups[0].original.id).toBe("ex-1");
    expect(groups[0].followUp?.id).toBe("ex-2");
  });

  it("never promotes a follow-up to its own top-level group", () => {
    const original = makeExchange({ id: "ex-1", answer: "Evasive.", evasion_detected: true });
    const followUp = makeExchange({ id: "ex-2", follow_up_to: "ex-1", answer: "Clarified." });
    const groups = groupCrossfireExchangesWithFollowUps([original, followUp]);
    expect(groups.map((g) => g.original.id)).toEqual(["ex-1"]);
  });

  it("keeps unrelated originals in separate groups, preserving order", () => {
    const first = makeExchange({ id: "ex-1", sequence: 1, answer: "A." });
    const second = makeExchange({ id: "ex-3", sequence: 3, answer: "B." });
    const followUpOfFirst = makeExchange({ id: "ex-2", sequence: 2, follow_up_to: "ex-1", answer: "A2." });
    const groups = groupCrossfireExchangesWithFollowUps([first, followUpOfFirst, second]);
    expect(groups.map((g) => g.original.id)).toEqual(["ex-1", "ex-3"]);
    expect(groups[0].followUp?.id).toBe("ex-2");
    expect(groups[1].followUp).toBeUndefined();
  });

  it("leaves an original's followUp undefined if the follow-up hasn't been generated yet", () => {
    const original = makeExchange({ id: "ex-1", answer: "Evasive.", evasion_detected: true });
    const groups = groupCrossfireExchangesWithFollowUps([original]);
    expect(groups[0].followUp).toBeUndefined();
  });
});

// ── Round drill attempts (Phase 8G) ─────────────────────────────────────────────

describe("isValidDrillAttempt", () => {
  it("rejects empty text", () => {
    expect(isValidDrillAttempt("")).toBe(false);
  });

  it("rejects whitespace-only text", () => {
    expect(isValidDrillAttempt("   ")).toBe(false);
  });

  it("accepts real text", () => {
    expect(isValidDrillAttempt("I addressed every opponent argument.")).toBe(true);
  });
});

describe("hasDrillAttemptScore", () => {
  it("is false when the backend never scored the attempt", () => {
    const attempt = makeDrillAttempt({ score: undefined });
    expect(hasDrillAttemptScore(attempt)).toBe(false);
  });

  it("is true when the backend returned a numeric score", () => {
    const attempt = makeDrillAttempt({ score: 85 });
    expect(hasDrillAttemptScore(attempt)).toBe(true);
  });

  it("is true even for a score of 0 — a real score must not be treated as absent", () => {
    const attempt = makeDrillAttempt({ score: 0 });
    expect(hasDrillAttemptScore(attempt)).toBe(true);
  });
});

// ── Drill attempt XP/mastery credit (Phase 8H) ──────────────────────────────────

describe("hasDrillAttemptCredit", () => {
  it("is false when neither XP nor mastery was awarded — nothing invented client-side", () => {
    const result = makeDrillAttemptResult({ xp_awarded: 0, mastery_emitted: false });
    expect(hasDrillAttemptCredit(result)).toBe(false);
  });

  it("is true when XP alone was awarded", () => {
    const result = makeDrillAttemptResult({ xp_awarded: 50, mastery_emitted: false });
    expect(hasDrillAttemptCredit(result)).toBe(true);
  });

  it("is true when mastery alone was emitted", () => {
    const result = makeDrillAttemptResult({ xp_awarded: 0, mastery_emitted: true });
    expect(hasDrillAttemptCredit(result)).toBe(true);
  });

  it("is true when both XP and mastery were awarded", () => {
    const result = makeDrillAttemptResult({ xp_awarded: 20, mastery_emitted: true });
    expect(hasDrillAttemptCredit(result)).toBe(true);
  });
});
