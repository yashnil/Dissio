"use client";

/**
 * AdaptationProgressSummary (Phase 7E) — entry-level "Adaptation progress"
 * section on the Judge Adaptation workspace. Pure read/aggregation view over
 * GET /judge-adaptation/attempt-trends — no scoring happens here, nothing is
 * invented: every number traces back to a persisted, scored attempt.
 */

import { Loader2, TrendingUp } from "lucide-react";
import {
  formatScoreDelta,
  scoreDeltaTone,
  hasJudgeTypeComparison,
  strongestJudgeType,
  weakestJudgeType,
  weakestRecurringDimension,
  trendEmptyStateMessage,
  type AttemptScoreTone,
  type AttemptTrendsView,
} from "@/lib/judgeAdaptationModel";
import { JUDGE_TYPE_LABELS, type JudgeType } from "@/types/judgeAdaptation";

const TONE_TEXT: Record<AttemptScoreTone | "neutral", string> = {
  green: "text-ok",
  amber: "text-warn",
  red: "text-danger",
  neutral: "text-ink-subtle",
};

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-hairline bg-surface-1 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="text-base font-semibold text-ink">{value}</p>
    </div>
  );
}

export function AdaptationProgressSummary({
  trends, loading, error,
}: {
  trends: AttemptTrendsView | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <section aria-label="Adaptation progress" className="rounded-lg border border-hairline bg-surface-2/40 px-4 py-3">
        <p role="status" className="flex items-center gap-1.5 text-xs text-ink-subtle">
          <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden="true" /> Loading your practice history…
        </p>
      </section>
    );
  }

  // Trend loading failure never blocks the material picker — this section
  // simply omits itself and the rest of the page works normally.
  if (error || !trends) return null;

  if (trends.totalAttempts === 0) {
    return (
      <section aria-label="Adaptation progress" className="rounded-lg border border-dashed border-hairline px-4 py-3">
        <p className="text-xs text-ink-subtle">{trendEmptyStateMessage()}</p>
        <p className="mt-0.5 text-[11px] text-ink-faint">
          Pick a saved card, argument, or frontline above, generate an adaptation, and submit a
          practice attempt to start tracking progress.
        </p>
      </section>
    );
  }

  const strongest = strongestJudgeType(trends);
  const weakest = weakestJudgeType(trends);
  const showComparison = hasJudgeTypeComparison(trends);
  const weakDim = weakestRecurringDimension(trends);
  const deltaTone = scoreDeltaTone(trends.improvementFromFirst);

  return (
    <section aria-label="Adaptation progress" className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-1 px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <TrendingUp size={14} className="text-lav" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink">Adaptation progress</h2>
        <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">v1 heuristic practice feedback</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricTile label="Attempts" value={String(trends.totalAttempts)} />
        <MetricTile label="Latest score" value={trends.latestOverallFit != null ? `${trends.latestOverallFit}/100` : "—"} />
        <MetricTile label="Best score" value={trends.bestOverallFit != null ? `${trends.bestOverallFit}/100` : "—"} />
        <div className="flex flex-col gap-0.5 rounded-lg border border-hairline bg-surface-1 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-ink-faint">Change from first</p>
          {trends.hasTrendData ? (
            <p className={`text-base font-semibold ${TONE_TEXT[deltaTone]}`}>
              {formatScoreDelta(trends.improvementFromFirst)}
            </p>
          ) : (
            <p className="text-[11px] leading-snug text-ink-faint">Complete another attempt to see improvement.</p>
          )}
        </div>
      </div>

      {showComparison && strongest && weakest && (
        <p className="text-xs leading-relaxed text-ink-subtle">
          Strongest so far: <span className="font-medium text-ink">{JUDGE_TYPE_LABELS[strongest.judge_type as JudgeType]}</span>
          {strongest.judge_type !== weakest.judge_type && (
            <>
              {" "}· Needs the most work: <span className="font-medium text-ink">{JUDGE_TYPE_LABELS[weakest.judge_type as JudgeType]}</span>
            </>
          )}
        </p>
      )}

      {weakDim && (
        <p className="text-xs leading-relaxed text-ink-subtle">
          Recurring weak point: <span className="font-medium text-ink">{weakDim.label}</span>{" "}
          <span className="text-ink-faint">(avg {weakDim.average_score}/100 across {weakDim.count} score{weakDim.count === 1 ? "" : "s"})</span>
        </p>
      )}

      {trends.recentAttempts.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Recent attempts</p>
          <ul className="mt-1 flex flex-col gap-1">
            {trends.recentAttempts.slice(0, 5).map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-subtle">
                <span className="font-medium text-ink">{JUDGE_TYPE_LABELS[a.judge_type as JudgeType] ?? a.judge_type}</span>
                {a.overall_fit != null && <span>{a.overall_fit}/100</span>}
                {a.created_at && (
                  <span className="text-ink-faint">
                    {new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                )}
                {a.weakest_dimension && <span className="text-ink-faint">· weak point: {a.weakest_dimension}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
