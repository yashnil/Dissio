/**
 * Pass 27 — Phase 9A. Tests for room/lobby pure helpers.
 *
 * Same convention as roundModel.test.ts: no React, no DOM, pure functions
 * called directly with fixture factories.
 */

import {
  ROOM_STATUS_LABELS,
  ROOM_ROLE_LABELS,
  PARTICIPANT_STATUS_LABELS,
  isDebaterRole,
  sideLabel,
  formatInviteCode,
  isValidInviteCodeInput,
  myParticipant,
  isRoomOwner,
  joinedParticipants,
  canSubmitCurrentTurn,
  disabledSubmitReason,
} from "@/lib/roomModel";
import type { RoundRoom, RoundRoomParticipant } from "@/types/round";

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
});
