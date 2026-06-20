/**
 * Report narrative model — derives the 8-tier coaching narrative from speech
 * analysis data. Pure functions, no DOM, fully testable.
 *
 * Tier order:
 *   1. Coach verdict       (ReportVerdictPanel — score + grade)
 *   2. Decisive moment     (deriveDecisiveMoment)
 *   3. Strongest sequence  (deriveStrongestSequence)
 *   4. Critical breakdown  (deriveCriticalBreakdown)
 *   5. Debate flow         (FlowCanvas)
 *   6. Judge lens          (integrated into flow toolbar)
 *   7. Assigned drills     (DrillCard list)
 *   8. Detailed rubric     (ScoreBreakdown — progressive disclosure)
 */

import type { FeedbackReport, ArgumentItem, Drill } from "@/types";

// ── 1. Decisive Moment ────────────────────────────────────────────────────────

/** The single issue that most likely cost or nearly cost the round. */
export interface DecisiveMoment {
  title: string;
  why: string | null;
  severity: "high" | "medium" | "low";
  issueType: string;
  affectedArguments: string[];
  recommendation: string | null;
}

export function deriveDecisiveMoment(feedback: FeedbackReport): DecisiveMoment | null {
  const issues = feedback.raw_feedback?.structured_issues;
  if (!issues || issues.length === 0) return null;

  // Prefer high-severity; fall back to first issue
  const top = issues.find((i) => i.severity === "high") ?? issues[0];
  return {
    title: top.title,
    why: top.why_it_matters ?? null,
    severity: top.severity,
    issueType: top.issue_type,
    affectedArguments: top.affected_argument_labels ?? [],
    recommendation: top.recommendation ?? null,
  };
}

// ── 2. Strongest Sequence ─────────────────────────────────────────────────────

/** The argument with the most complete and confident CWEI chain. */
export interface StrongestSequence {
  label: string;
  claim: string;
  warrant: string | null;
  evidence: string | null;
  impact: string | null;
  hasFullChain: boolean;
  confidence: number | null;
}

export function deriveStrongestSequence(args: ArgumentItem[]): StrongestSequence | null {
  if (args.length === 0) return null;

  const scored = args.map((a) => {
    const hasFullChain = !!(a.claim && a.warrant && a.evidence && a.impact);
    const score =
      (a.confidence ?? 0) +
      (hasFullChain ? 0.2 : 0) +
      (a.argument_type === "offense" ? 0.15 : 0) +
      (a.issues.length === 0 ? 0.1 : 0);
    return { arg: a, score, hasFullChain };
  });

  const best = scored.sort((a, b) => b.score - a.score)[0];
  if (!best) return null;

  return {
    label: best.arg.label,
    claim: best.arg.claim,
    warrant: best.arg.warrant || null,
    evidence: best.arg.evidence ?? null,
    impact: best.arg.impact || null,
    hasFullChain: best.hasFullChain,
    confidence: best.arg.confidence,
  };
}

// ── 3. Critical Breakdown ─────────────────────────────────────────────────────

/** The most serious breakdown — what went wrong and which drill addresses it. */
export interface CriticalBreakdown {
  title: string;
  explanation: string;
  severity: "high" | "medium" | "low";
  linkedDrillSkill: string | null;
  drillId: string | null;
}

/** Maps structured issue types to the drill skill_target most likely to fix them. */
export const ISSUE_TO_SKILL: Record<string, string> = {
  missing_warrant:   "warranting",
  weak_evidence:     "evidence",
  unclear_impact:    "weighing",
  no_weighing:       "weighing",
  dropped_argument:  "drops",
  weak_extension:    "extensions",
  no_clash:          "clash",
  new_argument:      "clash",
  organization:      "judge_adaptation",
};

export function deriveCriticalBreakdown(
  feedback: FeedbackReport,
  drills: Drill[],
): CriticalBreakdown | null {
  const issues = feedback.raw_feedback?.structured_issues;
  if (!issues || issues.length === 0) return null;

  const top = issues.find((i) => i.severity === "high") ?? issues[0];
  const expectedSkill = ISSUE_TO_SKILL[top.issue_type] ?? top.recommended_drill_type ?? null;

  const linkedDrill = expectedSkill
    ? drills.find((d) => d.skill_target === expectedSkill && d.status === "assigned")
    : null;

  return {
    title: top.title,
    explanation: top.explanation,
    severity: top.severity,
    linkedDrillSkill: expectedSkill,
    drillId: linkedDrill?.id ?? null,
  };
}

// ── 4. Weakness → Drill links ─────────────────────────────────────────────────

/** One entry per drill explaining WHY it was assigned from the speech. */
export interface DrillReason {
  drillId: string;
  drillTitle: string;
  weakness: string;
  skillTarget: string;
  why: string;
}

export function deriveWeaknessDrillLinks(
  drills: Drill[],
  feedback: FeedbackReport | null,
): DrillReason[] {
  return drills.map((d) => {
    const issue = feedback?.raw_feedback?.structured_issues?.find(
      (i) => ISSUE_TO_SKILL[i.issue_type] === d.skill_target,
    );

    return {
      drillId: d.id,
      drillTitle: d.title,
      weakness: d.source_weakness ?? issue?.title ?? "Speech weakness",
      skillTarget: d.skill_target,
      why: issue?.why_it_matters ?? `Assigned to strengthen your ${d.skill_target} skill.`,
    };
  });
}

// ── 5. Section-level helpers ──────────────────────────────────────────────────

/** True when the feedback has structured issues to show as a decisive moment. */
export function hasDecisiveMoment(feedback: FeedbackReport | null): boolean {
  return (feedback?.raw_feedback?.structured_issues?.length ?? 0) > 0;
}

/** True when all 4 CWEI fields are present and non-empty. */
export function hasCompleteChain(arg: ArgumentItem): boolean {
  return !!(arg.claim && arg.warrant && arg.evidence && arg.impact);
}

/** Derive a brief narrative title for a drill based on its skill target. */
export function drillNarrativeTitle(skillTarget: string): string {
  const LABELS: Record<string, string> = {
    weighing:             "Impact weighing drill",
    warranting:           "Warrant-building drill",
    drops:                "Drop prevention drill",
    extensions:           "Extension quality drill",
    evidence:             "Evidence use drill",
    clash:                "Clash drill",
    judge_adaptation:     "Judge adaptation drill",
    collapse:             "Collapse strategy drill",
    line_by_line:         "Line-by-line drill",
    evidence_alignment:   "Evidence alignment drill",
    claim_precision:      "Claim precision drill",
    evidence_attribution: "Evidence attribution drill",
    card_warranting:      "Card warranting drill",
  };
  return LABELS[skillTarget] ?? `${skillTarget.replace(/_/g, " ")} drill`;
}
