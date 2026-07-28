"use client";

import { estimateRoundTier, nextFocusAdvice, ROUND_TIER_BADGE_CLASS } from "@/lib/roundTierEstimate";
import type { RoundArgument, RoundDecision, RoundDrill, RoundSide } from "@/types/round";

interface Props {
  decision: RoundDecision;
  studentSide: RoundSide;
  allArguments: RoundArgument[];
  drills: RoundDrill[];
}

export function RoundTierSummary({ decision, studentSide, allArguments, drills }: Props) {
  const estimate = estimateRoundTier(decision, studentSide, allArguments);
  const advice = nextFocusAdvice(drills);

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold">Training Tier Estimate</h3>
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROUND_TIER_BADGE_CLASS[estimate.tier]}`}>
          {estimate.label}
        </span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{estimate.summary}</p>
      <p className="text-xs font-medium pt-1">{advice}</p>
    </div>
  );
}
