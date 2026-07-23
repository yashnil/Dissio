/**
 * Pass 16.5 — Tests for the typed roundApi client.
 *
 * Tests:
 * - No raw fetch() calls
 * - No PLACEHOLDER_USER_ID
 * - All exports are functions using apiFetch
 * - Adaptation review functions exist
 * - Student crossfire question function exists
 * - Idempotency key forwarded correctly
 */

import * as roundApi from "@/lib/roundApi";

// Mock apiFetch so we can inspect calls without a network
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

describe("roundApi client", () => {
  beforeEach(() => {
    mockApiFetch.mockClear();
  });

  // ── No raw fetch / placeholder ─────────────────────────────────────────────

  it("does not contain PLACEHOLDER_USER_ID", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../lib/roundApi.ts"),
      "utf8",
    );
    expect(src).not.toContain("PLACEHOLDER_USER_ID");
    expect(src).not.toContain("placeholder-user-id");
  });

  it("does not use raw fetch()", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../lib/roundApi.ts"),
      "utf8",
    );
    // Should not contain "fetch(" — apiFetch is used instead
    expect(src).not.toMatch(/\bfetch\(/);
  });

  it("uses apiFetch exclusively", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../lib/roundApi.ts"),
      "utf8",
    );
    expect(src).toContain("apiFetch");
  });

  // ── Exported functions ─────────────────────────────────────────────────────

  it("exports createRound as a function", () => {
    expect(typeof roundApi.createRound).toBe("function");
  });

  it("exports getRoundState as a function", () => {
    expect(typeof roundApi.getRoundState).toBe("function");
  });

  it("exports startRound as a function", () => {
    expect(typeof roundApi.startRound).toBe("function");
  });

  it("exports pauseRound as a function", () => {
    expect(typeof roundApi.pauseRound).toBe("function");
  });

  it("exports resumeRound as a function", () => {
    expect(typeof roundApi.resumeRound).toBe("function");
  });

  it("exports listRounds as a function", () => {
    expect(typeof roundApi.listRounds).toBe("function");
  });

  it("exports submitStudentSpeech as a function", () => {
    expect(typeof roundApi.submitStudentSpeech).toBe("function");
  });

  it("exports generateOpponentSpeech as a function", () => {
    expect(typeof roundApi.generateOpponentSpeech).toBe("function");
  });

  it("exports getCrossfireQuestion as a function", () => {
    expect(typeof roundApi.getCrossfireQuestion).toBe("function");
  });

  it("exports submitCrossfireAnswer as a function", () => {
    expect(typeof roundApi.submitCrossfireAnswer).toBe("function");
  });

  it("exports submitStudentCrossfireQuestion as a function", () => {
    expect(typeof roundApi.submitStudentCrossfireQuestion).toBe("function");
  });

  it("exports advancePhase as a function", () => {
    expect(typeof roundApi.advancePhase).toBe("function");
  });

  it("exports generateDecision as a function", () => {
    expect(typeof roundApi.generateDecision).toBe("function");
  });

  it("exports rejudgeRound as a function", () => {
    expect(typeof roundApi.rejudgeRound).toBe("function");
  });

  it("exports generateDrills as a function", () => {
    expect(typeof roundApi.generateDrills).toBe("function");
  });

  it("exports getRoundDrills as a function", () => {
    expect(typeof roundApi.getRoundDrills).toBe("function");
  });

  it("exports submitRoundDrillAttempt as a function", () => {
    expect(typeof roundApi.submitRoundDrillAttempt).toBe("function");
  });

  it("exports getRoundDrillAttempts as a function", () => {
    expect(typeof roundApi.getRoundDrillAttempts).toBe("function");
  });

  it("submitRoundDrillAttempt calls correct route with no user_id in body", async () => {
    await roundApi.submitRoundDrillAttempt("r-1", "drill-1", "My attempt text.");
    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/r-1/drills/drill-1/attempts");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.response_text).toBe("My attempt text.");
    expect(body.round_id).toBe("r-1");
    expect(body).not.toHaveProperty("user_id");
  });

  it("getRoundDrillAttempts calls GET correct route", async () => {
    await roundApi.getRoundDrillAttempts("r-1", "drill-1");
    const [path] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/r-1/drills/drill-1/attempts");
  });

  it("exports getRoundFlow as a function", () => {
    expect(typeof roundApi.getRoundFlow).toBe("function");
  });

  it("exports createAdaptationReview as a function", () => {
    expect(typeof roundApi.createAdaptationReview).toBe("function");
  });

  it("exports listAdaptationReviews as a function", () => {
    expect(typeof roundApi.listAdaptationReviews).toBe("function");
  });

  // ── Route construction ─────────────────────────────────────────────────────

  it("createRound calls POST /round-simulations", async () => {
    const config = {
      format: "full",
      student_side: "pro",
      speaking_order: "first",
      speaker_role: "first",
      judge_type: "flow",
      opponent_difficulty: "jv",
      resolution: "Test resolution",
      coaching_hints_enabled: true,
      pauses_allowed: true,
      practice_mode_overrides: [],
      constructive_time: 240,
      rebuttal_time: 240,
      summary_time: 180,
      final_focus_time: 120,
      crossfire_time: 180,
      prep_time: 120,
      approved_card_ids: [],
      approved_blockfile_ids: [],
      approved_frontline_ids: [],
      source_scope: "personal",
      evidence_testing_mode: false,
    } as any;
    await roundApi.createRound(config);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/round-simulations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("getRoundState calls GET /round-simulations/:id", async () => {
    await roundApi.getRoundState("r-123");
    expect(mockApiFetch).toHaveBeenCalledWith("/round-simulations/r-123");
  });

  it("startRound calls POST /round-simulations/:id/start", async () => {
    await roundApi.startRound("r-abc");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/round-simulations/r-abc/start",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("submitStudentSpeech passes idempotency key in body", async () => {
    await roundApi.submitStudentSpeech("r-1", "first_constructive", {
      transcriptText: "My speech",
      idempotencyKey: "student-r-1-first_constructive",
    });
    const [_path, opts] = mockApiFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.idempotency_key).toBe("student-r-1-first_constructive");
    expect(body.transcript_text).toBe("My speech");
    expect(body).not.toHaveProperty("user_id");
  });

  it("generateOpponentSpeech passes idempotency key in body", async () => {
    await roundApi.generateOpponentSpeech("r-1", "second_constructive", "opponent-r-1-second_constructive");
    const [_path, opts] = mockApiFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.idempotency_key).toBe("opponent-r-1-second_constructive");
    expect(body).not.toHaveProperty("user_id");
  });

  it("submitStudentCrossfireQuestion calls correct route", async () => {
    await roundApi.submitStudentCrossfireQuestion("r-1", "What evidence supports your claim?");
    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/r-1/crossfire/student-question");
    const body = JSON.parse(opts.body);
    expect(body.question).toBe("What evidence supports your claim?");
    expect(body.round_id).toBe("r-1");
    expect(body).not.toHaveProperty("user_id");
  });

  it("exports requestCrossfireFollowUp as a function", () => {
    expect(typeof roundApi.requestCrossfireFollowUp).toBe("function");
  });

  it("requestCrossfireFollowUp calls correct route with exchange_id, no user_id", async () => {
    await roundApi.requestCrossfireFollowUp("r-1", "ex-42");
    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/r-1/crossfire/follow-up");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.exchange_id).toBe("ex-42");
    expect(body.round_id).toBe("r-1");
    expect(body).not.toHaveProperty("user_id");
  });

  it("createAdaptationReview calls correct route", async () => {
    await roundApi.createAdaptationReview("r-1", "flow", { alternateJudgeType: "truth" });
    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/r-1/adaptation-reviews");
    const body = JSON.parse(opts.body);
    expect(body.judge_type).toBe("flow");
    expect(body.alternate_judge_type).toBe("truth");
    expect(body).not.toHaveProperty("user_id");
  });

  it("listAdaptationReviews calls GET correct route", async () => {
    await roundApi.listAdaptationReviews("r-1");
    const [path] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/r-1/adaptation-reviews");
  });

  it("advancePhase does not include user_id in body", async () => {
    await roundApi.advancePhase("r-1");
    const [_path, opts] = mockApiFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body).not.toHaveProperty("user_id");
    expect(body.round_id).toBe("r-1");
  });

  it("generateDecision does not include user_id in body", async () => {
    await roundApi.generateDecision("r-1", "flow");
    const [_path, opts] = mockApiFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body).not.toHaveProperty("user_id");
    expect(body.judge_type).toBe("flow");
  });

  it("getCrossfireQuestion appends sequence query param when provided", async () => {
    await roundApi.getCrossfireQuestion("r-1", 3);
    const [path] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/r-1/crossfire/question?sequence=3");
  });

  it("getCrossfireQuestion omits sequence param when not provided", async () => {
    await roundApi.getCrossfireQuestion("r-1");
    const [path] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/r-1/crossfire/question");
  });

  it("loadPreparation does not include user_id in body", async () => {
    await roundApi.loadPreparation("r-1", { cardIds: ["c-1", "c-2"] });
    const [_path, opts] = mockApiFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body).not.toHaveProperty("user_id");
    expect(body.card_ids).toEqual(["c-1", "c-2"]);
  });

  // ── Phase 9F: coach review / shared room notes ────────────────────────────

  it("exports createCoachNote as a function", () => {
    expect(typeof roundApi.createCoachNote).toBe("function");
  });

  it("exports listCoachNotes as a function", () => {
    expect(typeof roundApi.listCoachNotes).toBe("function");
  });

  it("createCoachNote posts to the annotations route with a fixed annotation_type and no user_id", async () => {
    await roundApi.createCoachNote("r-1", { content: "Nice weighing.", noteType: "flow", phase: "first_summary" });
    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/r-1/annotations");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.round_id).toBe("r-1");
    expect(body.annotation_type).toBe("speech_note");
    expect(body.content).toBe("Nice weighing.");
    expect(body.note_type).toBe("flow");
    expect(body.phase).toBe("first_summary");
    expect(body).not.toHaveProperty("user_id");
  });

  it("createCoachNote defaults noteType/phase to null when omitted", async () => {
    await roundApi.createCoachNote("r-1", { content: "General note." });
    const [_path, opts] = mockApiFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.note_type).toBeNull();
    expect(body.phase).toBeNull();
  });

  it("listCoachNotes calls GET the same annotations route", async () => {
    await roundApi.listCoachNotes("r-1");
    const [path] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/round-simulations/r-1/annotations");
  });
});
