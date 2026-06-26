/**
 * Unit tests for the Next Mission coaching loop model.
 * All pure functions — no React, no API calls.
 */

import {
  MISSION_SKILL_LABELS,
  deriveMissionCardState,
  deriveMissionScoreChanges,
  deriveCompletionDisplay,
  missionTimeLabel,
  missionCtaLabel,
} from "@/lib/missionModel";
import type { StudentMission } from "@/types";

// ── Shared fixture ─────────────────────────────────────────────────────────────

const BASE_MISSION: StudentMission = {
  id:                   "mission-001",
  user_id:              "user-001",
  mission_type:         "skill_focus",
  skill:                "weighing",
  title:                "Build Impact Weighing in Your Summary",
  reason:               "Your last speech showed a critical gap in impact weighing.",
  evidence:             "You never compared impacts against the opposition.",
  source_speech_id:     "speech-001",
  source_report_id:     "report-001",
  recommended_drill_id: "drill-001",
  priority_score:       11.4,
  priority_factors:     { latest_severity: "high", speech_type_relevant: true },
  status:               "ready",
  before_score:         { weighing: 7, clash: 14 },
  after_score:          null,
  score_delta:          null,
  remaining_issue:      null,
  success_criteria: [
    "You explicitly name both sides' impacts.",
    "You use at least one weighing mechanism.",
    "Your comparison closes with a clear voting issue statement.",
  ],
  completion_result: null,
  estimated_minutes: 6,
  created_at:        "2026-06-25T00:00:00Z",
  updated_at:        "2026-06-25T00:00:00Z",
  completed_at:      null,
};

// ═══════════════════════════════════════════════════════════════════════════════
// deriveMissionCardState
// ═══════════════════════════════════════════════════════════════════════════════

