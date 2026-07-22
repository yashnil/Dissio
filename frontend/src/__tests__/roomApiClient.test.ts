/**
 * Pass 27 — Phase 9A. Tests for the typed roomApi client.
 *
 * Tests:
 * - No raw fetch() calls
 * - No user_id ever sent in a request body (identity comes from the bearer
 *   token via apiFetch, matching roundApi.ts's convention)
 * - All exports are functions using apiFetch
 * - Exact route strings
 * - joinRoom uppercases the invite code before sending it
 */

import * as roomApi from "@/lib/roomApi";

const mockApiFetch = jest.fn().mockResolvedValue({});
jest.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {
    status: number;
    isNetworkError: boolean;
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
      this.isNetworkError = false;
    }
  },
}));

describe("roomApi client", () => {
  beforeEach(() => {
    mockApiFetch.mockClear();
  });

  it("does not use raw fetch()", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../lib/roomApi.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/\bfetch\(/);
  });

  it("uses apiFetch exclusively", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../lib/roomApi.ts"),
      "utf8",
    );
    expect(src).toContain("apiFetch");
  });

  it("exports all room functions", () => {
    expect(typeof roomApi.createRoom).toBe("function");
    expect(typeof roomApi.getRoom).toBe("function");
    expect(typeof roomApi.joinRoom).toBe("function");
    expect(typeof roomApi.listRoomParticipants).toBe("function");
    expect(typeof roomApi.updateRoomParticipant).toBe("function");
    expect(typeof roomApi.leaveRoom).toBe("function");
  });

  it("createRoom posts to /round-simulations/rooms with no user_id", async () => {
    await roomApi.createRoom({ roundId: "r1", title: "My room" });
    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/rooms");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body).not.toHaveProperty("user_id");
    expect(body.round_id).toBe("r1");
    expect(body.title).toBe("My room");
  });

  it("getRoom fetches the exact room route", async () => {
    await roomApi.getRoom("room-1");
    const [path] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/rooms/room-1");
  });

  it("joinRoom uppercases and trims the invite code, sends no user_id", async () => {
    await roomApi.joinRoom("  abcd1234  ", "Alex");
    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/rooms/join");
    const body = JSON.parse(opts.body as string);
    expect(body.invite_code).toBe("ABCD1234");
    expect(body.display_name).toBe("Alex");
    expect(body).not.toHaveProperty("user_id");
  });

  it("listRoomParticipants fetches the exact participants route", async () => {
    await roomApi.listRoomParticipants("room-1");
    const [path] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/rooms/room-1/participants");
  });

  it("updateRoomParticipant PATCHes the exact route with no user_id", async () => {
    await roomApi.updateRoomParticipant("room-1", "p2", { role: "debater_a", side: "pro" });
    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/rooms/room-1/participants/p2");
    expect(opts.method).toBe("PATCH");
    const body = JSON.parse(opts.body as string);
    expect(body.role).toBe("debater_a");
    expect(body.side).toBe("pro");
    expect(body).not.toHaveProperty("user_id");
  });

  it("leaveRoom posts to the exact leave route", async () => {
    await roomApi.leaveRoom("room-1");
    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/rooms/room-1/leave");
    expect(opts.method).toBe("POST");
  });
});
