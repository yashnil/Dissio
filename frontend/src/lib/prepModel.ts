/**
 * Tournament Prep display model — pure, tested derivations from real data.
 *
 * Truthfulness contract (mirrors practiceReadiness):
 *   green   = concrete coverage exists (counted rows, scored dimensions)
 *   amber   = partial coverage or known issues
 *   red     = a critical, concrete gap (zero coverage on a focused side,
 *             unsafe cards, critical readiness gaps)
 *   neutral = unknown / not started — never upgraded without data
 *
 * Every label carries an explanation naming the evidence behind it.
 */

import type {
  DimensionScore,
  PrepGap,
  PrepReadinessReport,
  PrepTask,
  PrepWorkout,
  PrepWorkspace,
  Side,
} from "@/types/prep";
import type {
  Argument,
  Frontline,
  FrontlineResponse,
  LibrarySearchResult,
  Resolution,
} from "@/types/library";

export type PrepTone = "green" | "amber" | "red" | "neutral";

export interface CoverageDisplay {
  label: string;
  tone: PrepTone;
  /** The concrete evidence behind the label — shown to the user. */
  explanation: string;
}

// ── Side labels ───────────────────────────────────────────────────────────────

export function describeSideFocus(side: Side): string {
  if (side === "both") return "PRO + CON";
  return side.toUpperCase();
}

// ── Entry state ───────────────────────────────────────────────────────────────

export type PrepEntryState =
  | "empty" // no resolutions at all — explain what unlocks the workspace
  | "resolutions-only" // resolutions exist but no prep started yet
  | "has-prep"; // at least one workspace to continue

export function derivePrepEntryState(
  resolutions: Resolution[],
  workspaces: PrepWorkspace[],
): PrepEntryState {
  if (workspaces.length > 0) return "has-prep";
  if (resolutions.length > 0) return "resolutions-only";
  return "empty";
}

