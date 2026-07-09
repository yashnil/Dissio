/**
 * Dashboard model tests — pure utility, no DOM, no React.
 *
 * Covers:
 *  - deriveUserStage: new-user → has-speech → has-feedback → has-drills → repeating
 *  - deriveDashboardState: all 6 sections gated correctly
 *  - next-action delegation: selectNextAction integration
 *  - section visibility: new-user, mid-funnel, returning-user states
 *  - hasPendingRecovery: error / in-progress speeches
 *  - permission-aware content: student vs coach fields
 *  - reduced-motion path: LOOP_STEP_INDEX values
 */

import {
  deriveUserStage,
  deriveDashboardState,
  LOOP_STEP_INDEX,
  type UserStage,
} from "@/lib/dashboardModel";
import type { Speech, ProgressSummary, SkillAverages } from "@/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function speech(over: Partial<Speech>): Speech {
  return {
    id: "s1",
    user_id: "u1",
    title: "Test Speech",
    speech_type: "constructive",
    side: "pro",
    judge_type: "flow",
    topic: null,
    audio_url: null,
    duration_seconds: 120,
    status: "done",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    parent_speech_id: null,
    source_drill_id: null,
    ...over,
  };
}

const SKILL_AVG: SkillAverages = {
  clash: 12, weighing: 10, extensions: 8, drops: 14, judge_adaptation: 11,
};

function progress(over: Partial<ProgressSummary>): ProgressSummary {
  return {
    speech_count: 0,
    feedback_ready_count: 0,
    drills_assigned_count: 0,
    drill_attempts_count: 0,
    drill_completion_rate: null,
    xp: 0,
    level: 1,
    xp_to_next_level: 100,
    skill_averages: null,
    incomplete_drills: [],
    badges: [],
    ...over,
  } as unknown as ProgressSummary;
}

// ── deriveUserStage ───────────────────────────────────────────────────────────

describe("deriveUserStage", () => {
  test("no speeches → new-user", () => {
    expect(deriveUserStage([], null)).toBe("new-user");
    expect(deriveUserStage([], progress({}))).toBe("new-user");
  });

  test("speech exists but no feedback → has-speech", () => {
    const s = [speech({ status: "analyzing" })];
    expect(deriveUserStage(s, progress({ speech_count: 1, feedback_ready_count: 0 }))).toBe("has-speech");
  });

  test("feedback ready, no drills attempted → has-feedback", () => {
    const s = [speech({ status: "done" })];
    expect(deriveUserStage(s, progress({ speech_count: 1, feedback_ready_count: 1, drill_attempts_count: 0 }))).toBe("has-feedback");
  });

  test("drill attempted → has-drills", () => {
    const s = [speech({ status: "done" })];
    expect(deriveUserStage(s, progress({ speech_count: 1, feedback_ready_count: 1, drill_attempts_count: 1 }))).toBe("has-drills");
  });

  test("2+ speeches → repeating", () => {
    const s = [speech({ id: "a" }), speech({ id: "b" })];
    expect(deriveUserStage(s, progress({ speech_count: 2, feedback_ready_count: 1 }))).toBe("repeating");
  });

  test("2+ feedback reports → repeating (even with 1 speech)", () => {
    const s = [speech({ status: "done" })];
    expect(deriveUserStage(s, progress({ speech_count: 1, feedback_ready_count: 2 }))).toBe("repeating");
  });
});

// ── LOOP_STEP_INDEX ───────────────────────────────────────────────────────────

describe("LOOP_STEP_INDEX", () => {
  const cases: [UserStage, number][] = [
    ["new-user",    -1],
    ["has-speech",   0],
    ["has-feedback", 1],
    ["has-drills",   2],
    ["repeating",    3],
  ];
  test.each(cases)("%s → step %i", (stage, expected) => {
    expect(LOOP_STEP_INDEX[stage]).toBe(expected);
  });
});

// ── deriveDashboardState ─ new-user ─────────────────────────────────────────

