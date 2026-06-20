/**
 * Tests for reportVerdictStyles helpers.
 *
 * These ensure all static class maps contain only complete, static Tailwind
 * class strings (no template literals that would escape the purge scan).
 */

import {
  resolveGrade,
  dimColor,
  CHAIN_STYLES,
  ISSUE_STYLES,
  type IssueColor,
} from "@/lib/reportVerdictStyles";

const ISSUE_COLORS: IssueColor[] = ["danger", "warn"];

// ── resolveGrade ────────────────────────────────────────────────────────────

describe("resolveGrade", () => {
  test("null score returns 'Not scored' with hairline ring", () => {
    const g = resolveGrade(null);
    expect(g.grade).toBe("Not scored");
    expect(g.ring).toBe("border-hairline-strong");
    expect(g.glowBg).toBe("bg-hairline-strong");
    expect(g.glow).toBe("");
  });

  test("score >= 90 → Tournament-Ready with ok ring", () => {
    const g = resolveGrade(95);
    expect(g.grade).toBe("Tournament-Ready");
    expect(g.ring).toBe("border-ok");
    expect(g.glowBg).toBe("bg-ok");
  });

  test("score 80 → Strong with ok ring", () => {
    const g = resolveGrade(80);
    expect(g.grade).toBe("Strong");
    expect(g.ring).toBe("border-ok");
  });

  test("score 70 → Solid with lav ring", () => {
    const g = resolveGrade(70);
    expect(g.grade).toBe("Solid");
    expect(g.ring).toBe("border-lav");
    expect(g.glowBg).toBe("bg-lav");
  });

  test("score 60 → Developing with lav ring", () => {
    const g = resolveGrade(60);
    expect(g.grade).toBe("Developing");
    expect(g.ring).toBe("border-lav");
  });

  test("score 50 → Flawed but Complete with warn ring", () => {
    const g = resolveGrade(50);
    expect(g.grade).toBe("Flawed but Complete");
    expect(g.ring).toBe("border-warn");
    expect(g.glowBg).toBe("bg-warn");
  });

  test("score 40 → Needs Foundation with warn ring", () => {
    const g = resolveGrade(40);
    expect(g.grade).toBe("Needs Foundation");
    expect(g.ring).toBe("border-warn");
  });

  test("score < 40 → Severely Underdeveloped with danger ring", () => {
    const g = resolveGrade(30);
    expect(g.grade).toBe("Severely Underdeveloped");
    expect(g.ring).toBe("border-danger");
    expect(g.glowBg).toBe("bg-danger");
  });

  test("score 0 → Severely Underdeveloped", () => {
    const g = resolveGrade(0);
    expect(g.grade).toBe("Severely Underdeveloped");
  });

  test("ring and glowBg are always consistent (border-X → bg-X)", () => {
    for (const score of [null, 100, 90, 80, 70, 60, 50, 40, 39, 0]) {
      const g = resolveGrade(score);
      const expectedBg = g.ring.replace("border-", "bg-");
      expect(g.glowBg).toBe(expectedBg);
    }
  });

  test("no template strings in glow value — static oklch or empty", () => {
    for (const score of [null, 100, 50, 0]) {
      const g = resolveGrade(score);
      expect(typeof g.glow).toBe("string");
      expect(g.glow).not.toContain("${");
    }
  });
});

// ── dimColor ────────────────────────────────────────────────────────────────

describe("dimColor", () => {
  test("val >= 16 → bg-ok", () => expect(dimColor(16)).toBe("bg-ok"));
  test("val >= 12 → bg-lav", () => expect(dimColor(12)).toBe("bg-lav"));
  test("val >= 8 → bg-warn", () => expect(dimColor(8)).toBe("bg-warn"));
  test("val < 8 → bg-danger", () => expect(dimColor(7)).toBe("bg-danger"));
  test("val 0 → bg-danger", () => expect(dimColor(0)).toBe("bg-danger"));
  test("val 20 → bg-ok", () => expect(dimColor(20)).toBe("bg-ok"));
  test("val 15 → bg-lav (under ok threshold)", () => expect(dimColor(15)).toBe("bg-lav"));
  test("returns a static class with no template expressions", () => {
    for (const v of [0, 4, 8, 12, 16, 20]) {
      expect(dimColor(v)).not.toContain("${");
    }
  });
});

