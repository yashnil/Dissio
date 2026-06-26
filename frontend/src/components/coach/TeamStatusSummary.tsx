"use client";

import type { TeamSummary } from "@/types/coach";

interface Props {
  summary: TeamSummary;
}

function Metric({
  value,
  label,
  highlight,
}: {
  value: number | string;
  label: string;
  highlight?: "warn" | "ok" | "danger";
}) {
  const cls =
    highlight === "danger"
      ? "text-danger"
      : highlight === "warn"
      ? "text-warn"
      : highlight === "ok"
      ? "text-ok"
      : "text-ink";

  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-2xl font-bold tabular-nums leading-none ${cls}`}>{value}</span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">{label}</span>
    </div>
  );
}

export default function TeamStatusSummary({ summary }: Props) {
  const readinessPct = summary.avg_readiness_pct;

  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6"
      role="region"
      aria-label="Team status summary"
    >
      <Metric value={summary.total_students} label="Students" />
      <Metric
        value={summary.practiced_this_week}
        label="Practiced this week"
        highlight={
          summary.practiced_this_week === 0 && summary.total_students > 0
            ? "danger"
            : summary.practiced_this_week === summary.total_students
            ? "ok"
            : undefined
        }
      />
      <Metric
        value={summary.pending_reviews}
        label="Pending reviews"
        highlight={summary.pending_reviews > 0 ? "warn" : undefined}
      />
      <Metric
        value={summary.overdue_assignments}
        label="Overdue"
        highlight={summary.overdue_assignments > 0 ? "danger" : undefined}
      />
      <Metric
        value={summary.without_recent_session}
        label="Inactive 7d+"
        highlight={summary.without_recent_session > 0 ? "warn" : undefined}
      />
      <Metric
        value={readinessPct !== null ? `${readinessPct}%` : "—"}
        label="Avg. completion"
        highlight={
          readinessPct !== null
            ? readinessPct >= 70
              ? "ok"
              : readinessPct >= 40
              ? undefined
              : "warn"
            : undefined
        }
      />
    </div>
  );
}