describe("deriveDashboardState — new-user", () => {
  const state = deriveDashboardState([], null);

  test("userStage = new-user", () => expect(state.userStage).toBe("new-user"));
  test("loopStepIndex = -1", () => expect(state.loopStepIndex).toBe(-1));
  test("nextAction kind = first-practice", () => expect(state.nextAction.kind).toBe("first-practice"));
  test("showRecentInsight = false", () => expect(state.showRecentInsight).toBe(false));
  test("showSkillTrajectory = false", () => expect(state.showSkillTrajectory).toBe(false));
  test("showDrillQueue = false", () => expect(state.showDrillQueue).toBe(false));
  test("showSpeechHistory = false", () => expect(state.showSpeechHistory).toBe(false));
  test("showMidFunnelGuide = false", () => expect(state.showMidFunnelGuide).toBe(false));
  test("hasPendingRecovery = false", () => expect(state.hasPendingRecovery).toBe(false));
});

// ── deriveDashboardState — first speech recording (has-speech) ───────────────

describe("deriveDashboardState — has-speech (processing)", () => {
  const speeches = [speech({ status: "analyzing" })];
  const prog = progress({ speech_count: 1, feedback_ready_count: 0, drill_attempts_count: 0 });
  const state = deriveDashboardState(speeches, prog);

  test("userStage = has-speech", () => expect(state.userStage).toBe("has-speech"));
  test("nextAction kind = resume-analysis", () => expect(state.nextAction.kind).toBe("resume-analysis"));
  test("showRecentInsight = false (no feedback yet)", () => expect(state.showRecentInsight).toBe(false));
  test("showMidFunnelGuide = true (has speech, no drills)", () => expect(state.showMidFunnelGuide).toBe(true));
  test("showSpeechHistory = true", () => expect(state.showSpeechHistory).toBe(true));
  test("hasPendingRecovery = true (analyzing)", () => expect(state.hasPendingRecovery).toBe(true));
});

// ── deriveDashboardState — feedback ready, no drills ─────────────────────────

describe("deriveDashboardState — has-feedback", () => {
  const speeches = [speech({ status: "done" })];
  const prog = progress({
    speech_count: 1,
    feedback_ready_count: 1,
    drill_attempts_count: 0,
    skill_averages: SKILL_AVG,
    incomplete_drills: [{ id: "d1", speech_id: "s1", title: "Warrant reps", skill_target: "weighing", difficulty: "medium", status: "assigned", speech_title: "Constructive" }],
  });
  const state = deriveDashboardState(speeches, prog);

  test("userStage = has-feedback", () => expect(state.userStage).toBe("has-feedback"));
  test("showRecentInsight = true", () => expect(state.showRecentInsight).toBe(true));
  test("showSkillTrajectory = true (skill_averages present)", () => expect(state.showSkillTrajectory).toBe(true));
  test("showDrillQueue = true (drills assigned)", () => expect(state.showDrillQueue).toBe(true));
  test("showMidFunnelGuide = true (no attempts yet)", () => expect(state.showMidFunnelGuide).toBe(true));
  test("nextAction kind = recommended-drill", () => expect(state.nextAction.kind).toBe("recommended-drill"));
});

// ── deriveDashboardState — active learner (has-drills) ───────────────────────

describe("deriveDashboardState — has-drills", () => {
  const speeches = [speech({ status: "done" })];
  const prog = progress({
    speech_count: 1,
    feedback_ready_count: 1,
    drill_attempts_count: 2,
    skill_averages: SKILL_AVG,
    incomplete_drills: [],
  });
  const state = deriveDashboardState(speeches, prog);

  test("userStage = has-drills", () => expect(state.userStage).toBe("has-drills"));
  test("showMidFunnelGuide = false (drill attempted)", () => expect(state.showMidFunnelGuide).toBe(false));
  test("showDrillQueue = false (no incomplete drills)", () => expect(state.showDrillQueue).toBe(false));
  test("nextAction kind = re-record", () => expect(state.nextAction.kind).toBe("re-record"));
});

// ── deriveDashboardState — returning user (repeating) ────────────────────────

describe("deriveDashboardState — repeating", () => {
  const speeches = [speech({ id: "a" }), speech({ id: "b", parent_speech_id: "a" })];
  const prog = progress({
    speech_count: 2,
    feedback_ready_count: 2,
    drill_attempts_count: 3,
    skill_averages: SKILL_AVG,
    incomplete_drills: [{ id: "d1", speech_id: "s1", title: "Clash drills", skill_target: "clash", difficulty: "hard", status: "assigned", speech_title: "Rebuttal" }],
  });
  const state = deriveDashboardState(speeches, prog);

  test("userStage = repeating", () => expect(state.userStage).toBe("repeating"));
  test("loopStepIndex = 3", () => expect(state.loopStepIndex).toBe(3));
  test("showMidFunnelGuide = false", () => expect(state.showMidFunnelGuide).toBe(false));
  test("showRecentInsight = true", () => expect(state.showRecentInsight).toBe(true));
  test("showSkillTrajectory = true", () => expect(state.showSkillTrajectory).toBe(true));
  test("showDrillQueue = true", () => expect(state.showDrillQueue).toBe(true));
  test("showSpeechHistory = true", () => expect(state.showSpeechHistory).toBe(true));
  test("nextAction kind = recommended-drill", () => expect(state.nextAction.kind).toBe("recommended-drill"));
});