describe("deriveMissionCardState", () => {
  it("returns loading when loading=true", () => {
    const state = deriveMissionCardState(true, null, null, false);
    expect(state.kind).toBe("loading");
  });

  it("returns error when error is non-null", () => {
    const state = deriveMissionCardState(false, "oops", null, false);
    expect(state.kind).toBe("error");
    if (state.kind === "error") expect(state.message).toBe("oops");
  });

  it("returns no-speech when hasSpeech is false", () => {
    const state = deriveMissionCardState(false, null, null, false);
    expect(state.kind).toBe("no-speech");
  });

  it("returns no-speech when mission is null even with speech", () => {
    const state = deriveMissionCardState(false, null, null, true);
    expect(state.kind).toBe("no-speech");
  });

  it("returns ready for a ready mission", () => {
    const state = deriveMissionCardState(false, null, BASE_MISSION, true);
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") expect(state.mission.id).toBe("mission-001");
  });

  it("returns in-progress for an in_progress mission", () => {
    const m = { ...BASE_MISSION, status: "in_progress" as const };
    const state = deriveMissionCardState(false, null, m, true);
    expect(state.kind).toBe("in-progress");
  });

  it("returns completed for a completed mission", () => {
    const m = { ...BASE_MISSION, status: "completed" as const };
    const state = deriveMissionCardState(false, null, m, true);
    expect(state.kind).toBe("completed");
  });

  it("loading takes precedence over error", () => {
    const state = deriveMissionCardState(true, "err", null, true);
    expect(state.kind).toBe("loading");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// deriveMissionScoreChanges
// ═══════════════════════════════════════════════════════════════════════════════

describe("deriveMissionScoreChanges", () => {
  it("returns empty array when no before/after scores", () => {
    const m = { ...BASE_MISSION, before_score: null, after_score: null };
    expect(deriveMissionScoreChanges(m)).toEqual([]);
  });

  it("returns empty array when only before_score is set", () => {
    const m = { ...BASE_MISSION, after_score: null };
    expect(deriveMissionScoreChanges(m)).toEqual([]);
  });

  it("returns dimension change for weighing improvement", () => {
    const m = {
      ...BASE_MISSION,
      before_score: { weighing: 7 },
      after_score:  { weighing: 14 },
    };
    const changes = deriveMissionScoreChanges(m);
    expect(changes).toHaveLength(1);
    expect(changes[0].label).toContain("Weighing");
    expect(changes[0].before).toBe("7/20");
    expect(changes[0].after).toBe("14/20");
    expect(changes[0].delta).toBe(7);
    expect(changes[0].tone).toBe("improved");
  });

  it("marks tone as regressed when score falls by 2+", () => {
    const m = {
      ...BASE_MISSION,
      skill: "weighing" as const,
      before_score: { weighing: 14 },
      after_score:  { weighing: 7 },
    };
    const changes = deriveMissionScoreChanges(m);
    expect(changes[0].tone).toBe("regressed");
  });

  it("marks tone as unchanged when delta is small", () => {
    const m = {
      ...BASE_MISSION,
      before_score: { weighing: 12 },
      after_score:  { weighing: 13 },
    };
    const changes = deriveMissionScoreChanges(m);
    expect(changes[0].tone).toBe("unchanged");
  });

  it("returns delivery changes for delivery skill", () => {
    const m = {
      ...BASE_MISSION,
      skill:        "delivery" as const,
      before_score: { filler_word_count: 20, words_per_minute: 210 },
      after_score:  { filler_word_count: 8,  words_per_minute: 165 },
    };
    const changes = deriveMissionScoreChanges(m);
    const fillerChange = changes.find((c) => c.label === "Filler words");
    const wpmChange    = changes.find((c) => c.label === "Words per minute");
    expect(fillerChange).toBeDefined();
    expect(fillerChange?.tone).toBe("improved"); // 20 → 8
    expect(wpmChange).toBeDefined();
    expect(wpmChange?.tone).toBe("improved"); // 165 WPM in range
  });

  it("returns no changes for skills without a mapped dimension", () => {
    const m = {
      ...BASE_MISSION,
      skill:        "warranting" as const,
      before_score: {},
      after_score:  {},
    };
    const changes = deriveMissionScoreChanges(m);
    expect(changes).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// deriveCompletionDisplay
// ═══════════════════════════════════════════════════════════════════════════════

describe("deriveCompletionDisplay", () => {
  it("improved result shows positive headline", () => {
    const d = deriveCompletionDisplay("improved", "Impact Weighing");
    expect(d.tone).toBe("improved");
    expect(d.headline).toContain("Impact Weighing");
  });

  it("regressed result shows appropriate message", () => {
    const d = deriveCompletionDisplay("regressed", "Clash");
    expect(d.tone).toBe("regressed");
    expect(d.subline).toContain("Re-record");
  });

  it("unchanged result uses warn tone", () => {
    const d = deriveCompletionDisplay("unchanged", "Extensions");
    expect(d.tone).toBe("unchanged");
    expect(d.subline).toMatch(/rep|practice/i);
  });

  it("completed result uses info tone", () => {
    const d = deriveCompletionDisplay("completed", "Delivery");
    expect(d.tone).toBe("info");
  });

  it("null result uses info tone", () => {
    const d = deriveCompletionDisplay(null, "Drops");
    expect(d.tone).toBe("info");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// missionTimeLabel
// ═══════════════════════════════════════════════════════════════════════════════

describe("missionTimeLabel", () => {
  it("returns ~1 min for very short missions", () => {
    expect(missionTimeLabel(1)).toBe("~1 min");
  });

  it("returns ~N min for missions under 60 minutes", () => {
    expect(missionTimeLabel(10)).toBe("~10 min");
    expect(missionTimeLabel(45)).toBe("~45 min");
  });

  it("returns ~N hr for missions >= 60 minutes", () => {
    expect(missionTimeLabel(60)).toBe("~1 hr");
    expect(missionTimeLabel(90)).toBe("~2 hr");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// missionCtaLabel
// ═══════════════════════════════════════════════════════════════════════════════

describe("missionCtaLabel", () => {
  it("returns Start Mission for ready", () => {
    expect(missionCtaLabel("ready")).toBe("Start Mission");
  });

  it("returns Continue Mission for in_progress", () => {
    expect(missionCtaLabel("in_progress")).toBe("Continue Mission");
  });

  it("returns Start Mission for completed (edge-case, shouldn't render)", () => {
    expect(missionCtaLabel("completed")).toBe("Start Mission");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MISSION_SKILL_LABELS
// ═══════════════════════════════════════════════════════════════════════════════

describe("MISSION_SKILL_LABELS", () => {
  const skills = [
    "warranting", "weighing", "extensions", "drops",
    "evidence_use", "clash", "judge_adaptation", "delivery", "organization",
  ] as const;

  it.each(skills)("has a non-empty label for %s", (skill) => {
    expect(MISSION_SKILL_LABELS[skill]).toBeTruthy();
    expect(MISSION_SKILL_LABELS[skill].length).toBeGreaterThan(3);
  });

  it("maps warranting to human-readable label", () => {
    expect(MISSION_SKILL_LABELS.warranting).toBe("Warranting");
  });

  it("maps evidence_use to human-readable label", () => {
    expect(MISSION_SKILL_LABELS.evidence_use).toBe("Evidence Use");
  });

  it("maps judge_adaptation to human-readable label", () => {
    expect(MISSION_SKILL_LABELS.judge_adaptation).toBe("Judge Adaptation");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe("edge cases", () => {
  it("deriveMissionCardState treats expired status as ready (API never returns expired)", () => {
    const m = { ...BASE_MISSION, status: "expired" as const };
    const state = deriveMissionCardState(false, null, m, true);
    // The /missions/next API only returns ready|in_progress, so expired is
    // an edge case that falls through to the default "ready" display.
    expect(state.kind).toBe("ready");
  });

  it("deriveMissionScoreChanges handles missing dimension in before_score", () => {
    const m = {
      ...BASE_MISSION,
      before_score: { clash: 14 },  // no weighing key
      after_score:  { weighing: 16, clash: 16 },
    };
    const changes = deriveMissionScoreChanges(m);
    // weighing is missing from before → no item for that dimension
    expect(changes.find((c) => c.label.includes("Weighing"))).toBeUndefined();
  });

  it("deriveMissionScoreChanges handles delivery with filler only", () => {
    const m = {
      ...BASE_MISSION,
      skill: "delivery" as const,
      before_score: { filler_word_count: 15 },
      after_score:  { filler_word_count: 6 },
    };
    const changes = deriveMissionScoreChanges(m);
    const filler = changes.find((c) => c.label === "Filler words");
    expect(filler?.tone).toBe("improved");
  });
});
