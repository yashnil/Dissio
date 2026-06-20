/**
 * Flow presentation model — derives a debate-flow view from the saved argument
 * map. Pure + tested so the Flow canvas can stay declarative.
 *
 * The backend gives us each argument's claim/warrant/evidence/impact, an
 * argument_type, an `issues` list, and a confidence. From that we derive a
 * per-node health state and a single semantic flow status. We never invent
 * opponent responses the data doesn't have — status reflects the real issues.
 */

import type { ArgumentItem, ArgumentType } from "@/types";

export type FlowNodeKind = "claim" | "warrant" | "evidence" | "impact";
export type FlowNodeState = "present" | "weak" | "missing";

export type FlowStatus =
  | "live"
  | "weighing"
  | "response"
  | "weak_warrant"
  | "unsupported_evidence"
  | "missing_impact"
  | "unclear";

export interface FlowNode {
  kind: FlowNodeKind;
  text: string;
  state: FlowNodeState;
}

export interface FlowRow {
  id: string;
  label: string;
  type: ArgumentType;
  nodes: FlowNode[];
  status: FlowStatus;
  statusLabel: string;
  /** Semantic tone token name for status (not color alone — paired with label). */
  tone: "ok" | "warn" | "danger" | "lav" | "ink";
  issues: string[];
  confidence: number | null;
}

function hasIssue(issues: string[], ...needles: string[]): boolean {
  return issues.some((i) => needles.some((n) => i.toLowerCase().includes(n)));
}

function isBlank(s: string | null | undefined): boolean {
  return !s || s.trim().length === 0;
}

function nodeState(kind: FlowNodeKind, item: ArgumentItem): FlowNodeState {
  const issues = item.issues ?? [];
  switch (kind) {
    case "claim":
      return isBlank(item.claim) ? "missing" : "present";
    case "warrant":
      if (isBlank(item.warrant)) return "missing";
      return hasIssue(issues, "warrant") ? "weak" : "present";
    case "evidence":
      if (isBlank(item.evidence)) return "missing";
      return hasIssue(issues, "evidence", "unsupported", "unverified") ? "weak" : "present";
    case "impact":
      if (isBlank(item.impact)) return "missing";
      return hasIssue(issues, "impact") ? "weak" : "present";
  }
}

const STATUS_META: Record<FlowStatus, { label: string; tone: FlowRow["tone"] }> = {
  live: { label: "Live", tone: "ok" },
  weighing: { label: "Weighing", tone: "lav" },
  response: { label: "Response", tone: "ink" },
  weak_warrant: { label: "Weak warrant", tone: "warn" },
  unsupported_evidence: { label: "Unsupported evidence", tone: "warn" },
  missing_impact: { label: "Missing impact", tone: "danger" },
  unclear: { label: "Needs work", tone: "warn" },
};

function deriveStatus(item: ArgumentItem, nodes: FlowNode[]): FlowStatus {
  if (item.argument_type === "weighing") return "weighing";
  if (item.argument_type === "response") return "response";
  const warrant = nodes.find((n) => n.kind === "warrant")!;
  const evidence = nodes.find((n) => n.kind === "evidence")!;
  const impact = nodes.find((n) => n.kind === "impact")!;
  if (impact.state === "missing") return "missing_impact";
  if (warrant.state !== "present") return "weak_warrant";
  if (evidence.state !== "present") return "unsupported_evidence";
  if ((item.issues ?? []).length > 0) return "unclear";
  return "live";
}

/** Humanize a raw issue token (e.g. "missing_warrant" → "Missing warrant"). */
export function humanizeIssue(issue: string): string {
  const s = issue.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function toFlowRow(item: ArgumentItem, index: number): FlowRow {
  const nodes: FlowNode[] = (["claim", "warrant", "evidence", "impact"] as FlowNodeKind[]).map(
    (kind) => ({
      kind,
      text:
        kind === "claim" ? item.claim
          : kind === "warrant" ? item.warrant
            : kind === "evidence" ? (item.evidence ?? "")
              : item.impact,
      state: nodeState(kind, item),
    }),
  );
  const status = deriveStatus(item, nodes);
  return {
    id: item.id ?? `arg_${index + 1}`,
    label: item.label || `Argument ${index + 1}`,
    type: item.argument_type,
    nodes,
    status,
    statusLabel: STATUS_META[status].label,
    tone: STATUS_META[status].tone,
    issues: item.issues ?? [],
    confidence: item.confidence,
  };
}

export function toFlowRows(args: ArgumentItem[]): FlowRow[] {
  return args.map(toFlowRow);
}

// ── Filtering ────────────────────────────────────────────────────────────────

export interface FlowFilter {
  query?: string;
  /** "all" or a specific status. */
  status?: FlowStatus | "all";
}

export function filterFlowRows(rows: FlowRow[], filter: FlowFilter): FlowRow[] {
  const q = (filter.query ?? "").trim().toLowerCase();
  const status = filter.status ?? "all";
  return rows.filter((row) => {
    if (status !== "all" && row.status !== status) return false;
    if (!q) return true;
    const hay = [row.label, ...row.nodes.map((n) => n.text), ...row.issues]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Status filters present in a set of rows, in canonical order (for filter chips). */
export function statusFiltersFor(rows: FlowRow[]): { value: FlowStatus; label: string; count: number }[] {
  const order: FlowStatus[] = [
    "live", "weighing", "response", "weak_warrant",
    "unsupported_evidence", "missing_impact", "unclear",
  ];
  return order
    .map((value) => ({
      value,
      label: STATUS_META[value].label,
      count: rows.filter((r) => r.status === value).length,
    }))
    .filter((f) => f.count > 0);
}

/** Count of arguments with any structural weakness (for the section summary). */
export function weakCount(rows: FlowRow[]): number {
  return rows.filter((r) => r.status !== "live" && r.status !== "weighing" && r.status !== "response").length;
}
