import {
  segmentTranscript,
  searchSegments,
  annotateSegment,
  countFillers,
  estimateReadTime,
  deriveTranscriptReadiness,
  deriveTranscriptCopyState,
  deriveReRecordDecision,
} from "@/lib/transcriptModel";

describe("segmentTranscript", () => {
  it("splits on paragraph breaks", () => {
    const segs = segmentTranscript("First para.\n\nSecond para.");
    expect(segs).toHaveLength(2);
    expect(segs[1].text).toBe("Second para.");
  });

  it("falls back to sentence splitting for a single block", () => {
    const segs = segmentTranscript("We win on weighing. They dropped the turn. Vote Con.");
    expect(segs.length).toBe(3);
    expect(segs[0].wordCount).toBe(4);
  });

  it("returns nothing for empty text", () => {
    expect(segmentTranscript("   ")).toHaveLength(0);
  });
});

describe("searchSegments", () => {
  const segs = segmentTranscript("Carbon pricing works.\n\nThe jobs argument stands.");
  it("filters by case-insensitive substring", () => {
    expect(searchSegments(segs, "JOBS")).toHaveLength(1);
  });
  it("returns all for empty query", () => {
    expect(searchSegments(segs, "")).toHaveLength(2);
  });
});

describe("countFillers + annotateSegment", () => {
  it("counts filler phrases", () => {
    expect(countFillers("um, you know, it's like basically true")).toBeGreaterThanOrEqual(3);
  });

  it("marks fillers only when enabled", () => {
    const plain = annotateSegment("um we win", "", false);
    expect(plain.every((t) => t.kind === "text")).toBe(true);
    const annotated = annotateSegment("um we win", "", true);
    expect(annotated.some((t) => t.kind === "filler")).toBe(true);
  });

  it("marks search matches and preserves full text", () => {
    const tokens = annotateSegment("we win on weighing", "win", false);
    expect(tokens.some((t) => t.kind === "match" && t.text === "win")).toBe(true);
    expect(tokens.map((t) => t.text).join("")).toBe("we win on weighing");
  });
});

describe("estimateReadTime", () => {
  it("formats m:ss at ~140 wpm", () => {
    expect(estimateReadTime(140)).toBe("1:00");
    expect(estimateReadTime(70)).toBe("0:30");
  });
});

// ── deriveTranscriptReadiness ─────────────────────────────────────────────────

describe("deriveTranscriptReadiness", () => {
  it("null word count → too_short", () => {
    expect(deriveTranscriptReadiness(null)).toBe("too_short");
  });
  it("0 words → too_short", () => {
    expect(deriveTranscriptReadiness(0)).toBe("too_short");
  });
  it("24 words → too_short", () => {
    expect(deriveTranscriptReadiness(24)).toBe("too_short");
  });
  it("25 words → too_short boundary (still too short)", () => {
    // readiness boundary: < 25 → too_short, so 25 passes to next check
    expect(deriveTranscriptReadiness(25)).not.toBe("too_short");
  });
  it("25–74 words → low", () => {
    expect(deriveTranscriptReadiness(50)).toBe("low");
    expect(deriveTranscriptReadiness(74)).toBe("low");
  });
  it("75+ words → ready", () => {
    expect(deriveTranscriptReadiness(75)).toBe("ready");
    expect(deriveTranscriptReadiness(300)).toBe("ready");
  });
});

// ── deriveTranscriptCopyState ─────────────────────────────────────────────────

describe("deriveTranscriptCopyState — copy success/failure states", () => {
  it("default (not copied) shows Copy label", () => {
    const state = deriveTranscriptCopyState(false);
    expect(state.label).toBe("Copy");
  });

  it("default state has actionable aria-label", () => {
    const state = deriveTranscriptCopyState(false);
    expect(state.ariaLabel.toLowerCase()).toContain("copy");
  });

  it("copied=true shows Copied label (success state)", () => {
    const state = deriveTranscriptCopyState(true);
    expect(state.label).toBe("Copied");
  });

  it("copied=true aria-label confirms success", () => {
    const state = deriveTranscriptCopyState(true);
    expect(state.ariaLabel.toLowerCase()).toContain("copied");
  });

  it("transitions are reversible: false→true→false is stable", () => {
    const before = deriveTranscriptCopyState(false);
    const after  = deriveTranscriptCopyState(true);
    const reset  = deriveTranscriptCopyState(false);
    expect(before.label).toBe(reset.label);
    expect(after.label).not.toBe(before.label);
  });
});

// ── deriveReRecordDecision ────────────────────────────────────────────────────

describe("deriveReRecordDecision — re-record behavior", () => {
  it("shows re-record only when readiness is too_short and canReRecord=true", () => {
    expect(deriveReRecordDecision("too_short", true).show).toBe(true);
  });

  it("does not show re-record when canReRecord=false", () => {
    expect(deriveReRecordDecision("too_short", false).show).toBe(false);
  });

  it("does not show re-record when transcript is low (has some content)", () => {
    expect(deriveReRecordDecision("low", true).show).toBe(false);
  });

  it("does not show re-record when transcript is ready", () => {
    expect(deriveReRecordDecision("ready", true).show).toBe(false);
  });

  it("re-record is always marked as destructive", () => {
    expect(deriveReRecordDecision("too_short", true).isDestructive).toBe(true);
    expect(deriveReRecordDecision("too_short", false).isDestructive).toBe(true);
  });

  it("provides a label for the re-record button", () => {
    const decision = deriveReRecordDecision("too_short", true);
    expect(decision.label).toBeTruthy();
    expect(decision.label.toLowerCase()).toContain("record");
  });
});
