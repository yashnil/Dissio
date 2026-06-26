"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Circle, Clock,
  Mic, AlertTriangle, TrendingUp, TrendingDown, Minus, BookOpen, Pause,
} from "lucide-react";
import AppShell from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase";
import { apiFetch, isBackendUnreachable } from "@/lib/api";
import {
  MISSION_SKILL_LABELS,
  deriveMissionScoreChanges,
  deriveCompletionDisplay,
  missionTimeLabel,
} from "@/lib/missionModel";
import type { StudentMission, MissionAttempt } from "@/types";

export default function MissionPage() {
  const router  = useRouter();
  const params  = useParams<{ id: string }>();
  const id      = params.id;

  const [userId,    setUserId]    = useState<string | null>(null);
  const [mission,   setMission]   = useState<StudentMission | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState("");
  const [starting,  setStarting]  = useState(false);
  const [completing, setCompleting] = useState(false);
  const [pausing,   setPausing]   = useState(false);

  // Load mission
  useEffect(() => {
    createClient().auth.getUser()
      .then(async ({ data }) => {
        if (!data.user) { router.replace("/login"); return; }
        setUserId(data.user.id);
        const m = await apiFetch<StudentMission>(`/missions/${id}?user_id=${data.user.id}`);
        setMission(m);
      })
      .catch((e) =>
        setErr(
          isBackendUnreachable(e)
            ? "Could not reach the server. Start the backend and refresh."
            : "Could not load this mission. Please go back and try again.",
        ),
      )
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handleStart() {
    if (!userId || !mission) return;
    setStarting(true);
    try {
      const updated = await apiFetch<StudentMission>(`/missions/${id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      setMission(updated);
    } catch {
      // Non-blocking
    } finally {
      setStarting(false);
    }
  }

  async function handleCompleteViaDrill() {
    if (!userId || !mission || !mission.recommended_drill_id) return;
    setErr("");
    setCompleting(true);
    try {
      const updated = await apiFetch<StudentMission>(`/missions/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          drill_id: mission.recommended_drill_id,
        }),
      });
      setMission(updated);
    } catch (e: unknown) {
      const msg = String(e instanceof Error ? e.message : e);
      if (msg.includes("No attempt found") || msg.includes("400")) {
        setErr("Complete the drill before evaluating your mission — we could not find a drill attempt yet.");
      } else {
        setErr("Could not evaluate your progress. Please try again.");
      }
    } finally {
      setCompleting(false);
    }
  }

  async function handlePause() {
    if (!userId || !mission) return;
    setPausing(true);
    try {
      await apiFetch<StudentMission>(`/missions/${id}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      router.push("/dashboard");
    } catch {
      setPausing(false);
    }
  }

  if (loading) return <LoadingState />;
  if (err && !mission) return <ErrorState message={err} />;
  if (!mission) return <ErrorState message="Mission not found." />;

  const skillLabel = MISSION_SKILL_LABELS[mission.skill] ?? mission.skill;
  const isCompleted = mission.status === "completed";
  const isActive    = mission.status === "ready" || mission.status === "in_progress" || mission.status === "paused";

  return (
    <AppShell maxWidth="full" bare>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-7 sm:px-6">

        {/* Back nav */}
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-xs font-medium text-ink-subtle transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 focus-visible:rounded"
        >
          <ArrowLeft size={12} aria-hidden="true" /> Back to dashboard
        </Link>

        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-lav/30 bg-lav/10 px-2.5 py-0.5 text-xs font-semibold text-lav">
              {skillLabel}
            </span>
            <span className="flex items-center gap-1 text-xs text-ink-faint">
              <Clock size={10} aria-hidden="true" />
              {missionTimeLabel(mission.estimated_minutes)}
            </span>
            {isCompleted && (
              <span className="flex items-center gap-1 text-xs font-medium text-ok">
                <CheckCircle2 size={12} aria-hidden="true" /> Completed
              </span>
            )}
          </div>
          <h1 className="text-title text-ink">{mission.title}</h1>
        </div>

        {/* Reason */}
        <Card>
          <CardContent className="flex flex-col gap-3 px-5 py-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              Why this matters now
            </p>
            <p className="text-sm leading-relaxed text-ink-subtle">{mission.reason}</p>
            {mission.evidence && (
              <blockquote className="border-l-2 border-lav/30 pl-3 text-xs italic leading-relaxed text-ink-faint">
                &ldquo;{mission.evidence}&rdquo;
              </blockquote>
            )}
          </CardContent>
        </Card>

        {/* Skill brief */}
        <SkillBrief skill={mission.skill} />

        {/* Success criteria */}
        {mission.success_criteria.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              What success looks like
            </p>
            <ul className="flex flex-col gap-2" role="list">
              {mission.success_criteria.map((crit, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-ink-subtle">
                  <Circle size={14} className="mt-0.5 shrink-0 text-lav/40" aria-hidden="true" />
                  {crit}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Drill CTA */}
        {mission.recommended_drill_id && (
          <DrillSection
            missionId={id}
            drillId={mission.recommended_drill_id}
            isActive={isActive}
            onStart={handleStart}
            starting={starting}
            missionStarted={mission.status === "in_progress" || mission.status === "paused"}
          />
        )}

        {/* Re-record prompt */}
        {isActive && mission.source_speech_id && (
          <div className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-1 px-4 py-4">
            <Mic size={15} className="mt-0.5 shrink-0 text-lav" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-sm font-semibold text-ink">Re-record after drilling</p>
              <p className="text-xs text-ink-subtle">
                After you finish the drill, record the same speech type again to measure your improvement.
                The backend will automatically compare your scores.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href={`/session?parent=${mission.source_speech_id}&mission_id=${id}`}>
                Re-record <Mic size={11} aria-hidden="true" />
              </Link>
            </Button>
          </div>
        )}

        {/* Evidence-based completion panel */}
        {isActive && mission.recommended_drill_id && (
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              Ready to evaluate?
            </p>
            <div className="rounded-xl border border-lav/20 bg-lav/5 px-4 py-4">
              <p className="mb-3 text-xs text-ink-subtle">
                After completing the drill, click below. The backend retrieves your drill attempt
                and computes your progress automatically.
              </p>
              <Button
                onClick={handleCompleteViaDrill}
                disabled={completing}
                className="w-full gap-1.5"
              >
                {completing ? "Evaluating your attempt…" : "Evaluate my drill attempt"}
                {!completing && <ArrowRight size={12} aria-hidden="true" />}
              </Button>
            </div>
          </div>
        )}

        {/* Pause */}
        {isActive && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handlePause}
              disabled={pausing}
              className="flex items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-ink-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lav/40 focus-visible:rounded disabled:opacity-50"
            >
              <Pause size={11} aria-hidden="true" />
              {pausing ? "Saving…" : "Save progress for later"}
            </button>
          </div>
        )}

        {/* Completion result */}
        {isCompleted && (
          <CompletionResult mission={mission} skillLabel={skillLabel} />
        )}

        {err && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-xs text-danger">
            <AlertTriangle size={13} aria-hidden="true" /> {err}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ── Skill briefs ───────────────────────────────────────────────────────────────

const SKILL_BRIEFS: Partial<Record<string, string>> = {
  warranting:
    "A warrant is the logical bridge between your claim and its impact. Without it, the judge has no reason to accept your argument. " +
    "Structure every argument as: Claim \u2192 Why (mechanism) \u2192 What world it produces (impact).",
  weighing:
    "Weighing is where rounds are won. Telling the judge your impact is bigger, faster, more likely, or more reversible than theirs " +
    "gives them a reason to vote for you even if they grant their side's argument.",
  extensions:
    "Extending an argument means carrying its full logic across the speech \u2014 claim, warrant, and impact \u2014 not just re-stating the tagline. " +
    "If you drop the warrant, the judge can vote it down.",
  drops:
    "Every opponent argument you fail to address is one the judge can vote on. A one-sentence response is enough to keep an argument from being conceded.",
  evidence_use:
    "Your card's tag line should be a direct inference from what the card says \u2014 not an extrapolation. " +
    "If your claim goes beyond the card, narrow it or find a better source.",
  clash:
    "Clash means directly engaging the opponent's argument \u2014 not ignoring it or restating your own case. " +
    "Name their argument, explain why it fails, and tell the judge what that means for the ballot.",
  judge_adaptation:
    "Different judges evaluate rounds differently. Flow judges want technical coverage. Lay judges want clarity and simple impacts. " +
    "Adapting means leading with what that judge cares about most.",
  delivery:
    "Clear delivery makes your arguments more persuasive. The target range is 150\u2013175 WPM. " +
    "Filler words (um, uh, like) reduce your credibility \u2014 replacing them with silence is almost always better.",
  organization:
    "Clear structure lets the judge flow your arguments cleanly. Use numbered signposts ('First, off their C1\u2026') " +
    "before every argument block so nothing gets missed.",
};

function SkillBrief({ skill }: { skill: string }) {
  const brief = SKILL_BRIEFS[skill];
  if (!brief) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-hairline bg-surface-1 px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        The skill: {MISSION_SKILL_LABELS[skill as keyof typeof MISSION_SKILL_LABELS] ?? skill}
      </p>
      <p className="text-xs leading-relaxed text-ink-subtle">{brief}</p>
    </div>
  );
}

// ── Drill section ──────────────────────────────────────────────────────────────

function DrillSection({
  missionId,
  drillId,
  isActive,
  onStart,
  starting,
  missionStarted,
}: {
  missionId: string;
  drillId: string;
  isActive: boolean;
  onStart: () => void;
  starting: boolean;
  missionStarted: boolean;
}) {
  return (
    <Card className="border-lav/20 bg-lav/5">
      <CardContent className="flex flex-col gap-3 px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          Your targeted drill
        </p>
        <p className="text-xs text-ink-subtle">
          This drill was generated specifically for the weakness identified in your last speech.
          Work through it, then return here to evaluate your progress.
        </p>
        <div className="flex items-center gap-2">
          {!missionStarted && isActive && (
            <Button size="sm" variant="outline" onClick={onStart} disabled={starting} className="gap-1">
              {starting ? "Starting\u2026" : "Start mission first"}
            </Button>
          )}
          {/* Same-window navigation: back button returns student to mission */}
          <Button asChild size="sm" className="gap-1">
            <Link href={`/drills/${drillId}?mission_id=${missionId}`}>
              Open drill workspace <BookOpen size={11} aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Completion result ──────────────────────────────────────────────────────────

function CompletionResult({
  mission,
  skillLabel,
}: {
  mission:    StudentMission;
  skillLabel: string;
}) {
  const display = deriveCompletionDisplay(mission.completion_result, skillLabel);
  const changes = deriveMissionScoreChanges(mission);

  const toneClass = {
    improved:   "border-ok/20 bg-ok/5",
    regressed:  "border-danger/20 bg-danger/5",
    unchanged:  "border-warn/20 bg-warn/5",
    info:       "border-hairline bg-surface-1",
  }[display.tone];

  return (
    <div className="flex flex-col gap-4">
      <Card className={toneClass}>
        <CardContent className="flex items-start gap-3 px-5 py-4">
          {display.tone === "improved"  && <TrendingUp  size={16} className="mt-0.5 shrink-0 text-ok"     aria-hidden="true" />}
          {display.tone === "regressed" && <TrendingDown size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />}
          {display.tone === "unchanged" && <Minus        size={16} className="mt-0.5 shrink-0 text-warn"   aria-hidden="true" />}
          {display.tone === "info"      && <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok"     aria-hidden="true" />}
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-ink">{display.headline}</p>
            <p className="text-xs text-ink-subtle">{display.subline}</p>
          </div>
        </CardContent>
      </Card>

      {mission.remaining_issue && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/20 bg-warn/5 px-4 py-3">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-warn">Still to work on</p>
            <p className="mt-0.5 text-xs text-ink-subtle">{mission.remaining_issue}</p>
          </div>
        </div>
      )}

      {changes.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              Before / after
            </p>
            {changes.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-4 text-xs">
                <span className="text-ink-subtle">{c.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-ink-faint">{c.before}</span>
                  <ArrowRight size={10} className="text-ink-faint" aria-hidden="true" />
                  <span className={`font-mono font-semibold ${
                    c.tone === "improved" ? "text-ok" : c.tone === "regressed" ? "text-danger" : "text-ink"
                  }`}>{c.after}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {mission.success_criteria.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            Success criteria
          </p>
          <ul className="flex flex-col gap-1.5" role="list">
            {mission.success_criteria.map((crit, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-ink-subtle">
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-ok/60" aria-hidden="true" />
                {crit}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        <Button asChild className="flex-1">
          <Link href="/dashboard">
            Back to dashboard <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </Button>
        {mission.source_speech_id && (
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/session?parent=${mission.source_speech_id}`}>
              Re-record speech <Mic size={12} aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Loading / error states ─────────────────────────────────────────────────────

function LoadingState() {
  return (
    <AppShell maxWidth="full" bare>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-7 sm:px-6">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </AppShell>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <AppShell maxWidth="full" bare>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-7 sm:px-6">
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 px-4 py-4">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-danger">{message}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">
            <ArrowLeft size={12} aria-hidden="true" /> Back to dashboard
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}
