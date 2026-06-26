"use client";

import { useState } from "react";
import Link from "next/link";
import {
  TrendingUp, TrendingDown, Minus, ArrowUpDown,
} from "lucide-react";
import type { RosterRow } from "@/types/coach";
import { SKILL_LABEL, TREND_COLOR } from "@/types/coach";

// Missing from coach.ts but needed here — map RecipientState to label
const _STATE_LABEL: Record<string, string> = {
  assigned: "Not started",
  started: "In progress",
  processing: "Processing",
  ready_for_review: "Review ready",
  failed: "Failed",
  reviewed: "Reviewed",
  revision_requested: "Revision",
};

type SortKey = "name" | "practice" | "mission" | "trend" | "attention";

interface Props {
  roster: RosterRow[];
  teamId: string;
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "improving") return <TrendingUp size={12} className="text-ok" aria-hidden />;
  if (trend === "declining") return <TrendingDown size={12} className="text-danger" aria-hidden />;
  return <Minus size={12} className="text-ink-subtle/60" aria-hidden />;
}

function AttentionBadge({ level }: { level: string }) {
  if (level === "none") return null;
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
        level === "high"
          ? "bg-danger/10 text-danger"
          : "bg-warn/10 text-warn"
      }`}
    >
      {level}
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function StudentRosterTable({ roster, teamId }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("attention");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...roster].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "name") {
      cmp = (a.display_name ?? "").localeCompare(b.display_name ?? "");
    } else if (sortKey === "practice") {
      cmp = (a.days_inactive ?? 999) - (b.days_inactive ?? 999);
    } else if (sortKey === "mission") {
      cmp = (a.active_mission_skill ?? "zzz").localeCompare(b.active_mission_skill ?? "zzz");
    } else if (sortKey === "trend") {
      const ORDER: Record<string, number> = { declining: 0, steady: 1, insufficient: 2, improving: 3 };
      cmp = (ORDER[a.score_trend] ?? 2) - (ORDER[b.score_trend] ?? 2);
    } else if (sortKey === "attention") {
      const ORDER: Record<string, number> = { high: 0, medium: 1, none: 2 };
      cmp = (ORDER[a.attention_level] ?? 2) - (ORDER[b.attention_level] ?? 2);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (roster.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-2 px-4 py-8 text-center text-[13px] text-ink-subtle">
        No students on this team yet. Share your invite code to get started.
      </div>
    );
  }

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      onClick={() => toggleSort(col)}
      className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle/70 hover:text-ink-subtle focus-visible:outline-2 focus-visible:outline-lav"
      aria-label={`Sort by ${label}`}
    >
      {label}
      <ArrowUpDown size={9} aria-hidden />
    </button>
  );

  return (
    <div
      role="region"
      aria-label="Student roster"
      className="overflow-x-auto rounded-xl border border-hairline bg-surface-1"
    >
      <table className="w-full min-w-[700px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-hairline bg-surface-2">
            <th className="px-3 py-2 text-left">
              <SortBtn col="name" label="Student" />
            </th>
            <th className="px-3 py-2 text-left">
              <SortBtn col="practice" label="Last Practice" />
            </th>
            <th className="px-3 py-2 text-left">
              <SortBtn col="mission" label="Mission" />
            </th>
            <th className="px-3 py-2 text-left">
              <SortBtn col="trend" label="Trend" />
            </th>
            <th className="px-3 py-2 text-left hidden md:table-cell">Assignment</th>
            <th className="px-3 py-2 text-left hidden lg:table-cell">Drills</th>
            <th className="px-3 py-2 text-left">
              <SortBtn col="attention" label="Flag" />
            </th>
            <th className="px-3 py-2 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.user_id}
              className="border-b border-hairline last:border-0 hover:bg-surface-2/50 transition-colors"
            >
              {/* Name */}
              <td className="px-3 py-2.5 font-medium text-ink">
                {row.display_name ?? "Student"}
              </td>

              {/* Last practice */}
              <td className="px-3 py-2.5 tabular-nums text-ink-subtle">
                {fmtDate(row.last_practice_at)}
                {row.days_inactive !== null && row.days_inactive >= 7 && (
                  <span className="ml-1 text-[10px] text-warn">({row.days_inactive}d)</span>
                )}
              </td>

              {/* Mission */}
              <td className="px-3 py-2.5">
                {row.active_mission_skill ? (
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                      row.active_mission_status === "in_progress" ? "text-lav" : "text-ink-subtle"
                    }`}>
                      {row.active_mission_status === "in_progress" ? "Active" : row.active_mission_status}
                    </span>
                    <span className="text-ink-subtle">·</span>
                    <span className="text-ink-subtle">
                      {SKILL_LABEL[row.active_mission_skill] ?? row.active_mission_skill}
                    </span>
                  </div>
                ) : (
                  <span className="text-ink-subtle/50">—</span>
                )}
              </td>

              {/* Trend */}
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1">
                  <TrendIcon trend={row.score_trend} />
                  <span className={`text-[11px] ${TREND_COLOR[row.score_trend] ?? "text-ink-subtle"}`}>
                    {row.score_trend === "insufficient" ? "New" : row.score_trend}
                  </span>
                </div>
              </td>

              {/* Assignment */}
              <td className="px-3 py-2.5 hidden md:table-cell">
                {row.top_assignment_status ? (
                  <span className="text-[11px] text-ink-subtle">
                    {_STATE_LABEL[row.top_assignment_status] ?? row.top_assignment_status}
                  </span>
                ) : (
                  <span className="text-ink-subtle/50">—</span>
                )}
              </td>

              {/* Drills */}
              <td className="px-3 py-2.5 hidden lg:table-cell tabular-nums text-ink-subtle">
                {row.drill_attempts_count > 0 ? row.drill_attempts_count : <span className="text-ink-subtle/50">0</span>}
              </td>

              {/* Attention */}
              <td className="px-3 py-2.5">
                <AttentionBadge level={row.attention_level} />
              </td>

              {/* Actions */}
              <td className="px-3 py-2.5 text-right">
                <Link
                  href={`/team/student?team=${teamId}&student=${row.user_id}`}
                  className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-subtle hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-lav"
                >
                  Profile
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
