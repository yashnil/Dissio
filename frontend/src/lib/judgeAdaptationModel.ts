/**
 * Judge Adaptation display model (Phase 7A) — pure, tested derivations.
 *
 * Bridges saved Library material (cards / arguments / frontlines) into the
 * adaptation workspace without exposing implementation concepts: users pick
 * real materials by title, and the backend source_type/source_id contract is
 * built here, out of sight.
 *
 * Evidence integrity contract:
 *  - exact source text stays labeled as exact source text
 *  - adaptation output is delivery/framing coaching, never a rewrite
 *  - unsupported/contradicted evidence is never treated as safe to adapt
 */

import type { Argument, Frontline, LibrarySearchResult } from "@/types/library";
import type { JudgeType } from "@/types/judgeAdaptation";
import { describeArgumentType } from "@/lib/prepModel";

// ── Material kinds ────────────────────────────────────────────────────────────

export type AdaptableMaterialKind = "card" | "argument" | "frontline";

export const MATERIAL_KIND_LABELS: Record<AdaptableMaterialKind, string> = {
  card: "Evidence card",
  argument: "Argument",
  frontline: "Frontline",
};

/** Backend source_type for each picker kind (the API's internal vocabulary). */
export function materialSourceType(kind: AdaptableMaterialKind): string {
  return kind === "card" ? "evidence" : kind;
}

// ── Normalized selected material ──────────────────────────────────────────────

export interface SelectedMaterial {
  kind: AdaptableMaterialKind;
  /** Backend id — used in requests only, never rendered. */
  id: string;
  /** Human label shown everywhere. */
  title: string;
  typeLabel: string;
  side: string | null;
  cite: string | null;
  /** Exact source text (cards only) — must be rendered as a labeled quote. */
  exactText: string | null;
  /** The student's own notes — rendered separately from source text. */
  userNotes: string | null;
  supportVerdict: string | null;
  cardStatus: string | null;
  /** Argument summary / frontline opponent-claim context. */
  contextText: string | null;
  /** For picker recency ordering. */
  sortDate: string;
  /** Resolution scope for filtering — never rendered directly. */
  resolutionId: string | null;
}

export function normalizeCardMaterial(row: LibrarySearchResult): SelectedMaterial {
  return {
    kind: "card",
    id: row.card_id,
    title: row.tag?.trim() || "Untitled card",
    typeLabel: MATERIAL_KIND_LABELS.card,
    side: row.side ?? null,
    cite: row.cite ?? null,
    exactText: row.body_preview || null,
    userNotes: row.user_notes ?? null,
    supportVerdict: row.support_verdict ?? null,
    cardStatus: row.card_status ?? null,
    contextText: row.argument_title ? `Supports: ${row.argument_title}` : null,
    sortDate: row.saved_at,
    resolutionId: row.resolution_id ?? null,
  };
}

export function normalizeArgumentMaterial(a: Argument): SelectedMaterial {
  return {
    kind: "argument",
    id: a.id,
    title: a.title,
    typeLabel: describeArgumentType(a.argument_type),
    side: a.side && a.side !== "neutral" ? a.side : null,
    cite: null,
    exactText: null,
    userNotes: null,
    supportVerdict: null,
    cardStatus: null,
    contextText: a.summary ?? null,
    sortDate: a.updated_at,
    resolutionId: a.resolution_id ?? null,
  };
}

export function normalizeFrontlineMaterial(f: Frontline): SelectedMaterial {
  return {
    kind: "frontline",
    id: f.id,
    title: f.title,
    typeLabel: MATERIAL_KIND_LABELS.frontline,
    side: f.side && f.side !== "neutral" ? f.side : null,
    cite: null,
    exactText: null,
    userNotes: null,
    supportVerdict: null,
    cardStatus: null,
    contextText: f.opponent_claim ? `Answers: “${f.opponent_claim}”` : null,
    sortDate: f.updated_at,
    resolutionId: f.resolution_id ?? null,
  };
}

// ── Integrity warnings + safety ───────────────────────────────────────────────

