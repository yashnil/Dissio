/**
 * Pass 16.5 — Typed API client for round simulations.
 *
 * All functions use apiFetch(), which:
 * - Attaches the Supabase Bearer token automatically
 * - Handles 401 token refresh transparently
 * - Throws ApiError for HTTP or network failures
 * - Never exposes backend URLs in component code
 */

import { apiFetch } from "@/lib/api";
import type {
  CoachAnnotation,
  CoachNoteType,
  RoundArgument,
  RoundDecision,
  RoundDrill,
  RoundDrillAttempt,
  RoundDrillAttemptResult,
  RoundPhaseType,
  RoundSimulation,
  RoundSimulationConfig,
  RoundSpeech,
  RoundStateResponse,
  CrossfireExchange,
  RoundAdaptationReview,
} from "@/types/round";

const BASE = "/round-simulations";

// ── Round lifecycle ─────────────────────────────────────────────────────────

export function createRound(config: RoundSimulationConfig, teamId?: string): Promise<RoundSimulation> {
  return apiFetch<RoundSimulation>(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config, team_id: teamId ?? null }),
  });
}

export function getRoundState(roundId: string): Promise<RoundStateResponse> {
  return apiFetch<RoundStateResponse>(`${BASE}/${roundId}`);
}

export function startRound(roundId: string): Promise<RoundSimulation> {
  return apiFetch<RoundSimulation>(`${BASE}/${roundId}/start`, { method: "POST" });
}

export function pauseRound(roundId: string): Promise<RoundSimulation> {
  return apiFetch<RoundSimulation>(`${BASE}/${roundId}/pause`, { method: "POST" });
}

export function resumeRound(roundId: string): Promise<RoundSimulation> {
  return apiFetch<RoundSimulation>(`${BASE}/${roundId}/resume`, { method: "POST" });
}

export function listRounds(): Promise<RoundSimulation[]> {
  return apiFetch<RoundSimulation[]>(BASE);
}

export function getPrepWarnings(roundId: string): Promise<{ warnings: string[]; count: number }> {
  return apiFetch(`${BASE}/${roundId}/prep-warnings`);
}

export function loadPreparation(
  roundId: string,
  opts: {
    cardIds?: string[];
    blockfileIds?: string[];
    frontlineIds?: string[];
    prepWorkspaceId?: string;
  },
): Promise<{ approved_cards: number; approved_blockfiles: number; approved_frontlines: number; opponent_plan_id: string }> {
  return apiFetch(`${BASE}/${roundId}/load-preparation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      round_id: roundId,
      card_ids: opts.cardIds ?? [],
      blockfile_ids: opts.blockfileIds ?? [],
      frontline_ids: opts.frontlineIds ?? [],
      prep_workspace_id: opts.prepWorkspaceId ?? null,
    }),
  });
}

// ── Speeches ────────────────────────────────────────────────────────────────

export function submitStudentSpeech(
  roundId: string,
  phase: string,
  opts: {
    transcriptText?: string;
    typedOutline?: string;
    audioUrl?: string;
    idempotencyKey?: string;
  },
): Promise<RoundSpeech> {
  return apiFetch<RoundSpeech>(`${BASE}/${roundId}/speeches/student`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      round_id: roundId,
      phase,
      transcript_text: opts.transcriptText ?? null,
      typed_outline: opts.typedOutline ?? null,
      audio_url: opts.audioUrl ?? null,
      idempotency_key: opts.idempotencyKey ?? null,
    }),
  });
}

export function generateOpponentSpeech(
  roundId: string,
  phase: string,
  idempotencyKey?: string,
): Promise<RoundSpeech> {
  return apiFetch<RoundSpeech>(`${BASE}/${roundId}/speeches/opponent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      round_id: roundId,
      phase,
      idempotency_key: idempotencyKey ?? null,
    }),
  });
}

// ── Crossfire ───────────────────────────────────────────────────────────────

export function getCrossfireQuestion(roundId: string, sequence?: number): Promise<CrossfireExchange> {
  const q = sequence != null ? `?sequence=${sequence}` : "";
  return apiFetch<CrossfireExchange>(`${BASE}/${roundId}/crossfire/question${q}`);
}

export function submitCrossfireAnswer(
  roundId: string,
  phase: string,
  answer: string,
): Promise<CrossfireExchange> {
  return apiFetch<CrossfireExchange>(`${BASE}/${roundId}/crossfire/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ round_id: roundId, phase, typed_response: answer }),
  });
}

export function submitStudentCrossfireQuestion(
  roundId: string,
  question: string,
): Promise<CrossfireExchange> {
  return apiFetch<CrossfireExchange>(`${BASE}/${roundId}/crossfire/student-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ round_id: roundId, question }),
  });
}

