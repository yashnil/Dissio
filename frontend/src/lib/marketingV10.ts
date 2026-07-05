/**
 * Dissio /home-v10 content — "The Glass Loupe"
 *
 * A more memorable evolution of V9's annotation card. The product promise is
 * made literal: a premium glass loupe passes over the hidden layer of a debate
 * round and, over the giant focal phrase "what decided it.", makes the exact
 * deciding sentence sharp — marked the way a judge marks it — with a judge
 * note etched to the rim and a next-move swing tag hanging from the handle.
 *
 * No fabricated metrics, testimonials, or unsupported claims.
 *
 * Section IDs: the hero gets a fresh `v10-hero` id, while every lower section is
 * reused verbatim from V6 (those components keep their own `v6-*` ids), so
 * NavV10 and PageFlowTraceV10 observe the V6 ids for warm/active detection.
 */

import { HOME_V6_SECTION_IDS } from "./marketingV6";

// ── Section IDs ───────────────────────────────────────────────────────────────

// Reuse every lower-section id from V6 (drop V6's own hero id).
const { hero: _v6Hero, ...V6_LOWER_SECTION_IDS } = HOME_V6_SECTION_IDS;

export const HOME_V10_SECTION_IDS = {
  hero: "v10-hero",
  ...V6_LOWER_SECTION_IDS,
} as const;

export type V10SectionId = (typeof HOME_V10_SECTION_IDS)[keyof typeof HOME_V10_SECTION_IDS];

// ── Navigation ────────────────────────────────────────────────────────────────

export const NAV_V10 = {
  brand: "Dissio",
  brandAriaLabel: "Dissio home",
  sections: [
    { id: "product",  label: "Product",  href: `#${HOME_V10_SECTION_IDS.pipeline}` },
    { id: "judges",   label: "Judges",   href: `#${HOME_V10_SECTION_IDS.judges}`   },
    { id: "evidence", label: "Evidence", href: `#${HOME_V10_SECTION_IDS.evidence}` },
    { id: "coaches",  label: "Coaches",  href: `#${HOME_V10_SECTION_IDS.paths}`    },
  ],
  ctaLoggedOut: {
    signIn:      "Sign in",
    signInHref:  "/login",
    primary:     "Start a practice",
    primaryHref: "/login",
  },
  ctaLoggedIn: {
    signOut:     "Sign out",
    primary:     "New practice",
    primaryHref: "/session",
  },
} as const;

// ── Hero ──────────────────────────────────────────────────────────────────────

export const HERO_V10 = {
  eyebrow:          "PUBLIC FORUM · NOVICE & JV",
  headlineA:        "The round moves fast.",
  headlineB1:       "Dissio shows",
  headlineB2:       "what decided it.",
  body:             "Record one speech. See the flow, the judge's decision, and the exact drill built from the moment your argument broke.",
  ctaPrimary:       "Start a practice",
  ctaPrimaryHref:   "/login",
  ctaSecondary:     "Watch a sample rep",
  ctaSecondaryHref: "/demo",
  trustLine:        "Coaching, not case generation · Exact evidence stays exact",
  skipLabel:        "Skip to main content",
} as const;

// ── The Decision Magnifier (the hero's single designed artifact) ──────────────

export const LENS_V10 = {
  // The transcribed line the judge weighed — revealed under the lens.
  sentence:      "Our impact outweighs because long-run growth matters more than short-run cost.",
  // The weak phrase, highlighted by Dissio (must be a substring of `sentence`).
  markedPhrase:  "outweighs because",
  // Judge margin note, docked to the lens rim.
  note:          "Missing warrant",
  noteSub:       "Judge cannot resolve the impact.",
  // The drill tag that hangs from the handle (sentence case — not shouted).
  tabTitle:      "Next move",
  tabSub:        "90-second warrant extension",
  // Description for assistive tech (mentions the loupe + warrant + drill).
  lensAriaLabel:
    "A glass magnifying loupe reveals the sentence that decided the round, highlights a missing warrant, and turns that mark into a next practice drill.",
} as const;

// ── The hidden debate layer (faint fragments the loupe is scanning) ───────────
//
// Rendered at very low opacity with slight blur around the headline and loupe —
// the messy round layer Dissio reads. Never readable as a paragraph, never a
// grid. All fragments are debate-native. aria-hidden in the DOM.

export const FIELD_V10 = {
  fragments: [
    "impact calculus",
    "warrant?",
    "extend defense",
    "JUDGE FLOW",
    "2:41",
    "weighing",
    "drop",
  ],
} as const;

// ── Color tokens (hex only — validated to /^#[0-9A-F]{6}$/i) ───────────────────

export const V10_COLORS = {
  bgDark:      "#080A10",
  surfaceDark: "#0E1018",
  borderDark:  "#1A1A2E",

  // Warm handoff surface (matches PipelineV6)
  bgWarm:      "#F3F0E8",

  // Warm revealed-sentence surface (paper under glass)
  paper:       "#F5F2EA",
  paperInk:    "#1A1814",

  // Metallic handle
  metalLight:  "#2A2F3E",
  metalDark:   "#12151F",

  // Semantic accents
  violet:      "#8B7CF8",
  violetDark:  "#6B5CE7",
  amber:       "#E8A822",
  cyan:        "#45C3E0",
  green:       "#42C478",
  greenText:   "#7CD8A2",
  fracture:    "#F26B4E",

  // Text on dark
  inkBright:   "#F5F4F8",
} as const;

// ── Validation helpers ────────────────────────────────────────────────────────

const BANNED_V10 = [
  "guaranteed", "proven", "best-in-class", "industry-leading",
  "testimonial", "customer says", "trusted by", "10x", "dramatically improves",
];

export function hasBannedV10Language(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_V10.some((w) => lower.includes(w));
}

export function isValidV10Link(href: string): boolean {
  return href.startsWith("/") || href.startsWith("#");
}
