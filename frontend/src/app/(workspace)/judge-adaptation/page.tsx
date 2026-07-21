"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { JudgeComparisonPanel } from "@/components/judge-adaptation/JudgeComparisonPanel";
import { JudgeProfileSelector } from "@/components/judge-adaptation/JudgeProfileSelector";
import { JudgeReadinessCard } from "@/components/judge-adaptation/JudgeReadinessCard";
import { JudgeWorkoutCard } from "@/components/judge-adaptation/JudgeWorkoutCard";
import { createClient } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { MaterialPicker, SelectedMaterialPreview } from "@/components/judge-adaptation/MaterialPicker";
import { AdaptationResultView } from "@/components/judge-adaptation/AdaptationResultView";
import { AdaptationProgressSummary } from "@/components/judge-adaptation/AdaptationProgressSummary";
import {
  adaptationRequestBody,
  deriveAdaptationReadiness,
  formatHistoryEntryV2,
  canReopenHistoryEntry,
  materialStubFromHistory,
  describeWorkoutPersistence,
  WORKOUT_PERSISTENCE_LABELS,
  normalizeAttemptTrends,
  type AdaptationHistoryRowV2,
  type AdaptationNote,
  type AttemptTrendsResponse,
  type AttemptTrendsView,
  type SelectedMaterial,
} from "@/lib/judgeAdaptationModel";
import type {
  JudgeAdaptationResult,
  JudgeComparisonResult,
  JudgeProfile,
  JudgeReadinessReport,
  JudgeType,
  JudgeWorkoutCreate,
  JudgeWorkoutRow,
} from "@/types/judgeAdaptation";

type Tab = "adapt" | "compare" | "workouts" | "readiness";

const TABS: { id: Tab; label: string }[] = [
  { id: "adapt", label: "Adapt" },
  { id: "compare", label: "Compare Judges" },
  { id: "workouts", label: "Workouts" },
  { id: "readiness", label: "Readiness" },
];

