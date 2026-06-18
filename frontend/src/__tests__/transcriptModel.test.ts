import {
  segmentTranscript,
  searchSegments,
  annotateSegment,
  countFillers,
  estimateReadTime,
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
