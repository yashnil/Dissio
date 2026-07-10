"use client";

/**
 * Tournament Prep — entry + first workspace (Phase 6A).
 *
 * Entry: continue recent prep, start prep from a saved resolution, create a
 * new resolution, or jump to Evidence Studio/Library. Never a dead end.
 *
 * Workspace: resolution overview + primary next action, concrete coverage
 * (arguments / evidence / frontlines), decomposed readiness dimensions, and
 * the existing gap/freshness/plan/workout detail panels.
 *
 * Readiness is derived in lib/prepModel.ts from real rows and report data —
 * green only with concrete coverage, neutral when unknown.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BarChart3, BookMarked, Calendar,
  Clipboard, Droplets, Dumbbell, FileText, Loader2, Plus,
  RefreshCw, Search, Target,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { apiFetch, isBackendUnreachable } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReadinessOverview } from "@/components/prep/ReadinessOverview";
import { FreshnessPanel } from "@/components/prep/FreshnessPanel";
import { PrepPlanPanel } from "@/components/prep/PrepPlanPanel";
import { PrepWorkoutPanel } from "@/components/prep/PrepWorkoutPanel";
import { GapsPanel } from "@/components/prep/GapsPanel";
import {
  derivePrepEntryState,
  sortWorkspacesByRecency,
  deriveArgumentCoverage,
  deriveEvidenceCoverage,
  deriveFrontlineReadiness,
  deriveTournamentReadiness,
  derivePrepNextAction,
  describeSideFocus,
  filterFrontlinesForResolution,
  mapGapToTarget,
  withPrepReturnContext,
  type CoverageDisplay,
  type PrepReturnContext,
  type PrepTone,
} from "@/lib/prepModel";
import {
  ArgumentsSection,
  EvidenceCardsSection,
  FrontlinesSection,
} from "@/components/prep/PrepMaterialsSections";
import type {
  PrepReadinessReport, PrepTask, PrepWorkout, PrepWorkspace, Side,
} from "@/types/prep";
import type { Argument, Frontline, LibrarySearchResult, Resolution } from "@/types/library";

// ── Semantic tone styles (label text always carries the state — never color-only)

const TONE: Record<PrepTone, { dot: string; text: string }> = {
  green:   { dot: "bg-ok",        text: "text-ok" },
  amber:   { dot: "bg-warn",      text: "text-warn" },
  red:     { dot: "bg-danger",    text: "text-danger" },
  neutral: { dot: "bg-ink-faint", text: "text-ink-subtle" },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Phase = "loading" | "error" | "ready";

interface SetupDraft {
  resolution: Resolution;
  side: Side;
  tournamentDate: string;
}

function PrepPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceParam = searchParams.get("workspace");

  const [userId, setUserId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [err, setErr] = useState("");

  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [workspaces, setWorkspaces] = useState<PrepWorkspace[]>([]);

  // Selected workspace data
  const [workspace, setWorkspace] = useState<PrepWorkspace | null>(null);
  const [report, setReport] = useState<PrepReadinessReport | null>(null);
  const [tasks, setTasks] = useState<PrepTask[]>([]);
  const [workouts, setWorkouts] = useState<PrepWorkout[]>([]);
  const [args, setArgs] = useState<Argument[] | null>(null);
  const [cards, setCards] = useState<LibrarySearchResult[] | null>(null);
  const [frontlines, setFrontlines] = useState<Frontline[] | null>(null);
  const [wsLoading, setWsLoading] = useState(false);

  // Setup + create-resolution UI state
  const [setup, setSetup] = useState<SetupDraft | null>(null);
  const [creatingWs, setCreatingWs] = useState(false);
  const [newResTitle, setNewResTitle] = useState("");
  const [creatingRes, setCreatingRes] = useState(false);
  const [actionErr, setActionErr] = useState("");

  const [generating, setGenerating] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const selectWorkspace = useCallback(async (wsId: string, uid: string) => {
    setWsLoading(true);
    setActionErr("");
    try {
      const data = await apiFetch<{
        workspace: PrepWorkspace;
        latest_report: PrepReadinessReport | null;
        pending_tasks: PrepTask[];
        active_workouts: PrepWorkout[];
      }>(`/prep/workspaces/${wsId}/overview?user_id=${uid}`);
      setWorkspace(data.workspace);
      setReport(data.latest_report ?? null);
      setTasks(data.pending_tasks ?? []);
      setWorkouts(data.active_workouts ?? []);
      router.replace(`/prep?workspace=${wsId}`, { scroll: false });
      const resolutionId = data.workspace.resolution_id;
      // Saved arguments for this resolution — the concrete coverage source.
      apiFetch<Argument[]>(
        `/library/arguments?user_id=${uid}&resolution_id=${resolutionId}`,
      )
        .then(setArgs)
        .catch(() => setArgs(null)); // unknown, rendered as neutral
      // Saved cards for this resolution (real materials behind evidence coverage).
      apiFetch<{ results: LibrarySearchResult[] }>("/library/search", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ user_id: uid, resolution_id: resolutionId, limit: 100 }),
      })
        .then((r) => setCards(r.results))
        .catch(() => setCards(null));
      // Frontlines — list endpoint has no resolution filter; filter client-side
      // on each frontline's saved resolution_id.
      apiFetch<Frontline[]>(`/library/frontlines?user_id=${uid}`)
        .then((all) => setFrontlines(filterFrontlinesForResolution(all, resolutionId)))
        .catch(() => setFrontlines(null));
    } catch {
      setActionErr("Could not open that prep workspace. Try again or pick another.");
    } finally {
      setWsLoading(false);
    }
  }, [router]);

  const loadEntry = useCallback(() => {
    return createClient().auth.getUser()
      .then(async ({ data }) => {
        if (!data.user) { router.replace("/login"); return; }
        const uid = data.user.id;
        setUserId(uid);
        const [res, wss] = await Promise.all([
          apiFetch<Resolution[]>(`/library/resolutions?user_id=${uid}`),
          apiFetch<PrepWorkspace[]>(`/prep/workspaces?user_id=${uid}`),
        ]);
        setResolutions(res);
        setWorkspaces(wss);
        setErr("");
        setPhase("ready");
        if (workspaceParam) void selectWorkspace(workspaceParam, uid);
      })
      .catch((e) => {
        setErr(
          isBackendUnreachable(e)
            ? "Could not reach the server. Start the backend and retry."
            : "Could not load your prep data. Please retry.",
        );
        setPhase("error");
      });
  // workspaceParam is read once on mount; selection afterwards goes through selectWorkspace.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, selectWorkspace]);

  useEffect(() => { loadEntry(); }, [loadEntry]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function createResolution() {
    const title = newResTitle.trim();
    if (!title || !userId || creatingRes) return;
    setCreatingRes(true);
    setActionErr("");
    try {
      const res = await apiFetch<Resolution>("/library/resolutions", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ user_id: userId, title, event_type: "pf" }),
      });
      setResolutions((prev) => [res, ...prev]);
      setNewResTitle("");
      setSetup({ resolution: res, side: "both", tournamentDate: "" });
    } catch {
      setActionErr("Could not save that resolution. Please try again.");
    } finally {
      setCreatingRes(false);
    }
  }

  async function createWorkspace() {
    if (!setup || !userId || creatingWs) return;
    setCreatingWs(true);
    setActionErr("");
    try {
      const ws = await apiFetch<PrepWorkspace>("/prep/workspaces", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          user_id: userId,
          resolution_id: setup.resolution.id,
          side: setup.side,
          tournament_date: setup.tournamentDate || null,
        }),
      });
      setWorkspaces((prev) => [ws, ...prev]);
      setSetup(null);
      await selectWorkspace(ws.id, userId);
    } catch {
      setActionErr("Could not create the prep workspace. Please try again.");
    } finally {
      setCreatingWs(false);
    }
  }

  async function generateReport() {
    if (!workspace || !userId || generating) return;
    setGenerating(true);
    setActionErr("");
    try {
      const rep = await apiFetch<PrepReadinessReport>("/prep/readiness-report", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          workspace_id: workspace.id,
          user_id: userId,
          force_refresh: !!report,
        }),
      });
      setReport(rep);
      if (rep.id) {
        try {
          const plan = await apiFetch<{ tasks: PrepTask[]; workouts: PrepWorkout[] }>(
            "/prep/prep-plan",
            {
              method: "POST",
              headers: JSON_HEADERS,
              body: JSON.stringify({
                workspace_id: workspace.id,
                user_id: userId,
                report_id: rep.id,
              }),
            },
          );
          setTasks(plan.tasks ?? []);
          setWorkouts(plan.workouts ?? []);
        } catch { /* plan generation is non-fatal */ }
      }
    } catch {
      setActionErr("Report generation failed. Your saved work is untouched — retry in a moment.");
    } finally {
      setGenerating(false);
    }
  }

  function completeTask(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "completed" as const } : t)));
    if (userId) {
      apiFetch(`/prep/tasks/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ user_id: userId, status: "completed" }),
      }).catch(() => { /* local state stands; next load reconciles */ });
    }
  }

  function completeWorkout(id: string) {
    setWorkouts((prev) => prev.map((w) => (w.id === id ? { ...w, status: "completed" as const } : w)));
    if (userId) {
      apiFetch(`/prep/workouts/${id}/complete?user_id=${userId}`, { method: "PATCH" })
        .catch(() => {});
    }
  }

  async function updateWorkspace(patch: { side?: Side; tournament_date?: string | null }) {
    if (!workspace || !userId) return;
    try {
      const updated = await apiFetch<PrepWorkspace>(`/prep/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ user_id: userId, ...patch }),
      });
      setWorkspace(updated);
      setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    } catch {
      setActionErr("Could not save the workspace changes. Please try again.");
    }
  }

  function backToEntry() {
    setWorkspace(null);
    setReport(null);
    setTasks([]);
    setWorkouts([]);
    setArgs(null);
    setCards(null);
    setFrontlines(null);
    router.replace("/prep", { scroll: false });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-7">
      {/* Stable frame — always visible */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-title text-ink">Tournament Prep</h1>
          <p className="mt-0.5 text-sm text-ink-subtle">
            Turn saved research into a preparation plan for a resolution.
          </p>
        </div>
        {workspace && (
          <button
            type="button"
            onClick={backToEntry}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
          >
            <ArrowLeft size={12} aria-hidden="true" /> All prep
          </button>
        )}
      </div>

      {phase === "loading" && (
        <p role="status" className="flex items-center gap-2 text-sm text-ink-subtle">
          <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" />
          Loading your resolutions and prep workspaces…
        </p>
      )}

      {phase === "error" && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
          <p className="flex-1 text-sm text-danger">{err}</p>
          <Button size="sm" variant="secondary" className="shrink-0" onClick={() => { setPhase("loading"); loadEntry(); }}>
            Retry
          </Button>
        </div>
      )}

      {actionErr && phase === "ready" && (
        <p role="alert" className="text-sm text-danger">{actionErr}</p>
      )}

      {phase === "ready" && !workspace && !wsLoading && (
        <EntryView
          resolutions={resolutions}
          workspaces={workspaces}
          onStartPrep={(r) => setSetup({ resolution: r, side: "both", tournamentDate: "" })}
          onSelectWorkspace={(id) => userId && selectWorkspace(id, userId)}
          newResTitle={newResTitle}
          setNewResTitle={setNewResTitle}
          onCreateResolution={createResolution}
          creatingRes={creatingRes}
        />
      )}

      {phase === "ready" && wsLoading && (
        <p role="status" className="flex items-center gap-2 text-sm text-ink-subtle">
          <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" />
          Opening prep workspace…
        </p>
      )}

      {phase === "ready" && workspace && !wsLoading && (
        <WorkspaceView
          userId={userId}
          workspace={workspace}
          resolution={resolutions.find((r) => r.id === workspace.resolution_id) ?? null}
          report={report}
          tasks={tasks}
          workouts={workouts}
          args={args}
          cards={cards}
          frontlines={frontlines}
          generating={generating}
          onGenerate={generateReport}
          onTaskComplete={completeTask}
          onWorkoutComplete={completeWorkout}
          onUpdateWorkspace={updateWorkspace}
        />
      )}

      {/* Resolution setup panel */}
      {setup && (
        <SetupPanel
          draft={setup}
          onChange={setSetup}
          onCancel={() => setSetup(null)}
          onCreate={createWorkspace}
          creating={creatingWs}
        />
      )}
    </div>
  );
}

