/**
 * Pass 27/28/29 — Phase 9A/9B/9C. Pure helpers for multiplayer round rooms.
 *
 * No API calls, no React, no side effects — same convention as
 * roundModel.ts. Turn-gating helpers here (canSubmitCurrentTurn,
 * disabledSubmitReason) mirror the backend's _require_turn_access logic
 * (round_simulations.py) for UI purposes only — the backend remains
 * authoritative, and as of Phase 9B exposes its own computed result
 * (TurnContext, on RoundRoomStateResponse) that callers should prefer once
 * it's available; these client-side helpers are the pre-first-response
 * fallback and the thing under test here.
 */

import type {
  CoachAnnotation,
  CoachNoteType,
  RoomParticipantStatus,
  RoomRole,
  RoomStatus,
  RoundPhaseType,
  RoundRoom,
  RoundRoomParticipant,
  RoundSide,
  SpeakerSlot,
} from "@/types/round";

// ── Labels ───────────────────────────────────────────────────────────────────

export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  waiting: "Waiting for players",
  active: "In progress",
  completed: "Completed",
  closed: "Closed",
};

export const ROOM_ROLE_LABELS: Record<RoomRole, string> = {
  owner: "Owner",
  debater_a: "Debater A",
  debater_b: "Debater B",
  coach: "Coach",
  observer: "Observer",
};

export const PARTICIPANT_STATUS_LABELS: Record<RoomParticipantStatus, string> = {
  invited: "Invited",
  joined: "Joined",
  left: "Left",
};

const DEBATER_ROLES = new Set<RoomRole>(["owner", "debater_a", "debater_b"]);

export function isDebaterRole(role: RoomRole): boolean {
  return DEBATER_ROLES.has(role);
}

export function sideLabel(side: RoundSide | null | undefined): string {
  if (side === "pro") return "Pro";
  if (side === "con") return "Con";
  return "Unassigned";
}

// ── Speaker slots (Phase 9C) ─────────────────────────────────────────────────

export const SPEAKER_SLOT_LABELS: Record<SpeakerSlot, string> = {
  first: "First Speaker",
  second: "Second Speaker",
};

/** Null/undefined is flex — matches either slot requirement, not "no slot". */
export function speakerSlotLabel(slot: SpeakerSlot | null | undefined): string {
  if (slot === "first" || slot === "second") return SPEAKER_SLOT_LABELS[slot];
  return "Either Speaker";
}

/** Human-facing "whose turn is it" sentence, e.g. "Pro First Speaker",
 * "Con Second Speaker", or "Either debater on Pro" when the phase has no
 * slot requirement (crossfire, or a phase-less/unknown context). */
export function expectedSpeakerLabel(
  expectedSide: RoundSide | null | undefined,
  expectedSlot: SpeakerSlot | null | undefined,
): string {
  const side = sideLabel(expectedSide);
  if (expectedSlot === "first" || expectedSlot === "second") {
    return `${side} ${SPEAKER_SLOT_LABELS[expectedSlot]}`;
  }
  return `Either debater on ${side}`;
}

// ── Invite codes ─────────────────────────────────────────────────────────────

/** Display formatting only — never changes the underlying code value used
 * in API calls. Groups an 8-character code as "XXXX-XXXX" for readability. */
