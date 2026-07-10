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

// ── Phase 7B: result / comparison normalization ──────────────────────────────

import type {
  AdaptationRisk,
  JudgeAdaptationResult,
  JudgeComparisonResult,
} from "@/types/judgeAdaptation";
import { JUDGE_TYPE_LABELS } from "@/types/judgeAdaptation";

/** Empty-safe view of an adaptation result. Every field mirrors a REAL
 *  backend field — nothing here invents content. */
export interface AdaptationView {
  judgeGoal: string | null;
  originalPurpose: string | null;
  emphasize: string[];
  simplify: string[];
  mustRemainExplicit: string[];
  canBeShortened: string[];
  suggestedPhrasing: string[];
  changes: JudgeAdaptationResult["changes"];
  risks: AdaptationRisk[];
  criticalRisks: AdaptationRisk[];
  deliveryNotes: string[];
  estimatedSeconds: number | null;
  adaptationId: string | null;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v : null;
const arr = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

export function normalizeAdaptationResult(result: JudgeAdaptationResult): AdaptationView {
  const deliveryNotes: string[] = [];
  const guide = result.evidence_guide;
  if (guide) {
    if (str(guide.best_practice_note)) deliveryNotes.push(guide.best_practice_note!);
    if (guide.estimated_read_time_seconds) {
      deliveryNotes.push(`Estimated read time: ${guide.estimated_read_time_seconds}s`);
    }
  }
  if (result.speech_plan?.time_allocation_notes) {
    deliveryNotes.push(result.speech_plan.time_allocation_notes);
  }

  return {
    judgeGoal: str(result.judge_goal),
    originalPurpose: str(result.original_purpose),
    emphasize: arr(result.what_to_emphasize),
    simplify: arr(result.what_to_simplify),
    mustRemainExplicit: arr(result.what_must_remain_explicit),
    canBeShortened: arr(result.what_can_be_shortened),
    suggestedPhrasing: arr(result.suggested_phrasing),
    changes: arr(result.changes),
    risks: arr(result.risks),
    criticalRisks: arr(result.critical_risks),
    deliveryNotes,
    estimatedSeconds: result.estimated_seconds || null,
    adaptationId: str(result.id),
  };
}

/**
 * "What did not change" — from real fields only: the material's own limits/
 * qualifiers (evidence guide) plus the explicit-keep list. The structural
 * integrity rules (quote/citation immutability) live in the checklist.
 */
export function deriveUnchangedItems(result: JudgeAdaptationResult): string[] {
  const items: string[] = [];
  const guide = result.evidence_guide;
  if (guide?.support_limit) items.push(`Support limit stands: ${guide.support_limit}`);
  if (guide?.relevant_qualifier) items.push(`Qualifier kept: ${guide.relevant_qualifier}`);
  for (const keep of arr(result.what_must_remain_explicit)) {
    items.push(`Stays explicit: ${keep}`);
  }
  return items;
}

/** The single next practice move, from real result data. */
export function deriveNextPracticeAction(view: AdaptationView): string {
  if (view.criticalRisks.length > 0) {
    return `Resolve first: ${view.criticalRisks[0].how_to_mitigate}`;
  }
  if (view.suggestedPhrasing.length > 0) {
    return "Practice the suggested phrasing out loud, then generate a judge workout to drill it.";
  }
  return "Generate a judge workout from the Workouts tab to drill this delivery.";
}

// ── Integrity checklist ───────────────────────────────────────────────────────

export type ChecklistStatus = "pass" | "warn" | "blocked" | "verify";

export interface IntegrityChecklistItem {
  label: string;
  status: ChecklistStatus;
  detail: string;
}

const OVERSTATEMENT_RISKS = new Set([
  "causal_overstatement", "source_qualification_inflated", "qualifier_removal",
]);

/**
 * Driven by real selected-material state and real response risks. "verify"
 * marks things only the student can confirm — never auto-passed.
 */
export function deriveIntegrityChecklist(
  material: SelectedMaterial,
  result: JudgeAdaptationResult | null,
): IntegrityChecklistItem[] {
  const items: IntegrityChecklistItem[] = [];

  if (!isMaterialSafeToAdapt(material)) {
    items.push({
      label: "Unsupported evidence not adapted",
      status: "blocked",
      detail: "This card's verdict fails its claim — adaptation is blocked until the evidence is fixed.",
    });
    return items;
  }
  items.push({
    label: "Unsupported evidence not adapted",
    status: "pass",
    detail: "No failing support verdict on this material.",
  });

  items.push({
    label: "Source quote unchanged",
    status: material.kind === "card" ? "pass" : "verify",
    detail:
      material.kind === "card"
        ? "The exact source text is shown above; the output below is delivery advice, not a rewrite."
        : "No quoted card text in this material — confirm any evidence you read stays verbatim.",
  });

  items.push({
    label: "Citation preserved",
    status: material.kind !== "card" ? "verify" : material.cite ? "pass" : "warn",
    detail:
      material.kind !== "card"
        ? "Cite any cards you read with this material."
        : material.cite
          ? `Citation on file: ${material.cite}`
          : "No citation on file — add one in the Library before round use.",
  });

  const overstated = (result ? [...result.risks, ...result.critical_risks] : []).filter(
    (r) => OVERSTATEMENT_RISKS.has(r.category),
  );
  items.push({
    label: "Claim not overstated",
    status: result === null ? "verify" : overstated.length > 0 ? "warn" : "pass",
    detail:
      result === null
        ? "Generate the adaptation to run overstatement checks."
        : overstated.length > 0
          ? overstated[0].description
          : "No overstatement risks flagged in this generation.",
  });

  items.push({
    label: "Judge-specific wording labeled as coaching",
    status: "pass",
    detail: "Everything generated here is delivery advice — it never replaces your saved material.",
  });

  items.push({
    label: "Verify before using in round",
    status: "verify",
    detail: "Read the adapted delivery against your card one final time before you compete with it.",
  });

  return items;
}

// ── Comparison normalization ──────────────────────────────────────────────────

export interface JudgeRiskColumn {
  judgeLabel: string;
  priorities: string[];
  risks: AdaptationRisk[];
}

export interface ComparisonView {
  judgeALabel: string;
  judgeBLabel: string;
  judgeAPriorities: string[];
  judgeBPriorities: string[];
  constants: string[];
  differences: JudgeComparisonResult["differences"];
  wordingDifferences: JudgeComparisonResult["wording_differences"];
  timeDifferences: JudgeComparisonResult["time_allocation_differences"];
  riskColumns: JudgeRiskColumn[];
  hasContent: boolean;
}

export function normalizeComparisonResult(result: JudgeComparisonResult): ComparisonView {
  const [a, b] = result.judge_types;
  const riskColumns: JudgeRiskColumn[] = Object.entries(result.strategic_risks_by_judge ?? {})
    .filter(([, risks]) => Array.isArray(risks) && risks.length > 0)
    .map(([judge, risks]) => ({
      judgeLabel: JUDGE_TYPE_LABELS[judge as keyof typeof JUDGE_TYPE_LABELS] ?? judge,
      priorities: judgePriorities(judge as Parameters<typeof judgePriorities>[0]),
      risks,
    }));
  const view: ComparisonView = {
    judgeALabel: JUDGE_TYPE_LABELS[a] ?? a,
    judgeBLabel: JUDGE_TYPE_LABELS[b] ?? b,
    judgeAPriorities: judgePriorities(a),
    judgeBPriorities: judgePriorities(b),
    constants: arr(result.constants),
    differences: arr(result.differences),
    wordingDifferences: arr(result.wording_differences),
    timeDifferences: arr(result.time_allocation_differences),
    riskColumns,
    hasContent: false,
  };
  view.hasContent =
    view.constants.length > 0 ||
    view.differences.length > 0 ||
    view.wordingDifferences.length > 0 ||
    view.timeDifferences.length > 0 ||
    view.riskColumns.length > 0;
  return view;
}

// ── History + notes display ───────────────────────────────────────────────────

export interface AdaptationHistoryRow {
  id: string;
  judge_type: string;
  source_type: string;
  risk_count: number | null;
  change_count: number | null;
  created_at: string;
}

export interface HistoryDisplay {
  /** Internal only — reopening; never rendered. */
  id: string;
  judgeLabel: string;
  materialKindLabel: string;
  date: string;
  summary: string;
}

const SOURCE_TYPE_KIND_LABELS: Record<string, string> = {
  evidence: "Evidence card",
  argument: "Argument",
  frontline: "Frontline",
  section: "Blockfile section",
  summary: "Summary",
  final_focus: "Final Focus",
  transcript: "Speech transcript",
};

/** Human history entry — the history endpoint returns no material titles, so
 *  entries are honestly limited to kind + judge + counts (never raw IDs). */
export function formatHistoryEntry(row: AdaptationHistoryRow): HistoryDisplay {
  const judgeLabel =
    JUDGE_TYPE_LABELS[row.judge_type as keyof typeof JUDGE_TYPE_LABELS] ?? row.judge_type;
  const parts: string[] = [];
  if (typeof row.change_count === "number") {
    parts.push(`${row.change_count} change${row.change_count === 1 ? "" : "s"}`);
  }
  if (typeof row.risk_count === "number") {
    parts.push(`${row.risk_count} risk${row.risk_count === 1 ? "" : "s"}`);
  }
  return {
    id: row.id,
    judgeLabel,
    materialKindLabel: SOURCE_TYPE_KIND_LABELS[row.source_type] ?? "Saved material",
    date: row.created_at,
    summary: parts.join(" · ") || "Generated",
  };
}

export interface AdaptationNote {
  id: string;
  adaptation_id: string;
  user_id: string;
  judge_type: string;
  note_text: string;
  created_at: string;
}

export function formatNoteLabel(note: Pick<AdaptationNote, "judge_type" | "created_at">): string {
  const judgeLabel =
    JUDGE_TYPE_LABELS[note.judge_type as keyof typeof JUDGE_TYPE_LABELS] ?? note.judge_type;
  return `${judgeLabel} · ${new Date(note.created_at).toLocaleDateString(undefined, {
    month: "short", day: "numeric",
  })}`;
}
