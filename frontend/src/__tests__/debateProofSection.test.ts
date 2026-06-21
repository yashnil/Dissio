/**
 * Unit tests for DebateProofSection data model.
 *
 * All imports are pure data exports — no DOM required.
 */

import {
  DECISIVE_MOMENT_NODES,
  BALLOT_EXCERPT,
  DRILL_CARD_DATA,
  BEFORE_SPEECH,
  AFTER_SPEECH,
  type FlowNode,
  type NodeStatus,
} from "@/components/marketing/DebateProofSection";

// ── Decisive moment nodes ─────────────────────────────────────────────────────

describe("DECISIVE_MOMENT_NODES — structural integrity", () => {
  test("exports exactly 5 nodes (CWEIV)", () => {
    expect(DECISIVE_MOMENT_NODES).toHaveLength(5);
  });

  test("node roles are CLAIM, EVIDENCE, WARRANT, IMPACT, WEIGHING in order", () => {
    const roles = DECISIVE_MOMENT_NODES.map((n) => n.role);
    expect(roles).toEqual(["CLAIM", "EVIDENCE", "WARRANT", "IMPACT", "WEIGHING"]);
  });

  test("each node has a valid status and non-empty excerpt", () => {
    const VALID: NodeStatus[] = ["strong", "weak", "missing"];
    for (const node of DECISIVE_MOMENT_NODES) {
      expect(VALID).toContain(node.status);
      expect(node.excerpt.length).toBeGreaterThan(0);
    }
  });

  test("WEIGHING node is 'missing' — the decisive gap", () => {
    const weighing = DECISIVE_MOMENT_NODES.find((n) => n.role === "WEIGHING");
    expect(weighing).toBeDefined();
    expect(weighing!.status).toBe("missing");
  });

  test("WARRANT node is 'weak' — consistent with SpeechFlowSection narrative", () => {
    const warrant = DECISIVE_MOMENT_NODES.find((n) => n.role === "WARRANT");
    expect(warrant).toBeDefined();
    expect(warrant!.status).toBe("weak");
  });

  test("CLAIM, EVIDENCE, IMPACT are all 'strong'", () => {
    const strong = ["CLAIM", "EVIDENCE", "IMPACT"];
    for (const role of strong) {
      const node = DECISIVE_MOMENT_NODES.find((n) => n.role === role);
      expect(node).toBeDefined();
      expect(node!.status).toBe("strong");
    }
  });

  test("node IDs (roles) are unique", () => {
    const roles = DECISIVE_MOMENT_NODES.map((n) => n.role);
    expect(new Set(roles).size).toBe(DECISIVE_MOMENT_NODES.length);
  });
});

// ── Ballot excerpt ─────────────────────────────────────────────────────────────

describe("BALLOT_EXCERPT", () => {
  test("is a non-empty string", () => {
    expect(typeof BALLOT_EXCERPT).toBe("string");
    expect(BALLOT_EXCERPT.length).toBeGreaterThan(20);
  });

  test("references the weighing gap explicitly", () => {
    expect(BALLOT_EXCERPT.toLowerCase()).toMatch(/weigh/);
  });
});

// ── Drill card ────────────────────────────────────────────────────────────────

describe("DRILL_CARD_DATA — structural integrity", () => {
  test("has a non-empty step, type, prompt, target, and durationLabel", () => {
    expect(DRILL_CARD_DATA.step.length).toBeGreaterThan(0);
    expect(DRILL_CARD_DATA.type.length).toBeGreaterThan(0);
    expect(DRILL_CARD_DATA.prompt.length).toBeGreaterThan(20);
    expect(DRILL_CARD_DATA.target.length).toBeGreaterThan(0);
    expect(DRILL_CARD_DATA.durationLabel.length).toBeGreaterThan(0);
  });

  test("prompt references the specific figures ($8K, five-year, timeframe)", () => {
    const prompt = DRILL_CARD_DATA.prompt.toLowerCase();
    expect(prompt).toMatch(/\$8k|8,?000|\$8/);
    expect(prompt).toMatch(/five.year|5.year|timeframe/);
  });

  test("type contains 'weighing' — targets the identified gap", () => {
    expect(DRILL_CARD_DATA.type.toLowerCase()).toMatch(/weigh/);
  });
});

// ── Before / After speeches ───────────────────────────────────────────────────

describe("BEFORE_SPEECH and AFTER_SPEECH — content differentiation", () => {
  test("both have non-empty label, timestamp, and excerpt", () => {
    for (const speech of [BEFORE_SPEECH, AFTER_SPEECH]) {
      expect(speech.label.length).toBeGreaterThan(0);
      expect(speech.timestamp.length).toBeGreaterThan(0);
      expect(speech.excerpt.length).toBeGreaterThan(20);
    }
  });

  test("excerpts are distinct", () => {
    expect(BEFORE_SPEECH.excerpt).not.toBe(AFTER_SPEECH.excerpt);
  });

  test("BEFORE_SPEECH has no added behaviors", () => {
    expect(BEFORE_SPEECH.added).toHaveLength(0);
  });

  test("AFTER_SPEECH has at least 3 added behaviors", () => {
    expect(AFTER_SPEECH.added.length).toBeGreaterThanOrEqual(3);
  });

  test("AFTER_SPEECH added behaviors include 'Weighing'", () => {
    expect(AFTER_SPEECH.added).toContain("Weighing");
  });

  test("AFTER_SPEECH added behaviors include 'Timeframe comparison'", () => {
    expect(AFTER_SPEECH.added).toContain("Timeframe comparison");
  });

  test("AFTER_SPEECH excerpt contains explicit timeframe comparison language", () => {
    const lower = AFTER_SPEECH.excerpt.toLowerCase();
    expect(lower).toMatch(/year|timeframe|outweigh/);
  });

  test("BEFORE_SPEECH excerpt does not include timeframe comparison language", () => {
    const lower = BEFORE_SPEECH.excerpt.toLowerCase();
    expect(lower).not.toMatch(/outweigh/);
  });
});

// ── Narrative continuity ──────────────────────────────────────────────────────

describe("Narrative continuity — C1 Economic Burden Shift", () => {
  test("decisive moment nodes reference same economic argument (municipality/cost/burden)", () => {
    const allExcerpts = DECISIVE_MOMENT_NODES.map((n) => n.excerpt.toLowerCase()).join(" ");
    expect(allExcerpts).toMatch(/municipal|cost|burden/);
  });

  test("drill prompt references same figures as JudgeLensSection corrections ($8K / five-year return)", () => {
    const prompt = DRILL_CARD_DATA.prompt;
    expect(prompt).toMatch(/\$8K/i);
    expect(prompt).toMatch(/five.year/i);
  });

  test("after speech excerpt mentions the timeframe comparison the drill prescribes", () => {
    const excerpt = AFTER_SPEECH.excerpt.toLowerCase();
    expect(excerpt).toMatch(/year|five/);
  });
});
