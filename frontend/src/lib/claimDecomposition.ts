/**
 * Claim decomposition — breaks a debate claim into research branches so a
 * student can search one angle at a time or all of them. Pure + tested.
 *
 * Each branch carries a refined search query (a re-phrasing of the claim toward
 * that angle) and an evidence-role hint that aligns with the backend's
 * EvidenceRole vocabulary. We never invent sources here — only research intent.
 */

import type { EvidenceRole } from "@/types";

export type BranchKey =
  | "causal_warrant"
  | "empirical_support"
  | "impact"
  | "counterargument"
  | "limitation";

export interface ResearchBranch {
  key: BranchKey;
  label: string;
  /** What this branch looks for. */
  description: string;
  /** Evidence-role hint (maps to the backend role taxonomy). */
  role: EvidenceRole;
  /** A claim re-phrased toward this angle, used as the search query. */
  query: string;
}

function clean(claim: string): string {
  return claim.trim().replace(/\s+/g, " ").replace(/[.?!]+$/, "");
}

const BRANCHES: {
  key: BranchKey;
  label: string;
  description: string;
  role: EvidenceRole;
  query: (c: string) => string;
}[] = [
  {
    key: "causal_warrant",
    label: "Causal warrant",
    description: "Why the claim is true — the mechanism linking cause to effect.",
    role: "mechanism_support",
    query: (c) => `how and why ${c} — mechanism`,
  },
  {
    key: "empirical_support",
    label: "Empirical support",
    description: "Data, studies, and statistics that back the claim.",
    role: "direct_support",
    query: (c) => `${c} — evidence, data, studies`,
  },
  {
    key: "impact",
    label: "Impact",
    description: "Why it matters — the consequences and magnitude.",
    role: "impact_support",
    query: (c) => `consequences and impact of ${c}`,
  },
  {
    key: "counterargument",
    label: "Counterargument",
    description: "The strongest case against the claim, to pre-empt or answer.",
    role: "counter_evidence",
    query: (c) => `arguments against ${c}`,
  },
  {
    key: "limitation",
    label: "Limitation",
    description: "Where the claim breaks down — scope, caveats, conditions.",
    role: "counter_evidence",
    query: (c) => `limitations and caveats of ${c}`,
  },
];

export function decomposeClaim(claim: string): ResearchBranch[] {
  const c = clean(claim);
  if (!c) return [];
  return BRANCHES.map((b) => ({
    key: b.key,
    label: b.label,
    description: b.description,
    role: b.role,
    query: b.query(c),
  }));
}

// ── Research depth ───────────────────────────────────────────────────────────

export type ResearchDepth = "quick" | "standard" | "deep";

export interface ResearchDepthOption {
  key: ResearchDepth;
  label: string;
  hint: string;
}

export const RESEARCH_DEPTH_OPTIONS: ResearchDepthOption[] = [
  { key: "quick", label: "Quick", hint: "Fewer sources, fastest" },
  { key: "standard", label: "Standard", hint: "Balanced coverage" },
  { key: "deep", label: "Deep", hint: "More sources, slower" },
];
