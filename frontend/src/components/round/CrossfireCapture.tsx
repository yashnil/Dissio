"use client";

import { useEffect, useId, useRef, useState } from "react";
import * as roundApi from "@/lib/roundApi";
import { ApiError } from "@/lib/api";
import {
  CROSSFIRE_EFFECT_LABELS,
  PHASE_LABELS,
  aiAsksExchanges,
  canRequestCrossfireFollowUp,
  crossfireEffectForExchange,
  crossfireEffectTone,
  crossfireExchangeArtifacts,
  crossfireFollowUpReason,
  findAnsweredCrossfireExchanges,
  findPendingCrossfireExchange,
  groupCrossfireExchangesWithFollowUps,
  hasCrossfireDiagnostics,
  isCrossfireFollowUp,
  isValidCrossfireAnswer,
  isValidCrossfireQuestion,
  opponentSide,
  sideLabel,
  studentAsksExchanges,
  type CrossfireArtifactKind,
} from "@/lib/roundModel";
import type { CrossfireEffect, CrossfireExchange, RoundPhaseType, RoundSide } from "@/types/round";

interface Props {
  roundId: string;
  phase: RoundPhaseType;
  studentSide: RoundSide;
  /** Exchanges for the current crossfire phase only (from round state), both directions mixed. */
  exchanges: CrossfireExchange[];
  /** Bounded flow/ballot consequences the backend derived for this phase's exchanges. */
  crossfireEffects: CrossfireEffect[];
  /** Called with a freshly generated or updated exchange to merge into round state. */
  onExchangeSaved: (exchange: CrossfireExchange) => void;
  onAdvancePhase: () => void;
  isLoading: boolean;
  /** Multiplayer only. Omitted (default) => solo behavior, unchanged. When
   * present and allowed is false, this viewer can't submit an answer/question
   * right now (wrong side, observer, coach, etc.) — the interactive panels
   * are replaced with `reason`. */
  turnGate?: { allowed: boolean; reason: string | null };
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

const ARTIFACT_LABELS: Record<CrossfireArtifactKind, string> = {
  ai_question: "AI Opponent asked",
  student_answer: "You answered",
  student_question: "You asked",
  ai_answer: "AI Opponent answered",
};

const EFFECT_TONE_CLASSES: Record<ReturnType<typeof crossfireEffectTone>, string> = {
  red: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-400",
  amber:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-400",
  neutral: "border-hairline bg-muted/30 text-muted-foreground",
};

const SEVERITY_TEXT: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };

function ExchangeEffectNote({ effect }: { effect: CrossfireEffect }) {
  const tone = crossfireEffectTone(effect.severity);
  return (
    <p className={`rounded-md border px-3 py-2 text-xs ${EFFECT_TONE_CLASSES[tone]}`}>
      <span className="font-semibold">
        {CROSSFIRE_EFFECT_LABELS[effect.effect_type]} ({SEVERITY_TEXT[effect.severity] ?? effect.severity}
        ){" — "}
      </span>
      {effect.explanation}
    </p>
  );
}

