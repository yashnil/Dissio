/**
 * Pure helper functions for Research-to-Card Evidence Builder.
 * No side effects, no API calls — safe to use in tests without mocking.
 */

import type { CardDraft, CardPurpose, CardSourceType, EvidenceRole, HighlightSpan, SearchDiagnostics, SourceQuality, SupportLevel } from "@/types";

// ── Source quality labels ─────────────────────────────────────────────────────

export function sourceQualityLabel(quality: SourceQuality | null | undefined): string {
  switch (quality) {
    case "high":    return "High credibility";
    case "medium":  return "Medium credibility";
    case "low":     return "Low credibility";
    default:        return "Unknown credibility";
  }
}

export function sourceQualityColor(quality: SourceQuality | null | undefined): string {
  switch (quality) {
    case "high":    return "text-ok";
    case "medium":  return "text-warn";
    case "low":     return "text-danger";
    default:        return "text-ink-subtle";
  }
}

export function sourceQualityBadgeStyle(quality: SourceQuality | null | undefined): string {
  switch (quality) {
    case "high":    return "bg-ok/10 text-ok border border-ok/30";
    case "medium":  return "bg-warn/10 text-warn border border-warn/30";
    case "low":     return "bg-danger/10 text-danger border border-danger/30";
    default:        return "bg-surface-2 text-ink-subtle border border-hairline";
  }
}

// ── Card source type ──────────────────────────────────────────────────────────

export function cardSourceTypeLabel(type: CardSourceType | null | undefined): string {
  switch (type) {
    case "url":              return "From URL";
    case "manual_paste":     return "Manually pasted";
    case "research_search":  return "Found via search";
    default:                 return "Unknown source";
  }
}

// ── Cite formatting ───────────────────────────────────────────────────────────

export function formatCardCite(draft: Pick<CardDraft, "author" | "publication" | "published_date" | "title" | "url">): string {
  const parts: string[] = [];
  if (draft.author) parts.push(draft.author);
  if (draft.publication) parts.push(draft.publication);
  if (draft.published_date) {
    const yearMatch = draft.published_date.match(/(19|20)\d{2}/);
    if (yearMatch) parts.push(yearMatch[0]);
  }
  if (draft.title && draft.title.length <= 80) parts.push(`"${draft.title}"`);
  if (parts.length === 0) return draft.url ?? "";
  return parts.join(" · ");
}

// ── Missing metadata ──────────────────────────────────────────────────────────

export function hasMissingMetadata(draft: Pick<CardDraft, "missing_metadata_json">): string[] {
  return Object.values(draft.missing_metadata_json ?? {});
}

// ── Save eligibility ──────────────────────────────────────────────────────────

export function canSaveCard(draft: CardDraft): boolean {
  return (
    draft.status === "draft" &&
    draft.body_text.trim().length >= 40 &&
    draft.tag.trim().length > 0
  );
}

// ── Support level labels ──────────────────────────────────────────────────────

export function supportLevelLabel(level: SupportLevel | null | undefined): string {
  switch (level) {
    case "strong_support":  return "Strong support";
    case "partial_support": return "Partial support";
    case "weak_support":    return "Weak support";
    case "no_support":      return "No support";
    default:                return "Support unknown";
  }
}

export function supportLevelBadgeStyle(level: SupportLevel | null | undefined): string {
  switch (level) {
    case "strong_support":  return "bg-ok/10 text-ok border border-ok/30";
    case "partial_support": return "bg-warn/10 text-warn border border-warn/30";
    case "weak_support":    return "bg-warn/10 text-warn border border-warn/30";
    case "no_support":      return "bg-danger/10 text-danger border border-danger/30";
    default:                return "bg-surface-2 text-ink-subtle border border-hairline";
  }
}

// ── Card purpose labels ───────────────────────────────────────────────────────

export function cardPurposeLabel(purpose: CardPurpose | null | undefined): string {
  switch (purpose) {
    case "uniqueness":    return "Uniqueness";
    case "link":          return "Link";
    case "internal_link": return "Internal link";
    case "impact":        return "Impact";
    case "answer":        return "Answer";
    case "frontline":     return "Frontline";
    case "weighing":      return "Weighing";
    case "background":    return "Background";
    case "solvency":      return "Solvency";
    case "harm":          return "Harm";
    default:              return "Evidence";
  }
}

// ── Search diagnostics ────────────────────────────────────────────────────────

/**
 * Return a short human-readable summary of what the search pipeline did.
 * Used in the "No cards found" panel.
 */
