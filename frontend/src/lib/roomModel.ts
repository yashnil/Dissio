/**
 * Pass 27 — Phase 9A. Pure helpers for multiplayer round rooms.
 *
 * No API calls, no React, no side effects — same convention as
 * roundModel.ts. Turn-gating helpers here (canSubmitCurrentTurn,
 * disabledSubmitReason) mirror the backend's _require_turn_access logic
 * (round_simulations.py) for UI purposes only; the backend remains the
 * authoritative check.
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
