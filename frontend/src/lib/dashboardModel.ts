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
