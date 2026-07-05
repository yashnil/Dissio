/**
 * marketingV10.test.ts — Unit tests for /home-v10 "The Decision Magnifier"
 * Covers section IDs, nav, hero + lens copy, colors, and validation helpers.
 */

import {
  HOME_V10_SECTION_IDS,
  NAV_V10,
  HERO_V10,
  LENS_V10,
  FIELD_V10,
  V10_COLORS,
  hasBannedV10Language,
  isValidV10Link,
} from "@/lib/marketingV10";
import { HOME_V6_SECTION_IDS } from "@/lib/marketingV6";

// ── Section IDs ───────────────────────────────────────────────────────────────

describe("HOME_V10_SECTION_IDS", () => {
  it("hero id starts with 'v10-'", () => {
    expect(HOME_V10_SECTION_IDS.hero.startsWith("v10-")).toBe(true);
    expect(HOME_V10_SECTION_IDS.hero).toBe("v10-hero");
  });

  it("preserves every lower-section id from V6 (reused components keep v6-* ids)", () => {
    expect(HOME_V10_SECTION_IDS.pipeline).toBe(HOME_V6_SECTION_IDS.pipeline);
    expect(HOME_V10_SECTION_IDS.ballot).toBe(HOME_V6_SECTION_IDS.ballot);
    expect(HOME_V10_SECTION_IDS.judges).toBe(HOME_V6_SECTION_IDS.judges);
    expect(HOME_V10_SECTION_IDS.drill).toBe(HOME_V6_SECTION_IDS.drill);
    expect(HOME_V10_SECTION_IDS.evidence).toBe(HOME_V6_SECTION_IDS.evidence);
    expect(HOME_V10_SECTION_IDS.paths).toBe(HOME_V6_SECTION_IDS.paths);
    expect(HOME_V10_SECTION_IDS.cta).toBe(HOME_V6_SECTION_IDS.cta);
    expect(HOME_V10_SECTION_IDS.footer).toBe(HOME_V6_SECTION_IDS.footer);
  });

  it("all lower ids start with 'v6-'", () => {
    const lower = Object.entries(HOME_V10_SECTION_IDS).filter(([k]) => k !== "hero");
    lower.forEach(([, id]) => expect(id.startsWith("v6-")).toBe(true));
  });

  it("has 9 distinct section IDs", () => {
    const ids = Object.values(HOME_V10_SECTION_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(9);
  });
});

// ── Validation helpers ────────────────────────────────────────────────────────

describe("hasBannedV10Language", () => {
  it("rejects banned marketing terms", () => {
    expect(hasBannedV10Language("This is guaranteed to work")).toBe(true);
    expect(hasBannedV10Language("best-in-class coaching")).toBe(true);
    expect(hasBannedV10Language("Dramatically Improves scores")).toBe(true);
    expect(hasBannedV10Language("trusted by thousands")).toBe(true);
  });

  it("passes clean debate copy", () => {
    expect(hasBannedV10Language("Record one speech. See what decided it.")).toBe(false);
  });
});

describe("isValidV10Link", () => {
  it("accepts / and # prefixes", () => {
    expect(isValidV10Link("/login")).toBe(true);
    expect(isValidV10Link("#v6-pipeline")).toBe(true);
  });

  it("rejects http(s) links", () => {
    expect(isValidV10Link("http://example.com")).toBe(false);
    expect(isValidV10Link("https://example.com")).toBe(false);
  });

  it("rejects relative paths without leading slash", () => {
    expect(isValidV10Link("login")).toBe(false);
  });

  it("all NAV_V10 section hrefs pass", () => {
    NAV_V10.sections.forEach((s) => expect(isValidV10Link(s.href)).toBe(true));
  });

  it("all hero CTA hrefs pass", () => {
    [HERO_V10.ctaPrimaryHref, HERO_V10.ctaSecondaryHref].forEach((h) =>
      expect(isValidV10Link(h)).toBe(true)
    );
  });
});

// ── NAV_V10 ───────────────────────────────────────────────────────────────────

describe("NAV_V10", () => {
  it("has brand name 'Dissio'", () => {
    expect(NAV_V10.brand).toBe("Dissio");
  });

  it("has exactly 4 navigation sections", () => {
    expect(NAV_V10.sections).toHaveLength(4);
  });

  it("section hrefs target the reused v6-* lower ids", () => {
    NAV_V10.sections.forEach((s) => expect(s.href.startsWith("#v6-")).toBe(true));
  });

  it("ctaLoggedOut primary href is /login", () => {
    expect(NAV_V10.ctaLoggedOut.primaryHref).toBe("/login");
    expect(NAV_V10.ctaLoggedOut.primary).toBe("Start a practice");
  });
});

// ── HERO_V10 copy ─────────────────────────────────────────────────────────────

describe("HERO_V10", () => {
  it("has the exact three headline lines", () => {
    expect(HERO_V10.headlineA).toBe("The round moves fast.");
    expect(HERO_V10.headlineB1).toBe("Dissio shows");
    expect(HERO_V10.headlineB2).toBe("what decided it.");
  });

  it("reads as one sentence when the three lines are joined", () => {
    const sentence = `${HERO_V10.headlineA} ${HERO_V10.headlineB1} ${HERO_V10.headlineB2}`;
    expect(sentence).toBe("The round moves fast. Dissio shows what decided it.");
  });

  it("eyebrow and trust line copy present", () => {
    expect(HERO_V10.eyebrow).toContain("PUBLIC FORUM");
    expect(HERO_V10.trustLine).toContain("Coaching, not case generation");
    expect(HERO_V10.trustLine).toContain("Exact evidence stays exact");
  });

  it("supporting copy tells the record → flow → decision → drill story", () => {
    expect(HERO_V10.body).toContain("Record one speech");
    expect(HERO_V10.body).toContain("drill");
  });

  it("primary CTA -> /login, secondary CTA -> /demo", () => {
    expect(HERO_V10.ctaPrimaryHref).toBe("/login");
    expect(HERO_V10.ctaSecondaryHref).toBe("/demo");
  });

  it("CTA labels match the spec", () => {
    expect(HERO_V10.ctaPrimary).toBe("Start a practice");
    expect(HERO_V10.ctaSecondary).toBe("Watch a sample rep");
  });

  it("no banned language in any hero copy", () => {
    const strings = [
      HERO_V10.eyebrow,
      HERO_V10.headlineA,
      HERO_V10.headlineB1,
      HERO_V10.headlineB2,
      HERO_V10.body,
      HERO_V10.trustLine,
    ];
    strings.forEach((s) => expect(hasBannedV10Language(s)).toBe(false));
  });
});

// ── LENS_V10 (the Decision Magnifier artifact) ────────────────────────────────

describe("LENS_V10", () => {
  it("the sentence contains the marked phrase", () => {
    expect(LENS_V10.markedPhrase).toBe("outweighs because");
    expect(LENS_V10.sentence).toContain(LENS_V10.markedPhrase);
    expect(LENS_V10.sentence).toBe(
      "Our impact outweighs because long-run growth matters more than short-run cost."
    );
  });

  it("has the exact judge note strings", () => {
    expect(LENS_V10.note).toBe("Missing warrant");
    expect(LENS_V10.noteSub).toBe("Judge cannot resolve the impact.");
  });

  it("has the exact next-move tab strings (tabTitle is sentence case)", () => {
    expect(LENS_V10.tabTitle).toBe("Next move");
    expect(LENS_V10.tabTitle).not.toBe("NEXT MOVE");
    expect(LENS_V10.tabSub).toBe("90-second warrant extension");
  });

  it("aria label describes the loupe story (no waveform, no card)", () => {
    const label = LENS_V10.lensAriaLabel.toLowerCase();
    expect(label).toContain("loupe");
    expect(label).toContain("magnif");
    expect(label).toContain("warrant");
    expect(label).toContain("drill");
    expect(label).not.toContain("waveform");
    expect(label).not.toContain("card");
  });

  it("no banned language across any lens copy", () => {
    const strings = [
      LENS_V10.sentence,
      LENS_V10.markedPhrase,
      LENS_V10.note,
      LENS_V10.noteSub,
      LENS_V10.tabTitle,
      LENS_V10.tabSub,
      LENS_V10.lensAriaLabel,
    ];
    strings.forEach((s) => expect(hasBannedV10Language(s)).toBe(false));
  });
});

// ── FIELD_V10 (the hidden debate layer the loupe scans) ───────────────────────

describe("FIELD_V10", () => {
  it("has a handful of fragments — enough to read as a layer, never a wall", () => {
    expect(FIELD_V10.fragments.length).toBeGreaterThanOrEqual(5);
    expect(FIELD_V10.fragments.length).toBeLessThanOrEqual(9);
  });

  it("every fragment is a short debate-native scrap, not a paragraph", () => {
    FIELD_V10.fragments.forEach((f) => {
      expect(f.length).toBeGreaterThan(0);
      expect(f.length).toBeLessThanOrEqual(24);
    });
  });

  it("fragments are unique", () => {
    expect(new Set(FIELD_V10.fragments).size).toBe(FIELD_V10.fragments.length);
  });

  it("no banned language in any fragment", () => {
    FIELD_V10.fragments.forEach((f) => expect(hasBannedV10Language(f)).toBe(false));
  });
});

// ── No banned language across NAV copy too ────────────────────────────────────

describe("No banned language in NAV_V10 copy", () => {
  it("nav labels and CTAs are clean", () => {
    const strings = [
      NAV_V10.brand,
      ...NAV_V10.sections.map((s) => s.label),
      NAV_V10.ctaLoggedOut.primary,
      NAV_V10.ctaLoggedOut.signIn,
      NAV_V10.ctaLoggedIn.primary,
    ];
    strings.forEach((s) => expect(hasBannedV10Language(s)).toBe(false));
  });
});

// ── Color tokens ──────────────────────────────────────────────────────────────

describe("V10_COLORS", () => {
  it("every token is a 6-digit hex color", () => {
    Object.values(V10_COLORS).forEach((hex) => {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  it("carries the core semantic accents", () => {
    expect(V10_COLORS.cyan).toBe("#45C3E0");
    expect(V10_COLORS.violet).toBe("#8B7CF8");
    expect(V10_COLORS.green).toBe("#42C478");
    expect(V10_COLORS.fracture).toBe("#F26B4E");
    expect(V10_COLORS.bgDark).toBe("#080A10");
  });

  it("carries the warm paper-under-glass tokens", () => {
    expect(V10_COLORS.paper).toBe("#F5F2EA");
    expect(V10_COLORS.paperInk).toBe("#1A1814");
  });

  it("carries the metallic lens-frame tokens", () => {
    expect(V10_COLORS.metalLight).toBe("#2A2F3E");
    expect(V10_COLORS.metalDark).toBe("#12151F");
  });
});
