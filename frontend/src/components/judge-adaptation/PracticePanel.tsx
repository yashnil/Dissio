"use client";

/**
 * PracticePanel (Phase 7D) — real scored practice loop.
 *
 * Only renders after a REAL adaptation result. Student pastes a delivery
 * attempt, submits it to POST /judge-adaptation/score-attempt, and sees
 * real deterministic v1 heuristic feedback: overall fit, a 7-dimension
 * breakdown (each with its own explanation), what improved, what still
 * needs work, evidence-integrity warnings, and a retry suggestion. Scoring
 * requires a persisted adaptation (canScorePracticeAttempt) — when that
 * isn't true, or the request fails, the UI says so plainly instead of
 * faking a score or a saved attempt.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic, TrendingUp, TriangleAlert } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  derivePracticeSuccessCriteria,
  derivePracticePanelState,
  validatePracticeAttempt,
  canScorePracticeAttempt,
  scoringUnavailableReason,
  materialSourceType,
  describeAttemptDimension,
  attemptScoreTone,
  normalizeAttemptScoreResponse,
  attemptRetrySuggestionOrFallback,
  describeAttemptSaveState,
  formatAttemptHistoryEntry,
  sortAttemptsByRecency,
  deriveWithinAdaptationImprovement,
  formatScoreDelta,
  scoreDeltaTone,
  PRACTICE_ATTEMPT_MIN_LENGTH,
  type AttemptFeedbackView,
  type AttemptRow,
  type AttemptScoreDimension,
  type AttemptScoreResponse,
  type AttemptScoreTone,
  type SelectedMaterial,
} from "@/lib/judgeAdaptationModel";
import { JUDGE_TYPE_LABELS, type JudgeAdaptationResult, type JudgeType } from "@/types/judgeAdaptation";

const TONE_TEXT: Record<AttemptScoreTone | "neutral", string> = {
  green: "text-ok",
  amber: "text-warn",
  red: "text-danger",
  neutral: "text-ink-subtle",
};
const TONE_LABEL: Record<AttemptScoreTone, string> = {
  green: "Strong fit",
  amber: "Developing fit",
  red: "Needs work",
};

function DimensionBreakdown({ dimensions }: { dimensions: AttemptScoreDimension[] }) {
  if (dimensions.length === 0) {
    return <p className="text-xs text-ink-faint">No dimension breakdown was returned for this score.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {dimensions.map((d) => {
        const tone = attemptScoreTone(d.score);
        return (
          <li key={d.dimension} className="rounded-md border border-hairline bg-surface-1 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink">{describeAttemptDimension(d.dimension)}</span>
              <span className={`text-xs font-semibold ${TONE_TEXT[tone]}`}>{d.score}/100</span>
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{d.explanation}</p>
          </li>
        );
      })}
    </ul>
  );
}

function AttemptFeedbackCard({ feedback }: { feedback: AttemptFeedbackView }) {
  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg border border-lav/25 bg-lav/5 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-lav-hi">v1 practice feedback</p>
        <span className={`text-sm font-semibold ${TONE_TEXT[feedback.overallTone]}`}>
          {feedback.overallFit}/100 — {TONE_LABEL[feedback.overallTone]}
        </span>
      </div>

      <DimensionBreakdown dimensions={feedback.dimensions} />

      {feedback.whatImproved.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ok">What improved</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {feedback.whatImproved.map((s, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-ink-subtle">{s}</li>
            ))}
          </ul>
        </div>
      )}

      {feedback.whatStillNeedsWork.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-warn">Still needs work</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {feedback.whatStillNeedsWork.map((s, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-ink-subtle">{s}</li>
            ))}
          </ul>
        </div>
      )}

      {feedback.integrityWarnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {feedback.integrityWarnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-danger">
              <TriangleAlert size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
              {w}
            </p>
          ))}
        </div>
      )}

      <div className="rounded-md border border-hairline bg-surface-1 px-2.5 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Next retry</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-subtle">
          {attemptRetrySuggestionOrFallback(feedback)}
        </p>
      </div>

      <p className="text-[11px] text-ink-faint">{describeAttemptSaveState(feedback.saved)}</p>
    </div>
  );
}

/**
 * Compact within-adaptation improvement view (Phase 7E). Never claims a
 * trend from a single attempt — with 0 attempts it renders nothing (the
 * history section below already covers that empty state); with exactly 1
 * it shows the one real score plus honest "complete another attempt" copy;
 * only 2+ attempts show a real first→latest delta.
 */
