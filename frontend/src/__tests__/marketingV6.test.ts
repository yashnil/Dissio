/**
 * marketingV6.test.ts — Unit tests for /home-v6 "Dissio Signal Lens"
 * Covers data constants, copy validation, and helper functions.
 */

import {
  HOME_V6_SECTION_IDS,
  NAV_V6,
  HERO_V6,
  INTRO_V6,
  PIPELINE_V6,
  BALLOT_V6,
  JUDGES_V6,
  DRILL_V6,
  EVIDENCE_V6,
  PATHS_V6,
  FINAL_CTA_V6,
  hasBannedV6Language,
  isValidV6Link,
} from "@/lib/marketingV6";

// ── Section IDs ───────────────────────────────────────────────────────────────

describe("HOME_V6_SECTION_IDS", () => {
  it("all IDs start with 'v6-'", () => {
    Object.values(HOME_V6_SECTION_IDS).forEach((id) => {
      expect(id.startsWith("v6-")).toBe(true);
    });
  });

  it("has 9 distinct section IDs", () => {
    const ids = Object.values(HOME_V6_SECTION_IDS);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Validation helpers ────────────────────────────────────────────────────────

describe("hasBannedV6Language", () => {
  it("rejects banned terms", () => {
    expect(hasBannedV6Language("This is guaranteed to work")).toBe(true);
    expect(hasBannedV6Language("We offer best-in-class service")).toBe(true);
    expect(hasBannedV6Language("Dramatically Improves your score")).toBe(true);
    expect(hasBannedV6Language("trusted by thousands")).toBe(true);
  });

  it("passes clean debate copy", () => {
    expect(hasBannedV6Language("Record a speech. See the flow. Fix one thing.")).toBe(false);
  });
});

describe("isValidV6Link", () => {
  it("accepts / and # prefixes", () => {
    expect(isValidV6Link("/login")).toBe(true);
    expect(isValidV6Link("#v6-pipeline")).toBe(true);
  });

  it("rejects http:// links", () => {
    expect(isValidV6Link("http://example.com")).toBe(false);
    expect(isValidV6Link("https://example.com")).toBe(false);
  });

  it("rejects relative paths without leading slash", () => {
    expect(isValidV6Link("login")).toBe(false);
  });

  it("all NAV_V6 section hrefs pass", () => {
    NAV_V6.sections.forEach((s) => expect(isValidV6Link(s.href)).toBe(true));
  });

  it("all CTA hrefs pass", () => {
    const hrefs = [
      NAV_V6.ctaLoggedOut.primaryHref,
      NAV_V6.ctaLoggedOut.signInHref,
      NAV_V6.ctaLoggedIn.primaryHref,
      HERO_V6.ctaPrimaryHref,
      HERO_V6.ctaSecondaryHref,
      FINAL_CTA_V6.ctaPrimaryHref,
      FINAL_CTA_V6.ctaSecondaryHref,
      PATHS_V6.student.ctaHref,
      PATHS_V6.coach.ctaHref,
    ];
    hrefs.forEach((href) => expect(isValidV6Link(href)).toBe(true));
  });
});

// ── NAV_V6 ────────────────────────────────────────────────────────────────────

describe("NAV_V6", () => {
  it("has brand name 'Dissio'", () => {
    expect(NAV_V6.brand).toBe("Dissio");
  });

  it("has exactly 4 navigation sections", () => {
    expect(NAV_V6.sections).toHaveLength(4);
  });

  it("ctaLoggedOut primary href is /login", () => {
    expect(NAV_V6.ctaLoggedOut.primaryHref).toBe("/login");
  });
});

// ── INTRO_V6 ──────────────────────────────────────────────────────────────────

describe("INTRO_V6", () => {
  it("brandText is DISSIO", () => {
    expect(INTRO_V6.brandText).toBe("DISSIO");
  });

  it("has skip, annotation, next-move, and drill labels", () => {
    expect(INTRO_V6.skipLabel).toBe("Skip intro");
    expect(INTRO_V6.annotationLabel).toBe("Missing warrant");
    expect(INTRO_V6.nextMoveLabel).toBe("Next move");
    expect(INTRO_V6.drillLabel).toBe("90-second warrant extension");
  });
});

// ── PIPELINE_V6 ───────────────────────────────────────────────────────────────

describe("PIPELINE_V6", () => {
  it("has 4 stages in order", () => {
    expect(PIPELINE_V6.stages.map((s) => s.id)).toEqual(["speech", "flow", "ballot", "drill"]);
  });

  it("headline has no banned language", () => {
    expect(hasBannedV6Language(PIPELINE_V6.headline)).toBe(false);
  });
});

// ── BALLOT_V6 ─────────────────────────────────────────────────────────────────

describe("BALLOT_V6", () => {
  it("has at least one highlighted line", () => {
    const highlighted = BALLOT_V6.excerpt.lines.filter((l) => l.highlight);
    expect(highlighted.length).toBeGreaterThanOrEqual(1);
  });

  it("highlighted line has a note", () => {
    const highlighted = BALLOT_V6.excerpt.lines.find((l) => l.highlight);
    expect(highlighted).toHaveProperty("note");
  });

  it("headline and judgeNote have no banned language", () => {
    expect(hasBannedV6Language(BALLOT_V6.headline)).toBe(false);
    expect(hasBannedV6Language(BALLOT_V6.judgeNote)).toBe(false);
  });
});

// ── JUDGES_V6 ─────────────────────────────────────────────────────────────────

describe("JUDGES_V6", () => {
  it("has exactly 4 judges", () => {
    expect(JUDGES_V6.judges).toHaveLength(4);
  });

  it("each judge has rfd, drill, score, accentColor", () => {
    JUDGES_V6.judges.forEach((j) => {
      expect(j.rfd.length).toBeGreaterThan(10);
      expect(j.drill.length).toBeGreaterThan(5);
      expect(j.score).toBeGreaterThanOrEqual(0);
      expect(j.score).toBeLessThanOrEqual(100);
      expect(j.accentColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

// ── DRILL_V6 ──────────────────────────────────────────────────────────────────

describe("DRILL_V6", () => {
  it("after score > before score", () => {
    expect(DRILL_V6.after.score).toBeGreaterThan(DRILL_V6.before.score);
  });

  it("before is 45 and after is 74", () => {
    expect(DRILL_V6.before.score).toBe(45);
    expect(DRILL_V6.after.score).toBe(74);
  });
});

// ── EVIDENCE_V6 ───────────────────────────────────────────────────────────────

describe("EVIDENCE_V6", () => {
  it("has exactly 3 layers", () => {
    expect(EVIDENCE_V6.layers).toHaveLength(3);
  });

  it("source is Congressional Budget Office", () => {
    expect(EVIDENCE_V6.source.title).toContain("Congressional Budget Office");
  });
});

// ── FINAL_CTA_V6 ──────────────────────────────────────────────────────────────

describe("FINAL_CTA_V6", () => {
  it("headlineA is 'The round ends.'", () => {
    expect(FINAL_CTA_V6.headlineA).toBe("The round ends.");
  });

  it("supportLine includes 'Public Forum'", () => {
    expect(FINAL_CTA_V6.supportLine).toContain("Public Forum");
  });
});

// ── Copy hygiene across all headline strings ──────────────────────────────────

describe("No banned language in key copy", () => {
  it("hero, ballot, pipeline, judges, drill, cta headlines are clean", () => {
    const strings = [
      HERO_V6.headlineA,
      HERO_V6.headlineB,
      HERO_V6.body,
      HERO_V6.trustLine,
      BALLOT_V6.headline,
      PIPELINE_V6.headline,
      JUDGES_V6.headline,
      DRILL_V6.headline,
      FINAL_CTA_V6.headlineA,
      FINAL_CTA_V6.headlineB,
      FINAL_CTA_V6.supportLine,
    ];
    strings.forEach((s) => expect(hasBannedV6Language(s)).toBe(false));
  });
});