function ExchangeTranscriptEntry({
  exchange,
  studentSide,
  effect,
  followUp,
}: {
  exchange: CrossfireExchange;
  studentSide: RoundSide;
  effect?: CrossfireEffect;
  /** Present only for entries in the AI-asks-you lane that may offer a follow-up. */
  followUp?: {
    eligible: boolean;
    busy: boolean;
    error: string | null;
    onRequest: (exchangeId: string) => void;
  };
}) {
  const artifacts = crossfireExchangeArtifacts(exchange, studentSide);
  const reason = followUp?.eligible ? crossfireFollowUpReason(exchange) : null;
  return (
    <div className="rounded-md border px-3 py-2.5 space-y-2 text-sm">
      {artifacts.map((a) => (
        <div key={`${a.exchangeId}-${a.kind}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {ARTIFACT_LABELS[a.kind]}
          </p>
          <p className="mt-0.5">{a.text}</p>
        </div>
      ))}
      <ExchangeDiagnostics exchange={exchange} />
      {effect && <ExchangeEffectNote effect={effect} />}
      {followUp?.eligible && (
        <div className="space-y-1.5 pt-1">
          {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
          {followUp.error && (
            <p role="alert" className="text-xs text-red-600">
              {followUp.error}
            </p>
          )}
          <button
            type="button"
            onClick={() => followUp.onRequest(exchange.id)}
            disabled={followUp.busy}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {followUp.busy ? "Asking follow-up…" : "Ask Follow-up"}
          </button>
        </div>
      )}
    </div>
  );
}

export function CrossfireCapture({
  roundId,
  phase,
  studentSide,
  exchanges,
  crossfireEffects,
  onExchangeSaved,
  onAdvancePhase,
  isLoading,
  turnGate,
}: Props) {
  const askerSide = opponentSide(studentSide);
  const askerLabel = `AI Opponent (${sideLabel(askerSide)})`;
  const answererLabel = `You (${sideLabel(studentSide)})`;
  const phaseLabel = PHASE_LABELS[phase] ?? phase;

  const aiLane = aiAsksExchanges(exchanges, studentSide);
  const studentLane = studentAsksExchanges(exchanges, studentSide);

  const pending = findPendingCrossfireExchange(aiLane);
  const aiAnswered = findAnsweredCrossfireExchanges(aiLane);

  // ── Lane A: AI asks you ──────────────────────────────────────────────────────

  const [questionState, setQuestionState] = useState<"idle" | "loading" | "error">("idle");
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchInFlightRef = useRef(false);
  const attemptedKeyRef = useRef<string | null>(null);
  const answerTextareaId = useId();

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

  // Auto-fetch the opening AI question for this phase exactly once, only when
  // the AI-asks lane (not the combined exchange list) is still empty. Scoping
  // to this lane keeps it independent of how many questions the student has
  // already asked in the other lane.
  useEffect(() => {
    const key = `${roundId}:${phase}`;
    if (aiLane.length > 0) {
      attemptedKeyRef.current = key;
      return;
    }
    if (attemptedKeyRef.current === key) return;
    attemptedKeyRef.current = key;
    fetchQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, phase, aiLane.length]);

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

  // Follow-up questions (Phase 8E) — student-requested only, never automatic.
  // Keyed by target exchange id so multiple historical entries can each show
  // their own busy/error state independently.
  const [followUpBusyId, setFollowUpBusyId] = useState<string | null>(null);
  const [followUpErrors, setFollowUpErrors] = useState<Record<string, string>>({});
  const followUpInFlightRef = useRef<Set<string>>(new Set());

  async function handleRequestFollowUp(exchangeId: string) {
    if (followUpInFlightRef.current.has(exchangeId)) return;
    followUpInFlightRef.current.add(exchangeId);
    setFollowUpBusyId(exchangeId);
    setFollowUpErrors((prev) => {
      const next = { ...prev };
      delete next[exchangeId];
      return next;
    });
    try {
      const followUp = await roundApi.requestCrossfireFollowUp(roundId, exchangeId);
      onExchangeSaved(followUp);
      setAnnouncement("Follow-up question ready.");
    } catch (e) {
      setFollowUpErrors((prev) => ({
        ...prev,
        [exchangeId]:
          e instanceof ApiError ? e.message : "Couldn't request a follow-up. Try again.",
      }));
    } finally {
      followUpInFlightRef.current.delete(exchangeId);
      setFollowUpBusyId(null);
    }
  }

  // ── Lane B: you ask the opponent ─────────────────────────────────────────────

  const [askText, setAskText] = useState("");
  const [askState, setAskState] = useState<"idle" | "asking" | "error">("idle");
  const [askError, setAskError] = useState<string | null>(null);
  const askInFlightRef = useRef(false);
  const askTextareaId = useId();

  async function handleAskOpponent() {
    if (askInFlightRef.current) return;
    if (!isValidCrossfireQuestion(askText)) {
      setAskError("Please enter a question before asking.");
      return;
    }
    askInFlightRef.current = true;
    setAskState("asking");
    setAskError(null);
    try {
      const exchange = await roundApi.submitStudentCrossfireQuestion(roundId, askText.trim());
      onExchangeSaved(exchange);
      setAskText("");
      setAskState("idle");
      setAnnouncement("The AI opponent answered your question.");
    } catch (e) {
      setAskState("error");
      setAskError(
        e instanceof ApiError
          ? e.message
          : "Couldn't get an answer. Your question is still here — try again.",
      );
    } finally {
      askInFlightRef.current = false;
    }
  }

  // ── Shared ────────────────────────────────────────────────────────────────────

  const [announcement, setAnnouncement] = useState("");
  const busy = isLoading || submitState === "submitting" || askState === "asking" || followUpBusyId !== null;

  if (turnGate && !turnGate.allowed) {
    return (
      <section aria-label={`${phaseLabel} crossfire`} className="space-y-3">
        <div className="rounded-lg border bg-muted/20 p-4 space-y-1">
          <p className="text-sm font-medium">Not your turn</p>
          <p className="text-xs text-muted-foreground">
            {turnGate.reason ?? "You can't submit right now."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={`${phaseLabel} crossfire`} className="space-y-5">
      <div className="rounded-lg border bg-sky-50 dark:bg-sky-950/20 p-4">
        <h2 className="text-sm font-medium">{phaseLabel}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Turn-based crossfire: {askerLabel} can ask you a question, and you can ask the AI
          opponent one — in either order. Read, type your reply, then submit.
        </p>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* ── Panel A: AI asks you ──────────────────────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {askerLabel} asks you
        </h3>

        {aiAnswered.length > 0 && (
          <div className="space-y-3">
            {groupCrossfireExchangesWithFollowUps(aiAnswered).map((group) => (
              <div key={group.original.id} className="space-y-2">
                <ExchangeTranscriptEntry
                  exchange={group.original}
                  studentSide={studentSide}
                  effect={crossfireEffectForExchange(crossfireEffects, group.original.id)}
                  followUp={{
                    // Only offer a follow-up when nothing is already pending —
                    // resolve what's in front of you before asking for more.
                    eligible:
                      !pending && canRequestCrossfireFollowUp(group.original, studentSide, aiLane),
                    busy: followUpBusyId === group.original.id,
                    error: followUpErrors[group.original.id] ?? null,
                    onRequest: handleRequestFollowUp,
                  }}
                />
                {group.followUp && (
                  <div className="ml-3 sm:ml-5 border-l-2 border-hairline pl-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Follow-up
                    </p>
                    <ExchangeTranscriptEntry
                      exchange={group.followUp}
                      studentSide={studentSide}
                      effect={crossfireEffectForExchange(crossfireEffects, group.followUp.id)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {questionState === "loading" && (
          <p role="status" className="text-xs text-muted-foreground">
            Generating crossfire question…
          </p>
        )}

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

        {pending && (
          <div className="space-y-3">
            <div className="rounded-md border px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {ARTIFACT_LABELS.ai_question}
                {isCrossfireFollowUp(pending) && " · Follow-up"}
              </p>
              <p className="text-sm mt-1">{pending.question}</p>
              {pending.target_argument && pending.target_argument !== "general" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Targeting argument {pending.target_argument}
                </p>
              )}
            </div>

            <label htmlFor={answerTextareaId} className="text-xs font-medium block">
              {answererLabel} respond
            </label>
            <textarea
              id={answerTextareaId}
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
            <button
              type="button"
              onClick={handleSubmitAnswer}
              disabled={busy || !answerText.trim()}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitState === "submitting" ? "Submitting..." : "Submit Answer"}
            </button>
          </div>
        )}

        {!pending && questionState === "idle" && (
          <button
            type="button"
            onClick={() => fetchQuestion()}
            disabled={busy}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {aiAnswered.length > 0 ? "Ask Another Question" : "Get Crossfire Question"}
          </button>
        )}
      </div>

      {/* ── Panel B: you ask the opponent ────────────────────────────────────── */}
      <div className="space-y-3 border-t pt-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          You ask {askerLabel}
        </h3>

        {studentLane.length > 0 && (
          <div className="space-y-2">
            {studentLane.map((ex) => (
              <ExchangeTranscriptEntry
                key={ex.id}
                exchange={ex}
                studentSide={studentSide}
                effect={crossfireEffectForExchange(crossfireEffects, ex.id)}
              />
            ))}
          </div>
        )}

        <label htmlFor={askTextareaId} className="text-xs font-medium block">
          Ask a question
        </label>
        <textarea
          id={askTextareaId}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Type a question for the AI opponent..."
          value={askText}
          onChange={(e) => setAskText(e.target.value)}
          disabled={askState === "asking"}
        />
        {askError && (
          <p role="alert" className="text-xs text-red-600">
            {askError}
          </p>
        )}
        <button
          type="button"
          onClick={handleAskOpponent}
          disabled={busy || !askText.trim()}
          className="w-full rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {askState === "asking" ? "Asking…" : "Ask Opponent"}
        </button>
      </div>

      {/* ── Shared phase control ─────────────────────────────────────────────── */}
      <div className="border-t pt-4">
        <button
          type="button"
          onClick={onAdvancePhase}
          disabled={busy}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Advance Phase
        </button>
      </div>
    </section>
  );
}
