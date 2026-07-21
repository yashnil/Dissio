"use client";

import { useEffect, useId, useRef, useState } from "react";
import * as roundApi from "@/lib/roundApi";
import { ApiError } from "@/lib/api";
import {
  PHASE_LABELS,
  findAnsweredCrossfireExchanges,
  findPendingCrossfireExchange,
  hasCrossfireDiagnostics,
  isValidCrossfireAnswer,
  opponentSide,
  sideLabel,
} from "@/lib/roundModel";
import type { CrossfireExchange, RoundPhaseType, RoundSide } from "@/types/round";

interface Props {
  roundId: string;
  phase: RoundPhaseType;
  studentSide: RoundSide;
  /** Exchanges for the current crossfire phase only (from round state). */
  exchanges: CrossfireExchange[];
  /** Called with a freshly generated or updated exchange to merge into round state. */
  onExchangeSaved: (exchange: CrossfireExchange) => void;
  onAdvancePhase: () => void;
  isLoading: boolean;
}

function ExchangeDiagnostics({ exchange }: { exchange: CrossfireExchange }) {
  if (!hasCrossfireDiagnostics(exchange)) return null;
  return (
    <div className="space-y-1.5">
      {exchange.concession_extracted && (
        <p className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
          <span className="font-semibold">Concession noted — </span>
          {exchange.concession_extracted}
        </p>
      )}
      {exchange.contradiction && (
        <p className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <span className="font-semibold">Contradiction flagged — </span>
          {exchange.contradiction}
        </p>
      )}
      {exchange.evasion_detected && !exchange.concession_extracted && !exchange.contradiction && (
        <p className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
          <span className="font-semibold">Possible evasion — </span>
          This answer may not have directly addressed the question.
        </p>
      )}
    </div>
  );
}

export function CrossfireCapture({
  roundId,
  phase,
  studentSide,
  exchanges,
  onExchangeSaved,
  onAdvancePhase,
  isLoading,
}: Props) {
  const askerSide = opponentSide(studentSide);
  const askerLabel = `AI Opponent (${sideLabel(askerSide)})`;
  const answererLabel = `You (${sideLabel(studentSide)})`;
  const phaseLabel = PHASE_LABELS[phase] ?? phase;

  const pending = findPendingCrossfireExchange(exchanges);
  const answered = findAnsweredCrossfireExchanges(exchanges);

  const [questionState, setQuestionState] = useState<"idle" | "loading" | "error">("idle");
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const fetchInFlightRef = useRef(false);
  const attemptedKeyRef = useRef<string | null>(null);
  const textareaId = useId();

  async function fetchQuestion() {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    setQuestionState("loading");
    setQuestionError(null);
    try {
      const exchange = await roundApi.getCrossfireQuestion(roundId);
      onExchangeSaved(exchange);
      setQuestionState("idle");
      setAnnouncement("Crossfire question ready.");
    } catch (e) {
      setQuestionState("error");
      setQuestionError(
        e instanceof ApiError ? e.message : "Couldn't generate a crossfire question.",
      );
    } finally {
      fetchInFlightRef.current = false;
    }
  }

  // Auto-fetch the opening question for this phase exactly once, only when
  // round state shows nothing pending or answered yet for it. If a question
  // is already persisted (fresh mount, refresh, remount), this never fires.
  useEffect(() => {
    const key = `${roundId}:${phase}`;
    if (exchanges.length > 0) {
      attemptedKeyRef.current = key;
      return;
    }
    if (attemptedKeyRef.current === key) return;
    attemptedKeyRef.current = key;
    fetchQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, phase, exchanges.length]);

  async function handleSubmitAnswer() {
    if (!pending) return;
    if (!isValidCrossfireAnswer(answerText)) {
      setSubmitError("Please enter an answer before submitting.");
      return;
    }
    setSubmitState("submitting");
    setSubmitError(null);
    try {
      const updated = await roundApi.submitCrossfireAnswer(roundId, phase, answerText.trim());
      onExchangeSaved(updated);
      setAnswerText("");
      setSubmitState("idle");
      setAnnouncement("Answer submitted.");
    } catch (e) {
      setSubmitState("error");
      setSubmitError(
        e instanceof ApiError
          ? e.message
          : "Couldn't submit your answer. Your draft is still here — try again.",
      );
    }
  }

  const busy = isLoading || submitState === "submitting";

  return (
    <section aria-label={`${phaseLabel} crossfire`} className="space-y-4">
      <div className="rounded-lg border bg-sky-50 dark:bg-sky-950/20 p-4">
        <h2 className="text-sm font-medium">{phaseLabel}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {askerLabel} asks — {answererLabel} answer. Turn-based: read the question, type your
          answer, then submit.
        </p>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* Prior exchanges this phase — clearly labeled question vs answer */}
      {answered.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Crossfire so far
          </h3>
          {answered.map((ex) => (
            <div key={ex.id} className="rounded-md border px-3 py-2.5 space-y-2 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {askerLabel} asked
                </p>
                <p className="mt-0.5">{ex.question}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {answererLabel} answered
                </p>
                <p className="mt-0.5">{ex.answer}</p>
              </div>
              <ExchangeDiagnostics exchange={ex} />
            </div>
          ))}
        </div>
      )}

      {/* Loading state — small, not a full skeleton */}
      {questionState === "loading" && (
        <p role="status" className="text-xs text-muted-foreground">
          Generating crossfire question…
        </p>
      )}

      {/* Error / retry */}
      {questionState === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20 px-3 py-2 space-y-2">
          <p role="alert" className="text-xs text-red-700 dark:text-red-400">
            {questionError}
          </p>
          <button
            type="button"
            onClick={() => fetchQuestion()}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Pending question + answer form */}
      {pending && (
        <div className="space-y-3">
          <div className="rounded-md border px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {askerLabel} asks
            </p>
            <p className="text-sm mt-1">{pending.question}</p>
            {pending.target_argument && pending.target_argument !== "general" && (
              <p className="text-xs text-muted-foreground mt-1">
                Targeting argument {pending.target_argument}
              </p>
            )}
          </div>

          <label htmlFor={textareaId} className="text-xs font-medium block">
            {answererLabel} respond
          </label>
          <textarea
            id={textareaId}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Type your answer..."
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            disabled={submitState === "submitting"}
          />
          {submitError && (
            <p role="alert" className="text-xs text-red-600">
              {submitError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmitAnswer}
              disabled={busy || !answerText.trim()}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitState === "submitting" ? "Submitting..." : "Submit Answer"}
            </button>
            <button
              type="button"
              onClick={onAdvancePhase}
              disabled={busy}
              className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Advance Phase
            </button>
          </div>
        </div>
      )}

      {/* No pending question and nothing loading/erroring — offer another round, or move on */}
      {!pending && questionState === "idle" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fetchQuestion()}
            disabled={busy}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {answered.length > 0 ? "Ask Another Question" : "Get Crossfire Question"}
          </button>
          <button
            type="button"
            onClick={onAdvancePhase}
            disabled={busy}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Advance Phase
          </button>
        </div>
      )}
    </section>
  );
}
