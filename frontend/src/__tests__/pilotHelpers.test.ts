/**
 * Unit tests for pilot readiness helpers.
 * Run with: npm test
 */

import { derivePilotChecklist } from "../components/PilotChecklist";
import type { ProgressSummary, PilotSummary } from "../types";

// ── Test fixtures ──────────────────────────────────────────────────────────────

const emptyProgress: ProgressSummary = {
  speech_count: 0,
  feedback_ready_count: 0,
  drills_assigned_count: 0,
  drill_attempts_count: 0,
  drills_completed_count: 0,
  drill_completion_rate: null,
  incomplete_drills: [],
  skill_averages: null,
  xp: 0,
  level: 1,
  xp_to_next_level: 100,
  badges: [],
};

const fullProgress: ProgressSummary = {
  ...emptyProgress,
  speech_count: 3,
  feedback_ready_count: 2,
  drills_assigned_count: 6,
  drill_attempts_count: 4,
  drills_completed_count: 2,
  drill_completion_rate: 0.33,
};

const fullPilot: PilotSummary = {
  speech_count: 3,
  analyzed_speech_count: 2,
  drill_count: 6,
  drill_attempt_count: 4,
  completed_drill_count: 2,
  rerecord_count: 1,
  comparison_count: 1,
  feedback_rating_count: 2,
  average_feedback_rating: 0.75,
  drill_rating_count: 1,
  average_drill_rating: 1.0,
  return_for_second_speech: true,
  completed_one_drill: true,
  latest_skill_scores: null,
  skill_trends: null,
  common_issues: [],
};

// ── derivePilotChecklist ───────────────────────────────────────────────────────

describe("derivePilotChecklist", () => {
  it("all items are undone for a brand new user", () => {
    const items = derivePilotChecklist(emptyProgress);
    expect(items).toHaveLength(6);
    expect(items.every((i) => !i.done)).toBe(true);
  });

  it("step 1 done when speech_count > 0", () => {
    const prog = { ...emptyProgress, speech_count: 1 };
    const items = derivePilotChecklist(prog);
    expect(items[0].done).toBe(true);
    expect(items[1].done).toBe(false);
  });

  it("step 2 done when feedback_ready_count > 0", () => {
    const prog = { ...emptyProgress, speech_count: 1, feedback_ready_count: 1 };
    const items = derivePilotChecklist(prog);
    expect(items[1].done).toBe(true);
  });

  it("step 3 done when drill_attempts_count > 0", () => {
    const prog = { ...emptyProgress, speech_count: 1, feedback_ready_count: 1, drill_attempts_count: 1 };
    const items = derivePilotChecklist(prog);
    expect(items[2].done).toBe(true);
  });

  it("step 4 (rerecord) uses pilot.rerecord_count when pilot provided", () => {
    const items = derivePilotChecklist(fullProgress, fullPilot);
    expect(items[3].done).toBe(true); // fullPilot.rerecord_count = 1
  });

  it("step 4 (rerecord) falls back to speech_count >= 2 when no pilot summary", () => {
    const prog = { ...emptyProgress, speech_count: 2 };
    const items = derivePilotChecklist(prog);
    expect(items[3].done).toBe(true);
  });

  it("step 4 not done when speech_count === 1 and no pilot summary", () => {
    const prog = { ...emptyProgress, speech_count: 1 };
    const items = derivePilotChecklist(prog);
    expect(items[3].done).toBe(false);
  });

  it("step 5 (comparison) uses pilot.comparison_count", () => {
    const items = derivePilotChecklist(fullProgress, fullPilot);
    expect(items[4].done).toBe(true);
  });

  it("step 5 not done when comparison_count is 0", () => {
    const pilot = { ...fullPilot, comparison_count: 0 };
    const items = derivePilotChecklist(fullProgress, pilot);
    expect(items[4].done).toBe(false);
  });

  it("step 5 not done when no pilot summary", () => {
    const items = derivePilotChecklist(fullProgress);
    expect(items[4].done).toBe(false);
  });

  it("step 6 (rate feedback) uses pilot.feedback_rating_count", () => {
    const items = derivePilotChecklist(fullProgress, fullPilot);
    expect(items[5].done).toBe(true);
  });

  it("step 6 not done when feedback_rating_count is 0", () => {
    const pilot = { ...fullPilot, feedback_rating_count: 0 };
    const items = derivePilotChecklist(fullProgress, pilot);
    expect(items[5].done).toBe(false);
  });

  it("all steps done for a fully active pilot tester", () => {
    const items = derivePilotChecklist(fullProgress, fullPilot);
    expect(items.every((i) => i.done)).toBe(true);
  });

  it("returns exactly 6 items", () => {
    expect(derivePilotChecklist(emptyProgress)).toHaveLength(6);
    expect(derivePilotChecklist(fullProgress, fullPilot)).toHaveLength(6);
  });
});
