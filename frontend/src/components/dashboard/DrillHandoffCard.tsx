"use client";

import Link from "next/link";
import { Target, ArrowRight, Lock, Dumbbell, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DrillHandoff } from "@/lib/dashboardHelpers";
import type { Workout } from "@/types";
import { deriveWorkoutProgress, getNextIncompleteStep } from "@/lib/workoutHelpers";

const SKILL_LABELS: Record<string, string> = {
  weighing: "Impact Weighing", warranting: "Warranting", drops: "Drop Prevention",
  extensions: "Extensions", evidence: "Evidence Use", clash: "Clash",
  judge_adaptation: "Judge Adaptation", collapse: "Collapse Strategy", line_by_line: "Line-by-Line",
};

/**
 * Cockpit drill slot. Surfaces the real recommended drill when one exists;
 * otherwise explains truthfully what unlocks drills. Never invents one.
 */
export default function DrillHandoffCard({
  handoff,
  workout,
}: {
  handoff: DrillHandoff;
  workout: Workout | null;
}) {
  return (
    <Card className={`h-full ${handoff.kind === "drill" ? "border-lav/20 bg-lav/5" : ""}`}>
      <CardContent className="flex h-full flex-col gap-3 px-5 py-4">
        <span className="text-eyebrow text-ink-subtle">Next drill</span>
        <HandoffBody handoff={handoff} />
        <WorkoutRow workout={workout} />
      </CardContent>
    </Card>
  );
}

function HandoffBody({ handoff }: { handoff: DrillHandoff }) {
  if (handoff.kind === "drill") {
    const d = handoff.drill;
    return (
      <>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-sm font-semibold text-ink">{d.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-lav/25 bg-lav/10 px-2 py-0.5 text-[10px] font-semibold text-lav">
              {SKILL_LABELS[d.skill_target] ?? d.skill_target}
            </span>
            <span className="text-[10px] capitalize text-ink-faint">{d.difficulty}</span>
            {d.speech_title && (
              <span className="truncate text-[10px] text-ink-faint">From: {d.speech_title}</span>
            )}
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <Button asChild size="sm" className="gap-1.5">
            <Link href={`/drills/${d.id}`}>
              <Target size={11} aria-hidden="true" /> Start drill
            </Link>
          </Button>
          {handoff.moreCount > 0 && (
            <Link
              href="/progress"
              className="text-xs text-ink-faint transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 focus-visible:rounded"
            >
              +{handoff.moreCount} more queued
            </Link>
          )}
        </div>
      </>
    );
  }

  if (handoff.kind === "generate-from-report") {
    return (
      <>
        <p className="text-sm text-ink-subtle">
          No drills queued. Drills are built from your ballot — open your latest report to generate them.
        </p>
        <div className="mt-auto pt-1">
          <Button asChild size="sm" variant="secondary" className="gap-1.5">
            <Link href={handoff.reportHref}>
              Open report <ArrowRight size={11} aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </>
    );
  }

  const message =
    handoff.kind === "locked-needs-analysis"
      ? "Drills unlock once a practice finishes analysis — each ballot generates 3 drills targeting your real weaknesses."
      : "Record a practice speech to unlock targeted drills built from your own ballot.";

  return (
    <div className="flex items-start gap-2.5">
      <Lock size={13} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
      <p className="text-sm leading-relaxed text-ink-subtle">{message}</p>
    </div>
  );
}

function WorkoutRow({ workout }: { workout: Workout | null }) {
  if (!workout || workout.status === "completed") return null;
  const next = getNextIncompleteStep(workout);
  const prog = deriveWorkoutProgress(workout);
  if (!next || !prog) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Dumbbell size={12} className="shrink-0 text-lav" aria-hidden="true" />
        <span className="truncate text-xs text-ink-subtle">
          Prep plan: {prog.completed}/{prog.total} done · {next.title}
        </span>
      </div>
      <Link
        href={`/speech/${workout.speech_id}`}
        className="flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-lav hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lav/50"
      >
        Continue <ChevronRight size={10} aria-hidden="true" />
      </Link>
    </div>
  );
}
