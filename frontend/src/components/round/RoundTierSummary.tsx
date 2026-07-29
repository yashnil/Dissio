"use client";

import { estimateRoundTier, nextFocusAdvice, tierReasons, ROUND_TIER_BADGE_CLASS } from "@/lib/roundTierEstimate";
import type { RoundArgument, RoundDecision, RoundDrill, RoundSide } from "@/types/round";

interface Props {
  decision: RoundDecision;
  studentSide: RoundSide;
  allArguments: RoundArgument[];
  drills: RoundDrill[];
}

export function RoundTierSummary({ decision, studentSide, allArguments, drills }: Props) {
  const estimate = estimateRoundTier(decision, studentSide, allArguments);
  const reasons = tierReasons(decision, studentSide, allArguments);
  const advice = nextFocusAdvice(drills);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold">Training Tier Estimate</h3>
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROUND_TIER_BADGE_CLASS[estimate.tier]}`}>
          {estimate.label}
        </span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{estimate.summary}</p>
      {reasons.length > 0 && (
        <ul className="space-y-1">
          {reasons.map((reason, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="mt-0.5 text-primary">›</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs font-medium pt-1">{advice}</p>
    </div>
  );
}
