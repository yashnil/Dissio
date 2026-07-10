"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdaptationChangesPanel } from "@/components/judge-adaptation/AdaptationChangesPanel";
import { JudgeComparisonPanel } from "@/components/judge-adaptation/JudgeComparisonPanel";
import { JudgeProfileSelector } from "@/components/judge-adaptation/JudgeProfileSelector";
import { JudgeReadinessCard } from "@/components/judge-adaptation/JudgeReadinessCard";
import { JudgeWorkoutCard } from "@/components/judge-adaptation/JudgeWorkoutCard";
import { createClient } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { MaterialPicker, SelectedMaterialPreview } from "@/components/judge-adaptation/MaterialPicker";
import {
  adaptationRequestBody,
  deriveAdaptationReadiness,
  type SelectedMaterial,
} from "@/lib/judgeAdaptationModel";
import type {
  JudgeAdaptationResult,
  JudgeComparisonResult,
  JudgeProfile,
  JudgeReadinessReport,
  JudgeType,
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

  /** Selecting new material invalidates any previously generated output. */
  function handleSelectMaterial(m: SelectedMaterial) {
    setMaterial(m);
    setAdaptResult(null);
    setCompareResult(null);
    setReadinessReport(null);
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
      const workout = await apiFetch<JudgeWorkoutRow>(
        `/judge-adaptation/workouts/generate?${params}`,
        { method: "POST" },
      );
      setWorkouts((prev) => [{ ...workout, id: Date.now().toString(), status: "not_started", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev]);
    } catch {}
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

          {adaptResult && (
            <div className="space-y-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-subtle)]">
                Coaching & delivery advice — your evidence text is unchanged
              </p>
              <div className="rounded-lg border border-[var(--surface-3)] bg-[var(--surface-2)] p-4">
                <p className="text-xs font-medium text-[var(--ink-subtle)] mb-1">Judge Goal</p>
                <p className="text-sm text-[var(--ink-primary)]">{adaptResult.judge_goal}</p>
              </div>

              {adaptResult.what_to_emphasize.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4">
                  <p className="text-xs font-medium text-emerald-700 mb-2 uppercase tracking-wide">
                    Emphasize
                  </p>
                  <ul className="space-y-1">
                    {adaptResult.what_to_emphasize.map((e, i) => (
                      <li key={i} className="text-xs text-emerald-800 flex items-start gap-2">
                        <span className="shrink-0">↑</span> {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {adaptResult.what_to_simplify.length > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50/30 p-4">
                  <p className="text-xs font-medium text-yellow-700 mb-2 uppercase tracking-wide">
                    Simplify
                  </p>
                  <ul className="space-y-1">
                    {adaptResult.what_to_simplify.map((e, i) => (
                      <li key={i} className="text-xs text-yellow-800 flex items-start gap-2">
                        <span className="shrink-0">↓</span> {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {adaptResult.what_must_remain_explicit.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/30 p-4">
                  <p className="text-xs font-medium text-slate-700 mb-2 uppercase tracking-wide">
                    Never Change
                  </p>
                  <ul className="space-y-1">
                    {adaptResult.what_must_remain_explicit.map((e, i) => (
                      <li key={i} className="text-xs text-slate-700 flex items-start gap-2">
                        <span className="shrink-0 text-red-500">✕</span> {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <AdaptationChangesPanel
                changes={adaptResult.changes}
                risks={adaptResult.risks}
              />
            </div>
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

          {workouts.length === 0 ? (
            <div className="text-center py-8 text-[var(--ink-subtle)]">
              <p className="text-sm">No workouts yet. Generate one above or check back after a coach assigns one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workouts.map((w) => (
                <JudgeWorkoutCard key={w.id} workout={w} onComplete={completeWorkout} />
              ))}
            </div>
          )}
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
