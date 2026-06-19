/**
 * Evidence provenance — the chain from search query to finished card, with each
 * node labeled by who authored it (source / user / AI) so the three never blur.
 * Pure + tested. Exact source text is surfaced verbatim, never rewritten.
 */

import type { CardDraft } from "@/types";

export type ProvenanceOrigin = "query" | "source" | "user" | "ai";

export interface ProvenanceNode {
  step: string;
  label: string;
  content: string;
  origin: ProvenanceOrigin;
}

function firstNonEmpty(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) {
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function sourceLabel(card: CardDraft): string {
  const author = firstNonEmpty(card.author);
  const pub = firstNonEmpty(card.publication, card.source_domain, card.source_title, card.title);
  const date = firstNonEmpty(card.published_date);
  return [author, pub, date].filter(Boolean).join(" · ") || (card.url ?? "Source");
}

export function buildProvenance(card: CardDraft): ProvenanceNode[] {
  const nodes: ProvenanceNode[] = [];

  const query = firstNonEmpty(card.claim_goal, card.topic);
  if (query) {
    nodes.push({ step: "Search", label: "What you searched", content: query, origin: "query" });
  }

  nodes.push({ step: "Source", label: "Where it's from", content: sourceLabel(card), origin: "source" });

  const passage = firstNonEmpty(card.body_text);
  if (passage) {
    nodes.push({
      step: "Passage",
      label: "Exact source text — unedited",
      content: passage.length > 280 ? passage.slice(0, 280).trimEnd() + "…" : passage,
      origin: "source",
    });
  }

  const quote = firstNonEmpty(card.cut_text_with_ellipses);
  if (quote) {
    nodes.push({ step: "Quote", label: "Your selected cut", content: quote, origin: "user" });
  }

  const tag = firstNonEmpty(card.tag);
  if (tag) {
    nodes.push({
      step: "Card",
      label: card.generated_tag ? "AI-proposed tag" : "Your tag",
      content: tag,
      origin: card.generated_tag ? "ai" : "user",
    });
  }

  return nodes;
}

export const PROVENANCE_ORIGIN_LABEL: Record<ProvenanceOrigin, string> = {
  query: "Query",
  source: "Source",
  user: "You",
  ai: "AI",
};