function ImprovementSummary({ history }: { history: AttemptRow[] }) {
  if (history.length === 0) return null;
  const imp = deriveWithinAdaptationImprovement(history);
  const deltaTone = scoreDeltaTone(imp.delta);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-2/40 px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        <TrendingUp size={13} className="text-lav" aria-hidden="true" />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          Improvement on this adaptation
        </p>
      </div>

      {!imp.hasTrendData ? (
        <p className="text-xs leading-relaxed text-ink-subtle">
          {imp.latestScore !== null && `Your only attempt scored ${imp.latestScore}/100. `}
          Complete another attempt to see improvement.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <p className="text-[10px] text-ink-faint">First</p>
              <p className="text-sm font-semibold text-ink">{imp.firstScore ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-ink-faint">Latest</p>
              <p className="text-sm font-semibold text-ink">{imp.latestScore ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-ink-faint">Best</p>
              <p className="text-sm font-semibold text-ink">{imp.bestScore ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-ink-faint">Change</p>
              <p className={`text-sm font-semibold ${TONE_TEXT[deltaTone]}`}>
                {formatScoreDelta(imp.delta)}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-ink-faint">
            {imp.attemptCount} attempts on this adaptation
            {imp.weakestCurrentDimension && ` · Current weak point — ${imp.weakestCurrentDimension}`}
          </p>
        </>
      )}
    </div>
  );
}

function AttemptHistorySection({ history }: { history: AttemptRow[] | null }) {
  if (history === null) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-xs text-ink-subtle">
        <Loader2 size={11} className="motion-safe:animate-spin" aria-hidden="true" /> Loading previous attempts…
      </p>
    );
  }
  const sorted = sortAttemptsByRecency(history);
  const bestScore = sorted.reduce<number | null>(
    (best, r) => (r.overall_fit != null && (best === null || r.overall_fit > best) ? r.overall_fit : best),
    null,
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        Previous attempts {history.length > 0 && `(${history.length})`}
      </p>
      {history.length === 0 ? (
        <p className="text-xs text-ink-faint">No practice attempts yet for this adaptation.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sorted.map((row, i) => {
            const h = formatAttemptHistoryEntry(row);
            const dims = Array.isArray((row.score_json as { dimensions?: unknown })?.dimensions)
              ? ((row.score_json as { dimensions: AttemptScoreDimension[] }).dimensions)
              : [];
            // Older attempt is the next entry in this newest-first list.
            const prev = sorted[i + 1];
            const delta = row.overall_fit != null && prev?.overall_fit != null
              ? row.overall_fit - prev.overall_fit
              : null;
            const isBest = bestScore !== null && row.overall_fit === bestScore;
            const isLatest = i === 0;
            return (
              <li key={h.id}>
                <details className="rounded-md border border-hairline bg-surface-1" open={isLatest}>
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 [&::-webkit-details-marker]:hidden">
                    <span className="text-ink-faint">{h.dateLabel}</span>
                    {h.overallFit != null && (
                      <span className={`font-semibold ${TONE_TEXT[h.tone]}`}>{h.overallFit}/100</span>
                    )}
                    {delta !== null && (
                      <span className={`text-[10px] font-medium ${TONE_TEXT[scoreDeltaTone(delta)]}`}>
                        {formatScoreDelta(delta)} vs previous
                      </span>
                    )}
                    {isLatest && (
                      <span className="rounded-full border border-lav/30 bg-lav/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-lav">
                        Latest
                      </span>
                    )}
                    {isBest && (
                      <span className="rounded-full border border-ok/30 bg-ok/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-ok">
                        Best
                      </span>
                    )}
                    {h.keyWeakness && (
                      <span className="min-w-0 flex-1 truncate text-ink-faint">{h.keyWeakness}</span>
                    )}
                  </summary>
                  <div className="flex flex-col gap-2 border-t border-hairline px-2.5 py-2">
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-subtle">{row.attempt_text}</p>
                    {dims.length > 0 && <DimensionBreakdown dimensions={dims} />}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type SubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "scored"; feedback: AttemptFeedbackView }
  | { status: "error"; message: string };

export function PracticePanel({
  material, result, judgeType, userId, onAttemptScored,
}: {
  material: SelectedMaterial;
  result: JudgeAdaptationResult;
  judgeType: JudgeType;
  userId: string | null;
  /** Called after a successful score so entry-level progress can refresh. */
  onAttemptScored?: () => void;
}) {
  const criteria = derivePracticeSuccessCriteria(result);
  const [attemptText, setAttemptText] = useState("");
  const [submission, setSubmission] = useState<SubmissionState>({ status: "idle" });
  const [history, setHistory] = useState<AttemptRow[] | null>(null);
  const validation = validatePracticeAttempt(attemptText);
  const panelState = derivePracticePanelState(material, result);
  // Unsupported/contradicted evidence is blocked client-side (before any
  // network call) AND server-side (score-attempt re-checks the card's saved
  // verdict) — adapting delivery can never make bad evidence safe.
  const scorable = canScorePracticeAttempt(result) && panelState.state === "ready";

  // Load attempt history for this adaptation whenever it changes (fresh
  // generation or a reopened history entry).
  const adaptationId = result.id ?? null;
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!scorable || !userId || !adaptationId || loadedFor.current === adaptationId) return;
    loadedFor.current = adaptationId;
    setHistory(null);
    const t = setTimeout(() => {
      apiFetch<AttemptRow[]>(`/judge-adaptation/adaptations/${adaptationId}/attempts?user_id=${userId}`)
        .then((rows) => setHistory(Array.isArray(rows) ? rows : []))
        .catch(() => setHistory([]));
    }, 0);
    return () => clearTimeout(t);
  }, [scorable, userId, adaptationId]);

  async function submitAttempt() {
    if (!validation.valid || !userId || !adaptationId || submission.status === "submitting") return;
    setSubmission({ status: "submitting" });
    try {
      const response = await apiFetch<AttemptScoreResponse>("/judge-adaptation/score-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          adaptation_id: adaptationId,
          judge_type: judgeType,
          source_type: materialSourceType(material.kind),
          source_id: material.id,
          attempt_text: attemptText.trim(),
        }),
      });
      const feedback = normalizeAttemptScoreResponse(response);
      setSubmission({ status: "scored", feedback });
      // Refresh this adaptation's history so the new attempt appears
      // immediately, and let the entry-level progress summary refresh too.
      apiFetch<AttemptRow[]>(`/judge-adaptation/adaptations/${adaptationId}/attempts?user_id=${userId}`)
        .then((rows) => setHistory(Array.isArray(rows) ? rows : []))
        .catch(() => {});
      onAttemptScored?.();
    } catch (e: unknown) {
      // Never fake a score or a saved attempt on failure.
      const message = e instanceof Error && e.message ? e.message : "Couldn't score that attempt. Please try again.";
      setSubmission({ status: "error", message });
    }
  }

  function tryAgain() {
    setSubmission({ status: "idle" });
    setAttemptText("");
  }

  return (
    <section aria-label="Practice this adaptation" className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-1 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Mic size={14} className="text-lav" aria-hidden="true" />
        <h3 className="text-heading text-ink">Practice this adaptation</h3>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
        <span>Judge: <span className="font-medium text-ink">{JUDGE_TYPE_LABELS[judgeType]}</span></span>
        <span>Material: <span className="font-medium text-ink">{material.title}</span></span>
      </div>

      {result.judge_goal && (
        <p className="text-sm leading-relaxed text-ink-subtle">
          Delivery goal: <span className="text-ink">{result.judge_goal}</span>
        </p>
      )}

      {criteria.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            What success looks like
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-subtle">
                <Check size={11} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {panelState.state === "unsafe-material" && (
        <p role="status" className="flex items-start gap-1.5 text-xs leading-relaxed text-danger">
          <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
          {panelState.reason}
        </p>
      )}

      {panelState.state === "ready" && !canScorePracticeAttempt(result) && (
        <p role="status" className="text-xs leading-relaxed text-ink-faint">{scoringUnavailableReason()}</p>
      )}

      {/* Context before the next attempt — shown only outside the
          fresh-feedback view, which already has its own "Try again"
          action, so there's never two competing retry buttons. */}
      {scorable && submission.status !== "scored" && history !== null && (
        <ImprovementSummary history={history} />
      )}

      {scorable && submission.status !== "scored" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => { e.preventDefault(); void submitAttempt(); }}
        >
          <label htmlFor="practice-attempt" className="text-xs font-medium text-ink">
            Paste or type how you&rsquo;d actually deliver this
          </label>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Write it the way you&rsquo;d say it out loud for this judge. Keep any quoted
            evidence, statistics, or citations exactly as saved — only your delivery,
            framing, and wording change here.
          </p>
          <textarea
            id="practice-attempt"
            value={attemptText}
            onChange={(e) => setAttemptText(e.target.value)}
            rows={5}
            disabled={submission.status === "submitting"}
            placeholder="e.g. One in five tons of carbon — gone. That's what this policy does…"
            className="w-full resize-y rounded-lg border border-hairline bg-surface-2/50 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-faint">
              {attemptText.trim().length}/{PRACTICE_ATTEMPT_MIN_LENGTH}+ characters
            </p>
            <button
              type="submit"
              disabled={!validation.valid || submission.status === "submitting"}
              className="flex items-center gap-1.5 rounded-lg bg-lav px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submission.status === "submitting" && (
                <Loader2 size={12} className="motion-safe:animate-spin" aria-hidden="true" />
              )}
              {submission.status === "submitting" ? "Scoring…" : "Submit practice attempt"}
            </button>
          </div>
          {!validation.valid && attemptText.length > 0 && (
            <p className="text-[11px] text-ink-faint">{validation.reason}</p>
          )}
          {submission.status === "error" && (
            <p role="alert" className="text-[11px] text-danger">{submission.message}</p>
          )}
        </form>
      )}

      {submission.status === "scored" && (
        <div className="flex flex-col gap-2.5">
          <div className="rounded-lg border border-hairline bg-surface-2/50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Your attempt</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{attemptText}</p>
          </div>

          <AttemptFeedbackCard feedback={submission.feedback} />

          <button
            type="button"
            onClick={tryAgain}
            className="w-fit rounded-lg border border-hairline bg-surface-1 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
          >
            Try again
          </button>
        </div>
      )}

      {scorable && <AttemptHistorySection history={history} />}
    </section>
  );
}