/** Workspaces newest-first for the "Continue preparation" list. */
export function sortWorkspacesByRecency(workspaces: PrepWorkspace[]): PrepWorkspace[] {
  return [...workspaces].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

// ── Argument coverage ─────────────────────────────────────────────────────────

export interface ArgumentCoverage extends CoverageDisplay {
  proCount: number;
  conCount: number;
  /** Focused sides with zero saved arguments. */
  missingSides: string[];
}

/**
 * Coverage from the resolution's actually-saved arguments. The counts are
 * concrete (fetched rows), so zero on a focused side is a real critical gap,
 * not a guess.
 */
export function deriveArgumentCoverage(
  args: Argument[],
  side: Side,
): ArgumentCoverage {
  const proCount = args.filter((a) => a.side === "pro").length;
  const conCount = args.filter((a) => a.side === "con").length;
  const focused: Array<"pro" | "con"> = side === "both" ? ["pro", "con"] : [side];
  const countFor = (s: "pro" | "con") => (s === "pro" ? proCount : conCount);
  const missingSides = focused.filter((s) => countFor(s) === 0).map((s) => s.toUpperCase());

  const counts = `${proCount} PRO / ${conCount} CON argument${proCount + conCount === 1 ? "" : "s"} saved`;

  if (missingSides.length > 0) {
    return {
      proCount, conCount, missingSides,
      tone: "red",
      label: "Missing side coverage",
      explanation: `No ${missingSides.join(" or ")} arguments saved yet — ${counts}.`,
    };
  }
  const thin = focused.some((s) => countFor(s) < 3);
  if (thin) {
    return {
      proCount, conCount, missingSides,
      tone: "amber",
      label: "Partial coverage",
      explanation: `${counts}. Fewer than 3 on a focused side — most PF cases run 2–3 contentions plus responses.`,
    };
  }
  return {
    proCount, conCount, missingSides,
    tone: "green",
    label: "Positions covered",
    explanation: `${counts} across your focused side${focused.length > 1 ? "s" : ""}.`,
  };
}

// ── Evidence coverage ─────────────────────────────────────────────────────────

export function deriveEvidenceCoverage(
  report: PrepReadinessReport | null,
): CoverageDisplay & { cardCount: number | null } {
  if (!report) {
    return {
      tone: "neutral",
      label: "Not scanned yet",
      explanation: "Generate a readiness report to scan your evidence library for this resolution.",
      cardCount: null,
    };
  }
  const cards = report.total_cards;
  const stale = report.stale_cards.length;
  const unsafe = report.unsafe_cards.length;

  if (cards === 0) {
    return {
      tone: "red",
      label: "No evidence",
      explanation: "0 evidence cards are linked to this resolution — every claim is currently unsupported.",
      cardCount: 0,
    };
  }
  if (unsafe > 0) {
    return {
      tone: "red",
      label: "Unsafe cards",
      explanation: `${cards} cards saved, but ${unsafe} flagged unsafe to read in round — review before the tournament.`,
      cardCount: cards,
    };
  }
  if (stale > 0) {
    return {
      tone: "amber",
      label: "Aging evidence",
      explanation: `${cards} cards saved; ${stale} assessed stale or aging — consider newer sources.`,
      cardCount: cards,
    };
  }
  return {
    tone: "green",
    label: "Evidence on file",
    explanation: `${cards} cards saved with no stale or unsafe flags in the latest scan.`,
    cardCount: cards,
  };
}

// ── Frontline readiness ───────────────────────────────────────────────────────

const FRONTLINE_GAP_CATEGORIES = new Set([
  "frontline_underdeveloped",
  "missing_response",
  "missing_counterevidence",
]);

export function deriveFrontlineReadiness(
  report: PrepReadinessReport | null,
): CoverageDisplay & { frontlineCount: number | null; weakCount: number } {
  if (!report) {
    return {
      tone: "neutral",
      label: "Not assessed yet",
      explanation: "Generate a readiness report to check your frontlines against expected responses.",
      frontlineCount: null,
      weakCount: 0,
    };
  }
  const total = report.total_frontlines;
  const weak = report.weakest_frontlines.length;
  const gapCount = report.gaps.filter((g) => FRONTLINE_GAP_CATEGORIES.has(g.gap_category)).length;

  if (total === 0) {
    return {
      tone: "red",
      label: "No frontlines",
      explanation: "0 frontlines saved — expected responses to your case are currently unanswered.",
      frontlineCount: 0,
      weakCount: 0,
    };
  }
  if (weak > 0 || gapCount > 0) {
    const parts: string[] = [`${total} frontlines saved`];
    if (weak > 0) parts.push(`${weak} flagged weakest`);
    if (gapCount > 0) parts.push(`${gapCount} response gap${gapCount === 1 ? "" : "s"} found`);
    return {
      tone: "amber",
      label: "Needs work",
      explanation: `${parts.join("; ")}.`,
      frontlineCount: total,
      weakCount: weak,
    };
  }
  return {
    tone: "green",
    label: "Frontlines ready",
    explanation: `${total} frontlines saved with no response gaps in the latest scan.`,
    frontlineCount: total,
    weakCount: 0,
  };
}

// ── Readiness dimensions ──────────────────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  argument_coverage: "Argument coverage",
  evidence_quality: "Evidence quality",
  evidence_freshness: "Evidence freshness",
  frontline_readiness: "Frontline readiness",
  source_diversity: "Source diversity",
  speech_stage_readiness: "Speech practice",
  weighing_preparation: "Weighing prep",
};

export interface ReadinessDimensionDisplay {
  key: string;
  label: string;
  score: number | null;
  tone: PrepTone;
  explanation: string;
}

export function dimensionTone(score: number | null | undefined): PrepTone {
  if (score == null) return "neutral"; // unknown data can never be green
  if (score >= 80) return "green";
  if (score >= 50) return "amber";
  return "red";
}

export interface TournamentReadiness {
  dimensions: ReadinessDimensionDisplay[];
  overall: CoverageDisplay;
}

/**
 * Decomposed readiness — never one vague score. Overall is green only when
 * every dimension is concretely scored ≥ 80 with zero critical gaps; unknown
 * dimensions cap the overall at amber.
 */