// ── hasPendingRecovery ────────────────────────────────────────────────────────

describe("hasPendingRecovery", () => {
  test("false when all done", () => {
    const state = deriveDashboardState([speech({ status: "done" })], null);
    expect(state.hasPendingRecovery).toBe(false);
  });
  test("true when error present", () => {
    const state = deriveDashboardState([speech({ status: "error" })], null);
    expect(state.hasPendingRecovery).toBe(true);
  });
  test("true when transcribing", () => {
    const state = deriveDashboardState([speech({ status: "transcribing" })], null);
    expect(state.hasPendingRecovery).toBe(true);
  });
  test("true when analyzing", () => {
    const state = deriveDashboardState([speech({ status: "analyzing" })], null);
    expect(state.hasPendingRecovery).toBe(true);
  });
  test("false when only pending (no analysis started)", () => {
    const state = deriveDashboardState([speech({ status: "pending" })], null);
    expect(state.hasPendingRecovery).toBe(false);
  });
});

// ── showSkillTrajectory gating ────────────────────────────────────────────────

describe("showSkillTrajectory gating", () => {
  const speeches = [speech({ status: "done" })];

  test("false when no skill_averages (null)", () => {
    const prog = progress({ feedback_ready_count: 1, skill_averages: null });
    expect(deriveDashboardState(speeches, prog).showSkillTrajectory).toBe(false);
  });

  test("false when feedback_ready_count = 0", () => {
    const prog = progress({ feedback_ready_count: 0, skill_averages: SKILL_AVG });
    expect(deriveDashboardState(speeches, prog).showSkillTrajectory).toBe(false);
  });

  test("true when skill_averages present and feedback_ready_count >= 1", () => {
    const prog = progress({ feedback_ready_count: 1, skill_averages: SKILL_AVG });
    expect(deriveDashboardState(speeches, prog).showSkillTrajectory).toBe(true);
  });
});

// ── Permission-aware content ──────────────────────────────────────────────────

