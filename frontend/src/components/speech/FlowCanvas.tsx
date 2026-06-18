"use client";

import { useMemo, useState } from "react";
import { Search, Rows3, Rows2, FileText, Target, X } from "lucide-react";
import type { ArgumentItem, JudgeType } from "@/types";
import {
  toFlowRows, filterFlowRows, statusFiltersFor, humanizeIssue,
  type FlowRow, type FlowNode, type FlowStatus,
} from "@/lib/flowModel";
import { cn } from "@/lib/utils";

interface FlowCanvasProps {
  args: ArgumentItem[];
  judgeMode?: JudgeType | "";
  /** Anchors within the report for cross-links. */
  transcriptHref?: string;
  drillsHref?: string;
}

const NODE_LABEL: Record<FlowNode["kind"], string> = {
  claim: "Claim",
  warrant: "Warrant",
  evidence: "Evidence",
  impact: "Impact",
};

const STATE_DOT: Record<FlowNode["state"], string> = {
  present: "bg-ok",
  weak: "bg-warn",
  missing: "bg-danger",
};

const TONE_BADGE: Record<FlowRow["tone"], string> = {
  ok: "border-ok/30 bg-ok/10 text-ok",
  warn: "border-warn/30 bg-warn/10 text-warn",
  danger: "border-danger/30 bg-danger/10 text-danger",
  lav: "border-lav/30 bg-lav/10 text-lav",
  ink: "border-hairline bg-surface-2 text-ink-subtle",
};

function NodeCell({ node, detailed }: { node: FlowNode; detailed: boolean }) {
  const missing = node.state === "missing";
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATE_DOT[node.state])} aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          {NODE_LABEL[node.kind]}
          {node.state === "weak" && <span className="ml-1 text-warn">· weak</span>}
        </span>
      </span>
      {missing ? (
        <span className="text-xs italic text-danger">Missing</span>
      ) : (
        <span className={cn("text-xs leading-relaxed text-ink", !detailed && "line-clamp-2")}>
          {node.text}
        </span>
      )}
    </div>
  );
}