export function deriveTournamentReadiness(
  report: PrepReadinessReport | null,
): TournamentReadiness {
  if (!report) {
    return {
      dimensions: [],
      overall: {
        tone: "neutral",
        label: "Not started",
        explanation: "No readiness report yet. Generate one to see coverage across every dimension.",
      },
    };
  }

  const dims: ReadinessDimensionDisplay[] = Object.entries(report.dimensions).map(
    ([key, dim]: [string, DimensionScore]) => ({
      key,
      label: DIMENSION_LABELS[key] ?? key.replace(/_/g, " "),
      score: dim.score ?? null,
      tone: dimensionTone(dim.score),
      explanation: dim.explanation,
    }),
  );

  const critical = report.critical_gaps.length;
  const scored = dims.filter((d) => d.score !== null);
  const unknown = dims.length - scored.length;

  let overall: CoverageDisplay;
  if (critical > 0) {
    overall = {
      tone: "red",
      label: "Critical gaps",
      explanation: `${critical} critical gap${critical === 1 ? "" : "s"} found — start with “${report.critical_gaps[0].title}”.`,
    };
  } else if (scored.length === 0) {
    overall = {
      tone: "neutral",
      label: "No data yet",
      explanation: "The scan found nothing to score — add arguments and evidence for this resolution first.",
    };
  } else if (unknown === 0 && scored.every((d) => d.tone === "green")) {
    overall = {
      tone: "green",
      label: "Tournament ready",
      explanation: `All ${dims.length} dimensions scored 80+ with no critical gaps.`,
    };
  } else if (scored.some((d) => d.tone === "red")) {
    const worst = scored.filter((d) => d.tone === "red").map((d) => d.label);
    overall = {
      tone: "red",
      label: "Major gaps",
      explanation: `Weakest dimensions: ${worst.join(", ")}.`,
    };
  } else {
    const pending = unknown > 0 ? `${unknown} dimension${unknown === 1 ? "" : "s"} have no data yet` : null;
    const partial = scored.filter((d) => d.tone === "amber").map((d) => d.label);
    overall = {
      tone: "amber",
      label: "In progress",
      explanation: [
        partial.length > 0 ? `Partial coverage: ${partial.join(", ")}` : null,
        pending,
      ].filter(Boolean).join(". ") + ".",
    };
  }

  return { dimensions: dims, overall };
}

// ── Next prep action ──────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

export type PrepNextActionKind =
  | "generate-report"
  | "fix-gap"
  | "do-task"
  | "do-workout"
  | "refresh";

export interface PrepNextAction {
  kind: PrepNextActionKind;
  title: string;
  description: string;
}

/**
 * The single most important next prep move, from real state only:
 * no report → generate; then critical/top gaps; then the highest-priority
 * pending task; then an unstarted workout; otherwise refresh after new work.
 */
export function derivePrepNextAction(input: {
  report: PrepReadinessReport | null;
  tasks: PrepTask[];
  workouts: PrepWorkout[];
}): PrepNextAction {
  const { report, tasks, workouts } = input;

  if (!report) {
    return {
      kind: "generate-report",
      title: "Generate your readiness report",
      description: "Dissio scans your saved arguments, evidence, and frontlines for this resolution and finds the gaps.",
    };
  }

  const openGaps = report.gaps
    .filter((g) => !g.resolved)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5));
  const topCritical = openGaps.find((g) => g.severity === "critical");
  if (topCritical) {
    return {
      kind: "fix-gap",
      title: topCritical.title,
      description: topCritical.recommended_action ?? topCritical.reason,
    };
  }

  const nextTask = [...tasks]
    .filter((t) => t.status === "pending")
    .sort((a, b) => a.priority - b.priority)[0];
  if (nextTask) {
    return {
      kind: "do-task",
      title: nextTask.title,
      description: nextTask.reason ?? "Top item on your prep plan.",
    };
  }

  const nextWorkout = workouts.find((w) => w.status === "not_started");
  if (nextWorkout) {
    return {
      kind: "do-workout",
      title: nextWorkout.title,
      description: nextWorkout.description ?? "Next prep workout in your queue.",
    };
  }

  if (openGaps.length > 0) {
    const g = openGaps[0];
    return {
      kind: "fix-gap",
      title: g.title,
      description: g.recommended_action ?? g.reason,
    };
  }

  return {
    kind: "refresh",
    title: "Coverage looks solid",
    description: "No open gaps, tasks, or workouts. Refresh the report after adding new evidence or frontlines.",
  };
}

// ── Gap sorting for display ───────────────────────────────────────────────────

export function sortGapsBySeverity(gaps: PrepGap[]): PrepGap[] {
  return [...gaps].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5),
  );
}

// ── Saved-card grouping (Evidence working section) ────────────────────────────

export interface PrepCardGroup {
  /** Stable grouping key (argument title / side bucket) — not an ID. */
  key: string;
  /** User-facing group label — argument title or a debate-native bucket. */
  label: string;
  cards: LibrarySearchResult[];
}

/**
 * Group saved cards by the argument they support (real metadata), falling
 * back to side buckets and finally "Unsorted". Labels come from titles —
 * never raw IDs. Groups with named arguments sort first; cards newest-first.
 */
