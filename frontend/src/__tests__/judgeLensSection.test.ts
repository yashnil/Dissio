/**
 * Unit tests for JudgeLensSection data model.
 *
 * All tests import exported constants/types — no DOM required.
 */

import {
  JUDGE_EVALUATIONS,
  type JudgeEvaluation,
  type HeardItem,
} from "@/components/marketing/JudgeLensSection";

describe("JUDGE_EVALUATIONS — structural integrity", () => {
  test("exports exactly 3 judges (flow, lay, parent)", () => {
    expect(JUDGE_EVALUATIONS).toHaveLength(3);
  });

  test("judge types are unique and match expected values", () => {
    const types = JUDGE_EVALUATIONS.map((j) => j.type);
    expect(types).toEqual(["flow", "lay", "parent"]);
    expect(new Set(types).size).toBe(3);
  });

  test("every judge has a non-empty label and tagline", () => {
    for (const j of JUDGE_EVALUATIONS) {
      expect(j.label.length).toBeGreaterThan(0);
      expect(j.tagline.length).toBeGreaterThan(0);
    }
  });

  test("every judge has exactly 3 priorities", () => {
    for (const j of JUDGE_EVALUATIONS) {
      expect(j.priorities).toHaveLength(3);
      for (const p of j.priorities) {
        expect(p.length).toBeGreaterThan(0);
      }
    }
  });

  test("every judge has exactly 5 heard items", () => {
    for (const j of JUDGE_EVALUATIONS) {
      expect(j.heard).toHaveLength(5);
    }
  });

  test("heard item labels are: Claim, Evidence, Warrant, Impact, Weighing", () => {
    const EXPECTED = ["Claim", "Evidence", "Warrant", "Impact", "Weighing"];
    for (const j of JUDGE_EVALUATIONS) {
      expect(j.heard.map((h) => h.label)).toEqual(EXPECTED);
    }
  });

  test("every heard item has a valid status and non-empty note", () => {
    const VALID: HeardItem["status"][] = ["landed", "weak", "missed"];
    for (const j of JUDGE_EVALUATIONS) {
      for (const item of j.heard) {
        expect(VALID).toContain(item.status);
        expect(item.note.length).toBeGreaterThan(0);
      }
    }
  });

  test("scores are valid numbers in range 1–100", () => {
    for (const j of JUDGE_EVALUATIONS) {
      expect(j.score).toBeGreaterThan(0);
      expect(j.score).toBeLessThanOrEqual(100);
    }
  });

  test("scores are distinct across judges", () => {
    const scores = JUDGE_EVALUATIONS.map((j) => j.score);
    expect(new Set(scores).size).toBe(3);
  });

  test("every judge has a non-empty scoreLabel", () => {
    for (const j of JUDGE_EVALUATIONS) {
      expect(j.scoreLabel.length).toBeGreaterThan(0);
    }
  });
});

describe("JUDGE_EVALUATIONS — content differentiation", () => {
  test("decisive issues are all distinct (not just label swaps)", () => {
    const issues = JUDGE_EVALUATIONS.map((j) => j.decisiveIssue);
    expect(new Set(issues).size).toBe(3);
  });

  test("ballot notes are all distinct and non-empty", () => {
    const notes = JUDGE_EVALUATIONS.map((j) => j.ballotNote);
    expect(new Set(notes).size).toBe(3);
    for (const n of notes) {
      expect(n.length).toBeGreaterThan(20);
    }
  });

  test("corrections are all distinct and actionable", () => {
    const corrections = JUDGE_EVALUATIONS.map((j) => j.correction);
    expect(new Set(corrections).size).toBe(3);
    for (const c of corrections) {
      expect(c.length).toBeGreaterThan(20);
    }
  });

  test("scoreLabels are all distinct", () => {
    const labels = JUDGE_EVALUATIONS.map((j) => j.scoreLabel);
    expect(new Set(labels).size).toBe(3);
  });
});

describe("JUDGE_EVALUATIONS — shared weakness (C1 weighing gap)", () => {
  test("Weighing is 'missed' for all three judges — shared root cause", () => {
    for (const j of JUDGE_EVALUATIONS) {
      const weighing = j.heard.find((h) => h.label === "Weighing");
      expect(weighing).toBeDefined();
      expect(weighing!.status).toBe("missed");
    }
  });

  test("flow judge has the highest score (technical precision)", () => {
    const flow = JUDGE_EVALUATIONS.find((j) => j.type === "flow")!;
    const others = JUDGE_EVALUATIONS.filter((j) => j.type !== "flow");
    for (const other of others) {
      expect(flow.score).toBeGreaterThan(other.score);
    }
  });

  test("parent judge has the lowest score (persuasion failure)", () => {
    const parent = JUDGE_EVALUATIONS.find((j) => j.type === "parent")!;
    const others = JUDGE_EVALUATIONS.filter((j) => j.type !== "parent");
    for (const other of others) {
      expect(parent.score).toBeLessThan(other.score);
    }
  });

  test("Claim 'landed' for all three judges (shared successful element)", () => {
    for (const j of JUDGE_EVALUATIONS) {
      const claim = j.heard.find((h) => h.label === "Claim");
      expect(claim).toBeDefined();
      expect(claim!.status).toBe("landed");
    }
  });
});

describe("JUDGE_EVALUATIONS — per-judge characterization", () => {
  const flow = JUDGE_EVALUATIONS.find((j) => j.type === "flow")!;
  const lay  = JUDGE_EVALUATIONS.find((j) => j.type === "lay")!;
  const parent = JUDGE_EVALUATIONS.find((j) => j.type === "parent")!;

  test("flow judge label and tagline reference technical/flow concepts", () => {
    expect(flow.label).toBe("Flow Judge");
    expect(flow.tagline.toLowerCase()).toMatch(/technical|flow|weight/);
  });

  test("lay judge label and tagline reference clarity/story", () => {
    expect(lay.label).toBe("Lay Judge");
    expect(lay.tagline.toLowerCase()).toMatch(/story|clear|accessible|impact/);
  });

  test("parent judge label and tagline reference real-world/stakes", () => {
    expect(parent.label).toBe("Parent Judge");
    expect(parent.tagline.toLowerCase()).toMatch(/real|plain|world|stakes|persuasion/);
  });

  test("flow judge Evidence is 'landed' (took the card seriously)", () => {
    const ev = flow.heard.find((h) => h.label === "Evidence")!;
    expect(ev.status).toBe("landed");
  });

  test("lay judge Evidence is 'weak' (numbers without context)", () => {
    const ev = lay.heard.find((h) => h.label === "Evidence")!;
    expect(ev.status).toBe("weak");
  });

  test("parent judge Impact is 'missed' (too abstract)", () => {
    const imp = parent.heard.find((h) => h.label === "Impact")!;
    expect(imp.status).toBe("missed");
  });
});
