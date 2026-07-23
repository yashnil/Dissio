/**
 * Pass 27/28/29/30/31 — Phase 9A/9B/9C/9D/9E. Tests for room/lobby pure helpers.
 *
 * Same convention as roundModel.test.ts: no React, no DOM, pure functions
 * called directly with fixture factories.
 */

import {
  ROOM_STATUS_LABELS,
  ROOM_ROLE_LABELS,
  PARTICIPANT_STATUS_LABELS,
  SPEAKER_SLOT_LABELS,
  isDebaterRole,
  sideLabel,
  speakerSlotLabel,
  expectedSpeakerLabel,
  formatInviteCode,
  isValidInviteCodeInput,
  myParticipant,
  isRoomOwner,
  joinedParticipants,
  canSubmitCurrentTurn,
  disabledSubmitReason,
  canPerformRoundAction,
  generalActionDisabledReason,
  describeCapabilities,
  isRoomClosed,
  canManageRoomLifecycle,
  canLeaveRoom,
  canCreateCoachNote,
  canReadCoachNotes,
  coachNoteDisabledReason,
  coachNoteTypeLabel,
  COACH_NOTE_TYPE_LABELS,
} from "@/lib/roomModel";
import type { RoundRoom, RoundRoomParticipant, RoundRoomStateResponse } from "@/types/round";

