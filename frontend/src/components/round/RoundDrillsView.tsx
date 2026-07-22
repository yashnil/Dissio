"use client";

import { useId, useState } from "react";
import * as roundApi from "@/lib/roundApi";
import { ApiError } from "@/lib/api";
import { hasDrillAttemptScore, hasDrillAttemptCredit, isValidDrillAttempt } from "@/lib/roundModel";
import type { RoundDrill, RoundDrillAttempt, RoundDrillAttemptResult } from "@/types/round";

interface Props {
  roundId: string;
  drills: RoundDrill[];
  onGenerateDrills: () => void;
  isLoading: boolean;
}

const SKILL_COLORS: Record<string, string> = {
  drops: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  clash: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  extensions: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  evidence: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  weighing: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  judge_adaptation: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  pacing_control: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
};

function AttemptFeedback({ attempt }: { attempt: RoundDrillAttempt }) {
  if (!hasDrillAttemptScore(attempt) || !attempt.feedback) {
    return (
      <p className="text-xs text-muted-foreground">
        Saved. Automatic feedback wasn&#39;t available for this attempt — your response is still recorded.
      </p>
    );
  }
  const fb = attempt.feedback;
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">Score: {attempt.score}/100</span>
        <span className="text-xs text-muted-foreground">
          {fb.met_success_criteria ? "Criteria met" : "Criteria not fully met"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{fb.feedback_summary}</p>
      {fb.strengths.length > 0 && (
        <ul className="space-y-0.5">
          {fb.strengths.map((s, i) => (
            <li key={i} className="text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0">+</span>
              {s}
            </li>
          ))}
        </ul>
      )}
      {fb.improvements.length > 0 && (
        <ul className="space-y-0.5">
          {fb.improvements.map((s, i) => (
            <li key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0">→</span>
              {s}
            </li>
          ))}
        </ul>
      )}
      {fb.next_instruction && (
        <p className="text-xs font-medium">{fb.next_instruction}</p>
      )}
    </div>
  );
}

function AttemptHistoryEntry({ attempt }: { attempt: RoundDrillAttempt }) {
  return (
    <div className="rounded-md border px-3 py-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {new Date(attempt.created_at).toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
          })}
        </span>
        {hasDrillAttemptScore(attempt) && (
          <span className="text-xs font-medium">{attempt.score}/100</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{attempt.response_text}</p>
    </div>
  );
}

