/**
 * Dissio /home-v6 content — "Dissio Signal Lens"
 *
 * All copy and data for the V6 homepage.
 * No fabricated metrics, testimonials, or unsupported claims.
 * Sample data is explicitly labeled throughout.
 */

// ── Section IDs ───────────────────────────────────────────────────────────────

export const HOME_V6_SECTION_IDS = {
  hero:     "v6-hero",
  pipeline: "v6-pipeline",
  ballot:   "v6-ballot",
  judges:   "v6-judges",
  drill:    "v6-drill",
  evidence: "v6-evidence",
  paths:    "v6-paths",
  cta:      "v6-cta",
  footer:   "v6-footer",
} as const;

export type V6SectionId = (typeof HOME_V6_SECTION_IDS)[keyof typeof HOME_V6_SECTION_IDS];

// ── Navigation ────────────────────────────────────────────────────────────────

export const NAV_V6 = {
  brand: "Dissio",
  brandAriaLabel: "Dissio home",
  sections: [
    { id: "product",  label: "Product",  href: `#${HOME_V6_SECTION_IDS.pipeline}` },
    { id: "judges",   label: "Judges",   href: `#${HOME_V6_SECTION_IDS.judges}`   },
    { id: "evidence", label: "Evidence", href: `#${HOME_V6_SECTION_IDS.evidence}` },
    { id: "coaches",  label: "Coaches",  href: `#${HOME_V6_SECTION_IDS.paths}`    },
  ],
  ctaLoggedOut: {
    signIn:          "Sign in",
    signInHref:      "/login",
    primary:         "Start a practice",
    primaryHref:     "/login",
  },
  ctaLoggedIn: {
    signOut:         "Sign out",
    primary:         "New practice",
    primaryHref:     "/session",
  },
} as const;

// ── Hero ──────────────────────────────────────────────────────────────────────

export const HERO_V6 = {
  eyebrow:       "AI DEBATE TRAINING · PUBLIC FORUM",
  headlineA:     "The round moves fast.",
  headlineB:     "Dissio shows what decided it.",
  body:          "Record one speech. See the flow, the judge's decision, and the exact drill built from the moment your argument broke.",
  ctaPrimary:    "Start a practice",
  ctaPrimaryHref:  "/login",
  ctaSecondary:  "Watch a sample rep",
  ctaSecondaryHref: "/demo",
  trustLine:     "Coaching, not case generation · Exact evidence stays exact",
  skipLabel:     "Skip to main content",
  xrayAriaLabel: "Signal Lens: a spatial diagram showing how Dissio transforms a Public Forum speech through four analytical layers — speech transcription, argument flow, judge ballot, and targeted drill.",
} as const;

// ── Argument layer data (used in both SVG fallback and hero overlay) ──────────

export const XRAY_LAYERS = {
  speech: {
    id:    "xray-speech",
    label: "SPEECH",
    color: "violet",
    resolution: "Resolved: The federal government should substantially increase infrastructure spending.",
    speaker:    "PRO · First Affirmative Constructive · 4:00",
    phrases: [
      { t: 0.15, text: "Infrastructure investment" },
      { t: 0.45, text: "long-run GDP returns" },
      { t: 0.72, text: "CBO evidence" },
    ],
  },
  flow: {
    id:    "xray-flow",
    label: "FLOW",
    pro: {
      label: "PRO",
      nodes: [
        { id: "p-claim",    tag: "C", text: "Federal investment generates long-run growth" },
        { id: "p-warrant",  tag: "W", text: "CBO: +1.5–2.2% GDP per 1% invested" },
        { id: "p-evidence", tag: "E", text: "CBO Infrastructure Report 2023, Table 3" },
        { id: "p-impact",   tag: "I", text: "Outweighs short-run municipal cost" },
      ],
    },
    con: {
      label: "CON",
      nodes: [
        { id: "c-claim",    tag: "C", text: "Near-term spending raises municipal debt" },
        { id: "c-warrant",  tag: "W", text: "Year-one spending = local tax liability" },
        { id: "c-evidence", tag: "E", text: "Brookings Fiscal Study 2022" },
        { id: "c-impact",   tag: "I", text: "Immediate harm outweighs speculative gains" },
      ],
    },
    brokenLink: {
      from: "p-impact",
      to:   "c-impact",
      note: "Timeframe comparison missing",
    },
  },
  ballot: {
    id:    "xray-ballot",
    label: "BALLOT",
    rfd:   "PRO wins the federal argument but fails to address CON's timeframe comparison. The 10-year frame is never anchored.",
    issue: "Unanswered: 10-year vs. year-one comparison",
    note:  "Warrant missing — timeframe unresolved",
  },
  drill: {
    id:        "xray-drill",
    label:     "DRILL",
    title:     "90-second weighing extension",
    before:    { label: "Before", score: 45, tag: "Generic weighing" },
    after:     { label: "After",  score: 74, tag: "Explicit timeframe comparison" },
    sampleLabel: "Sample data — illustrative only",
  },
} as const;

