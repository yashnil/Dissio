/**
 * Dashboard state model.
 *
 * Pure derivation from already-loaded data — no API calls, no side effects.
 * Centralises all "what does the user see?" decisions so they can be unit-tested
 * without mounting any components.
 */

import type { Speech, ProgressSummary } from "@/types";
import { selectNextAction, type NextAction } from "./dashboardHelpers";

// ── User stage ─────────────────────────────────────────────────────────────────

/**
 * Which stage of the practice loop the student is currently in.
 * Used to highlight the correct step in the LoopStageCard and gate sections.
 */
export type UserStage =
  | "new-user"      // no speeches yet
  | "has-speech"    // recorded at least once but no feedback ready yet
  | "has-feedback"  // feedback (ballot) ready, no drills attempted
  | "has-drills"    // at least one drill attempt
  | "repeating";    // 2+ speeches or 2+ feedback reports — full loop complete

/**
 * 0-indexed position in the Practice→Analyze→Drill→Improve rail.
 * -1 = haven't started; 3 = full loop complete.
 */
export const LOOP_STEP_INDEX: Record<UserStage, number> = {
  "new-user":    -1,
  "has-speech":   0,
  "has-feedback": 1,
  "has-drills":   2,
  "repeating":    3,
};

export function deriveUserStage(
  speeches: Speech[],
  progress: ProgressSummary | null,
): UserStage {
  if (speeches.length === 0) return "new-user";
  const feedbackCount   = progress?.feedback_ready_count   ?? 0;
  const drillAttempts   = progress?.drill_attempts_count   ?? 0;
  if (speeches.length >= 2 || feedbackCount >= 2) return "repeating";
  if (drillAttempts > 0)  return "has-drills";
  if (feedbackCount > 0)  return "has-feedback";
  return "has-speech";
}

// ── Stable page frame ──────────────────────────────────────────────────────────

/**
 * The dashboard frame that must be visible IMMEDIATELY — before auth resolves
 * or any data loads. The page renders these unconditionally so a slow or cold
 * backend can never leave the user staring at an anonymous skeleton with no
 * heading and no way to act.
 */
export const DASHBOARD_FRAME = {
  heading: "Practice dashboard",
  primaryCtaLabel: "Start practice",
  primaryCtaHref: "/session",
  loadingCopy: "Loading your recent practices — you can start a new one right away.",
} as const;

/**
 * How long the initial skeleton may stay up before it's replaced with the
 * useful delayed-loading fallback. Short enough that a cold backend never
 * makes the dashboard feel like a blank loading page.
 */
export const DASHBOARD_LOADING_GRACE_MS = 1500;

/** Copy + actions for the post-grace-period fallback. Truthful: history is
 *  still UNKNOWN (not empty) — the user just doesn't have to wait for it. */
export const DASHBOARD_DELAYED_LOADING = {
  title: "Still loading your recent practices.",
  body: "You can start a new practice now. We’ll load your history when the server responds.",
  retryLabel: "Retry loading",
} as const;

export type DashboardContentState =
  | "loading-fresh"
  | "loading-delayed"
  | "error"
  | "ready";

/**
 * Which content region renders under the always-visible frame.
 * - loading-fresh: brief local skeleton, within the grace period.
 * - loading-delayed: grace period elapsed — useful copy + Start/Retry actions.
 * - error: fetch failed (wins over any delayed flag once loading clears).
 * - ready: data arrived.
 */
export function deriveDashboardContentState(
  loading: boolean,
  err: string,
  delayedLoading: boolean,
): DashboardContentState {
  if (loading) return delayedLoading ? "loading-delayed" : "loading-fresh";
  if (err) return "error";
  return "ready";
}

// ── Dashboard state ────────────────────────────────────────────────────────────

export interface DashboardState {
  userStage: UserStage;
  /** 0-based index (-1 = not started) in Practice/Analyze/Drill/Improve. */
  loopStepIndex: number;
  nextAction: NextAction;

  /** Section 2: coaching focus / recent insight. */
  showRecentInsight: boolean;
  /** Section 4: skill trajectory bars. */
  showSkillTrajectory: boolean;
  /** Section 5: upcoming drills queue. */
  showDrillQueue: boolean;
  /** Section 6: speech history list. */
  showSpeechHistory: boolean;

  /** Contextual onboarding strip for mid-funnel (has speech, no drills yet). */
  showMidFunnelGuide: boolean;
  /** Whether there are speeches stuck in error/processing that need attention. */
  hasPendingRecovery: boolean;
}

export function deriveDashboardState(
  speeches: Speech[],
  progress: ProgressSummary | null,
): DashboardState {
  const userStage = deriveUserStage(speeches, progress);
  const nextAction = selectNextAction({ speeches, progress, focusSkill: null });

  const feedbackCount = progress?.feedback_ready_count ?? 0;
  const drillAttempts = progress?.drill_attempts_count ?? 0;
  const hasSkillData  = feedbackCount >= 1 && progress?.skill_averages != null;

  const hasPendingRecovery = speeches.some(
    (s) => s.status === "error" || s.status === "transcribing" || s.status === "analyzing",
  );

  return {
    userStage,
    loopStepIndex: LOOP_STEP_INDEX[userStage],
    nextAction,
    showRecentInsight:   feedbackCount >= 1,
    showSkillTrajectory: hasSkillData,
    showDrillQueue:      (progress?.incomplete_drills?.length ?? 0) > 0,
    showSpeechHistory:   speeches.length > 0,
    showMidFunnelGuide:  speeches.length > 0 && drillAttempts === 0,
    hasPendingRecovery,
  };
}