export function groupCardsByArgument(cards: LibrarySearchResult[]): PrepCardGroup[] {
  const groups = new Map<string, PrepCardGroup>();
  for (const card of cards) {
    let key: string;
    let label: string;
    if (card.argument_title) {
      key = `arg:${card.argument_title}`;
      label = card.argument_title;
    } else if (card.side === "pro" || card.side === "con") {
      key = `side:${card.side}`;
      label = `${card.side.toUpperCase()} — no argument assigned`;
    } else {
      key = "unsorted";
      label = "Unsorted";
    }
    const g = groups.get(key) ?? { key, label, cards: [] };
    g.cards.push(card);
    groups.set(key, g);
  }
  const rank = (g: PrepCardGroup) =>
    g.key.startsWith("arg:") ? 0 : g.key.startsWith("side:") ? 1 : 2;
  const result = [...groups.values()].sort(
    (a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label),
  );
  for (const g of result) {
    g.cards.sort((a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime());
  }
  return result;
}

/** Human warnings from a card's real verdict/status/citation fields. */
export function deriveCardWarnings(
  card: Pick<LibrarySearchResult, "support_verdict" | "card_status" | "cite">,
): string[] {
  const warnings: string[] = [];
  if (card.support_verdict === "unsupported") warnings.push("Verdict: does not support its claim");
  if (card.support_verdict === "contradicted") warnings.push("Verdict: contradicted by its source");
  if (card.support_verdict === "partially_supported") warnings.push("Verdict: only partially supported");
  if (card.card_status === "flagged") warnings.push("Flagged for review");
  if (!card.cite) warnings.push("No citation on file");
  return warnings;
}

export function cardVerdictTone(verdict: string | null | undefined): PrepTone {
  switch (verdict) {
    case "supported": return "green";
    case "partially_supported": return "amber";
    case "unsupported":
    case "contradicted": return "red";
    default: return "neutral"; // unverified — never green
  }
}

// ── Argument grouping (Argument working section) ──────────────────────────────

export interface SideArguments {
  pro: Argument[];
  con: Argument[];
  other: Argument[];
}

export function groupArgumentsBySide(args: Argument[]): SideArguments {
  return {
    pro: args.filter((a) => a.side === "pro"),
    con: args.filter((a) => a.side === "con"),
    other: args.filter((a) => a.side !== "pro" && a.side !== "con"),
  };
}

const ARGUMENT_TYPE_LABELS: Record<string, string> = {
  contention: "Contention",
  response: "Response",
  framework: "Framework",
  position: "Position",
  counterplan: "Counterplan",
  kritik: "Kritik",
  value: "Value",
  criterion: "Criterion",
  other: "Argument",
};

export function describeArgumentType(argumentType: string): string {
  return ARGUMENT_TYPE_LABELS[argumentType] ?? "Argument";
}

// ── Frontline grouping (Frontline working section) ────────────────────────────

/** Frontlines whose saved metadata ties them to this resolution. */
export function filterFrontlinesForResolution(
  frontlines: Frontline[],
  resolutionId: string,
): Frontline[] {
  return frontlines.filter((f) => f.resolution_id === resolutionId);
}

export interface SideFrontlines {
  pro: Frontline[];
  con: Frontline[];
  other: Frontline[];
}

export function groupFrontlinesBySide(frontlines: Frontline[]): SideFrontlines {
  return {
    pro: frontlines.filter((f) => f.side === "pro"),
    con: frontlines.filter((f) => f.side === "con"),
    other: frontlines.filter((f) => f.side !== "pro" && f.side !== "con"),
  };
}

// ── Item-level Library deep links ─────────────────────────────────────────────

export type LibraryItemKind = "card" | "argument" | "frontline";

/** Deep link to an exact Library item. IDs live in the URL only — visible
 *  labels must always come from titles/tags. */
export function libraryItemHref(kind: LibraryItemKind, id: string): string {
  return `/library?${kind}=${encodeURIComponent(id)}`;
}

/** Screen-reader label for a selected Library item — human title, never an ID. */
export function libraryItemA11yLabel(kind: LibraryItemKind, title: string | null | undefined): string {
  const KIND_LABEL: Record<LibraryItemKind, string> = {
    card: "evidence card",
    argument: "argument",
    frontline: "frontline",
  };
  return `Selected ${KIND_LABEL[kind]}: ${title?.trim() || "untitled"}`;
}

// ── Frontline response warnings ───────────────────────────────────────────────

const RESPONSE_TYPE_LABELS: Record<string, string> = {
  no_link: "No link",
  link_defense: "Link defense",
  impact_defense: "Impact defense",
  uniqueness_takeout: "Uniqueness takeout",
  turn: "Turn",
  counterplan: "Counterplan",
  mitigation: "Mitigation",
  non_unique: "Non-unique",
  weighing: "Weighing",
  evidence_indictment: "Evidence indictment",
  source_challenge: "Source challenge",
};

export function describeResponseType(responseType: string): string {
  return RESPONSE_TYPE_LABELS[responseType] ?? responseType.replace(/_/g, " ");
}

/**
 * Warning for a saved frontline response, from real linkage data.
 * Analytical responses legitimately carry no cards; an evidence-based
 * response with zero linked cards is a concrete gap. Unknown counts stay
 * silent — never warn without evidence.
 */
export function frontlineResponseWarning(
  response: Pick<FrontlineResponse, "is_analytical">,
  linkedCardCount: number | null,
): string | null {
  if (linkedCardCount === null) return null;
  if (response.is_analytical) return null;
  if (linkedCardCount === 0) return "No linked evidence — this response is currently unsupported";
  return null;
}

// ── Gap → action target mapping (deep links) ──────────────────────────────────

export type GapSection = "arguments" | "evidence" | "frontlines" | "practice";

export interface GapTarget {
  section: GapSection;
  /** Where the user can actually fix it. */
  href: string;
  actionLabel: string;
  /** Why this destination — shown when there's no exact item to jump to. */
  explanation: string;
}

const EVIDENCE_GAP_CATEGORIES = new Set([
  "missing_claim_support", "missing_warrant", "missing_impact", "missing_uniqueness",
  "missing_link", "missing_internal_link", "missing_counterevidence",
  "weak_source", "unsupported_card", "partial_support", "abstract_only",
  "stale_evidence", "freshness_unknown", "duplicate_evidence",
  "insufficient_source_diversity",
]);

const FRONTLINE_GAP_TARGETS = new Set([
  "missing_response", "frontline_underdeveloped",
]);

const PRACTICE_GAP_CATEGORIES = new Set([
  "missing_summary_extension", "missing_final_focus_extension", "missing_weighing",
]);

type GapRefs = Partial<Pick<PrepGap, "card_id" | "argument_id" | "frontline_id">>;

/**
 * When the gap carries a real entity reference, target the exact Library
 * item. The ref matching the gap's category family wins; otherwise any
 * available ref (card → frontline → argument).
 */
function exactGapTarget(gap: Pick<PrepGap, "gap_category"> & GapRefs): GapTarget | null {
  const cat = gap.gap_category;
  const card = (): GapTarget | null => gap.card_id ? {
    section: "evidence",
    href: libraryItemHref("card", gap.card_id),
    actionLabel: "Open card",
    explanation: "Jump to the exact card in your Library.",
  } : null;
  const frontline = (): GapTarget | null => gap.frontline_id ? {
    section: "frontlines",
    href: libraryItemHref("frontline", gap.frontline_id),
    actionLabel: "Open frontline",
    explanation: "Jump to the exact frontline in your Library.",
  } : null;
  const argument = (): GapTarget | null => gap.argument_id ? {
    section: "arguments",
    href: libraryItemHref("argument", gap.argument_id),
    actionLabel: "Open argument",
    explanation: "Jump to the exact argument in your Library.",
  } : null;

  if (FRONTLINE_GAP_TARGETS.has(cat)) return frontline() ?? argument() ?? card();
  if (cat === "missing_argument") return argument() ?? null;
  if (EVIDENCE_GAP_CATEGORIES.has(cat)) return card() ?? argument() ?? frontline();
  return card() ?? frontline() ?? argument();
}

/**
 * Route a readiness gap to the place it can be fixed: the exact Library item
 * when the gap references one, otherwise the closest working surface — each
 * with a one-line why.
 */
export function mapGapToTarget(gap: Pick<PrepGap, "gap_category"> & GapRefs): GapTarget {
  const exact = exactGapTarget(gap);
  if (exact) return exact;
  const cat = gap.gap_category;
  if (cat === "missing_argument") {
    return {
      section: "arguments",
      href: "/library",
      actionLabel: "Add argument",
      explanation: "Arguments live in your Library — add the missing position there.",
    };
  }
  if (FRONTLINE_GAP_TARGETS.has(cat)) {
    return {
      section: "frontlines",
      href: "/library",
      actionLabel: "Write frontline",
      explanation: "Frontlines are built in your Library's blockfiles.",
    };
  }
  if (PRACTICE_GAP_CATEGORIES.has(cat)) {
    return {
      section: "practice",
      href: "/session",
      actionLabel: "Practice it",
      explanation: "Extensions and weighing improve through practice reps.",
    };
  }
  if (EVIDENCE_GAP_CATEGORIES.has(cat)) {
    return {
      section: "evidence",
      href: "/evidence",
      actionLabel: "Add evidence",
      explanation: "Find and cut a card for this in Evidence Studio.",
    };
  }
  return {
    section: "evidence",
    href: "/evidence",
    actionLabel: "Review in Evidence Studio",
    explanation: "No exact target for this gap yet — Evidence Studio is the closest place to work on it.",
  };
}
