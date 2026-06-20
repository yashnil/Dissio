"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Check, XCircle } from "lucide-react";
import { deriveResearchStages, rejectedSources } from "@/lib/researchStages";
import type { GenerateCardsResponse } from "@/types";

/**
 * Transparent "how this search went" summary — real stage counts from the
 * backend diagnostics (never a percentage) plus the sources that were rejected
 * and why. Collapsed by default.
 */
export default function ResearchSummary({ result }: { result: GenerateCardsResponse }) {
  const [open, setOpen] = useState(false);
  const stages = deriveResearchStages(result);
  const rejected = rejectedSources(result);
  if (stages.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-ink-subtle transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        How this search went
        {rejected.length > 0 && (
          <span className="ml-auto text-[11px] text-ink-muted">{rejected.length} source{rejected.length === 1 ? "" : "s"} rejected</span>
        )}
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
          <ol className="flex flex-col gap-1.5">
            {stages.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-xs">
                <Check size={12} className="shrink-0 text-ok" aria-hidden />
                <span className="text-ink">{s.label}</span>
                {s.detail && <span className="ml-auto tabular-nums text-ink-muted">{s.detail}</span>}
              </li>
            ))}
          </ol>

          {rejected.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-border pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Rejected sources</p>
              <ul className="flex flex-col gap-1">
                {rejected.slice(0, 8).map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-ink-muted">
                    <XCircle size={11} className="mt-0.5 shrink-0 text-danger/70" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{r.url}</span>
                    <span className="shrink-0 text-ink-faint">{r.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