describe("permission-aware content (student vs coach)", () => {
  // The dashboard is student-only; coach functionality is on /team.
  // Verify that student speech data doesn't include coach-only fields
  // (this is enforced by the API — we test the frontend model's expectations).

  test("nextAction href never points to /team (coach route)", () => {
    const state = deriveDashboardState([], null);
    expect(state.nextAction.href).not.toContain("/team");
  });

  test("all next-action kinds resolve to student-accessible hrefs", () => {
    const kinds = [
      deriveDashboardState([], null).nextAction,
      deriveDashboardState([speech({ status: "error" })], null).nextAction,
      deriveDashboardState([speech({ status: "analyzing" })], null).nextAction,
    ];
    kinds.forEach((a) => {
      expect(a.href).toMatch(/^\/(session|speech|drills|progress|demo)/);
    });
  });
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe("loading state (empty data before fetch)", () => {
  // Before fetch completes, the page renders with speeches=[] progress=null.
  // Verify the model produces safe defaults.
  const state = deriveDashboardState([], null);

  test("no sections shown while loading", () => {
    expect(state.showRecentInsight).toBe(false);
    expect(state.showSkillTrajectory).toBe(false);
    expect(state.showDrillQueue).toBe(false);
    expect(state.showSpeechHistory).toBe(false);
    expect(state.hasPendingRecovery).toBe(false);
  });

  test("nextAction is always defined (never null)", () => {
    expect(state.nextAction).toBeDefined();
    expect(state.nextAction.href).toBeTruthy();
    expect(state.nextAction.title).toBeTruthy();
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe("error state (fetch failed, speeches=[] progress=null)", () => {
  // Same empty data as loading — model doesn't know about errors, just absent data.
  const state = deriveDashboardState([], null);

  test("userStage defaults to new-user (safe fallback)", () => {
    expect(state.userStage).toBe("new-user");
  });
  test("no content sections shown", () => {
    expect(state.showSpeechHistory).toBe(false);
    expect(state.showDrillQueue).toBe(false);
  });
});

// ── Reduced-motion — loop step index values ────────────────────────────────────

describe("LOOP_STEP_INDEX values are stable across all stages", () => {
  // These values drive the progress-bar rendering (CSS widths, highlight classes).
  // Reduced-motion users see the same positions — just without CSS transitions.

  test("all stages have a defined step index", () => {
    const stages: UserStage[] = ["new-user", "has-speech", "has-feedback", "has-drills", "repeating"];
    stages.forEach((s) => {
      expect(typeof LOOP_STEP_INDEX[s]).toBe("number");
    });
  });

  test("step indices are monotonically increasing", () => {
    expect(LOOP_STEP_INDEX["new-user"]).toBeLessThan(LOOP_STEP_INDEX["has-speech"]);
    expect(LOOP_STEP_INDEX["has-speech"]).toBeLessThan(LOOP_STEP_INDEX["has-feedback"]);
    expect(LOOP_STEP_INDEX["has-feedback"]).toBeLessThan(LOOP_STEP_INDEX["has-drills"]);
    expect(LOOP_STEP_INDEX["has-drills"]).toBeLessThan(LOOP_STEP_INDEX["repeating"]);
  });
});

// ── Stable page frame + content state (loading must never be a dead page) ────

import {
  DASHBOARD_FRAME,
  DASHBOARD_LOADING_GRACE_MS,
  DASHBOARD_DELAYED_LOADING,
  deriveDashboardContentState,
} from "@/lib/dashboardModel";

describe("DASHBOARD_FRAME", () => {
  it("provides a real heading and primary action for the always-visible frame", () => {
    // The page renders these unconditionally — even while loading, the user
    // sees a heading and can start a practice. Never a skeleton-only page.
    expect(DASHBOARD_FRAME.heading).toBe("Practice dashboard");
    expect(DASHBOARD_FRAME.primaryCtaLabel).toBe("Start practice");
    expect(DASHBOARD_FRAME.primaryCtaHref).toBe("/session");
  });

  it("loading copy tells the user they can act right away", () => {
    expect(DASHBOARD_FRAME.loadingCopy.toLowerCase()).toContain("start a new one");
  });
});

describe("delayed-loading fallback", () => {
  it("grace period is short — skeletons can never dominate a cold start", () => {
    expect(DASHBOARD_LOADING_GRACE_MS).toBeGreaterThanOrEqual(1000);
    expect(DASHBOARD_LOADING_GRACE_MS).toBeLessThanOrEqual(2000);
  });

  it("delayed copy is useful and truthful (history unknown, not empty)", () => {
    expect(DASHBOARD_DELAYED_LOADING.title).toBe("Still loading your recent practices.");
    expect(DASHBOARD_DELAYED_LOADING.body).toContain("start a new practice now");
    expect(DASHBOARD_DELAYED_LOADING.body).toContain("when the server responds");
    expect(DASHBOARD_DELAYED_LOADING.retryLabel).toBe("Retry loading");
  });
});

describe("deriveDashboardContentState", () => {
  it("fresh loading within the grace period", () => {
    expect(deriveDashboardContentState(true, "", false)).toBe("loading-fresh");
  });

  it("delayed loading after the grace period elapses", () => {
    expect(deriveDashboardContentState(true, "", true)).toBe("loading-delayed");
  });

  it("a load failure clears loading into an actionable error — error wins over delayed", () => {
    expect(deriveDashboardContentState(false, "Could not reach the server.", true)).toBe("error");
    expect(deriveDashboardContentState(false, "Could not reach the server.", false)).toBe("error");
  });

  it("ready wins once data arrives, regardless of a stale delayed flag", () => {
    expect(deriveDashboardContentState(false, "", true)).toBe("ready");
    expect(deriveDashboardContentState(false, "", false)).toBe("ready");
  });

  it("ready + no speeches still routes to the first-run empty state", () => {
    // Content state says "ready"; the empty-state gate is userStage.
    expect(deriveDashboardContentState(false, "", false)).toBe("ready");
    expect(deriveDashboardState([], null).userStage).toBe("new-user");
  });
});
