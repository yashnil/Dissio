/**
 * Transparent research summary — turns the real SearchDiagnostics returned after
 * a search into honest, ordered stages with actual counts (never a fake
 * percentage), plus the list of sources that were rejected and why. Pure + tested.
 */

import type { GenerateCardsResponse, SearchDiagnostics } from "@/types";

export interface ResearchStage {
  key: string;
  label: string;
  /** Real count summary, or null when the backend didn't report it. */
  detail: string | null;
}

function n(value: number | undefined | null): number | null {
  return typeof value === "number" ? value : null;
}

export function deriveResearchStages(resp: GenerateCardsResponse | null): ResearchStage[] {
  if (!resp) return [];
  const d: SearchDiagnostics | null | undefined = resp.diagnostics;
  const stages: ResearchStage[] = [];

  // 1. Interpreting the claim
  stages.push({
    key: "interpret",
    label: "Interpreting your claim",
    detail: resp.normalized_claim ? `Searched: “${resp.normalized_claim}”` : null,
  });

  // 2. Expanding queries
  const variants = d?.query_variants_used?.length ?? d?.queries_run?.length ?? null;
  stages.push({
    key: "expand",
    label: "Expanding search queries",
    detail: variants != null ? `${variants} quer${variants === 1 ? "y" : "ies"} run` : null,
  });

  // 3. Finding sources
  const found = n(d?.sources_found);
  const attempted = n(d?.sources_attempted);
  stages.push({
    key: "find",
    label: "Finding sources",
    detail: found != null ? `${found} found${attempted != null ? ` of ${attempted} attempted` : ""}` : null,
  });

  // 4. Rejecting weak sources
  const rejected =
    (n(d?.filtered_low_quality) ?? 0) +
    (n(d?.filtered_no_support) ?? 0) +
    (n(d?.rejected_by_low_source_quality) ?? 0) +
    (n(d?.rejected_by_low_debate_usefulness) ?? 0) +
    (n(d?.rejected_by_overclaim) ?? 0);
  stages.push({
    key: "reject",
    label: "Rejecting weak sources",
    detail: rejected > 0 ? `${rejected} filtered out` : (d ? "None filtered" : null),
  });

  // 5. Extracting passages
  const passages = n(d?.passages_considered) ?? n(d?.chunks_created);
  stages.push({
    key: "extract",
    label: "Extracting passages",
    detail: passages != null ? `${passages} passages considered` : null,
  });

  // 6. Validating quotes / candidates
  const candidates = n(d?.candidates_generated);
  stages.push({
    key: "validate",
    label: "Validating quotes",
    detail: candidates != null ? `${candidates} candidate${candidates === 1 ? "" : "s"} generated` : null,
  });

  // 7. Ranking candidates
  stages.push({
    key: "rank",
    label: "Ranking candidates",
    detail: `${resp.cards.length} card${resp.cards.length === 1 ? "" : "s"} cut${d?.reranker_used ? ` · ${d.reranker_used}` : ""}`,
  });

  return stages;
}

export interface RejectedSource {
  url: string;
  reason: string;
  quality: string | null;
}

const USED_STATUSES = new Set(["used", "included", "card", "selected", "accepted"]);

export function rejectedSources(resp: GenerateCardsResponse | null): RejectedSource[] {
  const considered = resp?.sources_considered ?? [];
  return considered
    .filter((s) => !USED_STATUSES.has((s.status ?? "").toLowerCase()))
    .map((s) => ({
      url: s.url,
      reason: s.reason || s.status || "Not used",
      quality: s.quality ?? null,
    }));
}

// ── No-results / failure classification ─────────────────────────────────────────

export type ResearchOutcome =
  | "cards_found"
  | "not_configured"
  | "no_credible_candidates"
  | "overly_narrow"
  | "retrieval_failure";

export interface ResearchOutcomeResult {
  outcome: ResearchOutcome;
  message: string;
  /** Concrete next steps / query improvements. */
  suggestions: string[];
  revisedClaims: string[];
}

export function classifyOutcome(
  resp: GenerateCardsResponse | null,
  fetchError?: string | null,
): ResearchOutcomeResult | null {
  if (fetchError) {
    return {
      outcome: "retrieval_failure",
      message: "We couldn't reach the research service. Your claim is fine — this was a connection problem.",
      suggestions: ["Check your connection and retry", "Try again in a moment"],
      revisedClaims: [],
    };
  }
  if (!resp) return null;
  if (!resp.search_configured) {
    return {
      outcome: "not_configured",
      message: resp.no_card_reason ?? "Research Search isn't configured on this server.",
      suggestions: resp.suggestions ?? [],
      revisedClaims: [],
    };
  }
  if (resp.cards.length > 0) {
    return { outcome: "cards_found", message: "", suggestions: [], revisedClaims: [] };
  }
  // Search ran but produced no cards.
  const hadCandidates = (resp.diagnostics?.candidates_generated ?? 0) > 0
    || (resp.diagnostics?.sources_found ?? 0) > 0;
  return {
    outcome: hadCandidates ? "overly_narrow" : "no_credible_candidates",
    message:
      resp.no_card_reason ??
      (hadCandidates
        ? "We found sources but none cleanly supported this exact claim — try broadening it."
        : "No credible sources surfaced for this claim. This doesn't mean none exist — try rephrasing."),
    suggestions: resp.suggestions ?? [],
    revisedClaims: resp.suggested_revised_claims ?? [],
  };
}
