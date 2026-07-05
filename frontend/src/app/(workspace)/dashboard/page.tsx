"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mic, CheckCircle2, Target,
  MoreHorizontal, Trash2, ArrowUpRight, ArrowRight,
  Play, AlertTriangle, X,
} from "lucide-react";
import DeleteDialog from "@/components/DeleteDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase";
import { apiFetch, isBackendUnreachable } from "@/lib/api";
import { reducedSafe, staggerParent, staggerChild } from "@/lib/motion";
import { motion } from "motion/react";
import FirstRunCommandCenter from "@/components/FirstRunCommandCenter";
import NextActionPanel from "@/components/dashboard/NextActionPanel";
import CoachingFocusCard from "@/components/dashboard/CoachingFocusCard";
import LoopStageCard from "@/components/dashboard/LoopStageCard";
import LatestPracticeCard from "@/components/dashboard/LatestPracticeCard";
import DrillHandoffCard from "@/components/dashboard/DrillHandoffCard";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { deriveDashboardState } from "@/lib/dashboardModel";
import { getDrillHandoff } from "@/lib/dashboardHelpers";
import {
  getSpeechListReadiness,
  getPipelineProgress,
  getLatestPracticeSummary,
  getDashboardRetryAction,
  getRetryJobId,
  getRetryFailureMessage,
  hasActiveSpeeches,
  shouldPollDashboard,
  findNewlyReadySpeeches,
  ACTIVE_POLL_INTERVAL_MS,
} from "@/lib/practiceReadiness";
import NextMissionCard from "@/components/dashboard/NextMissionCard";
import { ContinueTrainingCard } from "@/components/training/ContinueTrainingCard";
import type { Speech, ProgressSummary, PilotSummary, Workout, StudentMission } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  constructive: "Constructive", rebuttal: "Rebuttal", summary: "Summary",
  final_focus: "Final Focus",  crossfire: "Crossfire",
};
const JUDGE_LABEL: Record<string, string> = {
  lay: "Lay", flow: "Flow", tech: "Tech", coach: "Coach",
};
const SKILL_GRID = [
  { key: "clash",            label: "Clash",           icon: "⚔", max: 20 },
  { key: "weighing",         label: "Impact Weighing", icon: "⚖", max: 20 },
  { key: "extensions",       label: "Extensions",      icon: "↗", max: 20 },
  { key: "drops",            label: "Drop Prevention", icon: "🛡", max: 20 },
  { key: "judge_adaptation", label: "Judge Adapt.",    icon: "👁", max: 20 },
] as const;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtPercent(val: number | null) {
  return val === null ? "—" : `${Math.round(val * 100)}%`;
}

// ── Speech card ───────────────────────────────────────────────────────────────

