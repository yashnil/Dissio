"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOOP_STEP_INDEX, type UserStage } from "@/lib/dashboardModel";
import type { ProgressSummary } from "@/types";

const LOOP_LABELS = ["Practice", "Analyze", "Drill", "Improve"] as const;

// Context copy shown below the rail for the current stage.
const STAGE_CONTEXT: Record<UserStage, { action: string; href: string } | null> = {
  "new-user":    { action: "Record your first speech to begin", href: "/session" },
  "has-speech":  null,   // analysis in progress — no action needed
  "has-feedback": { action: "Open your speech report to generate drills", href: "/progress" },
  "has-drills":  { action: "Re-record this speech to close the loop", href: "/session" },
  "repeating":   null,
};

interface Props {
  progress: ProgressSummary;
  userStage: UserStage;
  className?: string;
}

export default function LoopStageCard({ progress, userStage, className }: Props) {
  const activeIndex = LOOP_STEP_INDEX[userStage];
  const stageCtx    = STAGE_CONTEXT[userStage];

  return (
    <div
      role="region"
      aria-label="Training loop position"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-hairline bg-surface-1 px-5 py-4",
        "sm:flex-row sm:items-center sm:gap-6",
        className,
      )}
    >
      {/* Rail */}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-eyebrow text-ink-subtle">Training loop</span>
          {progress.speech_count > 0 && (
            <span className="font-mono text-xs tabular-nums text-ink-subtle">
              Rep {progress.speech_count}
            </span>
          )}
        </div>

        {/* Step beads */}
        <div className="flex items-start gap-2" role="list" aria-label="Loop steps">
          {LOOP_LABELS.map((label, i) => {
            const done   = i < activeIndex;
            const active = i === activeIndex;
            const future = i > activeIndex;
            return (
              <div
                key={label}
                role="listitem"
                aria-current={active ? "step" : undefined}
                className={cn("flex flex-1 flex-col items-center gap-1.5")}
              >
                <div
                  className={cn(
                    "h-1.5 w-full rounded-full transition-colors",
                    done   ? "bg-lav"    :
                    active ? "bg-lav/50" :
                             "bg-hairline",
                    future && i > activeIndex + 1 && "opacity-30",
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-medium transition-colors",
                    active ? "text-lav-hi font-semibold" :
                    done   ? "text-ink-subtle"             :
                             "text-ink-subtle",
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Stage action hint */}
        {stageCtx && (
          <Link
            href={stageCtx.href}
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-lav transition-colors hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 focus-visible:rounded"
          >
            {stageCtx.action}
            <ArrowRight size={10} aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* Divider (desktop) */}
      <div className="hidden h-12 w-px shrink-0 bg-hairline sm:block" aria-hidden="true" />

      {/* Compact stats */}
      <div
        className="flex shrink-0 items-center gap-5"
        aria-label="Training stats"
      >
        <StatCell value={progress.xp}                   label="XP"      />
        <div className="h-5 w-px bg-hairline" aria-hidden="true" />
        <StatCell value={progress.level}                label="Level"   />
        <div className="h-5 w-px bg-hairline" aria-hidden="true" />
        <StatCell value={progress.feedback_ready_count} label="Reports" />
      </div>
    </div>
  );
}

function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-mono text-xl font-bold leading-none tabular-nums text-ink">
        {value}
      </span>
      <span className="text-eyebrow text-ink-faint">{label}</span>
    </div>
  );
}