/** Human warnings from a material's real verdict/status fields. */
export function deriveMaterialWarnings(m: SelectedMaterial): string[] {
  const warnings: string[] = [];
  if (m.supportVerdict === "unsupported") warnings.push("Verdict: does not support its claim");
  if (m.supportVerdict === "contradicted") warnings.push("Verdict: contradicted by its source");
  if (m.supportVerdict === "partially_supported") warnings.push("Verdict: only partially supported");
  if (m.cardStatus === "flagged") warnings.push("Flagged for review");
  if (m.kind === "card" && !m.cite) warnings.push("No citation on file");
  return warnings;
}

/**
 * Unsupported/contradicted evidence must never be treated as safe: adapting
 * delivery cannot fix a card that misstates its source. Everything else
 * (including unverified) may proceed — with warnings shown.
 */
export function isMaterialSafeToAdapt(m: SelectedMaterial): boolean {
  return m.supportVerdict !== "unsupported" && m.supportVerdict !== "contradicted";
}

// ── Picker filtering ──────────────────────────────────────────────────────────

export interface MaterialFilter {
  query?: string;
  kind?: AdaptableMaterialKind | "all";
  side?: "pro" | "con" | "all";
  resolutionId?: string | "all";
}

export function filterMaterials(
  materials: SelectedMaterial[],
  filter: MaterialFilter,
): SelectedMaterial[] {
  const q = filter.query?.trim().toLowerCase() ?? "";
  return materials.filter((m) => {
    if (filter.kind && filter.kind !== "all" && m.kind !== filter.kind) return false;
    if (filter.side && filter.side !== "all" && m.side !== filter.side) return false;
    if (filter.resolutionId && filter.resolutionId !== "all" && m.resolutionId !== filter.resolutionId) return false;
    if (q) {
      const haystack = [m.title, m.cite, m.contextText, m.typeLabel]
        .filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Newest first — the picker's "recent materials" ordering. */
export function sortMaterialsByRecency(materials: SelectedMaterial[]): SelectedMaterial[] {
  return [...materials].sort(
    (a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime(),
  );
}

// ── Judge profile priorities (plan §13.3, debate-native) ─────────────────────

export const JUDGE_PRIORITIES: Record<Exclude<JudgeType, "custom">, string[]> = {
  lay: ["Clarity", "Story", "Real-world consequence"],
  parent: ["Common sense", "Professional tone", "Concrete examples"],
  flow: ["Line-by-line", "Drops", "Weighing"],
  technical: ["Precise resolution", "Concessions", "Comparative warrants"],
  coach: ["Skill growth", "Strategic choices", "Repeated patterns"],
};

export function judgePriorities(judgeType: JudgeType): string[] {
  return (JUDGE_PRIORITIES as Record<string, string[]>)[judgeType] ?? [];
}

// ── Adaptation readiness ──────────────────────────────────────────────────────

export type AdaptationReadiness =
  | { state: "ready" }
  | { state: "no-material"; reason: string }
  | { state: "no-judge"; reason: string }
  | { state: "unsafe-material"; reason: string };

/** Whether the workspace can truthfully generate an adaptation right now. */
export function deriveAdaptationReadiness(
  material: SelectedMaterial | null,
  judgeType: JudgeType | null,
): AdaptationReadiness {
  if (!material) {
    return {
      state: "no-material",
      reason: "Pick a saved card, argument, or frontline to adapt.",
    };
  }
  if (!isMaterialSafeToAdapt(material)) {
    return {
      state: "unsafe-material",
      reason:
        "This card's verdict says it doesn't support its claim. Fix the evidence in your Library first — adapting delivery can't make it safe.",
    };
  }
  if (!judgeType) {
    return { state: "no-judge", reason: "Choose the judge you're adapting for." };
  }
  return { state: "ready" };
}

/** Request body for the existing /judge-adaptation endpoints. */
export function adaptationRequestBody(
  userId: string,
  judgeType: JudgeType,
  material: SelectedMaterial,
): { user_id: string; judge_type: JudgeType; source_type: string; source_id: string } {
  return {
    user_id: userId,
    judge_type: judgeType,
    source_type: materialSourceType(material.kind),
    source_id: material.id,
  };
}

/** What adaptation may and may not change — shown alongside every result. */
export const ADAPTATION_INTEGRITY_RULES = {
  canChange: ["Delivery and pacing", "Framing and story", "Order and emphasis", "Vocabulary level"],
  mustNotChange: ["Quoted source text", "What the evidence claims", "Citations", "Statistical findings"],
} as const;