function JudgeAdaptationContent() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tab, setTab] = useState<Tab>("adapt");
  const [profiles, setProfiles] = useState<JudgeProfile[]>([]);
  const [selectedJudge, setSelectedJudge] = useState<JudgeType | null>("lay");
  const [compareJudge, setCompareJudge] = useState<JudgeType | null>("flow");

  const [material, setMaterial] = useState<SelectedMaterial | null>(null);

  const [adaptResult, setAdaptResult] = useState<JudgeAdaptationResult | null>(null);
  const [compareResult, setCompareResult] = useState<JudgeComparisonResult | null>(null);
  const [readinessReport, setReadinessReport] = useState<JudgeReadinessReport | null>(null);
  const [workouts, setWorkouts] = useState<JudgeWorkoutRow[]>([]);

  const [isAdapting, setIsAdapting] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState<AdaptationNote[] | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [history, setHistory] = useState<AdaptationHistoryRowV2[] | null>(null);
  const [previewWorkouts, setPreviewWorkouts] = useState<JudgeWorkoutCreate[]>([]);
  const [savingWorkoutIndex, setSavingWorkoutIndex] = useState<number | null>(null);
  const [saveWorkoutErr, setSaveWorkoutErr] = useState<string | null>(null);

  const [trends, setTrends] = useState<AttemptTrendsView | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendsErr, setTrendsErr] = useState<string | null>(null);

  // Require authentication — redirect to /login if no session
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) {
          router.replace("/login?next=/judge-adaptation");
          return;
        }
        setUserId(data.user.id);
      })
      .catch(() => {
        router.replace("/login?next=/judge-adaptation");
      })
      .finally(() => setAuthLoading(false));
  }, [router]);

  // Load profiles once authenticated
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => {
      apiFetch<JudgeProfile[]>(`/judge-adaptation/profiles?user_id=${userId}`)
        .then(setProfiles)
        .catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, [userId]);

  /**
   * Entry-level "Adaptation progress" summary — pure aggregation over
   * already-scored attempts (Phase 7E). A load failure never blocks the
   * material picker or anything else on the page; the section just omits
   * itself. Re-callable so a fresh score can refresh the numbers.
   */
  function loadTrends(uid: string) {
    setTrendsErr(null);
    apiFetch<AttemptTrendsResponse>(`/judge-adaptation/attempt-trends?user_id=${uid}`)
      .then((res) => setTrends(normalizeAttemptTrends(res)))
      .catch(() => setTrendsErr("Couldn't load your practice history."))
      .finally(() => setTrendsLoading(false));
  }

  useEffect(() => {
    if (!userId) return;
    // trendsLoading already starts true — nothing to set synchronously here.
    const t = setTimeout(() => loadTrends(userId), 0);
    return () => clearTimeout(t);
  }, [userId]);

  // Load workouts when tab switches
  useEffect(() => {
    if (tab !== "workouts" || !userId) return;
    const t = setTimeout(() => {
      apiFetch<JudgeWorkoutRow[]>(`/judge-adaptation/workouts?user_id=${userId}`)
        .then((data) => setWorkouts(Array.isArray(data) ? data : []))
        .catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, [tab, userId]);

  // Recent adaptation history — real persisted rows (kind + judge + counts).
  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => {
      apiFetch<AdaptationHistoryRowV2[]>(`/judge-adaptation/history?user_id=${userId}&limit=8`)
        .then((rows) => setHistory(Array.isArray(rows) ? rows : []))
        .catch(() => setHistory([]));
    }, 0);
    return () => clearTimeout(t);
  }, [userId]);

  /**
   * Reopen a history entry: the stored result_json is a real persisted
   * result, so it renders exactly as a fresh generation would. The material
   * shown is an honest reduced stub (real label, no fabricated card text —
   * see materialStubFromHistory) since history doesn't carry live material
   * fields. Requires canReopenHistoryEntry(row) to have been checked by the
   * caller.
   */
  function reopenHistoryEntry(row: AdaptationHistoryRowV2) {
    const stub = materialStubFromHistory(row);
    if (!stub || !row.result_json) return;
    setMaterial(stub);
    setSelectedJudge(row.judge_type as JudgeType);
    setAdaptResult(row.result_json as JudgeAdaptationResult);
    setCompareResult(null);
    setReadinessReport(null);
    setError(null);
    setTab("adapt");
    setNotes(null);
    if (row.id && userId) {
      apiFetch<AdaptationNote[]>(`/judge-adaptation/notes/${row.id}?user_id=${userId}`)
        .then((rows) => setNotes(Array.isArray(rows) ? rows : []))
        .catch(() => setNotes([]));
    }
  }

  /** Selecting new material invalidates any previously generated output. */
  function handleSelectMaterial(m: SelectedMaterial) {
    setMaterial(m);
    setAdaptResult(null);
    setCompareResult(null);
    setReadinessReport(null);
    setNotes(null);
    setNoteErr(null);
    setError(null);
  }

  const readiness = deriveAdaptationReadiness(material, selectedJudge);

  async function runAdaptation() {
    if (readiness.state !== "ready" || !material || !selectedJudge || !userId) return;
    setError(null);
    setIsAdapting(true);
    try {
      const result = await apiFetch<JudgeAdaptationResult>("/judge-adaptation/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adaptationRequestBody(userId, selectedJudge, material)),
      });
      setAdaptResult(result);
      setNotes(null);
      if (result.id) {
        apiFetch<AdaptationNote[]>(`/judge-adaptation/notes/${result.id}?user_id=${userId}`)
          .then((rows) => setNotes(Array.isArray(rows) ? rows : []))
          .catch(() => setNotes([]));
      }
      apiFetch<AdaptationHistoryRowV2[]>(`/judge-adaptation/history?user_id=${userId}&limit=8`)
        .then((rows) => setHistory(Array.isArray(rows) ? rows : []))
        .catch(() => {});
    } catch {
      setError("Adaptation didn't generate. Your saved material is untouched — retry in a moment.");
    } finally {
      setIsAdapting(false);
    }
  }

  async function runComparison() {
    if (readiness.state !== "ready" || !material || !selectedJudge || !compareJudge || !userId) return;
    setError(null);
    setIsComparing(true);
    try {
      const base = adaptationRequestBody(userId, selectedJudge, material);
      const result = await apiFetch<JudgeComparisonResult>("/judge-adaptation/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: base.user_id,
          judge_types: [selectedJudge, compareJudge],
          source_type: base.source_type,
          source_id: base.source_id,
        }),
      });
      setCompareResult(result);
    } catch {
      setError("Comparison didn't generate. Retry in a moment.");
    } finally {
      setIsComparing(false);
    }
  }

  async function loadReadiness() {
    if (readiness.state !== "ready" || !material || !selectedJudge || !userId) return;
    try {
      const result = await apiFetch<JudgeReadinessReport>("/judge-adaptation/readiness-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adaptationRequestBody(userId, selectedJudge, material)),
      });
      setReadinessReport(result);
    } catch { /* keep prior state */ }
  }

  async function generateWorkout() {
    if (readiness.state !== "ready" || !material || !selectedJudge || !userId) return;
    try {
      const base = adaptationRequestBody(userId, selectedJudge, material);
      const params = new URLSearchParams({
        user_id: base.user_id,
        judge_type: base.judge_type,
        source_type: base.source_type,
        source_id: base.source_id,
      });
      // The endpoint returns an UNPERSISTED workout spec — shown as a
      // clearly-labeled preview, never merged into saved/assigned workouts.
      const workout = await apiFetch<JudgeWorkoutCreate>(
        `/judge-adaptation/workouts/generate?${params}`,
        { method: "POST" },
      );
      setPreviewWorkouts((prev) => [workout, ...prev]);
    } catch {}
  }

  /** Persist a generated preview for the student themselves — the backend
   *  endpoint always forces assigned_by === assigned_to === this user. */
  async function saveWorkout(workout: JudgeWorkoutCreate, index: number) {
    if (!userId || savingWorkoutIndex !== null) return;
    setSavingWorkoutIndex(index);
    try {
      const saved = await apiFetch<{ id: string; status: string }>("/judge-adaptation/workouts/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...workout, user_id: userId }),
      });
      setPreviewWorkouts((prev) => prev.filter((_, i) => i !== index));
      setWorkouts((prev) => [
        { ...workout, id: saved.id, assigned_by: userId, assigned_to: userId,
          status: "not_started" as const,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ...prev,
      ]);
    } catch {
      setSaveWorkoutErr("Couldn't save that workout. It's still available above as a preview.");
    } finally {
      setSavingWorkoutIndex(null);
    }
  }

  async function completeWorkout(id: string, notes: string) {
    try {
      const params = new URLSearchParams({ user_id: userId ?? "" });
      if (notes) params.set("student_notes", notes);
      await apiFetch(`/judge-adaptation/workouts/${id}/complete?${params}`, {
        method: "PATCH",
      });
      setWorkouts((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: "completed" as const } : w))
      );
    } catch {}
  }

  async function addNote(text: string) {
    if (!adaptResult?.id || !selectedJudge || !userId) return;
    setNoteSaving(true);
    setNoteErr(null);
    try {
      const saved = await apiFetch<AdaptationNote>("/judge-adaptation/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          adaptation_id: adaptResult.id,
          judge_type: selectedJudge,
          note_text: text,
        }),
      });
      setNotes((prev) => [...(prev ?? []), saved]);
    } catch {
      setNoteErr("Couldn't save that note. Please try again.");
    } finally {
      setNoteSaving(false);
    }
  }

  // No flash of protected content — show loading state while session resolves
  if (authLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 text-sm text-[var(--ink-subtle)]">
        Loading…
      </div>
    );
  }

  // Redirect in progress — render nothing
  if (!userId) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--ink-primary)]">Judge Adaptation</h1>
        <p className="text-sm text-[var(--ink-subtle)] mt-1">
          Adapt your arguments, evidence, and frontlines for different judge types without changing
          what the evidence says.
        </p>
      </div>

      <AdaptationProgressSummary trends={trends} loading={trendsLoading} error={trendsErr} />

      {/* Material selection — real saved materials, picked by title */}
      <section
        aria-label="Material to adapt"
        className="rounded-lg border border-[var(--surface-3)] bg-[var(--surface-2)] p-4 space-y-3"
      >
        <h2 className="text-xs font-medium text-[var(--ink-subtle)] uppercase tracking-wide">
          Material to adapt
        </h2>
        {material ? (
          <SelectedMaterialPreview material={material} onChange={() => setMaterial(null)} />
        ) : (
          <MaterialPicker userId={userId} onSelect={handleSelectMaterial} selectedId={null} />
        )}
      </section>

      {/* Judge selector */}
      <div className="rounded-lg border border-[var(--surface-3)] bg-[var(--surface-2)] p-4">
        <JudgeProfileSelector
          profiles={profiles}
          selected={selectedJudge}
          onSelect={setSelectedJudge}
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-[var(--surface-3)]">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                tab === t.id
                  ? "border-[var(--lavender-8)] text-[var(--lavender-8)]"
                  : "border-transparent text-[var(--ink-subtle)] hover:text-[var(--ink-primary)]",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Readiness guidance — truthful reason whenever generation is blocked */}
      {readiness.state !== "ready" && (
        <p role="status" className="text-xs text-[var(--ink-subtle)]">
          {readiness.state === "unsafe-material" ? (
            <span className="text-danger">{readiness.reason}</span>
          ) : (
            readiness.reason
          )}
        </p>
      )}

      {/* Tab content */}
      {tab === "adapt" && (
        <div className="space-y-4">
          <button
            onClick={runAdaptation}
            disabled={isAdapting || readiness.state !== "ready"}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--lavender-8)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isAdapting ? "Generating..." : "Generate Adaptation"}
          </button>

          {adaptResult && material && (
            <AdaptationResultView
              material={material}
              result={adaptResult}
              notes={notes}
              onAddNote={adaptResult.id ? addNote : null}
              noteSaving={noteSaving}
              noteError={noteErr}
              userId={userId}
              onAttemptScored={() => userId && loadTrends(userId)}
            />
          )}

          {/* Recent adaptations — real persisted history, reopenable when the
              stored result has enough data (canReopenHistoryEntry). */}
          {history !== null && history.length > 0 && (
            <section aria-label="Recent adaptations" className="rounded-lg border border-[var(--surface-3)] bg-[var(--surface-2)] p-4">
              <h3 className="text-xs font-medium text-[var(--ink-subtle)] uppercase tracking-wide">
                Recent adaptations
              </h3>
              <ul className="mt-2 space-y-1.5">
                {history.map((row) => {
                  const h = formatHistoryEntryV2(row);
                  const reopenable = canReopenHistoryEntry(row) && !!materialStubFromHistory(row);
                  return (
                    <li key={h.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--ink-subtle)]">
                      <span className="font-medium text-[var(--ink-primary)]">{h.materialKindLabel}</span>
                      <span>· {h.judgeLabel}</span>
                      <span>· {h.summary}</span>
                      <span className="text-[var(--ink-faint,#999)]">
                        · {new Date(h.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                      {reopenable ? (
                        <button
                          type="button"
                          onClick={() => reopenHistoryEntry(row)}
                          className="ml-auto rounded-md border border-[var(--surface-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--lavender-8)] hover:bg-[var(--surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lavender-8)]/50"
                        >
                          Reopen
                        </button>
                      ) : (
                        <span className="ml-auto text-[10px] text-[var(--ink-faint,#999)]">Not reopenable</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === "compare" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--surface-3)] bg-[var(--surface-2)] p-4">
            <p className="text-xs font-medium text-[var(--ink-subtle)] uppercase tracking-wide mb-3">
              Compare Against
            </p>
            <JudgeProfileSelector
              profiles={profiles}
              selected={compareJudge}
              onSelect={setCompareJudge}
            />
          </div>

          <button
            onClick={runComparison}
            disabled={isComparing || readiness.state !== "ready" || !compareJudge}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--lavender-8)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isComparing ? "Comparing..." : "Compare Judges"}
          </button>

          {!compareResult && !isComparing && (
            <p className="text-sm text-[var(--ink-subtle)]">
              Nothing generated yet. Pick a material and two judges, then compare —
              you&rsquo;ll see how the same truthful material lands differently for each.
            </p>
          )}
          <JudgeComparisonPanel result={compareResult} isLoading={isComparing} />
        </div>
      )}

      {tab === "workouts" && (
        <div className="space-y-4">
          <button
            onClick={generateWorkout}
            disabled={readiness.state !== "ready"}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--lavender-8)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Generate Workout
          </button>

          {saveWorkoutErr && (
            <p role="alert" className="text-xs text-red-700">{saveWorkoutErr}</p>
          )}

          {previewWorkouts.length > 0 && (
            <section aria-label="Generated workout previews" className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-subtle)]">
                {WORKOUT_PERSISTENCE_LABELS["preview-only"]} — save it to keep it after you leave
              </p>
              {previewWorkouts.map((w, i) => (
                <div key={`${w.title}-${i}`} className="rounded-lg border border-[var(--surface-3)] bg-[var(--surface-2)] p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--ink-primary)]">{w.title}</p>
                    <button
                      onClick={() => saveWorkout(w, i)}
                      disabled={savingWorkoutIndex !== null}
                      className="shrink-0 rounded-md border border-[var(--surface-3)] px-2 py-1 text-[11px] font-medium text-[var(--lavender-8)] hover:bg-[var(--surface-1)] disabled:opacity-50"
                    >
                      {savingWorkoutIndex === i ? "Saving…" : "Save for me"}
                    </button>
                  </div>
                  {w.description && <p className="text-xs text-[var(--ink-subtle)]">{w.description}</p>}
                  <p className="text-xs text-[var(--ink-primary)]">{w.prompt}</p>
                  {w.instructions && <p className="text-[11px] text-[var(--ink-subtle)]">{w.instructions}</p>}
                  {w.success_criteria.length > 0 && (
                    <ul className="space-y-0.5">
                      {w.success_criteria.map((c, j) => (
                        <li key={j} className="text-[11px] text-[var(--ink-subtle)]">✓ {c}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[10px] text-[var(--ink-subtle)]">
                    ~{Math.round(w.time_limit_seconds / 60)} min · {WORKOUT_PERSISTENCE_LABELS["preview-only"].toLowerCase()}
                  </p>
                </div>
              ))}
            </section>
          )}

          {workouts.length === 0 && previewWorkouts.length === 0 ? (
            <div className="text-center py-8 text-[var(--ink-subtle)]">
              <p className="text-sm">No workouts yet. Generate one above or check back after a coach assigns one.</p>
            </div>
          ) : workouts.length > 0 ? (
            <section aria-label="Assigned workouts" className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-subtle)]">
                Assigned workouts
              </p>
              {workouts.map((w) => (
                <div key={w.id} className="space-y-1">
                  <p className="text-[10px] font-medium text-[var(--ink-subtle)]">
                    {WORKOUT_PERSISTENCE_LABELS[describeWorkoutPersistence(w, userId)]}
                  </p>
                  <JudgeWorkoutCard workout={w} onComplete={completeWorkout} />
                </div>
              ))}
            </section>
          ) : null}
        </div>
      )}

      {tab === "readiness" && (
        <div className="space-y-4">
          <button
            onClick={loadReadiness}
            disabled={readiness.state !== "ready"}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--lavender-8)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            Compute Readiness
          </button>

          {readinessReport ? (
            <JudgeReadinessCard report={readinessReport} />
          ) : (
            <div className="text-center py-8 text-[var(--ink-subtle)]">
              <p className="text-sm">
                Judge readiness is a separate score from evidence quality and freshness.
                Pick a saved material and a judge type, then click Compute Readiness.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function JudgeAdaptationPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-4 py-8 text-sm text-[var(--ink-subtle)]">Loading…</div>}>
      <JudgeAdaptationContent />
    </Suspense>
  );
}