function makeRoom(overrides: Partial<RoundRoom> = {}): RoundRoom {
  return {
    id: "room-1",
    round_id: "r1",
    owner_user_id: "owner-1",
    status: "waiting",
    invite_code: "ABCD1234",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeParticipant(overrides: Partial<RoundRoomParticipant> = {}): RoundRoomParticipant {
  return {
    id: "p1",
    room_id: "room-1",
    user_id: "u1",
    role: "debater_a",
    side: "pro",
    status: "joined",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ── Labels ───────────────────────────────────────────────────────────────────

describe("labels", () => {
  it("has a status label for every RoomStatus value", () => {
    expect(ROOM_STATUS_LABELS.waiting).toBe("Waiting for players");
    expect(ROOM_STATUS_LABELS.active).toBeTruthy();
    expect(ROOM_STATUS_LABELS.completed).toBeTruthy();
    expect(ROOM_STATUS_LABELS.closed).toBeTruthy();
  });

  it("has a role label for every RoomRole value", () => {
    expect(ROOM_ROLE_LABELS.owner).toBe("Owner");
    expect(ROOM_ROLE_LABELS.debater_a).toBeTruthy();
    expect(ROOM_ROLE_LABELS.debater_b).toBeTruthy();
    expect(ROOM_ROLE_LABELS.coach).toBeTruthy();
    expect(ROOM_ROLE_LABELS.observer).toBeTruthy();
  });

  it("has a participant status label for every value", () => {
    expect(PARTICIPANT_STATUS_LABELS.invited).toBeTruthy();
    expect(PARTICIPANT_STATUS_LABELS.joined).toBeTruthy();
    expect(PARTICIPANT_STATUS_LABELS.left).toBeTruthy();
  });

  it("isDebaterRole is true for owner/debater_a/debater_b, false otherwise", () => {
    expect(isDebaterRole("owner")).toBe(true);
    expect(isDebaterRole("debater_a")).toBe(true);
    expect(isDebaterRole("debater_b")).toBe(true);
    expect(isDebaterRole("coach")).toBe(false);
    expect(isDebaterRole("observer")).toBe(false);
  });

  it("sideLabel maps pro/con/null", () => {
    expect(sideLabel("pro")).toBe("Pro");
    expect(sideLabel("con")).toBe("Con");
    expect(sideLabel(null)).toBe("Unassigned");
    expect(sideLabel(undefined)).toBe("Unassigned");
  });
});

// ── Invite codes ─────────────────────────────────────────────────────────────

describe("formatInviteCode", () => {
  it("groups an 8-character code as XXXX-XXXX", () => {
    expect(formatInviteCode("abcd1234")).toBe("ABCD-1234");
  });

  it("trims and uppercases before formatting", () => {
    expect(formatInviteCode("  abcd1234  ")).toBe("ABCD-1234");
  });

  it("returns a non-8-character code unchanged (uppercased)", () => {
    expect(formatInviteCode("short")).toBe("SHORT");
  });
});

describe("isValidInviteCodeInput", () => {
  it("rejects blank/whitespace-only input", () => {
    expect(isValidInviteCodeInput("")).toBe(false);
    expect(isValidInviteCodeInput("   ")).toBe(false);
  });

  it("accepts non-empty input", () => {
    expect(isValidInviteCodeInput("ABCD1234")).toBe(true);
  });
});

// ── Participants ─────────────────────────────────────────────────────────────

describe("myParticipant", () => {
  it("finds the participant matching the given user id", () => {
    const participants = [makeParticipant({ id: "p1", user_id: "u1" }), makeParticipant({ id: "p2", user_id: "u2" })];
    expect(myParticipant(participants, "u2")?.id).toBe("p2");
  });

  it("returns undefined when no participant matches", () => {
    const participants = [makeParticipant({ user_id: "u1" })];
    expect(myParticipant(participants, "stranger")).toBeUndefined();
  });

  it("returns undefined for a null/undefined user id", () => {
    const participants = [makeParticipant({ user_id: "u1" })];
    expect(myParticipant(participants, null)).toBeUndefined();
    expect(myParticipant(participants, undefined)).toBeUndefined();
  });
});

describe("isRoomOwner", () => {
  it("is true when the user id matches owner_user_id", () => {
    expect(isRoomOwner(makeRoom({ owner_user_id: "owner-1" }), "owner-1")).toBe(true);
  });

  it("is false for a non-owner or missing user id", () => {
    expect(isRoomOwner(makeRoom({ owner_user_id: "owner-1" }), "u2")).toBe(false);
    expect(isRoomOwner(makeRoom({ owner_user_id: "owner-1" }), null)).toBe(false);
  });
});

describe("joinedParticipants", () => {
  it("filters to only status='joined' rows", () => {
    const participants = [
      makeParticipant({ id: "p1", status: "joined" }),
      makeParticipant({ id: "p2", status: "invited" }),
      makeParticipant({ id: "p3", status: "left" }),
    ];
    const joined = joinedParticipants(participants);
    expect(joined.map((p) => p.id)).toEqual(["p1"]);
  });
});

// ── Turn gating ──────────────────────────────────────────────────────────────

describe("canSubmitCurrentTurn", () => {
  it("allows the owner when joined and on the matching side", () => {
    const p = makeParticipant({ role: "owner", side: "pro", status: "joined" });
    expect(canSubmitCurrentTurn(p, "pro")).toBe(true);
  });

  it("allows a partner (debater_b) sharing the same side", () => {
    const p = makeParticipant({ role: "debater_b", side: "pro", status: "joined" });
    expect(canSubmitCurrentTurn(p, "pro")).toBe(true);
  });

  it("rejects a participant assigned to the wrong side", () => {
    const p = makeParticipant({ role: "debater_a", side: "con", status: "joined" });
    expect(canSubmitCurrentTurn(p, "pro")).toBe(false);
  });

  it("rejects an observer regardless of side", () => {
    const p = makeParticipant({ role: "observer", side: "pro", status: "joined" });
    expect(canSubmitCurrentTurn(p, "pro")).toBe(false);
  });

  it("rejects a coach regardless of side", () => {
    const p = makeParticipant({ role: "coach", side: "pro", status: "joined" });
    expect(canSubmitCurrentTurn(p, "pro")).toBe(false);
  });

  it("rejects a participant who hasn't joined (invited/left)", () => {
    const invited = makeParticipant({ role: "debater_a", side: "pro", status: "invited" });
    const left = makeParticipant({ role: "debater_a", side: "pro", status: "left" });
    expect(canSubmitCurrentTurn(invited, "pro")).toBe(false);
    expect(canSubmitCurrentTurn(left, "pro")).toBe(false);
  });

  it("rejects when there is no participant record at all", () => {
    expect(canSubmitCurrentTurn(undefined, "pro")).toBe(false);
  });

  it("rejects an unassigned (null side) participant", () => {
    const p = makeParticipant({ role: "debater_a", side: undefined, status: "joined" });
    expect(canSubmitCurrentTurn(p, "pro")).toBe(false);
  });

  // ── Phase 9C: speaker slot ─────────────────────────────────────────────────

  it("allows a participant whose assigned slot matches the expected slot", () => {
    const p = makeParticipant({ role: "debater_a", side: "pro", status: "joined", speaker_slot: "first" });
    expect(canSubmitCurrentTurn(p, "pro", "first")).toBe(true);
  });

  it("rejects a participant whose assigned slot does not match the expected slot", () => {
    const p = makeParticipant({ role: "debater_a", side: "pro", status: "joined", speaker_slot: "second" });
    expect(canSubmitCurrentTurn(p, "pro", "first")).toBe(false);
  });

  it("a flex (unassigned slot) participant matches any expected slot", () => {
    const p = makeParticipant({ role: "debater_a", side: "pro", status: "joined", speaker_slot: undefined });
    expect(canSubmitCurrentTurn(p, "pro", "first")).toBe(true);
    expect(canSubmitCurrentTurn(p, "pro", "second")).toBe(true);
  });

  it("an assigned slot still matches when the phase has no slot requirement", () => {
    const p = makeParticipant({ role: "debater_a", side: "pro", status: "joined", speaker_slot: "second" });
    expect(canSubmitCurrentTurn(p, "pro", undefined)).toBe(true);
  });

  it("wrong side is still rejected regardless of slot", () => {
    const p = makeParticipant({ role: "debater_a", side: "con", status: "joined", speaker_slot: "first" });
    expect(canSubmitCurrentTurn(p, "pro", "first")).toBe(false);
  });
});

describe("disabledSubmitReason", () => {
  it("returns null when submission is allowed", () => {
    const p = makeParticipant({ role: "debater_a", side: "pro", status: "joined" });
    expect(disabledSubmitReason(p, "pro")).toBeNull();
  });

  it("explains observer restriction", () => {
    const p = makeParticipant({ role: "observer", side: undefined, status: "joined" });
    expect(disabledSubmitReason(p, "pro")).toMatch(/observer/i);
  });

  it("explains coach restriction", () => {
    const p = makeParticipant({ role: "coach", side: undefined, status: "joined" });
    expect(disabledSubmitReason(p, "pro")).toMatch(/coach/i);
  });

  it("explains an unassigned side", () => {
    const p = makeParticipant({ role: "debater_a", side: undefined, status: "joined" });
    expect(disabledSubmitReason(p, "pro")).toMatch(/assign/i);
  });

  it("explains a wrong-side assignment by naming both sides", () => {
    const p = makeParticipant({ role: "debater_a", side: "con", status: "joined" });
    const reason = disabledSubmitReason(p, "pro");
    expect(reason).toMatch(/Con/);
    expect(reason).toMatch(/Pro/);
  });

  it("explains a missing participant record without inventing a false certainty", () => {
    expect(disabledSubmitReason(undefined, "pro")).toMatch(/not an active participant/i);
  });

  // ── Phase 9C: speaker slot ─────────────────────────────────────────────────

  it("explains a wrong-slot mismatch by naming both slots", () => {
    const p = makeParticipant({ role: "debater_a", side: "pro", status: "joined", speaker_slot: "second" });
    const reason = disabledSubmitReason(p, "pro", "first");
    expect(reason).toMatch(/second/i);
    expect(reason).toMatch(/first/i);
  });

  it("returns null for a flex participant regardless of the expected slot", () => {
    const p = makeParticipant({ role: "debater_a", side: "pro", status: "joined", speaker_slot: undefined });
    expect(disabledSubmitReason(p, "pro", "first")).toBeNull();
    expect(disabledSubmitReason(p, "pro", "second")).toBeNull();
  });
});

// ── Phase 9B: round-content actions ─────────────────────────────────────────

describe("canPerformRoundAction", () => {
  it("allows the owner", () => {
    const p = makeParticipant({ role: "owner", status: "joined" });
    expect(canPerformRoundAction(p)).toBe(true);
  });

  it("allows a joined debater regardless of side", () => {
    const p = makeParticipant({ role: "debater_b", side: "con", status: "joined" });
    expect(canPerformRoundAction(p)).toBe(true);
  });

  it("rejects a coach", () => {
    const p = makeParticipant({ role: "coach", status: "joined" });
    expect(canPerformRoundAction(p)).toBe(false);
  });

  it("rejects an observer", () => {
    const p = makeParticipant({ role: "observer", status: "joined" });
    expect(canPerformRoundAction(p)).toBe(false);
  });

  it("rejects a participant who hasn't joined", () => {
    const p = makeParticipant({ role: "debater_a", status: "invited" });
    expect(canPerformRoundAction(p)).toBe(false);
  });

  it("rejects when there is no participant record", () => {
    expect(canPerformRoundAction(undefined)).toBe(false);
  });
});

// ── Phase 9D: general-action disabled reason (rejudge, etc.) ───────────────

describe("generalActionDisabledReason", () => {
  it("returns null for the owner", () => {
    const p = makeParticipant({ role: "owner", status: "joined" });
    expect(generalActionDisabledReason(p)).toBeNull();
  });

  it("returns null for a joined debater", () => {
    const p = makeParticipant({ role: "debater_b", side: "con", status: "joined" });
    expect(generalActionDisabledReason(p)).toBeNull();
  });

  it("explains coach restriction", () => {
    const p = makeParticipant({ role: "coach", status: "joined" });
    expect(generalActionDisabledReason(p)).toMatch(/coach/i);
  });

  it("explains observer restriction", () => {
    const p = makeParticipant({ role: "observer", status: "joined" });
    expect(generalActionDisabledReason(p)).toMatch(/observer/i);
  });

  it("explains a participant who hasn't joined", () => {
    const p = makeParticipant({ role: "debater_a", status: "invited" });
    expect(generalActionDisabledReason(p)).toMatch(/not an active participant/i);
  });

  it("explains a missing participant record without inventing a false certainty", () => {
    expect(generalActionDisabledReason(undefined)).toMatch(/not an active participant/i);
  });

  it("never includes a raw id in the reason text", () => {
    const p = makeParticipant({ id: "p-secret-123", role: "coach", status: "joined" });
    expect(generalActionDisabledReason(p)).not.toMatch(/p-secret-123/);
  });
});

describe("describeCapabilities", () => {
  it("describes a joined debater on the matching side", () => {
    const p = makeParticipant({ role: "debater_a", side: "pro", status: "joined" });
    const desc = describeCapabilities(p, "pro");
    expect(desc).toMatch(/Debater A/);
    expect(desc).toMatch(/Pro/);
  });

  it("describes an observer as watch-only", () => {
    const p = makeParticipant({ role: "observer", side: undefined, status: "joined" });
    expect(describeCapabilities(p, "pro")).toMatch(/watch/i);
  });

  it("describes a coach's review/notes capability, distinct from an observer", () => {
    const coachDesc = describeCapabilities(makeParticipant({ role: "coach", side: undefined, status: "joined" }), "pro");
    const observerDesc = describeCapabilities(makeParticipant({ role: "observer", side: undefined, status: "joined" }), "pro");
    expect(coachDesc).toMatch(/notes/i);
    expect(coachDesc).not.toBe(observerDesc);
  });

  it("describes an unassigned debater as needing a side assignment", () => {
    const p = makeParticipant({ role: "debater_a", side: undefined, status: "joined" });
    expect(describeCapabilities(p, "pro")).toMatch(/assign/i);
  });

  it("describes a missing/unjoined participant plainly", () => {
    expect(describeCapabilities(undefined, "pro")).toMatch(/not an active participant/i);
  });

  it("mentions the assigned speaker slot when set", () => {
    const p = makeParticipant({ role: "debater_a", side: "pro", status: "joined", speaker_slot: "first" });
    expect(describeCapabilities(p, "pro")).toMatch(/first speaker/i);
  });
});

// ── Phase 9C: speaker slots ──────────────────────────────────────────────────

describe("SPEAKER_SLOT_LABELS / speakerSlotLabel", () => {
  it("has a label for both slot values", () => {
    expect(SPEAKER_SLOT_LABELS.first).toBe("First Speaker");
    expect(SPEAKER_SLOT_LABELS.second).toBe("Second Speaker");
  });

  it("labels null/undefined as flex, not a missing value", () => {
    expect(speakerSlotLabel(null)).toBe("Either Speaker");
    expect(speakerSlotLabel(undefined)).toBe("Either Speaker");
  });

  it("labels first/second directly", () => {
    expect(speakerSlotLabel("first")).toBe("First Speaker");
    expect(speakerSlotLabel("second")).toBe("Second Speaker");
  });
});

describe("expectedSpeakerLabel", () => {
  it("names side and slot together", () => {
    expect(expectedSpeakerLabel("pro", "first")).toBe("Pro First Speaker");
    expect(expectedSpeakerLabel("con", "second")).toBe("Con Second Speaker");
  });

  it("falls back to 'Either debater' when there is no slot requirement", () => {
    expect(expectedSpeakerLabel("pro", undefined)).toBe("Either debater on Pro");
    expect(expectedSpeakerLabel("pro", null)).toBe("Either debater on Pro");
  });
});

// ── Phase 9B: turn_context end-to-end through the label helpers ────────────

describe("RoundRoomStateResponse turn_context shape", () => {
  function makeRoomState(overrides: Partial<RoundRoomStateResponse> = {}): RoundRoomStateResponse {
    const room = makeRoom();
    const viewer = makeParticipant();
    return {
      room,
      participants: [viewer],
      viewer_participant: viewer,
      turn_context: {
        can_submit_current_turn: true,
        expected_side: "pro",
        expected_role: "debater",
      },
      ...overrides,
    };
  }

  it("a can-submit turn_context matches canSubmitCurrentTurn for the same participant", () => {
    const state = makeRoomState();
    const viewer = state.participants[0];
    expect(state.turn_context?.can_submit_current_turn).toBe(true);
    expect(canSubmitCurrentTurn(viewer, "pro")).toBe(true);
  });

  it("a disabled turn_context carries a human-readable reason", () => {
    const state = makeRoomState({
      turn_context: {
        can_submit_current_turn: false,
        disabled_reason: "Observers can watch the round but can't submit speeches or crossfire answers.",
        expected_side: "pro",
        expected_role: "debater",
      },
    });
    expect(state.turn_context?.can_submit_current_turn).toBe(false);
    expect(state.turn_context?.disabled_reason).toMatch(/observer/i);
  });

  it("turn_context is optional — a solo-shaped response can omit it entirely", () => {
    const state = makeRoomState({ turn_context: undefined });
    expect(state.turn_context).toBeUndefined();
  });
});

// ── Phase 9E: room lifecycle ─────────────────────────────────────────────────

describe("isRoomClosed", () => {
  it("is true only for status='closed'", () => {
    expect(isRoomClosed(makeRoom({ status: "closed" }))).toBe(true);
    expect(isRoomClosed(makeRoom({ status: "waiting" }))).toBe(false);
    expect(isRoomClosed(makeRoom({ status: "active" }))).toBe(false);
    expect(isRoomClosed(makeRoom({ status: "completed" }))).toBe(false);
  });
});

describe("canManageRoomLifecycle", () => {
  it("allows the owner of an open room", () => {
    const room = makeRoom({ owner_user_id: "owner-1", status: "waiting" });
    expect(canManageRoomLifecycle(room, "owner-1")).toBe(true);
  });

  it("rejects the owner once the room is closed", () => {
    const room = makeRoom({ owner_user_id: "owner-1", status: "closed" });
    expect(canManageRoomLifecycle(room, "owner-1")).toBe(false);
  });

  it("rejects a non-owner regardless of room status", () => {
    const room = makeRoom({ owner_user_id: "owner-1", status: "waiting" });
    expect(canManageRoomLifecycle(room, "u2")).toBe(false);
  });

  it("rejects a missing user id", () => {
    const room = makeRoom({ owner_user_id: "owner-1", status: "waiting" });
    expect(canManageRoomLifecycle(room, null)).toBe(false);
  });
});

describe("canLeaveRoom", () => {
  const room = makeRoom({ owner_user_id: "owner-1" });

  it("allows a joined non-owner participant", () => {
    const p = makeParticipant({ user_id: "u2", status: "joined" });
    expect(canLeaveRoom(p, room, "u2")).toBe(true);
  });

  it("rejects the owner", () => {
    const p = makeParticipant({ user_id: "owner-1", role: "owner", status: "joined" });
    expect(canLeaveRoom(p, room, "owner-1")).toBe(false);
  });

  it("rejects a participant who has already left", () => {
    const p = makeParticipant({ user_id: "u2", status: "left" });
    expect(canLeaveRoom(p, room, "u2")).toBe(false);
  });

  it("rejects when there is no participant record", () => {
    expect(canLeaveRoom(undefined, room, "u2")).toBe(false);
  });

  it("never includes a raw room or participant id in its inputs/outputs", () => {
    // canLeaveRoom returns a plain boolean -- nothing to leak by
    // construction, but confirm the room/participant ids used in these
    // fixtures never need to appear in any user-facing string this helper
    // could feed (defensive documentation of the contract).
    const p = makeParticipant({ id: "p-secret-1", user_id: "u2", status: "joined" });
    const result = canLeaveRoom(p, room, "u2");
    expect(typeof result).toBe("boolean");
  });
});

// ── Phase 9F: coach review / shared room notes ──────────────────────────────

describe("canCreateCoachNote", () => {
  const openRoom = makeRoom({ status: "waiting" });
  const closedRoom = makeRoom({ status: "closed" });

  it("allows the owner in an open room", () => {
    const p = makeParticipant({ role: "owner", status: "joined" });
    expect(canCreateCoachNote(p, openRoom)).toBe(true);
  });

  it("allows a joined coach in an open room", () => {
    const p = makeParticipant({ role: "coach", side: undefined, status: "joined" });
    expect(canCreateCoachNote(p, openRoom)).toBe(true);
  });

  it("rejects a debater", () => {
    const p = makeParticipant({ role: "debater_a", status: "joined" });
    expect(canCreateCoachNote(p, openRoom)).toBe(false);
  });

  it("rejects an observer", () => {
    const p = makeParticipant({ role: "observer", side: undefined, status: "joined" });
    expect(canCreateCoachNote(p, openRoom)).toBe(false);
  });

  it("rejects a coach once the room is closed", () => {
    const p = makeParticipant({ role: "coach", side: undefined, status: "joined" });
    expect(canCreateCoachNote(p, closedRoom)).toBe(false);
  });

  it("rejects a participant who isn't joined", () => {
    const p = makeParticipant({ role: "coach", side: undefined, status: "invited" });
    expect(canCreateCoachNote(p, openRoom)).toBe(false);
  });

  it("rejects when there is no participant record", () => {
    expect(canCreateCoachNote(undefined, openRoom)).toBe(false);
  });
});

describe("canReadCoachNotes", () => {
  it("allows any joined participant, including observers", () => {
    expect(canReadCoachNotes(makeParticipant({ role: "observer", side: undefined, status: "joined" }))).toBe(true);
    expect(canReadCoachNotes(makeParticipant({ role: "debater_a", status: "joined" }))).toBe(true);
  });

  it("rejects a non-joined or missing participant", () => {
    expect(canReadCoachNotes(makeParticipant({ status: "invited" }))).toBe(false);
    expect(canReadCoachNotes(undefined)).toBe(false);
  });
});

describe("coachNoteDisabledReason", () => {
  it("returns null when creation is allowed", () => {
    const p = makeParticipant({ role: "coach", side: undefined, status: "joined" });
    expect(coachNoteDisabledReason(p, makeRoom({ status: "waiting" }))).toBeNull();
  });

  it("explains a missing/unjoined participant", () => {
    expect(coachNoteDisabledReason(undefined, makeRoom())).toMatch(/not an active participant/i);
  });

  it("explains a closed room", () => {
    const p = makeParticipant({ role: "coach", side: undefined, status: "joined" });
    expect(coachNoteDisabledReason(p, makeRoom({ status: "closed" }))).toMatch(/closed/i);
  });

  it("explains that observers can read but not add", () => {
    const p = makeParticipant({ role: "observer", side: undefined, status: "joined" });
    expect(coachNoteDisabledReason(p, makeRoom({ status: "waiting" }))).toMatch(/observers/i);
  });

  it("explains that a debater isn't the owner or a coach", () => {
    const p = makeParticipant({ role: "debater_a", status: "joined" });
    expect(coachNoteDisabledReason(p, makeRoom({ status: "waiting" }))).toMatch(/owner or a coach/i);
  });
});

describe("coachNoteTypeLabel / COACH_NOTE_TYPE_LABELS", () => {
  it("has a label for every note type", () => {
    expect(COACH_NOTE_TYPE_LABELS.general).toBe("General");
    expect(COACH_NOTE_TYPE_LABELS.flow).toBe("Flow");
    expect(COACH_NOTE_TYPE_LABELS.crossfire).toBe("Crossfire");
    expect(COACH_NOTE_TYPE_LABELS.drill).toBe("Drill");
    expect(COACH_NOTE_TYPE_LABELS.ballot).toBe("Ballot");
  });

  it("resolves each valid note type", () => {
    expect(coachNoteTypeLabel("flow")).toBe("Flow");
    expect(coachNoteTypeLabel("ballot")).toBe("Ballot");
  });

  it("falls back to General for missing/unknown values", () => {
    expect(coachNoteTypeLabel(undefined)).toBe("General");
    expect(coachNoteTypeLabel(null)).toBe("General");
  });
});