function DrillCard({ roundId, drill }: { roundId: string; drill: RoundDrill }) {
  const colorClass = SKILL_COLORS[drill.skill_target] ?? "bg-muted text-muted-foreground";
  const minutes = Math.floor(drill.time_limit_seconds / 60);
  const secs = drill.time_limit_seconds % 60;
  const timeLabel = minutes > 0 ? `${minutes}:${String(secs).padStart(2, "0")}` : `${secs}s`;
  const textareaId = useId();

  const [expanded, setExpanded] = useState(false);
  const [attemptText, setAttemptText] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RoundDrillAttemptResult | null>(null);

  const [attempts, setAttempts] = useState<RoundDrillAttempt[] | null>(null);
  const [attemptsLoadState, setAttemptsLoadState] = useState<"idle" | "loading" | "error">("idle");

  async function loadAttempts() {
    setAttemptsLoadState("loading");
    try {
      const result = await roundApi.getRoundDrillAttempts(roundId, drill.id);
      setAttempts(result);
      setAttemptsLoadState("idle");
    } catch {
      setAttemptsLoadState("error");
    }
  }

  function handleTogglePractice() {
    const next = !expanded;
    setExpanded(next);
    if (next && attempts === null) {
      loadAttempts();
    }
  }

  async function handleSubmitAttempt() {
    if (!isValidDrillAttempt(attemptText)) {
      setSubmitError("Please write or paste a response before submitting.");
      return;
    }
    setSubmitState("submitting");
    setSubmitError(null);
    try {
      const result = await roundApi.submitRoundDrillAttempt(roundId, drill.id, attemptText.trim());
      setLastResult(result);
      setAttempts((prev) => (prev ? [result.attempt, ...prev] : [result.attempt]));
      setAttemptText("");
      setSubmitState("idle");
    } catch (e) {
      setSubmitState("error");
      setSubmitError(
        e instanceof ApiError
          ? e.message
          : "Couldn't save your attempt. Your draft is still here — try again.",
      );
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-tight">{drill.title}</h3>
        <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
          {drill.skill_target.replace(/_/g, " ")}
        </span>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{drill.prompt}</p>

      {drill.source.weakness_description && (
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <p className="text-xs text-muted-foreground italic">&ldquo;{drill.source.weakness_description}&rdquo;</p>
        </div>
      )}

      {drill.source.argument_label && (
        <p className="text-xs text-muted-foreground">
          Related argument: {drill.source.argument_label}
        </p>
      )}

      <div className="space-y-1">
        <p className="text-xs font-medium">Success criteria:</p>
        <ul className="space-y-0.5">
          {drill.success_criteria.map((c, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="mt-0.5 text-primary shrink-0">·</span>
              {c}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">Time limit: {timeLabel}</span>
        <button
          type="button"
          onClick={handleTogglePractice}
          aria-expanded={expanded}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          {expanded ? "Close" : "Practice"}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 pt-2 border-t">
          <label htmlFor={textareaId} className="text-xs font-medium block pt-2">
            Write or paste your response
          </label>
          <textarea
            id={textareaId}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Type your redo, speech snippet, or answer..."
            value={attemptText}
            onChange={(e) => setAttemptText(e.target.value)}
            disabled={submitState === "submitting"}
          />
          {submitError && (
            <p role="alert" className="text-xs text-red-600">
              {submitError}
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmitAttempt}
            disabled={submitState === "submitting" || !attemptText.trim()}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitState === "submitting" ? "Saving..." : "Submit Attempt"}
          </button>

          {lastResult && (
            <div className="space-y-1">
              <p role="status" className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Attempt saved.
              </p>
              {hasDrillAttemptCredit(lastResult) && (
                <p className="text-xs text-muted-foreground">
                  {[
                    lastResult.xp_awarded > 0 ? `+${lastResult.xp_awarded} XP` : null,
                    lastResult.mastery_emitted ? "Counted toward skill mastery." : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <AttemptFeedback attempt={lastResult.attempt} />
            </div>
          )}

          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Attempt history
            </p>
            {attemptsLoadState === "loading" && (
              <p className="text-xs text-muted-foreground">Loading past attempts…</p>
            )}
            {attemptsLoadState === "error" && (
              <p className="text-xs text-red-600">Couldn&#39;t load past attempts.</p>
            )}
            {attemptsLoadState === "idle" && attempts !== null && attempts.length === 0 && (
              <p className="text-xs text-muted-foreground">No attempts yet.</p>
            )}
            {attemptsLoadState === "idle" && attempts !== null && attempts.length > 0 && (
              <div className="space-y-1.5">
                {attempts.map((a) => (
                  <AttemptHistoryEntry key={a.id} attempt={a} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RoundDrillsView({ roundId, drills, onGenerateDrills, isLoading }: Props) {
  if (drills.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Generate targeted drills from this round&#39;s failures and dropped arguments.
        </p>
        <button
          onClick={onGenerateDrills}
          disabled={isLoading}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50 transition-opacity"
        >
          {isLoading ? "Generating drills..." : "Generate Post-Round Drills"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Post-Round Drills ({drills.length})</h2>
        <button
          onClick={onGenerateDrills}
          disabled={isLoading}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors"
        >
          {isLoading ? "Regenerating..." : "Regenerate"}
        </button>
      </div>
      <div className="grid gap-4">
        {drills.map((d) => <DrillCard key={d.id} roundId={roundId} drill={d} />)}
      </div>
    </div>
  );
}
