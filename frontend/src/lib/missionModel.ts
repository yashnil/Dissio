/**
 * Pure derivation functions for the Next Mission coaching loop.
 * No API calls, no side effects — testable in isolation.
 */

import type { MissionCompletionResult, MissionSkill, StudentMission } from "@/types";

// ── Skill labels (matches backend SKILL_LABELS) ────────────────────────────────

export const MISSION_SKILL_LABELS: Record<MissionSkill, string> = {
  warranting:       "Warranting",
  weighing:         "Impact Weighing",
  extensions:       "Extensions",
  drops:            "Drop Prevention",
  evidence_use:     "Evidence Use",
  clash:            "Clash",
  judge_adaptation: "Judge Adaptation",
  delivery:         "Delivery",
  organization:     "Organization",
};

// ── Skill → rubric dimension (for before/after comparisons) ───────────────────

const SKILL_TO_DIM: Partial<Record<MissionSkill, string>> = {
  weighing:         "weighing",
  extensions:       "extensions",
  drops:            "drops",
  clash:            "clash",
  judge_adaptation: "judge_adaptation",
};

// ── Card state ─────────────────────────────────────────────────────────────────

export type MissionCardState =
  | { kind: "loading" }
  | { kind: "no-speech" }
  | { kind: "ready";       mission: StudentMission }
  | { kind: "in-progress"; mission: StudentMission }
  | { kind: "completed";   mission: StudentMission }
  | { kind: "error";       message: string };

export function deriveMissionCardState(
  loading: boolean,
  error: string | null,
  mission: StudentMission | null,
  hasSpeech: boolean,
): MissionCardState {
  if (loading)         return { kind: "loading" };
  if (error)           return { kind: "error", message: error };
  if (!hasSpeech)      return { kind: "no-speech" };
  if (!mission)        return { kind: "no-speech" };

  if (mission.status === "completed") return { kind: "completed", mission };
  if (mission.status === "in_progress") return { kind: "in-progress", mission };
  return { kind: "ready", mission };
}

// ── Score comparison ───────────────────────────────────────────────────────────

export interface ScoreChangeItem {
  label:  string;
  before: string;
  after:  string;
  /** Positive delta means improvement (for score-based metrics).
   *  For filler words a lower after value is better — caller inverts. */
  delta:  number | null;
  tone:   "improved" | "regressed" | "unchanged" | "info";
}

export function deriveMissionScoreChanges(mission: StudentMission): ScoreChangeItem[] {
  const { skill, before_score, after_score } = mission;
  if (!before_score || !after_score) return [];

  const items: ScoreChangeItem[] = [];

  const dim = SKILL_TO_DIM[skill];
  if (dim) {
    const b = before_score[dim] ?? null;
    const a = after_score[dim]  ?? null;
    if (b !== null && a !== null) {
      const delta = a - b;
      items.push({
        label:  MISSION_SKILL_LABELS[skill] ?? skill,
        before: `${b}/20`,
        after:  `${a}/20`,
        delta,
        tone:   delta >= 2 ? "improved" : delta <= -2 ? "regressed" : "unchanged",
      });
    }
  }

  if (skill === "delivery") {
    const bf = before_score["filler_word_count"] ?? null;
    const af = after_score["filler_word_count"]  ?? null;
    if (bf !== null && af !== null) {
      const delta = bf - af; // positive = improvement (fewer fillers)
      items.push({
        label:  "Filler words",
        before: `${bf}`,
        after:  `${af}`,
        delta,
        tone:   delta > 0 ? "improved" : delta < 0 ? "regressed" : "unchanged",
      });
    }
    const bw = before_score["words_per_minute"] ?? null;
    const aw = after_score["words_per_minute"]  ?? null;
    if (bw !== null && aw !== null) {
      const inRange = aw >= 150 && aw <= 175;
      items.push({
        label:  "Words per minute",
        before: `${Math.round(bw)} WPM`,
        after:  `${Math.round(aw)} WPM`,
        delta:  null,
        tone:   inRange ? "improved" : "info",
      });
    }
  }

  return items;
}

// ── Completion result display ──────────────────────────────────────────────────

export interface CompletionDisplay {
  headline: string;
  subline:  string;
  tone:     "improved" | "regressed" | "unchanged" | "info";
}

export function deriveCompletionDisplay(
  result: MissionCompletionResult | null,
  skillLabel: string,
): CompletionDisplay {
  switch (result) {
    case "improved":
      return {
        headline: `${skillLabel} improved`,
        subline:  "Your score went up. Keep practicing to lock it in.",
        tone:     "improved",
      };
    case "regressed":
      return {
        headline: "Score dipped — keep going",
        subline:  "That happens. Re-record and the pattern will shift.",
        tone:     "regressed",
      };
    case "unchanged":
      return {
        headline: "Score held steady",
        subline:  "One more focused rep should push it over the line.",
        tone:     "unchanged",
      };
    default:
      return {
        headline: "Mission complete",
        subline:  "Review the before/after data below.",
        tone:     "info",
      };
  }
}

// ── Estimated time label ───────────────────────────────────────────────────────

export function missionTimeLabel(minutes: number): string {
  if (minutes < 2)  return "~1 min";
  if (minutes < 60) return `~${minutes} min`;
  return `~${Math.round(minutes / 60)} hr`;
}

// ── CTA label by status ────────────────────────────────────────────────────────

export function missionCtaLabel(status: StudentMission["status"]): string {
  return status === "in_progress" ? "Continue Mission" : "Start Mission";
}