export default function FlowCanvas({ args, judgeMode, transcriptHref, drillsHref }: FlowCanvasProps) {
  const rows = useMemo(() => toFlowRows(args), [args]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FlowStatus | "all">("all");
  const [detailed, setDetailed] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterFlowRows(rows, { query, status }),
    [rows, query, status],
  );
  const statusFilters = useMemo(() => statusFiltersFor(rows), [rows]);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search arguments…"
              aria-label="Search the flow"
              className="h-8 w-full rounded-md border border-hairline bg-surface-2 pl-8 pr-2 text-xs text-ink outline-none focus-visible:border-lav/50 focus-visible:ring-2 focus-visible:ring-lav/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setDetailed((d) => !d)}
            aria-pressed={detailed}
            className="flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2.5 text-xs text-ink-subtle transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
          >
            {detailed ? <Rows2 size={13} aria-hidden /> : <Rows3 size={13} aria-hidden />}
            <span className="hidden sm:inline">{detailed ? "Detailed" : "Compact"}</span>
          </button>
        </div>

        {statusFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
            <FilterChip active={status === "all"} onClick={() => setStatus("all")} label="All" count={rows.length} />
            {statusFilters.map((f) => (
              <FilterChip
                key={f.value}
                active={status === f.value}
                onClick={() => setStatus(status === f.value ? "all" : f.value)}
                label={f.label}
                count={f.count}
              />
            ))}
          </div>
        )}
        {judgeMode && (
          <p className="text-[11px] text-ink-faint">Viewing as a {judgeMode} judge.</p>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-hairline bg-surface-1 px-4 py-6 text-center text-xs text-ink-subtle">
          No arguments match this filter.
        </p>
      ) : (
        <>
          {/* ── Desktop matrix ─────────────────────────────────────────── */}
          <div className="hidden overflow-hidden rounded-xl border border-hairline md:block">
            <div className="grid grid-cols-[minmax(120px,1fr)_2fr_2fr_2fr_2fr_auto] gap-px bg-hairline text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              {["Argument", "Claim", "Warrant", "Evidence", "Impact", "Status"].map((h) => (
                <div key={h} className="bg-surface-2 px-3 py-2">{h}</div>
              ))}
            </div>
            <div className="flex flex-col gap-px bg-hairline">
              {filtered.map((row) => {
                const dim = focusedId !== null && focusedId !== row.id;
                const focused = focusedId === row.id;
                return (
                  <div key={row.id} className={cn("transition-opacity", dim && "opacity-40")}>
                    <button
                      type="button"
                      onClick={() => setFocusedId(focused ? null : row.id)}
                      aria-pressed={focused}
                      className={cn(
                        "grid w-full grid-cols-[minmax(120px,1fr)_2fr_2fr_2fr_2fr_auto] gap-px bg-hairline text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50",
                      )}
                    >
                      <div className={cn("flex flex-col gap-1 px-3 py-3", focused ? "bg-lav/[0.06]" : "bg-surface-1")}>
                        <span className="text-xs font-semibold text-ink">{row.label}</span>
                        <span className="text-[10px] capitalize text-ink-faint">{row.type}</span>
                      </div>
                      {row.nodes.map((node) => (
                        <div key={node.kind} className={cn("px-3 py-3", focused ? "bg-lav/[0.06]" : "bg-surface-1")}>
                          <NodeCell node={node} detailed={detailed} />
                        </div>
                      ))}
                      <div className={cn("flex items-start px-3 py-3", focused ? "bg-lav/[0.06]" : "bg-surface-1")}>
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", TONE_BADGE[row.tone])}>
                          {row.statusLabel}
                        </span>
                      </div>
                    </button>
                    {focused && (
                      <FocusDetail row={row} transcriptHref={transcriptHref} drillsHref={drillsHref} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Mobile argument cards ──────────────────────────────────── */}
          <ul className="flex flex-col gap-2 md:hidden">
            {filtered.map((row) => (
              <li key={row.id} className="rounded-xl border border-hairline bg-surface-1 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{row.label}</span>
                    <span className="text-[10px] capitalize text-ink-faint">{row.type}</span>
                  </span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", TONE_BADGE[row.tone])}>
                    {row.statusLabel}
                  </span>
                </div>
                <div className="flex flex-col gap-2 border-l border-hairline pl-3">
                  {row.nodes.map((node) => (
                    <NodeCell key={node.kind} node={node} detailed />
                  ))}
                </div>
                <FocusDetail row={row} transcriptHref={transcriptHref} drillsHref={drillsHref} inline />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50",
        active ? "border-lav/50 bg-lav/10 text-lav" : "border-hairline bg-surface-1 text-ink-subtle hover:text-ink",
      )}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function FocusDetail({
  row, transcriptHref, drillsHref, inline,
}: { row: FlowRow; transcriptHref?: string; drillsHref?: string; inline?: boolean }) {
  const hasIssues = row.issues.length > 0;
  if (!hasIssues && !transcriptHref && !drillsHref) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 bg-surface-2/50 px-3 py-2.5", !inline && "border-t border-hairline", inline && "mt-2 rounded-md")}>
      {hasIssues && (
        <div className="flex flex-wrap items-center gap-1.5">
          <X size={11} className="text-danger" aria-hidden />
          {row.issues.map((issue) => (
            <span key={issue} className="rounded border border-danger/25 bg-danger/5 px-1.5 py-0.5 text-[10px] text-danger">
              {humanizeIssue(issue)}
            </span>
          ))}
        </div>
      )}
      <div className="ml-auto flex items-center gap-3">
        {transcriptHref && (
          <a href={transcriptHref} className="flex items-center gap-1 text-[11px] font-medium text-lav hover:underline">
            <FileText size={11} aria-hidden /> Transcript
          </a>
        )}
        {drillsHref && row.tone !== "ok" && (
          <a href={drillsHref} className="flex items-center gap-1 text-[11px] font-medium text-lav hover:underline">
            <Target size={11} aria-hidden /> Drill this
          </a>
        )}
      </div>
    </div>
  );
}