// ── CHAIN_STYLES ─────────────────────────────────────────────────────────────

describe("CHAIN_STYLES", () => {
  test.each(ISSUE_COLORS)("%s: wrapper contains correct color token", (color) => {
    expect(CHAIN_STYLES[color].wrapper).toContain(`${color}/`);
  });

  test.each(ISSUE_COLORS)("%s: label contains correct color token", (color) => {
    expect(CHAIN_STYLES[color].label).toContain(`${color}/`);
  });

  test.each(ISSUE_COLORS)("%s: chevron contains correct color token", (color) => {
    expect(CHAIN_STYLES[color].chevron).toContain(`${color}/`);
  });

  test.each(ISSUE_COLORS)("%s: pill contains correct color token", (color) => {
    expect(CHAIN_STYLES[color].pill).toContain(`${color}/`);
  });

  test.each(ISSUE_COLORS)("%s: no template strings in any field", (color) => {
    const s = CHAIN_STYLES[color];
    for (const val of Object.values(s)) {
      expect(val).not.toContain("${");
    }
  });

  test("danger and warn variants are different", () => {
    expect(CHAIN_STYLES.danger.wrapper).not.toBe(CHAIN_STYLES.warn.wrapper);
    expect(CHAIN_STYLES.danger.label).not.toBe(CHAIN_STYLES.warn.label);
  });
});

// ── ISSUE_STYLES ─────────────────────────────────────────────────────────────

describe("ISSUE_STYLES", () => {
  test.each(ISSUE_COLORS)("%s: card contains correct color token", (color) => {
    expect(ISSUE_STYLES[color].card).toContain(`${color}/`);
  });

  test.each(ISSUE_COLORS)("%s: header border contains correct color token", (color) => {
    expect(ISSUE_STYLES[color].header).toContain(`border-${color}/`);
  });

  test.each(ISSUE_COLORS)("%s: dot has bg-<color>", (color) => {
    expect(ISSUE_STYLES[color].dot).toContain(`bg-${color}`);
  });

  test.each(ISSUE_COLORS)("%s: eyebrow has text-<color>", (color) => {
    expect(ISSUE_STYLES[color].eyebrow).toContain(`text-${color}`);
  });

  test.each(ISSUE_COLORS)("%s: badge contains all three color usages", (color) => {
    const badge = ISSUE_STYLES[color].badge;
    expect(badge).toContain(`border-${color}/`);
    expect(badge).toContain(`bg-${color}/`);
    expect(badge).toContain(`text-${color}`);
  });

  test.each(ISSUE_COLORS)("%s: reco contains correct color token", (color) => {
    expect(ISSUE_STYLES[color].reco).toContain(`${color}/`);
  });

  test.each(ISSUE_COLORS)("%s: arrow has text-<color>", (color) => {
    expect(ISSUE_STYLES[color].arrow).toContain(`text-${color}`);
  });

  test.each(ISSUE_COLORS)("%s: no template strings in any field", (color) => {
    const s = ISSUE_STYLES[color];
    for (const val of Object.values(s)) {
      expect(val).not.toContain("${");
    }
  });

  test("danger and warn variants are different for every field", () => {
    const fields = Object.keys(ISSUE_STYLES.danger) as (keyof typeof ISSUE_STYLES.danger)[];
    for (const field of fields) {
      expect(ISSUE_STYLES.danger[field]).not.toBe(ISSUE_STYLES.warn[field]);
    }
  });
});