export function formatInviteCode(code: string): string {
  const clean = code.trim().toUpperCase();
  if (clean.length !== 8) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

export function isValidInviteCodeInput(code: string): boolean {
  return code.trim().length > 0;
}

// ── Participants ─────────────────────────────────────────────────────────────

export function myParticipant(
  participants: RoundRoomParticipant[],
  userId: string | null | undefined,
): RoundRoomParticipant | undefined {
  if (!userId) return undefined;
  return participants.find((p) => p.user_id === userId);
}

export function isRoomOwner(room: RoundRoom, userId: string | null | undefined): boolean {
  return !!userId && room.owner_user_id === userId;
}

export function joinedParticipants(participants: RoundRoomParticipant[]): RoundRoomParticipant[] {
  return participants.filter((p) => p.status === "joined");
}

// ── Room lifecycle (Phase 9E) ────────────────────────────────────────────────

export function isRoomClosed(room: RoundRoom): boolean {
  return room.status === "closed";
}

/** Owner-only, and only while the room isn't already closed -- gates
 * showing the Close Room / Rotate Invite Code controls. */
export function canManageRoomLifecycle(room: RoundRoom, userId: string | null | undefined): boolean {
  return isRoomOwner(room, userId) && !isRoomClosed(room);
}

/** A joined, non-owner participant may leave. The owner manages the room
 * instead of leaving it (no ownership-transfer support); a participant who
 * already left has nothing left to do. */
export function canLeaveRoom(
  participant: RoundRoomParticipant | undefined,
  room: RoundRoom,
  userId: string | null | undefined,
): boolean {
  if (!participant || participant.status !== "joined") return false;
  return !isRoomOwner(room, userId);
}

// ── Turn gating ──────────────────────────────────────────────────────────────

/** Mirrors _require_turn_access/_participant_turn_state: only a joined,
 * non-observer/coach participant assigned to the round's human-controlled
 * side (and, when the phase requires one, the matching speaker_slot) may
 * submit a speech or crossfire action right now.
 *
 * expectedSlot rule (Phase 9C): a participant's speaker_slot of undefined is
 * flex — it matches ANY expectedSlot (including undefined). Only an
 * explicitly assigned slot that disagrees with a real expectedSlot is
 * rejected. This is required for backward compatibility with every
 * participant that existed before speaker slots did. */
export function canSubmitCurrentTurn(
  participant: RoundRoomParticipant | undefined,
  studentSide: RoundSide,
  expectedSlot?: SpeakerSlot | null,
): boolean {
  if (!participant) return false;
  if (participant.status !== "joined") return false;
  if (participant.role === "coach" || participant.role === "observer") return false;
  if (participant.side !== studentSide) return false;
  if (expectedSlot != null && participant.speaker_slot != null && participant.speaker_slot !== expectedSlot) {
    return false;
  }
  return true;
}

/** Human-readable reason submission is disabled, or null when it's allowed.
 * Never fabricates certainty about *why* a participant record is missing —
 * that's just "not part of this room yet". */
export function disabledSubmitReason(
  participant: RoundRoomParticipant | undefined,
  studentSide: RoundSide,
  expectedSlot?: SpeakerSlot | null,
): string | null {
  if (canSubmitCurrentTurn(participant, studentSide, expectedSlot)) return null;
  if (!participant || participant.status !== "joined") {
    return "You're not an active participant in this room yet.";
  }
  if (participant.role === "coach") {
    return "Coaches can watch the round but can't submit speeches or crossfire answers.";
  }
  if (participant.role === "observer") {
    return "Observers can watch the round but can't submit speeches or crossfire answers.";
  }
  if (participant.side == null) {
    return "Ask the room owner to assign you a side before you can participate.";
  }
  if (participant.side !== studentSide) {
    return `You're assigned to ${sideLabel(participant.side)} — this action belongs to ${sideLabel(studentSide)}.`;
  }
  return `You're the ${speakerSlotLabel(participant.speaker_slot).toLowerCase()} — this phase belongs to the ${speakerSlotLabel(expectedSlot).toLowerCase()} on your side.`;
}

// ── Round-content actions (Phase 9B) ─────────────────────────────────────────

/** Mirrors _require_general_mutate_access: the owner or any joined
 * non-observer/coach participant may generate decisions/drills, rejudge, or
 * submit a drill attempt. Unlike canSubmitCurrentTurn, this is NOT
 * side-specific — these actions aren't tied to whose turn it is. */
export function canPerformRoundAction(participant: RoundRoomParticipant | undefined): boolean {
  if (!participant) return false;
  if (participant.status !== "joined") return false;
  return participant.role !== "coach" && participant.role !== "observer";
}

/** Human-readable reason a general round action (rejudge, generate
 * decision/drills) is disabled, or null when it's allowed. The
 * reason-returning counterpart to canPerformRoundAction, mirroring the
 * canSubmitCurrentTurn/disabledSubmitReason pairing. Phase 9D: wired into
 * the ballot's rejudge control first; reusable for other general-mutate
 * actions later. */
export function generalActionDisabledReason(participant: RoundRoomParticipant | undefined): string | null {
  if (canPerformRoundAction(participant)) return null;
  if (!participant || participant.status !== "joined") {
    return "You're not an active participant in this room yet.";
  }
  if (participant.role === "coach") {
    return "Coaches can watch the round but can't perform this action.";
  }
  if (participant.role === "observer") {
    return "Observers can watch the round but can't perform this action.";
  }
  return null;
}

/** Short, human-facing sentence describing what this participant can do in
 * the room right now — for a "what can I do here" banner. */
export function describeCapabilities(
  participant: RoundRoomParticipant | undefined,
  studentSide: RoundSide,
): string {
  if (!participant || participant.status !== "joined") {
    return "You're not an active participant in this room yet.";
  }
  const roleLabel = ROOM_ROLE_LABELS[participant.role];
  if (participant.role === "coach") {
    return "Review mode: you can leave notes, but not take debate turns.";
  }
  if (participant.role === "observer") {
    return `You're an ${roleLabel} — you can watch the round and read coach notes, but can't act or add your own.`;
  }
  if (participant.side == null) {
    return `You're ${roleLabel} — ask the room owner to assign you a side before you can act.`;
  }
  if (participant.speaker_slot != null) {
    return `You're ${roleLabel} (${sideLabel(participant.side)}, ${speakerSlotLabel(participant.speaker_slot)}) — you can submit your assigned speeches and any crossfire for ${sideLabel(studentSide)}.`;
  }
  return `You're ${roleLabel} (${sideLabel(participant.side)}) — you can submit speeches and crossfire for ${sideLabel(studentSide)}.`;
}

// ── Coach review / shared room notes (Phase 9F) ─────────────────────────────

export const COACH_NOTE_TYPE_LABELS: Record<CoachNoteType, string> = {
  general: "General",
  flow: "Flow",
  crossfire: "Crossfire",
  drill: "Drill",
  ballot: "Ballot",
};

export function coachNoteTypeLabel(noteType: CoachNoteType | null | undefined): string {
  if (noteType && noteType in COACH_NOTE_TYPE_LABELS) return COACH_NOTE_TYPE_LABELS[noteType];
  return "General";
}

/** Mirrors _require_coach_or_owner_access, plus 9E's room-not-closed gate:
 * only the owner or a joined coach may add a note, and only while the room
 * isn't closed. Never broadens who can submit a speech/crossfire/drill
 * attempt -- this is a separate, additive capability. */
export function canCreateCoachNote(
  participant: RoundRoomParticipant | undefined,
  room: RoundRoom,
): boolean {
  if (!participant || participant.status !== "joined") return false;
  if (isRoomClosed(room)) return false;
  return participant.role === "owner" || participant.role === "coach";
}

/** Mirrors _load_round_access's read tier: any joined participant, any
 * role, can read notes -- including observers. */
export function canReadCoachNotes(participant: RoundRoomParticipant | undefined): boolean {
  return !!participant && participant.status === "joined";
}

/** Human-readable reason coach-note creation is disabled, or null when it's
 * allowed. The reason-returning counterpart to canCreateCoachNote. */
export function coachNoteDisabledReason(
  participant: RoundRoomParticipant | undefined,
  room: RoundRoom,
): string | null {
  if (canCreateCoachNote(participant, room)) return null;
  if (!participant || participant.status !== "joined") {
    return "You're not an active participant in this room yet.";
  }
  if (isRoomClosed(room)) {
    return "This room has been closed; new notes can no longer be added.";
  }
  if (participant.role === "observer") {
    return "Observers can read coach notes but can't add them.";
  }
  return "Only the room owner or a coach can add notes — you can still read them.";
}

// ── Note badges, filtering, room-closed copy (Phase 9G) ─────────────────────

/** Compact numeric badge for the Notes tab. Null (no badge) at zero. */
export function coachNoteBadgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

/** Role-agnostic summary sentence for surfaces any joined participant sees
 * (e.g. the room lobby), not gated to a specific role. */
export function coachNoteCountSummary(count: number): string | null {
  if (count <= 0) return null;
  return `${count} coach note${count === 1 ? "" : "s"} available.`;
}

/** Debater-focused sentence for the active round view's capability banner.
 * Coaches already know about their own notes; observers get their own
 * passive copy via describeCapabilities instead. */
export function coachNotesAvailableMessage(
  count: number,
  participant: RoundRoomParticipant | undefined,
): string | null {
  if (count <= 0) return null;
  if (!participant || participant.role === "coach" || participant.role === "observer") return null;
  return `${count} coach note${count === 1 ? "" : "s"} available for review.`;
}

/** Closed-room notice for the active round view, where no lifecycle
 * messaging existed before Phase 9G (RoomLobby already had its own). */
export function roomClosedNotice(room: RoundRoom): string | null {
  if (!isRoomClosed(room)) return null;
  return "This room is closed; notes and round materials remain viewable.";
}

export type CoachNoteTypeFilter = CoachNoteType | "all";
export type CoachNotePhaseFilter = RoundPhaseType | "all";

/** Pure filter over an already-loaded note list -- no backend call. A note
 * with no note_type set is treated as "general" for filtering purposes,
 * matching coachNoteTypeLabel's fallback. */
export function filterCoachNotes(
  notes: CoachAnnotation[],
  typeFilter: CoachNoteTypeFilter,
  phaseFilter: CoachNotePhaseFilter,
): CoachAnnotation[] {
  return notes.filter((n) => {
    if (typeFilter !== "all" && (n.note_type ?? "general") !== typeFilter) return false;
    if (phaseFilter !== "all" && n.phase !== phaseFilter) return false;
    return true;
  });
}

/** Only the phases actually present among these notes, in the given phase
 * order -- keeps the phase filter dropdown short instead of listing all 13
 * round phases regardless of whether any note references them. */
export function distinctCoachNotePhases(
  notes: CoachAnnotation[],
  phaseOrder: RoundPhaseType[],
): RoundPhaseType[] {
  const present = new Set(notes.map((n) => n.phase).filter((p): p is RoundPhaseType => !!p));
  return phaseOrder.filter((p) => present.has(p));
}

/** Distinguishes "nothing has ever been posted" from "filters hid
 * everything" -- null means render the (non-empty) filtered list instead. */
export function coachNotesEmptyStateMessage(
  totalCount: number,
  filteredCount: number,
): string | null {
  if (totalCount === 0) return "No coach notes yet.";
  if (filteredCount === 0) return "No notes match the selected filters.";
  return null;
}

/** "3 notes" when unfiltered, "2 of 5 notes" once a filter narrows the list. */
export function coachNoteCountLabel(filteredCount: number, totalCount: number): string {
  const noun = (n: number) => `${n} note${n === 1 ? "" : "s"}`;
  if (filteredCount === totalCount) return noun(totalCount);
  return `${filteredCount} of ${noun(totalCount)}`;
}

// ── Note review anchors (Phase 9H) ──────────────────────────────────────────
// Turns a note's note_type/phase into a real, honest navigation target. Every
// branch that can't point at something truthful returns null -- callers must
// never render a link to nowhere.

export type ReviewTargetTab = "round" | "flow" | "ballot" | "drills";

export const REVIEW_TAB_LABELS: Record<ReviewTargetTab, string> = {
  round: "Round",
  flow: "Flow",
  ballot: "Ballot",
  drills: "Drills",
};

export interface CoachNoteReviewTarget {
  tab: ReviewTargetTab;
  actionLabel: string;
  contextLabel: string;
}

/** phaseLabels is passed in (rather than importing roundModel.ts's
 * PHASE_LABELS) so this file never needs a cross-import. A crossfire note
 * only ever gets a target while the round is still literally on that phase
 * -- there's no replay surface to show a past crossfire phase in, so an
 * older crossfire note becomes context-only rather than a fake link. */
export function coachNoteReviewTarget(
  note: CoachAnnotation,
  currentPhase: RoundPhaseType | undefined,
  phaseLabels: Record<RoundPhaseType, string>,
): CoachNoteReviewTarget | null {
  const noteType = note.note_type ?? "general";

  function target(tab: ReviewTargetTab, actionLabel: string): CoachNoteReviewTarget {
    const phaseSuffix = note.phase ? phaseLabels[note.phase] : null;
    return {
      tab,
      actionLabel,
      contextLabel: phaseSuffix ? `${phaseSuffix} · ${REVIEW_TAB_LABELS[tab]}` : REVIEW_TAB_LABELS[tab],
    };
  }

  if (noteType === "flow") return target("flow", "Review in Flow");
  if (noteType === "ballot") return target("ballot", "Review Ballot");
  if (noteType === "drill") return target("drills", "Review Drills");
  if (noteType === "crossfire") {
    if (note.phase && note.phase === currentPhase && isCrossfirePhase(currentPhase)) {
      return target("round", "Review Crossfire");
    }
    return null;
  }
  // general (or unset) -- only actionable when a phase is attached; Flow is
  // the one tab that's always a truthful destination regardless of which
  // historical phase the note referenced, since flow state is cumulative.
  if (note.phase) return target("flow", "Review in Flow");
  return null;
}

export function reviewContextBannerText(contextLabel: string): string {
  return `Viewing coach note context: ${contextLabel}`;
}

// ── Crossfire readiness (Phase 10B) ─────────────────────────────────────────
// Polling-based, not push -- backend remains authoritative. These helpers
// only ever read data already present on RoundRoomParticipant/RoundRoom;
// none of them broaden who can submit a crossfire answer/question.

/** Canonical crossfire-phase check, mirroring round_state_machine.py's
 * CROSSFIRE_PHASES by value (not imported, to keep this file decoupled from
 * roundModel.ts, an established layering rule). */
const CROSSFIRE_PHASES = new Set<RoundPhaseType>([
  "first_crossfire",
  "grand_crossfire",
  "final_crossfire",
]);

export function isCrossfirePhase(phase: RoundPhaseType): boolean {
  return CROSSFIRE_PHASES.has(phase);
}

/** Suggested polling cadence while in a crossfire phase -- within the
 * requested 2-5s window; the dashboard's less time-sensitive poll uses 6s. */
export const CROSSFIRE_POLL_INTERVAL_MS = 3000;

/** A participant is "ready" only when ready_phase matches the phase being
 * asked about -- this is what makes readiness never leak from one crossfire
 * phase into the next, with no reset write required anywhere. */
function isParticipantReadyForPhase(
  participant: RoundRoomParticipant,
  phase: RoundPhaseType | undefined,
): boolean {
  return participant.is_ready === true && !!phase && participant.ready_phase === phase;
}

export function isViewerCrossfireReady(
  participant: RoundRoomParticipant | undefined,
  currentPhase: RoundPhaseType | undefined,
): boolean {
  return !!participant && isParticipantReadyForPhase(participant, currentPhase);
}

export interface CrossfireReadyCounts {
  readyCount: number;
  eligibleCount: number;
}

/** Eligible = joined, non-coach/non-observer, assigned to the student's
 * side -- the exact set of roles _require_turn_access would allow to answer
 * a crossfire question, mirrored here for display purposes only. */
export function crossfireReadyCounts(
  participants: RoundRoomParticipant[],
  studentSide: RoundSide,
  currentPhase: RoundPhaseType | undefined,
): CrossfireReadyCounts {
  const eligible = participants.filter(
    (p) => p.status === "joined" && p.side === studentSide && p.role !== "coach" && p.role !== "observer",
  );
  const ready = eligible.filter((p) => isParticipantReadyForPhase(p, currentPhase));
  return { readyCount: ready.length, eligibleCount: eligible.length };
}

export function crossfireReadyLabel(viewerReady: boolean): string {
  return viewerReady ? "Ready" : "Not ready";
}

export function crossfireReadyCountLabel(readyCount: number, eligibleCount: number): string {
  return `${readyCount} of ${eligibleCount} ready`;
}

/** Human-facing team coordination sentence. Generalizes past exactly one
 * partner -- "partner" reads naturally for the common 2-debater case, and
 * still holds together for a lone debater or a larger team split. */
export function crossfirePartnerReadyLabel(
  viewerReady: boolean,
  readyCount: number,
  eligibleCount: number,
): string {
  if (eligibleCount <= 1) return "No partner in this room yet.";
  const partnersReady = Math.max(readyCount - (viewerReady ? 1 : 0), 0);
  const partnersTotal = eligibleCount - 1;
  if (partnersReady >= partnersTotal) return "Partner ready.";
  return "Waiting for partner.";
}

/** Mirrors _require_turn_access exactly: joined, not coach/observer, on the
 * student's side, room not closed, and only during a crossfire phase.
 * Never broadens who can submit an actual crossfire answer/question --
 * readiness is advisory coordination layered on top of that existing tier. */
export function canToggleCrossfireReady(
  participant: RoundRoomParticipant | undefined,
  room: RoundRoom,
  studentSide: RoundSide,
  currentPhase: RoundPhaseType | undefined,
): boolean {
  if (!participant || participant.status !== "joined") return false;
  if (isRoomClosed(room)) return false;
  if (participant.role === "coach" || participant.role === "observer") return false;
  if (participant.side !== studentSide) return false;
  if (!currentPhase || !isCrossfirePhase(currentPhase)) return false;
  return true;
}

/** The reason-returning counterpart to canToggleCrossfireReady. */
export function crossfireReadyDisabledReason(
  participant: RoundRoomParticipant | undefined,
  room: RoundRoom,
  studentSide: RoundSide,
  currentPhase: RoundPhaseType | undefined,
): string | null {
  if (canToggleCrossfireReady(participant, room, studentSide, currentPhase)) return null;
  if (!participant || participant.status !== "joined") {
    return "You're not an active participant in this room yet.";
  }
  if (isRoomClosed(room)) {
    return "This room is closed; readiness can no longer be changed.";
  }
  if (participant.role === "coach") {
    return "Coaches can watch crossfire but can't mark ready.";
  }
  if (participant.role === "observer") {
    return "Observers can watch crossfire but can't mark ready.";
  }
  if (participant.side !== studentSide) {
    return `You're assigned to ${sideLabel(participant.side)} — readiness applies to ${sideLabel(studentSide)}.`;
  }
  return "Readiness only applies during crossfire phases.";
}

/** Honest connection-status copy -- this is polling, never claims to be
 * "live" or "connected" the way a real realtime channel would. */
export function connectionStateLabel(pollActive: boolean): string {
  return pollActive ? "Syncing crossfire state…" : "Polling paused outside crossfire.";
}