function SpeechCard({
  s,
  onDelete,
  onRetry,
  retrying,
  retryError,
}: {
  s: Speech;
  onDelete: (s: Speech) => void;
  onRetry: (s: Speech) => void;
  retrying: boolean;
  retryError: string | null;
}) {
  const badge = getSpeechListReadiness(s);
  const pipeline = getPipelineProgress(s);
  const canDirectRetry = getDashboardRetryAction(s).kind === "direct-retry";
  const accentBorder =
    badge.tone === "green"        ? "border-l-ok/60"
    : badge.tone === "red"        ? "border-l-danger/60"
    : badge.badge === "indigo"    ? "border-l-lav/40"
    : badge.tone === "amber"      ? "border-l-warn/60"
    : "border-l-hairline";

  return (
    <Card className={`border-l-2 transition-colors duration-150 hover:border-hairline-strong ${accentBorder}`}>
      <CardContent className="flex items-center gap-4 px-5 py-4">
        <Link href={`/speech/${s.id}`} className="group flex min-w-0 flex-1 items-start gap-3.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-2 transition-colors group-hover:border-lav/30 group-hover:bg-lav/5">
            <Mic size={13} className="text-ink-faint transition-colors group-hover:text-lav" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate text-sm font-semibold text-ink transition-colors group-hover:text-lav-hi">
              {s.title}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0">
              <span className="text-xs text-ink-subtle">{TYPE_LABEL[s.speech_type] ?? s.speech_type}</span>
              {s.side       && <span className="text-xs capitalize text-ink-faint">· {s.side}</span>}
              {s.judge_type && <span className="text-xs text-ink-faint">· {JUDGE_LABEL[s.judge_type]} judge</span>}
              {s.topic      && <span className="hidden truncate text-xs text-ink-faint sm:inline">· {s.topic}</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-0.5">
              {pipeline.map((step, i, arr) => (
                <div key={step.key} className="flex items-center gap-0.5">
                  <div
                    title={`${step.label}${step.unknown ? " — unknown" : step.done ? " ready" : " not ready"}`}
                    className={`h-1.5 rounded-full transition-colors ${step.done ? "w-5 bg-lav" : "w-3 bg-hairline"}`}
                  />
                  {i < arr.length - 1 && <div className="h-px w-0.5 bg-hairline" />}
                </div>
              ))}
              <span className="ml-1.5 text-xs text-ink-faint">{fmtDate(s.created_at)}</span>
            </div>
          </div>
        </Link>

        <div className="flex shrink-0 items-center gap-2" title={badge.detail}>
          {canDirectRetry && (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1 text-xs"
              onClick={() => onRetry(s)}
              disabled={retrying}
            >
              {retrying ? "Retrying…" : "Retry analysis"}
            </Button>
          )}
          <Badge variant={badge.badge}>
            {badge.isProcessing ? `${badge.label}…` : badge.label}
          </Badge>
          {badge.detail && <span className="sr-only">{badge.detail}</span>}
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.preventDefault()}
                className="flex h-6 w-6 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
                aria-label="Speech options"
              >
                <MoreHorizontal size={13} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/speech/${s.id}`} className="flex items-center gap-2">
                  <ArrowUpRight size={12} /> View flow report
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => onDelete(s)}>
                <Trash2 size={12} /> Delete session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuRoot>
        </div>
      </CardContent>
      {retryError && (
        <p role="alert" className="px-5 pb-3 text-xs text-danger">
          {retryError}
        </p>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  const [userId,        setUserId]       = useState<string | null>(null);
  const [speeches,      setSpeeches]     = useState<Speech[]>([]);
  const [progress,      setProgress]     = useState<ProgressSummary | null>(null);
  const [pilotSummary,  setPilotSummary] = useState<PilotSummary | null>(null);
  const [latestWorkout, setLatestWorkout] = useState<Workout | null>(null);
  const [mission,       setMission]      = useState<StudentMission | null>(null);
  const [missionLoading, setMissionLoading] = useState(true);
  const [missionErr,    setMissionErr]   = useState("");
  const [nextTrainingAction, setNextTrainingAction] = useState<Record<string, unknown> | null>(null);
  const [trainingLoading, setTrainingLoading] = useState(true);
  const [loading,       setLoading]      = useState(true);
  const [err,           setErr]          = useState("");
  const [del,           setDel]          = useState<Speech | null>(null);
  const [deleting,      setDeleting]     = useState(false);
  const [deleteErr,     setDeleteErr]    = useState("");

  useEffect(() => {
    createClient().auth.getUser()
      .then(async ({ data }) => {
        if (!data.user) { router.replace("/login"); return; }
        setUserId(data.user.id);

        const [speechesData, progressData] = await Promise.all([
          // include_artifacts adds backend-verified readiness per row (batched
          // server-side — no extra frontend requests).
          apiFetch<Speech[]>(`/speeches?user_id=${data.user.id}&include_artifacts=true`),
          apiFetch<ProgressSummary>(`/users/${data.user.id}/progress`),
        ]);
        setSpeeches(speechesData);
        setProgress(progressData);
        // Show the dashboard immediately — critical data is ready
        setLoading(false);

        // Non-critical secondary data loads independently in the background
        apiFetch<PilotSummary>(`/users/${data.user.id}/pilot-summary`)
          .then((pilotData) => setPilotSummary(pilotData))
          .catch(() => { /* non-critical */ });

        apiFetch<Workout[]>(`/workouts?user_id=${data.user.id}`)
          .then((ws) => { if (ws.length > 0) setLatestWorkout(ws[0]); })
          .catch(() => {});

        // Next Mission — non-blocking, shown as its own card
        apiFetch<StudentMission | null>(`/missions/next?user_id=${data.user.id}`)
          .then((m) => { setMission(m); })
          .catch(() => { setMissionErr("Mission unavailable"); })
          .finally(() => { setMissionLoading(false); });

        // Next Training Action — non-blocking, unified priority pipeline
        apiFetch<Record<string, unknown>>(`/training/next-action?user_id=${data.user.id}`)
          .then((action) => { setNextTrainingAction(action); })
          .catch(() => { setNextTrainingAction(null); })
          .finally(() => { setTrainingLoading(false); });
      })
      .catch((e) => {
        setErr(
          isBackendUnreachable(e)
            ? "Could not reach the server. Start the backend and refresh."
            : "Could not load your data. Please refresh and try again.",
        );
        setLoading(false);
      });
  }, [router]);

  // ── Liveness: background refresh while any row is actively analyzing ──────
  // Polls the same batched endpoint (no N+1) and quietly swaps row data in.
  // Polling runs only while the tab is visible AND an active row exists; when
  // the last row settles (ready/failed/stale) or the tab hides, the interval
  // is torn down — completed or hidden dashboards never poll.
  const [tabVisible, setTabVisible] = useState(true);
  const speechesRef = useRef<Speech[]>([]);
  useEffect(() => { speechesRef.current = speeches; }, [speeches]);

  // Report-ready handoff: shown only when a refresh OBSERVES a transition to
  // verified Ready while the user is on the dashboard. Never on initial load.
  const [readyNotice, setReadyNotice] =
    useState<{ speechId: string; title: string; extraCount: number } | null>(null);
  const dismissedReadyIds = useRef<Set<string>>(new Set());

  const refreshSpeeches = useCallback(async () => {
    if (!userId) return;
    try {
      const fresh = await apiFetch<Speech[]>(
        `/speeches?user_id=${userId}&include_artifacts=true`,
      );
      const newlyReady = findNewlyReadySpeeches(speechesRef.current, fresh)
        .filter((s) => !dismissedReadyIds.current.has(s.id));
      if (newlyReady.length > 0) {
        setReadyNotice({
          speechId: newlyReady[0].id,
          title: newlyReady[0].title,
          extraCount: newlyReady.length - 1,
        });
      }
      setSpeeches(fresh);
      // Once everything settled, sync progress so drills/feedback counts
      // reflect the finished analysis (one follow-up fetch, then silence).
      if (!hasActiveSpeeches(fresh)) {
        apiFetch<ProgressSummary>(`/users/${userId}/progress`)
          .then(setProgress)
          .catch(() => { /* keep last known progress */ });
      }
    } catch {
      // Background refresh only — keep showing the last good data.
    }
  }, [userId]);

  // Pause on hidden tabs; one immediate catch-up refetch when visibility
  // returns (then normal polling resumes if rows are still active).
  const refreshRef = useRef(refreshSpeeches);
  useEffect(() => { refreshRef.current = refreshSpeeches; }, [refreshSpeeches]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      const visible = document.visibilityState === "visible";
      setTabVisible(visible);
      if (visible && speechesRef.current.length > 0) {
        refreshRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const pollActive =
    !loading && !err && userId !== null && shouldPollDashboard(speeches, tabVisible);
  useEffect(() => {
    if (!pollActive) return;
    const id = setInterval(() => { refreshRef.current(); }, ACTIVE_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollActive]);

  function dismissReadyNotice() {
    if (readyNotice) dismissedReadyIds.current.add(readyNotice.speechId);
    setReadyNotice(null);
  }

  // ── One-click retry (failed / stalled analyses) ────────────────────────────
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryErr, setRetryErr] = useState<{ speechId: string; message: string } | null>(null);

  async function handleRetry(s: Speech) {
    const jobId = getRetryJobId(s);
    if (!jobId || !userId || retryingId) return;
    setRetryingId(s.id);
    setRetryErr(null);
    try {
      // Same endpoint the speech page uses — no parallel retry system.
      await apiFetch(`/jobs/${jobId}/retry?user_id=${userId}`, { method: "POST" });
      await refreshSpeeches(); // row flips to Preparing; active polling re-arms itself
    } catch {
      setRetryErr({ speechId: s.id, message: getRetryFailureMessage() });
    } finally {
      setRetryingId(null);
    }
  }

  async function handleDelete() {
    if (!del || !userId) return;
    setDeleting(true);
    setDeleteErr("");
    try {
      await apiFetch(`/speeches/${del.id}?user_id=${userId}`, { method: "DELETE" });
      setSpeeches((p) => p.filter((s) => s.id !== del.id));
      const progressData = await apiFetch<ProgressSummary>(`/users/${userId}/progress`);
      setProgress(progressData);
      try {
        const pilotData = await apiFetch<PilotSummary>(`/users/${userId}/pilot-summary`);
        setPilotSummary(pilotData);
      } catch { /* non-critical */ }
      setDel(null);
    } catch (e: unknown) {
      setDeleteErr(e instanceof Error ? e.message : "Could not delete this session.");
    } finally { setDeleting(false); }
  }

  const state   = deriveDashboardState(speeches, progress);
  const latestPractice = getLatestPracticeSummary(speeches);
  const drillHandoff = getDrillHandoff({
    incompleteDrills: progress?.incomplete_drills ?? [],
    feedbackReadyCount: progress?.feedback_ready_count ?? 0,
    speeches,
  });
  const stagger = reducedSafe(staggerParent(0.06, 0.03));
  const child   = reducedSafe(staggerChild);

  return (
    <>
      <motion.div
        className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-7"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        {/* Error */}
        {!loading && err && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
            <p className="text-sm text-danger">{err}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && <DashboardSkeleton />}

        {!loading && (
          <>
            {/* 0. Report-ready handoff — appears only when a report finished
                while the user was watching the dashboard. Dismissible. */}
            {readyNotice && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-3 rounded-xl border border-ok/25 bg-ok/5 px-4 py-3"
              >
                <CheckCircle2 size={16} className="shrink-0 text-ok" aria-hidden="true" />
                <p className="min-w-0 flex-1 text-sm text-ink">
                  <span className="font-semibold">Report ready — open it.</span>{" "}
                  <span className="text-ink-subtle">
                    &ldquo;{readyNotice.title}&rdquo; finished analyzing
                    {readyNotice.extraCount > 0 &&
                      ` (+${readyNotice.extraCount} more ready)`}
                    .
                  </span>
                </p>
                <Button asChild size="sm" className="shrink-0 gap-1.5">
                  <Link href={`/speech/${readyNotice.speechId}`}>
                    Open report <ArrowRight size={11} aria-hidden="true" />
                  </Link>
                </Button>
                <button
                  type="button"
                  onClick={dismissReadyNotice}
                  aria-label="Dismiss report-ready notice"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            )}

            {/* 1. Next Best Action — dominant hero ───────────────────── */}
            <motion.div variants={child}>
              <NextActionPanel action={state.nextAction} />
            </motion.div>

            {/* 1a. Cockpit band — latest practice + drill handoff ─────── */}
            {latestPractice && (
              <motion.div variants={child}>
                <section aria-label="Practice cockpit" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <LatestPracticeCard
                    summary={latestPractice}
                    onRetry={
                      getDashboardRetryAction(latestPractice.speech).kind === "direct-retry"
                        ? () => handleRetry(latestPractice.speech)
                        : undefined
                    }
                    retrying={retryingId === latestPractice.speech.id}
                    retryError={
                      retryErr?.speechId === latestPractice.speech.id ? retryErr.message : null
                    }
                  />
                  <DrillHandoffCard handoff={drillHandoff} workout={latestWorkout} />
                </section>
              </motion.div>
            )}

            {/* 1b. Next Mission coaching card */}
            <motion.div variants={child}>
              <section aria-label="Next mission">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-eyebrow text-ink-subtle">Next mission</span>
                </div>
                <NextMissionCard
                  loading={missionLoading}
                  error={missionErr || null}
                  mission={mission}
                  hasSpeech={speeches.length > 0}
                />
              </section>
            </motion.div>

            {/* 1c. Continue Training CTA */}
            <motion.div variants={child}>
              <section aria-label="Training plan">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-eyebrow text-ink-subtle">Continue training</span>
                </div>
                <ContinueTrainingCard
                  nextAction={nextTrainingAction as Parameters<typeof ContinueTrainingCard>[0]["nextAction"]}
                  loading={trainingLoading}
                />
              </section>
            </motion.div>

            {/* 2. Recent speech insight — priority skill from latest data */}
            {state.showRecentInsight && progress && (
              <motion.div variants={child}>
                <CoachingFocusCard
                  skillAverages={progress.skill_averages}
                  feedbackReadyCount={progress.feedback_ready_count}
                />
              </motion.div>
            )}

            {/* New user: contextual first-run guide */}
            {state.userStage === "new-user" && (
              <motion.div variants={child}>
                <FirstRunCommandCenter userId={userId} />
              </motion.div>
            )}

            {/* Mid-funnel: has speech, no drills attempted yet */}
            {state.showMidFunnelGuide && progress && (
              <motion.div variants={child}>
                <MidFunnelGuide progress={progress} speeches={speeches} />
              </motion.div>
            )}

            {/* 3. Training loop stage ─────────────────────────────────── */}
            {progress && (
              <motion.div variants={child}>
                <LoopStageCard progress={progress} userStage={state.userStage} />
              </motion.div>
            )}

            {/* 4. Skill trajectory ────────────────────────────────────── */}
            {state.showSkillTrajectory && progress && (
              <motion.div variants={child}>
                <SkillTrajectorySection progress={progress} pilotSummary={pilotSummary} />
              </motion.div>
            )}

            {/* 5. Speech history ──────────────────────────────────────── */}
            {state.showSpeechHistory && (
              <motion.div variants={child} className="flex flex-col gap-3">
                {state.hasPendingRecovery && <RecoveryBanner speeches={speeches} />}
                <SpeechHistorySection
                  speeches={speeches}
                  onDelete={setDel}
                  autoUpdating={pollActive}
                  onRetry={handleRetry}
                  retryingId={retryingId}
                  retryErr={retryErr}
                />
              </motion.div>
            )}
          </>
        )}
      </motion.div>

      <DeleteDialog
        open={del !== null}
        onOpenChange={(o) => { if (!o && !deleting) { setDel(null); setDeleteErr(""); } }}
        title="Delete session?"
        description={`"${del?.title}" will be permanently deleted along with its transcript, flow, feedback, and drills.`}
        onConfirm={handleDelete}
        isDeleting={deleting}
        error={deleteErr}
      />
    </>
  );
}

// ── Mid-funnel onboarding ─────────────────────────────────────────────────────

function MidFunnelGuide({
  progress,
  speeches,
}: {
  progress: ProgressSummary;
  speeches: Speech[];
}) {
  const hasFeedback  = progress.feedback_ready_count > 0;
  const latestDone   = speeches.find((s) => s.status === "done");
  const isProcessing = speeches.some((s) =>
    ["pending", "transcribing", "analyzing"].includes(s.status),
  );

  // Processing — show a subtle waiting hint
  if (isProcessing && !hasFeedback) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-1 px-4 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-lav/25 bg-lav/10" aria-hidden="true">
          <span className="h-2 w-2 motion-safe:animate-pulse rounded-full bg-lav" />
        </span>
        <p className="text-sm text-ink-subtle">
          Your speech is being analyzed — check back in a moment for your flow and ballot.
        </p>
      </div>
    );
  }

  // Feedback ready but no drills — the key conversion nudge
  if (hasFeedback && latestDone) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-lav/20 bg-lav/5 px-4 py-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-lav/15" aria-hidden="true">
          <Target size={15} className="text-lav-hi" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-sm font-semibold text-ink">Ready to drill</p>
          <p className="text-sm text-ink-subtle">
            Your ballot is ready. Open your speech report to generate 3 targeted drills based on your actual weaknesses.
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href={`/speech/${latestDone.id}`}>
            Open report <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  }

  // First speech exists but still "pending" with no processing (edge: setup-only)
  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-1 px-4 py-3">
      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-semibold text-ink">First session recorded</p>
        <p className="text-xs text-ink-subtle">
          Once analysis finishes, open the report and tap &ldquo;Generate Drills&rdquo; to start practicing.
        </p>
      </div>
      {latestDone && (
        <Link
          href={`/speech/${latestDone.id}`}
          className="shrink-0 text-xs font-medium text-lav transition-colors hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 focus-visible:rounded"
        >
          View →
        </Link>
      )}
    </div>
  );
}

// ── Skill trajectory section ──────────────────────────────────────────────────

function SkillTrajectorySection({
  progress,
  pilotSummary,
}: {
  progress: ProgressSummary;
  pilotSummary: PilotSummary | null;
}) {
  const showTrends =
    pilotSummary?.skill_trends != null && progress.feedback_ready_count >= 2;

  return (
    <section aria-label="Skill trajectory" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-eyebrow text-ink-subtle">Skill trajectory</span>
          <span className="rep-badge">
            avg · {progress.feedback_ready_count} speech{progress.feedback_ready_count !== 1 ? "es" : ""}
          </span>
        </div>
        <Link
          href="/progress"
          className="flex items-center gap-1 text-xs font-medium text-lav transition-colors hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 focus-visible:rounded"
        >
          Full progress <ArrowRight size={11} aria-hidden="true" />
        </Link>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2">
          {SKILL_GRID.map((skill) => {
            const value = (progress.skill_averages as Record<string, number> | null)?.[skill.key] ?? 0;
            const pct   = (value / skill.max) * 100;
            const barClass = pct >= 70 ? "bg-lav" : pct >= 50 ? "bg-warn" : "bg-danger";
            const trends = showTrends ? pilotSummary!.skill_trends : null;
            const trendVal = trends?.[skill.key as keyof typeof trends];
            const trendDir = trendVal?.trend === "improving" ? "up"
              : trendVal?.trend === "needs_attention" ? "down"
              : null;

            return (
              <div key={skill.key} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-eyebrow text-ink-subtle">
                    <span aria-hidden="true">{skill.icon}</span>
                    {" "}{skill.label}
                    {trendDir === "up"   && <span className="ml-1 text-ok" aria-label="improving">↑</span>}
                    {trendDir === "down" && <span className="ml-1 text-danger" aria-label="declining">↓</span>}
                  </span>
                  <span className="font-mono text-xs font-bold tabular-nums text-ink">
                    {value.toFixed(1)}<span className="font-normal text-ink-faint">/{skill.max}</span>
                  </span>
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-hairline"
                  role="progressbar"
                  aria-valuenow={value}
                  aria-valuemin={0}
                  aria-valuemax={skill.max}
                  aria-label={skill.label}
                >
                  <div
                    className={`h-full rounded-full motion-safe:transition-all motion-safe:duration-700 ${barClass}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}

          {progress.drill_completion_rate !== null && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-eyebrow text-ink-subtle">Drill completion</span>
                <span className="font-mono text-xs font-bold text-ink">{fmtPercent(progress.drill_completion_rate)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-hairline">
                <div
                  className="h-full rounded-full bg-ok motion-safe:transition-all motion-safe:duration-700"
                  style={{ width: `${(progress.drill_completion_rate || 0) * 100}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ── Recovery banner ───────────────────────────────────────────────────────────

function RecoveryBanner({ speeches }: { speeches: Speech[] }) {
  const stuck = speeches.filter(
    (s) => s.status === "error" || s.status === "transcribing" || s.status === "analyzing",
  );
  if (stuck.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-xl border border-warn/25 bg-warn/5 px-4 py-3"
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-1.5">
        <p className="text-sm font-medium text-ink">
          {stuck.length === 1 ? "1 session needs attention" : `${stuck.length} sessions need attention`}
        </p>
        <div className="flex flex-col gap-1">
          {stuck.slice(0, 3).map((s) => (
            <Link
              key={s.id}
              href={`/speech/${s.id}`}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs text-ink-subtle transition-colors hover:bg-warn/10 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warn/50"
            >
              <span className="truncate font-medium">{s.title}</span>
              <span className={`shrink-0 ${s.status === "error" ? "text-danger" : "text-warn"}`}>
                {s.status === "error" ? "Failed — retry" : "In progress"}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Speech history section ────────────────────────────────────────────────────

function SpeechHistorySection({
  speeches,
  onDelete,
  autoUpdating,
  onRetry,
  retryingId,
  retryErr,
}: {
  speeches: Speech[];
  onDelete: (s: Speech) => void;
  autoUpdating: boolean;
  onRetry: (s: Speech) => void;
  retryingId: string | null;
  retryErr: { speechId: string; message: string } | null;
}) {
  return (
    <section aria-label="Speech history" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-eyebrow text-ink-subtle">Flow reports</span>
          <span className="rep-badge">{speeches.length}</span>
          {autoUpdating && (
            <span className="flex items-center gap-1 text-[10px] text-ink-faint">
              <span
                className="h-1.5 w-1.5 rounded-full bg-lav motion-safe:animate-pulse"
                aria-hidden="true"
              />
              Updating automatically
            </span>
          )}
        </div>
        <Link
          href="/session"
          className="flex items-center gap-1 text-xs font-medium text-lav transition-colors hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 focus-visible:rounded"
        >
          <Play size={10} aria-hidden="true" /> New session
        </Link>
      </div>
      <div className="flex flex-col gap-1.5">
        {speeches.map((s) => (
          <SpeechCard
            key={s.id}
            s={s}
            onDelete={onDelete}
            onRetry={onRetry}
            retrying={retryingId === s.id}
            retryError={retryErr?.speechId === s.id ? retryErr.message : null}
          />
        ))}
      </div>
    </section>
  );
}

