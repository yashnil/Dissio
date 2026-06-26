"use client";

import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import type { RosterRow } from "@/types/coach";
import { SKILL_LABEL } from "@/types/coach";

interface Props {
  queue: RosterRow[];
  teamId: string;
}

function levelIcon(level: "high" | "medium") {
  return level === "high" ? (
    <AlertTriangle size={14} className="text-danger shrink-0" aria-hidden />
  ) : (
    <Clock size={14} className="text-warn shrink-0" aria-hidden />
  );
}

export default function AttentionQueue({ queue, teamId }: Props) {
  if (queue.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-2 px-4 py-6 text-center text-[13px] text-ink-subtle">
        No students need attention right now. Keep it up!
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Students needing attention"
      className="divide-y divide-hairline rounded-xl border border-hairline bg-surface-1 overflow-hidden"
    >
      {queue.map((row) => (
        <div
          key={row.user_id}
          className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
        >
          {/* Name + level */}
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:w-36">
            {levelIcon(row.attention_level as "high" | "medium")}
            <span className="truncate text-[13px] font-semibold text-ink">
              {row.display_name ?? "Student"}
            </span>
          </div>

          {/* Flags */}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {row.attention_flags.slice(0, 2).map((f) => (
              <Link
                key={f.rule}
                href={f.link}
                className="group flex items-baseline gap-1.5 text-[12px] text-ink-subtle hover:text-ink"
              >
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle/60 group-hover:text-ink-subtle">
                  {f.rule.replace(/_/g, " ")}
                </span>
                <span className="truncate">{f.reason}</span>
              </Link>
            ))}
          </div>

          {/* Mission skill + action */}
          <div className="flex shrink-0 items-center gap-2">
            {row.active_mission_skill && (
              <span className="rounded-full border border-lav/30 bg-lav/10 px-2 py-0.5 text-[10px] font-semibold text-lav">
                {SKILL_LABEL[row.active_mission_skill] ?? row.active_mission_skill}
              </span>
            )}
            <Link
              href={`/team/student?team=${teamId}&student=${row.user_id}`}
              className="rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-subtle hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-lav"
            >
              View
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