/** Student-requested AI follow-up pressing a specific answer the backend
 * already flagged as evasive or contradictory. `exchangeId` identifies the
 * target exchange — the backend derives the auth'd user from the session,
 * never from the request body. */
export function requestCrossfireFollowUp(
  roundId: string,
  exchangeId: string,
): Promise<CrossfireExchange> {
  return apiFetch<CrossfireExchange>(`${BASE}/${roundId}/crossfire/follow-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ round_id: roundId, exchange_id: exchangeId }),
  });
}

// ── Phase ───────────────────────────────────────────────────────────────────

export function advancePhase(
  roundId: string,
  opts?: { targetPhase?: string; practiceOverride?: boolean },
): Promise<RoundSimulation> {
  return apiFetch<RoundSimulation>(`${BASE}/${roundId}/advance-phase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      round_id: roundId,
      target_phase: opts?.targetPhase ?? null,
      practice_override: opts?.practiceOverride ?? false,
    }),
  });
}

// ── Decision ────────────────────────────────────────────────────────────────

export function generateDecision(roundId: string, judgeType?: string): Promise<RoundDecision> {
  return apiFetch<RoundDecision>(`${BASE}/${roundId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ round_id: roundId, judge_type: judgeType ?? null }),
  });
}

export function rejudgeRound(roundId: string, judgeType: string): Promise<RoundDecision> {
  return apiFetch<RoundDecision>(`${BASE}/${roundId}/rejudge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ judge_type: judgeType }),
  });
}

// ── Drills & flow ────────────────────────────────────────────────────────────

export function generateDrills(roundId: string): Promise<RoundDrill[]> {
  return apiFetch<RoundDrill[]>(`${BASE}/${roundId}/drills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ round_id: roundId }),
  });
}

export function getRoundDrills(roundId: string): Promise<RoundDrill[]> {
  return apiFetch<RoundDrill[]>(`${BASE}/${roundId}/drills`);
}

export function submitRoundDrillAttempt(
  roundId: string,
  drillId: string,
  responseText: string,
): Promise<RoundDrillAttemptResult> {
  return apiFetch<RoundDrillAttemptResult>(`${BASE}/${roundId}/drills/${drillId}/attempts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ round_id: roundId, response_text: responseText }),
  });
}

export function getRoundDrillAttempts(
  roundId: string,
  drillId: string,
): Promise<RoundDrillAttempt[]> {
  return apiFetch<RoundDrillAttempt[]>(`${BASE}/${roundId}/drills/${drillId}/attempts`);
}

export function getRoundFlow(roundId: string): Promise<RoundArgument[]> {
  return apiFetch<RoundArgument[]>(`${BASE}/${roundId}/flow`);
}

export function getEvidenceReport(roundId: string): Promise<Record<string, unknown>> {
  return apiFetch(`${BASE}/${roundId}/evidence-report`);
}

// ── Adaptation reviews ───────────────────────────────────────────────────────

export function createAdaptationReview(
  roundId: string,
  judgeType: string,
  opts?: { decisionId?: string; alternateJudgeType?: string },
): Promise<RoundAdaptationReview> {
  return apiFetch<RoundAdaptationReview>(`${BASE}/${roundId}/adaptation-reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      round_id: roundId,
      judge_type: judgeType,
      decision_id: opts?.decisionId ?? null,
      alternate_judge_type: opts?.alternateJudgeType ?? null,
    }),
  });
}

export function listAdaptationReviews(roundId: string): Promise<RoundAdaptationReview[]> {
  return apiFetch<RoundAdaptationReview[]>(`${BASE}/${roundId}/adaptation-reviews`);
}

// ── Coach review / shared room notes (Phase 9F) ─────────────────────────────
//
// Reuses the existing Pass 17 coach-annotation endpoint under a "coach note"
// framing for the multiplayer round surface. annotation_type is fixed at
// "speech_note" -- that field is a separate, older per-artifact vocabulary
// this feature doesn't repurpose; note_type is the new, intentionally
// distinct axis ("which round section is this about").

export function createCoachNote(
  roundId: string,
  opts: { content: string; noteType?: CoachNoteType; phase?: RoundPhaseType },
): Promise<CoachAnnotation> {
  return apiFetch<CoachAnnotation>(`${BASE}/${roundId}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      round_id: roundId,
      annotation_type: "speech_note",
      content: opts.content,
      target_id: null,
      target_type: null,
      is_correction: false,
      finding_id: null,
      phase: opts.phase ?? null,
      note_type: opts.noteType ?? null,
    }),
  });
}

export function listCoachNotes(roundId: string): Promise<CoachAnnotation[]> {
  return apiFetch<CoachAnnotation[]>(`${BASE}/${roundId}/annotations`);
}
