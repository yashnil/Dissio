"use client";

import Link from "next/link";
import {
  Target, ArrowRight, Clock, CheckCircle2, Loader2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MISSION_SKILL_LABELS,
  deriveMissionCardState,
  missionCtaLabel,
  missionTimeLabel,
  type MissionCardState,
} from "@/lib/missionModel";
import type { StudentMission } from "@/types";

// ── State derivation is done by the caller; this component is pure display ───

interface NextMissionCardProps {
  loading:   boolean;
  error:     string | null;
  mission:   StudentMission | null;
  hasSpeech: boolean;
}

export default function NextMissionCard({
  loading,
  error,
  mission,
  hasSpeech,
}: NextMissionCardProps) {
  const state = deriveMissionCardState(loading, error, mission, hasSpeech);
  return <MissionCardInner state={state} />;
}

function MissionCardInner({ state }: { state: MissionCardState }) {
  if (state.kind === "loading") return <MissionSkeleton />;

  if (state.kind === "no-speech") {
    return (
      <Card className="border-hairline bg-surface-1">
        <CardContent className="flex items-start gap-3 px-5 py-5">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-2"
            aria-hidden="true"
          >
            <Target size={15} className="text-ink-faint" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm font-semibold text-ink">No mission yet</p>
            <p className="text-xs text-ink-subtle">
              Record your first speech to get a personalized coaching mission.
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href="/session">
              Record <ArrowRight size={11} aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl border border-warn/25 bg-warn/5 px-4 py-3"
      >
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
        <p className="text-xs text-ink-subtle">{state.message}</p>
      </div>
    );
  }

  const { mission } = state;
  const skillLabel  = MISSION_SKILL_LABELS[mission.skill] ?? mission.skill;
  const ctaLabel    = missionCtaLabel(mission.status);
  const timeLabel   = missionTimeLabel(mission.estimated_minutes);

  if (state.kind === "completed") {
    return (
      <Card className="border-ok/20 bg-ok/5">
        <CardContent className="flex items-start gap-3 px-5 py-5">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 text-[10px] font-semibold text-ok">
                {skillLabel}
              </span>
              <span className="text-[10px] text-ink-faint">Completed</span>
            </div>
            <p className="text-sm font-semibold text-ink">{mission.title}</p>
            <p className="text-xs text-ink-subtle">{mission.reason}</p>
          </div>
          <Link
            href={`/missions/${mission.id}`}
            className="shrink-0 text-xs font-medium text-lav transition-colors hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 focus-visible:rounded"
          >
            Review →
          </Link>
        </CardContent>
      </Card>
    );
  }

  // ready or in_progress
  const isInProgress = state.kind === "in-progress";

  return (
    <Card className="border-lav/20 bg-lav/5">
      <CardContent className="flex flex-col gap-4 px-5 py-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-lav/30 bg-lav/10 px-2 py-0.5 text-[10px] font-semibold text-lav">
                {skillLabel}
              </span>
              {isInProgress && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-warn">
                  <Loader2 size={9} className="motion-safe:animate-spin" aria-hidden="true" />
                  In progress
                </span>
              )}
              <span className="flex items-center gap-1 text-[10px] text-ink-faint">
                <Clock size={9} aria-hidden="true" /> {timeLabel}
              </span>
            </div>

            <p className="text-sm font-semibold leading-tight text-ink">{mission.title}</p>
          </div>

          <Button asChild size="sm" className="shrink-0 gap-1">
            <Link href={`/missions/${mission.id}`}>
              {ctaLabel} <ArrowRight size={11} aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {/* Reason */}
        <p className="text-xs leading-relaxed text-ink-subtle">{mission.reason}</p>

        {/* Evidence — grounded in actual feedback */}
        {mission.evidence && (
          <blockquote className="border-l-2 border-lav/30 pl-3 text-xs italic leading-relaxed text-ink-faint">
            &ldquo;{mission.evidence}&rdquo;
          </blockquote>
        )}

        {/* Success criteria preview */}
        {mission.success_criteria.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-lav/10 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              What success looks like
            </p>
            <ul className="flex flex-col gap-0.5">
              {mission.success_criteria.slice(0, 2).map((crit, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-ink-subtle">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lav/40" aria-hidden="true" />
                  {crit}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MissionSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 px-5 py-5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </CardContent>
    </Card>
  );
}