// ── Entry view ────────────────────────────────────────────────────────────────

function EntryView({
  resolutions, workspaces, onStartPrep, onSelectWorkspace,
  newResTitle, setNewResTitle, onCreateResolution, creatingRes,
}: {
  resolutions: Resolution[];
  workspaces: PrepWorkspace[];
  onStartPrep: (r: Resolution) => void;
  onSelectWorkspace: (id: string) => void;
  newResTitle: string;
  setNewResTitle: (v: string) => void;
  onCreateResolution: () => void;
  creatingRes: boolean;
}) {
  const entryState = derivePrepEntryState(resolutions, workspaces);
  const recent = sortWorkspacesByRecency(workspaces);
  const titleFor = (ws: PrepWorkspace) =>
    resolutions.find((r) => r.id === ws.resolution_id)?.title ?? "Saved resolution";

  return (
    <div className="flex flex-col gap-5">
      {/* Continue recent prep */}
      {entryState === "has-prep" && (
        <section aria-label="Continue preparation" className="flex flex-col gap-2">
          <h2 className="text-eyebrow text-ink-subtle">Continue preparation</h2>
          <div className="flex flex-col gap-1.5">
            {recent.slice(0, 4).map((ws) => (
              <Card key={ws.id} className="transition-colors hover:border-hairline-strong">
                <CardContent className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-2" aria-hidden="true">
                    <Target size={13} className="text-ink-faint" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{titleFor(ws)}</p>
                    <p className="text-xs text-ink-subtle">
                      {describeSideFocus(ws.side)}
                      {ws.tournament_date && ` · Tournament ${ws.tournament_date}`}
                      <span className="text-ink-faint"> · updated {fmtDate(ws.updated_at)}</span>
                    </p>
                  </div>
                  <Button size="sm" className="shrink-0 gap-1" onClick={() => onSelectWorkspace(ws.id)}>
                    Open <ArrowRight size={11} aria-hidden="true" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Start prep from a resolution */}
      {resolutions.length > 0 && (
        <section aria-label="Start preparation" className="flex flex-col gap-2">
          <h2 className="text-eyebrow text-ink-subtle">Start prep from a resolution</h2>
          <div className="flex flex-col gap-1.5">
            {resolutions.slice(0, 6).map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center gap-3 px-4 py-3">
                  <FileText size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
                  <p className="min-w-0 flex-1 truncate text-sm text-ink">{r.title}</p>
                  <Button size="sm" variant="secondary" className="shrink-0" onClick={() => onStartPrep(r)}>
                    Prep this
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* New resolution */}
      <section aria-label="New resolution" className="flex flex-col gap-2">
        <h2 className="text-eyebrow text-ink-subtle">
          {entryState === "empty" ? "Add your first resolution" : "New resolution"}
        </h2>
        {entryState === "empty" && (
          <p className="text-sm leading-relaxed text-ink-subtle">
            Tournament Prep builds a readiness plan from your saved arguments, evidence,
            and frontlines for a specific resolution. Add the resolution you&rsquo;re
            debating to unlock the workspace — then bring in evidence from Evidence Studio.
          </p>
        )}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => { e.preventDefault(); onCreateResolution(); }}
        >
          <label htmlFor="new-resolution" className="sr-only">Resolution text</label>
          <input
            id="new-resolution"
            type="text"
            value={newResTitle}
            onChange={(e) => setNewResTitle(e.target.value)}
            placeholder="Resolved: The United States federal government should…"
            className="min-w-0 flex-1 rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
          />
          <Button type="submit" size="sm" disabled={!newResTitle.trim() || creatingRes} className="gap-1.5 sm:self-stretch">
            {creatingRes ? <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
            {creatingRes ? "Saving…" : "Add resolution"}
          </Button>
        </form>
      </section>

      {/* Evidence entry points */}
      <section aria-label="Research sources" className="flex flex-wrap items-center gap-3">
        <Link
          href="/evidence"
          className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-3 py-2 text-xs font-medium text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
        >
          <Search size={12} aria-hidden="true" /> Search Evidence Studio
        </Link>
        <Link
          href="/library"
          className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-3 py-2 text-xs font-medium text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
        >
          <BookMarked size={12} aria-hidden="true" /> Open Library
        </Link>
      </section>
    </div>
  );
}

// ── Resolution setup panel ────────────────────────────────────────────────────

const SIDE_OPTIONS: { value: Side; label: string; hint: string }[] = [
  { value: "pro", label: "PRO", hint: "Affirm the resolution" },
  { value: "con", label: "CON", hint: "Negate the resolution" },
  { value: "both", label: "Both", hint: "Full tournament prep" },
];

function SetupPanel({
  draft, onChange, onCancel, onCreate, creating,
}: {
  draft: SetupDraft;
  onChange: (d: SetupDraft) => void;
  onCancel: () => void;
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <section
      aria-label="Prep setup"
      className="flex flex-col gap-4 rounded-xl border border-lav/25 bg-lav/5 px-5 py-5"
    >
      <div>
        <h2 className="text-heading text-ink">Set up prep</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-subtle">{draft.resolution.title}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-eyebrow text-ink-subtle">Side focus</legend>
        <div className="flex flex-wrap gap-2">
          {SIDE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-lav/50 ${
                draft.side === opt.value
                  ? "border-lav/40 bg-lav/10 text-ink"
                  : "border-hairline bg-surface-1 text-ink-subtle hover:border-hairline-strong"
              }`}
            >
              <input
                type="radio"
                name="side-focus"
                value={opt.value}
                checked={draft.side === opt.value}
                onChange={() => onChange({ ...draft, side: opt.value })}
                className="sr-only"
              />
              <span className="font-semibold">{opt.label}</span>
              <span className="text-xs text-ink-faint">{opt.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tournament-date" className="text-eyebrow text-ink-subtle">
          Tournament date <span className="font-normal normal-case text-ink-faint">(optional)</span>
        </label>
        <input
          id="tournament-date"
          type="date"
          value={draft.tournamentDate}
          onChange={(e) => onChange({ ...draft, tournamentDate: e.target.value })}
          className="w-fit rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
        />
        <p className="text-xs text-ink-faint">Solo prep for now — partner and team assignment come later.</p>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onCreate} disabled={creating} className="gap-1.5">
          {creating ? <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden="true" /> : <Target size={12} aria-hidden="true" />}
          {creating ? "Creating…" : "Create prep workspace"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={creating}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

// ── Workspace view ────────────────────────────────────────────────────────────

type DetailTab = "gaps" | "freshness" | "plan" | "workouts";

const DETAIL_TABS: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
  { id: "gaps", label: "Gaps", icon: <AlertTriangle size={13} aria-hidden="true" /> },
  { id: "freshness", label: "Freshness", icon: <Droplets size={13} aria-hidden="true" /> },
  { id: "plan", label: "Prep Plan", icon: <Clipboard size={13} aria-hidden="true" /> },
  { id: "workouts", label: "Workouts", icon: <Dumbbell size={13} aria-hidden="true" /> },
];

function ToneBadge({ display }: { display: CoverageDisplay }) {
  const t = TONE[display.tone];
  return (
    <span className={`flex items-center gap-1.5 text-xs font-semibold ${t.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
      {display.label}
    </span>
  );
}

function WorkspaceView({
  userId, workspace, resolution, report, tasks, workouts, args, cards, frontlines,
  generating, onGenerate, onTaskComplete, onWorkoutComplete, onUpdateWorkspace,
}: {
  userId: string | null;
  workspace: PrepWorkspace;
  resolution: Resolution | null;
  report: PrepReadinessReport | null;
  tasks: PrepTask[];
  workouts: PrepWorkout[];
  args: Argument[] | null;
  cards: LibrarySearchResult[] | null;
  frontlines: Frontline[] | null;
  generating: boolean;
  onGenerate: () => void;
  onTaskComplete: (id: string) => void;
  onWorkoutComplete: (id: string) => void;
  onUpdateWorkspace: (patch: { side?: Side; tournament_date?: string | null }) => Promise<void>;
}) {
  const [tab, setTab] = useState<DetailTab>("gaps");
  // Round trip: Library deep links carry this so "Back to Tournament Prep"
  // returns to THIS workspace (IDs stay in URLs, never in labels).
  const returnContext: PrepReturnContext = {
    workspaceId: workspace.id,
    resolutionId: workspace.resolution_id,
  };
  const [editing, setEditing] = useState(false);
  const [editSide, setEditSide] = useState<Side>(workspace.side);
  const [editDate, setEditDate] = useState(workspace.tournament_date ?? "");
  const [savingEdit, setSavingEdit] = useState(false);

  async function saveEdit() {
    setSavingEdit(true);
    await onUpdateWorkspace({ side: editSide, tournament_date: editDate || null });
    setSavingEdit(false);
    setEditing(false);
  }

  const title = resolution?.title ?? report?.resolution_title ?? "Saved resolution";
  const nextAction = derivePrepNextAction({ report, tasks, workouts });
  const argCoverage = args !== null
    ? deriveArgumentCoverage(args, workspace.side)
    : ({ tone: "neutral", label: "Not loaded", explanation: "Could not load saved arguments — coverage unknown.", proCount: 0, conCount: 0, missingSides: [] } as const);
  const evidenceCoverage = deriveEvidenceCoverage(report);
  const frontlineCoverage = deriveFrontlineReadiness(report);
  const readiness = deriveTournamentReadiness(report);
  const pendingTaskCount = tasks.filter((t) => t.status === "pending").length;
  // Concrete missing responses from the readiness report's frontline gaps.
  const missingFrontlineGaps = (report?.gaps ?? [])
    .filter((g) => !g.resolved && (g.gap_category === "missing_response" || g.gap_category === "frontline_underdeveloped"))
    .map((g) => {
      const target = mapGapToTarget(g); // exact frontline link when the gap carries a ref
      return {
        title: g.title,
        severity: g.severity,
        action: target.actionLabel,
        href: withPrepReturnContext(target.href, returnContext),
      };
    });

  return (
    <div className="flex flex-col gap-5">
      {/* A. Resolution overview + primary next action */}
      <section aria-label="Resolution overview" className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-1 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-heading text-ink">{title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
              <span className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 font-medium">
                {describeSideFocus(workspace.side)}
              </span>
              {workspace.tournament_date && (
                <span className="flex items-center gap-1">
                  <Calendar size={11} aria-hidden="true" /> Tournament {workspace.tournament_date}
                </span>
              )}
              <span className="text-ink-faint">
                {report
                  ? `Last scanned ${fmtDate(report.generated_at)}`
                  : "Not scanned yet"}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => { setEditing((e) => !e); setEditSide(workspace.side); setEditDate(workspace.tournament_date ?? ""); }}>
              {editing ? "Close" : "Edit"}
            </Button>
            <Button size="sm" variant="secondary" onClick={onGenerate} disabled={generating} className="gap-1.5">
              {generating
                ? <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden="true" />
                : <RefreshCw size={12} aria-hidden="true" />}
              {generating ? "Scanning…" : report ? "Refresh report" : "Generate report"}
            </Button>
          </div>
        </div>

        {/* Lightweight edit: side focus + tournament date (PATCHes the workspace) */}
        {editing && (
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-hairline bg-surface-2/50 px-4 py-3">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-eyebrow text-ink-subtle">Side focus</legend>
              <div className="flex gap-1.5">
                {SIDE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-lav/50 ${
                      editSide === opt.value
                        ? "border-lav/40 bg-lav/10 text-ink"
                        : "border-hairline bg-surface-1 text-ink-subtle"
                    }`}
                  >
                    <input
                      type="radio"
                      name="edit-side"
                      value={opt.value}
                      checked={editSide === opt.value}
                      onChange={() => setEditSide(opt.value)}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-date" className="text-eyebrow text-ink-subtle">Tournament date</label>
              <input
                id="edit-date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
              />
            </div>
            <Button size="sm" onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save"}
            </Button>
          </div>
        )}

        {/* Primary next action — grounded in current coverage state */}
        <div className="flex items-start gap-3 rounded-lg border border-lav/20 bg-lav/5 px-4 py-3">
          <Target size={14} className="mt-0.5 shrink-0 text-lav" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-eyebrow text-lav-hi">Next prep move</p>
            <p className="mt-0.5 text-sm font-semibold text-ink">{nextAction.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-subtle">{nextAction.description}</p>
          </div>
          {(nextAction.kind === "generate-report" || nextAction.kind === "refresh") && (
            <Button size="sm" onClick={onGenerate} disabled={generating} className="shrink-0">
              {nextAction.kind === "generate-report" ? "Generate" : "Refresh"}
            </Button>
          )}
        </div>
      </section>

      {/* B–D. Working materials — the real rows behind each coverage summary */}
      <section aria-label="Prep materials" className="flex flex-col gap-3">
        <ArgumentsSection args={args} display={argCoverage} returnContext={returnContext} />
        <EvidenceCardsSection cards={cards} display={evidenceCoverage} returnContext={returnContext} />
        <FrontlinesSection
          frontlines={frontlines}
          display={frontlineCoverage}
          missingGapTitles={missingFrontlineGaps}
          userId={userId}
          returnContext={returnContext}
        />
      </section>

      {/* F. Readiness — decomposed dimensions */}
      <section aria-label="Readiness" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-eyebrow text-ink-subtle">Readiness</h2>
          <ToneBadge display={readiness.overall} />
        </div>
        <p className="text-xs leading-relaxed text-ink-subtle">{readiness.overall.explanation}</p>
        {report ? (
          <Card>
            <CardContent className="px-5 py-4">
              <ReadinessOverview report={report} />
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-hairline px-5 py-5">
            <p className="text-sm text-ink-subtle">
              Generate a readiness report to score argument coverage, evidence quality,
              freshness, frontlines, source diversity, and weighing prep for this resolution.
            </p>
            <Button size="sm" onClick={onGenerate} disabled={generating} className="gap-1.5">
              {generating
                ? <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden="true" />
                : <BarChart3 size={12} aria-hidden="true" />}
              {generating ? "Scanning…" : "Generate readiness report"}
            </Button>
          </div>
        )}
      </section>

      {/* E + details: gaps / freshness / plan / workouts */}
      {report && (
        <section aria-label="Prep details" className="flex flex-col gap-3">
          <div role="tablist" aria-label="Prep detail sections" className="flex gap-1 border-b border-hairline">
            {DETAIL_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 ${
                  tab === t.id
                    ? "border-lav font-semibold text-lav"
                    : "border-transparent text-ink-subtle hover:text-ink"
                }`}
              >
                {t.icon}
                {t.label}
                {t.id === "gaps" && report.gaps.length > 0 && (
                  <span className="rounded-full bg-warn/10 px-1.5 text-[10px] font-semibold text-warn">
                    {report.gaps.length}
                  </span>
                )}
                {t.id === "plan" && pendingTaskCount > 0 && (
                  <span className="rounded-full bg-lav/10 px-1.5 text-[10px] font-semibold text-lav">
                    {pendingTaskCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="min-h-[280px]">
            {tab === "gaps" && <GapsPanel gaps={report.gaps} returnContext={returnContext} />}
            {tab === "freshness" && <FreshnessPanel assessments={report.freshness_assessments} />}
            {tab === "plan" && <PrepPlanPanel tasks={tasks} onTaskComplete={onTaskComplete} />}
            {tab === "workouts" && (
              <PrepWorkoutPanel workouts={workouts} onWorkoutComplete={onWorkoutComplete} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function PrepPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <h1 className="text-title text-ink">Tournament Prep</h1>
          <p role="status" className="mt-2 text-sm text-ink-subtle">Loading…</p>
        </div>
      }
    >
      <PrepPageContent />
    </Suspense>
  );
}