export function formatDiagnosticsSummary(d: SearchDiagnostics | null | undefined): string {
  if (!d) return "";
  const tried = d.sources_attempted;
  const extracted = d.sources_extracted;
  const filtered = d.filtered_no_support + d.filtered_low_quality;
  if (tried === 0) return "No sources were fetched.";
  if (extracted === 0) return `Found ${d.sources_found} result(s) but could not extract text.`;
  if (filtered === 0) return `Checked ${extracted} source(s) — no matching passages found.`;
  return (
    `Checked ${extracted} source(s). ` +
    (d.filtered_low_quality > 0 ? `${d.filtered_low_quality} filtered for low credibility. ` : "") +
    (d.filtered_no_support > 0 ? `${d.filtered_no_support} passage(s) did not support the claim.` : "")
  ).trim();
}

/**
 * Return true if the diagnostics object has enough data to be worth showing.
 */
export function hasDiagnostics(d: SearchDiagnostics | null | undefined): boolean {
  return !!(d && (d.sources_found > 0 || d.sources_attempted > 0));
}

// ── Evidence role labels ──────────────────────────────────────────────────────

export function evidenceRoleLabel(role: EvidenceRole | null | undefined): string {
  switch (role) {
    case "direct_support":    return "Direct evidence";
    case "mechanism_support": return "Mechanism";
    case "example_support":   return "Example/case";
    case "impact_support":    return "Impact";
    case "definition_support": return "Definition";
    case "authority_support": return "Authority";
    case "counter_evidence":  return "Counter-evidence";
    default:                  return "Evidence";
  }
}

export function evidenceRoleGroupLabel(role: EvidenceRole | null | undefined): string {
  switch (role) {
    case "direct_support":    return "Direct support";
    case "mechanism_support": return "Mechanism cards";
    case "example_support":   return "Example / case cards";
    case "impact_support":    return "Impact / harm cards";
    case "definition_support": return "Definition cards";
    case "authority_support": return "Authority cards";
    case "counter_evidence":  return "Counter-evidence (review carefully)";
    default:                  return "Evidence";
  }
}

export const EVIDENCE_ROLE_ORDER: EvidenceRole[] = [
  "direct_support", "mechanism_support", "example_support",
  "impact_support", "authority_support", "definition_support", "counter_evidence",
];

export function evidenceRoleBadgeStyle(role: EvidenceRole | null | undefined): string {
  switch (role) {
    case "direct_support":    return "bg-ok/10 text-ok";
    case "mechanism_support": return "bg-lav/10 text-lav";
    case "example_support":   return "bg-lav/15 text-lav";
    case "impact_support":    return "bg-danger/10 text-danger";
    case "definition_support": return "bg-surface-2 text-ink-subtle";
    case "authority_support": return "bg-lav/10 text-lav";
    case "counter_evidence":  return "bg-warn/10 text-warn";
    default:                  return "bg-surface-2 text-ink-subtle";
  }
}

// ── Highlighted body rendering ────────────────────────────────────────────────

interface RenderedSegment {
  text: string;
  type: "plain" | "highlight" | "underline";
  reason?: string;
}

/**
 * Split body_text into plain/highlight/underline segments for rendering.
 *
 * Spans must be non-overlapping and within [0, body_text.length).
 * Out-of-range or overlapping spans are silently dropped.
 * Segments are always returned in order so rendering is deterministic.
 */
export function renderHighlightedBody(body: string, spans: HighlightSpan[]): RenderedSegment[] {
  if (!body) return [];
  if (!spans || spans.length === 0) return [{ text: body, type: "plain" }];

  // Validate and sort spans
  const valid = spans
    .filter(
      (s) =>
        typeof s.start === "number" &&
        typeof s.end === "number" &&
        s.start >= 0 &&
        s.end > s.start &&
        s.end <= body.length,
    )
    .sort((a, b) => a.start - b.start);

  // Remove overlapping spans (keep earlier one)
  const merged: HighlightSpan[] = [];
  let cursor = 0;
  for (const span of valid) {
    if (span.start >= cursor) {
      merged.push(span);
      cursor = span.end;
    }
  }

  const segments: RenderedSegment[] = [];
  let pos = 0;
  for (const span of merged) {
    if (span.start > pos) {
      segments.push({ text: body.slice(pos, span.start), type: "plain" });
    }
    segments.push({
      text: body.slice(span.start, span.end),
      type: span.type === "underline" ? "underline" : "highlight",
      reason: span.reason,
    });
    pos = span.end;
  }
  if (pos < body.length) {
    segments.push({ text: body.slice(pos), type: "plain" });
  }
  return segments;
}
