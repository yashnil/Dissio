/**
 * Static class maps for ReportVerdictPanel severity colors.
 *
 * Template-string classes (`border-${color}/15`) are not picked up by the
 * Tailwind v4 content scanner. Every class that should appear in the final
 * CSS bundle must be a complete, static string.
 */

export type IssueColor = "danger" | "warn";

// ── resolveGrade ────────────────────────────────────────────────────────────

export interface GradeConfig {
  grade: string;
  ring: string;
  glowBg: string;
  glow: string;
}

export function resolveGrade(score: number | null): GradeConfig {
  if (score === null) return { grade: "Not scored",            ring: "border-hairline-strong", glowBg: "bg-hairline-strong", glow: "" };
  if (score >= 90)    return { grade: "Tournament-Ready",      ring: "border-ok",    glowBg: "bg-ok",     glow: "oklch(0.620 0.170 145 / 0.30)" };
  if (score >= 80)    return { grade: "Strong",                ring: "border-ok",    glowBg: "bg-ok",     glow: "oklch(0.620 0.170 145 / 0.25)" };
  if (score >= 70)    return { grade: "Solid",                 ring: "border-lav",   glowBg: "bg-lav",    glow: "oklch(0.510 0.156 278 / 0.30)" };
  if (score >= 60)    return { grade: "Developing",            ring: "border-lav",   glowBg: "bg-lav",    glow: "oklch(0.510 0.156 278 / 0.25)" };
  if (score >= 50)    return { grade: "Flawed but Complete",   ring: "border-warn",  glowBg: "bg-warn",   glow: "oklch(0.750 0.155 74 / 0.25)"  };
  if (score >= 40)    return { grade: "Needs Foundation",      ring: "border-warn",  glowBg: "bg-warn",   glow: "oklch(0.750 0.155 74 / 0.20)"  };
  return               { grade: "Severely Underdeveloped", ring: "border-danger", glowBg: "bg-danger", glow: "oklch(0.640 0.215 25 / 0.20)" };
}

// ── dimColor ────────────────────────────────────────────────────────────────

export function dimColor(val: number): string {
  if (val >= 16) return "bg-ok";
  if (val >= 12) return "bg-lav";
  if (val >= 8)  return "bg-warn";
  return "bg-danger";
}

// ── ArgumentChain style map ─────────────────────────────────────────────────

export interface ChainStyles {
  wrapper: string;
  label: string;
  chevron: string;
  pill: string;
}

export const CHAIN_STYLES: Record<IssueColor, ChainStyles> = {
  danger: {
    wrapper: "rounded-lg border border-danger/15 bg-danger/5 px-3 py-2",
    label:   "mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-danger/60",
    chevron: "shrink-0 text-danger/35",
    pill:    "rounded border border-danger/20 bg-danger/10 px-2 py-0.5 text-[10px] font-medium text-ink-muted",
  },
  warn: {
    wrapper: "rounded-lg border border-warn/15 bg-warn/5 px-3 py-2",
    label:   "mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-warn/60",
    chevron: "shrink-0 text-warn/35",
    pill:    "rounded border border-warn/20 bg-warn/10 px-2 py-0.5 text-[10px] font-medium text-ink-muted",
  },
};

// ── TopIssueCard style map ──────────────────────────────────────────────────

export interface IssueStyles {
  card: string;
  header: string;
  dot: string;
  eyebrow: string;
  badge: string;
  reco: string;
  arrow: string;
}

export const ISSUE_STYLES: Record<IssueColor, IssueStyles> = {
  danger: {
    card:    "rounded-xl border border-danger/25 bg-danger/5",
    header:  "flex items-center justify-between gap-2 border-b border-danger/15 px-4 py-2",
    dot:     "h-1.5 w-1.5 shrink-0 rounded-full bg-danger analysis-step-active",
    eyebrow: "text-eyebrow text-danger",
    badge:   "rounded-full border border-danger/20 bg-danger/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-danger",
    reco:    "flex items-start gap-2 rounded-lg border border-danger/15 bg-surface-1 px-3 py-2",
    arrow:   "mt-0.5 shrink-0 text-danger",
  },
  warn: {
    card:    "rounded-xl border border-warn/25 bg-warn/5",
    header:  "flex items-center justify-between gap-2 border-b border-warn/15 px-4 py-2",
    dot:     "h-1.5 w-1.5 shrink-0 rounded-full bg-warn analysis-step-active",
    eyebrow: "text-eyebrow text-warn",
    badge:   "rounded-full border border-warn/20 bg-warn/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-warn",
    reco:    "flex items-start gap-2 rounded-lg border border-warn/15 bg-surface-1 px-3 py-2",
    arrow:   "mt-0.5 shrink-0 text-warn",
  },
};