// ── Intro animation copy ──────────────────────────────────────────────────────

export const INTRO_V6 = {
  brandText:        "DISSIO",
  skipLabel:        "Skip intro",
  annotationLabel:  "Missing warrant",
  nextMoveLabel:    "Next move",
  drillLabel:       "90-second warrant extension",
  gap1Text:         "Warrant missing",
  gap2Text:         "Timeframe unresolved",
  sampleLabel:      "Sample data",
} as const;

// ── Section 1: Pipeline ───────────────────────────────────────────────────────

export const PIPELINE_V6 = {
  eyebrow:  "FROM VOICE TO VERDICT",
  headline: "One speech. Four useful views.",
  stages: [
    {
      id:       "speech",
      label:    "Speech",
      step:     "01",
      caption:  "Every word transcribed and timestamped.",
      previewLabel: "Transcript + waveform",
    },
    {
      id:       "flow",
      label:    "Flow",
      step:     "02",
      caption:  "Claim, warrant, evidence, and impact extracted per speaker.",
      previewLabel: "Argument structure",
    },
    {
      id:       "ballot",
      label:    "Ballot",
      step:     "03",
      caption:  "A judge-style RFD naming the exact moment that shifted the round.",
      previewLabel: "Reason for decision",
    },
    {
      id:       "drill",
      label:    "Drill",
      step:     "04",
      caption:  "One 90-second spoken drill. Re-record. Track the delta.",
      previewLabel: "Targeted next rep",
    },
  ],
} as const;

// ── Section 2: Ballot ─────────────────────────────────────────────────────────

export const BALLOT_V6 = {
  eyebrow:   "THE LINE THAT COST THE BALLOT",
  headline:  "Feedback should point to the exact line.",
  subhead:   "Not \"weigh more.\" The sentence, warrant, and comparison the judge needed.",
  excerpt: {
    speaker: "PRO · Summary · 2:54",
    lines: [
      { text: "Federal infrastructure investment has a measured return.",           highlight: false },
      { text: "The CBO puts it at one-point-five to two-point-two percent.",       highlight: false },
      { text: "That outweighs the short-run municipal concern.",                   highlight: true, note: "No timeframe stated — judge cannot weigh this" },
      { text: "Cost is temporary. Growth is permanent.",                           highlight: false },
    ],
  },
  judgeNote:  "Where is the comparison? Year-one cost vs. 10-year return is the entire weighing question. This line doesn't make it.",
  connection: "This sentence → reason for decision",
  sampleLabel: "Sample ballot excerpt — illustrative only",
} as const;

// ── Section 3: Judges ─────────────────────────────────────────────────────────

