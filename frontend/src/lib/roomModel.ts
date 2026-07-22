/**
 * Pass 27/28 — Phase 9A/9B. Pure helpers for multiplayer round rooms.
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
  RoomParticipantStatus,
  RoomRole,
  RoomStatus,
  RoundRoom,
  RoundRoomParticipant,
  RoundSide,
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

// ── Turn gating ──────────────────────────────────────────────────────────────

/** Mirrors _require_turn_access: only a joined, non-observer/coach
 * participant assigned to the round's human-controlled side may submit a
 * speech or crossfire action right now. */
export function canSubmitCurrentTurn(
  participant: RoundRoomParticipant | undefined,
  studentSide: RoundSide,
): boolean {
  if (!participant) return false;
  if (participant.status !== "joined") return false;
  if (participant.role === "coach" || participant.role === "observer") return false;
  return participant.side === studentSide;
}

/** Human-readable reason submission is disabled, or null when it's allowed.
 * Never fabricates certainty about *why* a participant record is missing —
 * that's just "not part of this room yet". */
export function disabledSubmitReason(
  participant: RoundRoomParticipant | undefined,
  studentSide: RoundSide,
): string | null {
  if (canSubmitCurrentTurn(participant, studentSide)) return null;
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
  return `You're assigned to ${sideLabel(participant.side)} — this action belongs to ${sideLabel(studentSide)}.`;
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
  if (participant.role === "coach" || participant.role === "observer") {
    return `You're a ${roleLabel} — you can watch the round and review outputs, but can't act.`;
  }
  if (participant.side == null) {
    return `You're ${roleLabel} — ask the room owner to assign you a side before you can act.`;
  }
  return `You're ${roleLabel} (${sideLabel(participant.side)}) — you can submit speeches and crossfire for ${sideLabel(studentSide)}.`;
}
