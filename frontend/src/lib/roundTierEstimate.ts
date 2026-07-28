/**
 * Post-round training-tier estimate + next-focus advice.
 *
 * Deliberately qualitative — three coarse tiers, not a fake precise score.
 * Reuses signals the round already produces (RoundDecision, the flowed
 * arguments, and generated RoundDrills) instead of inventing new backend
 * analysis. Same "reps until competitive" vocabulary as opponent difficulty
 * (medium/advanced ~ jv/varsity) so the estimate reads as one coherent
 * training ladder, not a second, unrelated grading system.
 */

import type { RoundArgument, RoundDecision, RoundDrill, RoundSide } from "@/types/round";

export type RoundTier = "building" | "competitive_jv" | "competitive_varsity";

export const ROUND_TIER_LABELS: Record<RoundTier, string> = {
  building: "Building Fundamentals",
  competitive_jv: "Competitive at JV",
  competitive_varsity: "Competitive at Varsity",
};

export const ROUND_TIER_BADGE_CLASS: Record<RoundTier, string> = {
  building: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
  competitive_jv: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  competitive_varsity: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const TIER_SUMMARIES: Record<RoundTier, string> = {
  building:
    "The fundamentals need more reps before this holds up under pressure — that's exactly what the drills below are for.",
  competitive_jv: "A solid, competitive round — a few focused reps from being varsity-ready.",
  competitive_varsity: "This performance would hold up against tougher competition — keep sharpening the details.",
};

export interface RoundTierEstimate {
  tier: RoundTier;
  label: string;
  summary: string;
  /** Internal 0-100 signal used only to pick a tier — never rendered as a
   * precise score in the UI. */
  score: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function estimateRoundTier(
  decision: RoundDecision,
  studentSide: RoundSide,
  allArguments: RoundArgument[],
): RoundTierEstimate {
  const won = decision.winner === studentSide;
  const points = decision.speaker_points[studentSide] ?? 27;
  const studentDrops = allArguments.filter((a) => a.side === studentSide && a.status === "dropped").length;
  const usedWeighing = decision.weighing_comparison.trim().length > 0;

  let score = won ? 55 : 25;
  score += clamp((points - 25) * 4, 0, 20);
  score -= clamp(studentDrops * 5, 0, 20);
  score -= clamp(decision.adaptation_failures.length * 3, 0, 15);
  score -= clamp(decision.evidence_issues.length * 3, 0, 15);
  score += usedWeighing ? 5 : 0;
  score = clamp(Math.round(score), 0, 100);

  const tier: RoundTier = score >= 70 ? "competitive_varsity" : score >= 40 ? "competitive_jv" : "building";

  return { tier, label: ROUND_TIER_LABELS[tier], summary: TIER_SUMMARIES[tier], score };
}

/** One-line "what to work on next," derived from whichever skill the
 * generated drills show up most for. Never references a drill/round id. */
export function nextFocusAdvice(drills: RoundDrill[]): string {
  if (drills.length === 0) {
    return "Generate post-round drills to see a targeted next step.";
  }
  const counts = new Map<string, number>();
  for (const drill of drills) {
    counts.set(drill.skill_target, (counts.get(drill.skill_target) ?? 0) + 1);
  }
  let topSkill = drills[0].skill_target;
  let topCount = 0;
  for (const [skill, count] of counts) {
    if (count > topCount) {
      topSkill = skill;
      topCount = count;
    }
  }
  const skillLabel = topSkill.replace(/_/g, " ");
  return `Next focus: ${skillLabel} — ${topCount} drill${topCount === 1 ? "" : "s"} generated for it.`;
}