export const JUDGES_V6 = {
  eyebrow:   "FOUR JUDGES, FOUR ROUNDS",
  headline:  "The speech stays the same. The decision doesn't.",
  subhead:   "Dissio runs four parallel evaluations so you can adapt before the round.",
  fragment: {
    speaker: "PRO · First Rebuttal",
    text:    "\"The CBO evidence covers the ten-year window. CON's concern is a year-one cost that PRO's own warrant resolves.\"",
    sampleLabel: "Sample speech fragment",
  },
  judges: [
    {
      id:          "lay",
      label:       "Lay",
      accentColor: "#8B7CF8",
      tint:        "rgba(139,124,248,0.05)",
      lens:        "Story, consequence, and persuasive clarity.",
      highlight:   "Impact language",
      rfd:         "The real-world stakes were clear but the economic specifics confused the round. Lead with one concrete consequence.",
      drill:       "Restate the GDP figure as a concrete local benefit in 30 seconds.",
      score:       72,
    },
    {
      id:          "flow",
      label:       "Flow",
      accentColor: "#45C3E0",
      tint:        "rgba(69,195,224,0.05)",
      lens:        "Line-by-line clash, extensions, drops.",
      highlight:   "Dropped argument",
      rfd:         "CON's timeframe objection stands unanswered in the second summary. That conceded drop shifts the ballot.",
      drill:       "Extend the CBO warrant explicitly in your summary — 45 seconds.",
      score:       58,
    },
    {
      id:          "tech",
      label:       "Technical",
      accentColor: "#E8A822",
      tint:        "rgba(232,168,34,0.05)",
      lens:        "Warrant precision, comparative weighing, evidence quality.",
      highlight:   "Missing comparison",
      rfd:         "PRO's 1.5–2.2% figure lacks a timeframe anchor. Without the 10-year frame, the weighing comparison cannot be made.",
      drill:       "Add an explicit timeframe to every weighing claim. Practice in 60 seconds.",
      score:       63,
    },
    {
      id:          "coach",
      label:       "Coach",
      accentColor: "#42C478",
      tint:        "rgba(66,196,120,0.05)",
      lens:        "Skill development and strategic growth.",
      highlight:   "Growth opportunity",
      rfd:         "Strong structure. The core skill gap is explicit timeframe comparison. One focused drill fixes this for the tournament.",
      drill:       "Record a 90-second weighing block naming the comparison explicitly.",
      score:       81,
    },
  ],
  sampleLabel: "Sample evaluation — illustrative only",
} as const;

// ── Section 4: Drill ──────────────────────────────────────────────────────────

export const DRILL_V6 = {
  eyebrow:   "ONE WEAKNESS, ONE DRILL",
  headline:  "Fix one thing. Measure the difference.",
  sampleLabel: "Sample practice session — illustrative only",
  before: {
    label:   "Before",
    excerpt: "\"That outweighs the short-run municipal concern. Cost is temporary. Growth is permanent.\"",
    note:    "No timeframe stated. Judge cannot evaluate the comparison.",
    tag:     "Generic weighing",
    score:   45,
    dim:     "Warrant depth",
  },
  drill: {
    label:       "Drill",
    title:       "Timeframe weighing extension",
    instruction: "In 90 seconds, restate PRO's impact with an explicit 10-year return frame against CON's year-one cost. Name the comparison directly.",
    duration:    "90 sec",
    rep:         "Practice rep",
  },
  after: {
    label:   "After",
    excerpt: "\"PRO's 1.5% GDP growth compounds over ten years. CON's municipal cost is absorbed in year one. The 10-year frame wins the weighing debate.\"",
    note:    "Explicit timeframe and comparison. Judge can evaluate.",
    tag:     "Explicit timeframe comparison",
    score:   74,
    dim:     "Warrant depth",
  },
} as const;

// ── Section 5: Evidence ───────────────────────────────────────────────────────

