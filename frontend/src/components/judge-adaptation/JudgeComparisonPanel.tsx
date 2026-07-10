"use client";

import { JudgeComparisonResult, RISK_LEVEL_COLORS } from "@/types/judgeAdaptation";
import { normalizeComparisonResult } from "@/lib/judgeAdaptationModel";

interface Props {
  result: JudgeComparisonResult | null;
  isLoading?: boolean;
}

/** Column headers so every a/b grid reads as judge-specific columns. */
function ColumnHeaders({ a, b }: { a: string; b: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 mb-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-subtle)]">{a}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-subtle)]">{b}</p>
    </div>
  );
}

export function JudgeComparisonPanel({ result, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-[var(--surface-2)]" />
        ))}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-8 text-[var(--ink-subtle)]">
        <p className="text-sm">Select two judge types to compare adaptations.</p>
      </div>
    );
  }

  const view = normalizeComparisonResult(result);

  if (!view.hasContent) {
    return (
      <p className="py-6 text-sm text-[var(--ink-subtle)]">
        The comparison returned no differences for this material — try a different
        judge pairing or material.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Judge columns header — labels + real priorities */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: view.judgeALabel, priorities: view.judgeAPriorities },
          { label: view.judgeBLabel, priorities: view.judgeBPriorities },
        ].map((j) => (
          <div key={j.label} className="rounded-lg border border-[var(--surface-3)] bg-[var(--surface-2)] px-3 py-2">
            <p className="text-sm font-semibold text-[var(--ink-primary)]">{j.label}</p>
            {j.priorities.length > 0 && (
              <p className="text-[10px] text-[var(--ink-subtle)] mt-0.5">
                Prioritizes: {j.priorities.join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* What stays the same — evidence integrity across judges */}
      {view.constants.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-[var(--ink-subtle)] uppercase tracking-wide mb-2">
            What stays the same for every judge ({view.constants.length})
          </p>
          <ul className="space-y-1">
            {view.constants.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[var(--ink-primary)]">
                <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Preference differences */}
      {view.differences.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-[var(--ink-subtle)] uppercase tracking-wide mb-2">
            Key Differences
          </p>
          <div className="space-y-2">
            {view.differences.map((d, i) => (
              <div
                key={i}
                className="rounded-md border border-[var(--surface-3)] bg-[var(--surface-2)] p-3"
              >
                <p className="text-[11px] font-semibold text-[var(--lavender-8)] uppercase tracking-wide mb-1">
                  {d.dimension}
                </p>
                <ColumnHeaders a={view.judgeALabel} b={view.judgeBLabel} />
                <div className="grid grid-cols-2 gap-2 mb-1">
                  <p className="text-xs text-[var(--ink-primary)]">{d.judge_a_value}</p>
                  <p className="text-xs text-[var(--ink-primary)]">{d.judge_b_value}</p>
                </div>
                <p className="text-[11px] text-[var(--ink-subtle)]">{d.why_different}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time allocation */}
      {view.timeDifferences.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-[var(--ink-subtle)] uppercase tracking-wide mb-2">
            Time Allocation
          </p>
          <div className="space-y-2">
            {view.timeDifferences.map((d, i) => (
              <div key={i} className="rounded-md border border-[var(--surface-3)] p-3">
                <ColumnHeaders a={view.judgeALabel} b={view.judgeBLabel} />
                <div className="grid grid-cols-2 gap-2">
                  <p className="text-xs text-[var(--ink-primary)]">{d.judge_a_value}</p>
                  <p className="text-xs text-[var(--ink-primary)]">{d.judge_b_value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wording differences */}
      {view.wordingDifferences.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-[var(--ink-subtle)] uppercase tracking-wide mb-2">
            Wording Changes
          </p>
          <div className="space-y-2">
            {view.wordingDifferences.slice(0, 4).map((d, i) => (
              <div key={i} className="rounded-md border border-[var(--surface-3)] p-3">
                <p className="text-[11px] font-semibold text-[var(--ink-primary)] mb-1">
                  {d.dimension.replace(/_/g, " ")}
                </p>
                <ColumnHeaders a={view.judgeALabel} b={view.judgeBLabel} />
                <div className="grid grid-cols-2 gap-2">
                  <p className="text-xs text-[var(--ink-subtle)]">{d.judge_a_value}</p>
                  <p className="text-xs text-[var(--ink-subtle)]">{d.judge_b_value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strategic risks per judge — real response data only */}
      {view.riskColumns.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-[var(--ink-subtle)] uppercase tracking-wide mb-2">
            Risks by judge
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {view.riskColumns.map((col) => (
              <div key={col.judgeLabel} className="rounded-md border border-[var(--surface-3)] p-3 space-y-1.5">
                <p className="text-xs font-semibold text-[var(--ink-primary)]">{col.judgeLabel}</p>
                {col.risks.map((r, i) => (
                  <div key={i} className={`rounded border px-2 py-1.5 ${RISK_LEVEL_COLORS[r.level]}`}>
                    <p className="text-[11px] font-medium">
                      <span className="uppercase">{r.level}</span> — {r.description}
                    </p>
                    <p className="text-[10px] opacity-80 mt-0.5">Fix: {r.how_to_mitigate}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