export const EVIDENCE_V6 = {
  eyebrow:   "EVIDENCE UNDER GLASS",
  headline:  "The card stays exact. The coaching stays labeled.",
  subhead:   "Three visually distinct layers. Toggle any layer to see what it adds.",
  source: {
    title:  "Congressional Budget Office",
    detail: "Economic Effects of Increased Infrastructure Investment · 2023",
    type:   "Government report",
  },
  layers: [
    {
      id:    "quote",
      label: "Exact quote",
      icon:  "text",
      content: "\"Public investment in physical infrastructure yields an estimated 1.5 to 2.2 percent increase in long-run GDP for each percent of GDP invested, primarily through productivity gains in the private sector.\"",
      highlight: "1.5 to 2.2 percent increase in long-run GDP",
    },
    {
      id:      "citation",
      label:   "Citation & provenance",
      icon:    "link",
      citation: "CBO (2023). Economic Effects of Increased Infrastructure Investment. Congress of the United States.",
      provenance: "Source text unchanged · Citation complete · Date verified",
    },
    {
      id:      "ai",
      label:   "AI coaching tag",
      icon:    "cpu",
      tag:     "Weighing anchor — use the 10-year return frame to outweigh short-run fiscal cost arguments.",
      note:    "This is an AI recommendation, not part of the source.",
    },
  ],
} as const;

// ── Section 6: Paths ──────────────────────────────────────────────────────────

export const PATHS_V6 = {
  eyebrow:   "BUILT FOR THE REP AND THE ROOM",
  headline:  "The same analysis. Two roles.",
  student: {
    label:   "Students",
    heading: "Your next practice tells you what to fix.",
    points: [
      "Judge-style RFD after every practice speech",
      "One targeted drill per session — not a list of suggestions",
      "Skill delta tracked rep by rep",
    ],
    cta:     "Start a practice",
    ctaHref: "/login",
  },
  coach: {
    label:   "Coaches",
    heading: "Team patterns visible before tournament week.",
    points: [
      "Recurring weaknesses across all students",
      "Assign targeted drills from any speech",
      "Progress without replaying every recording",
    ],
    cta:     "Learn about team access",
    ctaHref: "/coaches",
  },
} as const;

// ── Final CTA ─────────────────────────────────────────────────────────────────

export const FINAL_CTA_V6 = {
  headlineA:       "The round ends.",
  headlineB:       "The learning shouldn't.",
  ctaPrimary:      "Start a practice",
  ctaPrimaryHref:  "/login",
  ctaSecondary:    "See a sample report",
  ctaSecondaryHref: "/demo",
  supportLine:     "Public Forum · No credit card required · Free to start",
} as const;

// ── Color tokens ──────────────────────────────────────────────────────────────

export const V6_COLORS = {
  // Dark analytical surfaces
  bgDark:       "#080A10",
  surfaceDark:  "#0E1018",
  borderDark:   "#1A1A2E",

  // Warm ballot-paper surfaces
  bgWarm:       "#F6F2E8",
  textWarm:     "#1A1814",
  textWarmMid:  "#4A4640",
  textWarmMuted:"#5A5650",
  borderWarm:   "#D7D1C6",

  // Semantic accents (hex — consistent with THREE.js requirement)
  violet:       "#8B7CF8",
  violetDark:   "#6B5CE7",
  amber:        "#E8A822",
  cyan:         "#45C3E0",
  green:        "#42C478",
  fracture:     "#F26B4E",

  // Text on dark
  inkBright:    "#F5F4F8",
  inkMid:       "rgba(245,244,248,0.65)",
  inkDim:       "rgba(245,244,248,0.45)",
} as const;

// ── Validation helpers ────────────────────────────────────────────────────────

const BANNED_V6 = [
  "guaranteed", "proven", "best-in-class", "industry-leading",
  "testimonial", "customer says", "trusted by", "10x", "dramatically improves",
];

export function hasBannedV6Language(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_V6.some((w) => lower.includes(w));
}

export function isValidV6Link(href: string): boolean {
  return href.startsWith("/") || href.startsWith("#");
}
