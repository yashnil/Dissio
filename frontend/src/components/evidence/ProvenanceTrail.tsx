"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ArrowDown } from "lucide-react";
import { buildProvenance, PROVENANCE_ORIGIN_LABEL, type ProvenanceOrigin } from "@/lib/evidenceProvenance";
import type { CardDraft } from "@/types";
import { cn } from "@/lib/utils";

const ORIGIN_CLS: Record<ProvenanceOrigin, string> = {
  query: "border-hairline bg-surface-2 text-ink-subtle",
  source: "border-authored-user/40 bg-authored-user/[0.08] text-ink",
  user: "border-authored-coach/40 bg-authored-coach/[0.08] text-ink",
  ai: "border-authored-ai/40 bg-authored-ai/[0.08] text-ink",
};

/**
 * Provenance trail: query → source → exact passage → selected quote → card,
 * with each node tagged by author (Source / You / AI) so the three never blur.
 * Collapsed by default to keep the card list compact.
 */
export default function ProvenanceTrail({ card }: { card: CardDraft }) {
  const [open, setOpen] = useState(false);
  const nodes = buildProvenance(card);
  if (nodes.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-ink-subtle transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        Provenance
        <span className="ml-auto text-[11px] text-ink-muted">source → quote → card</span>
      </button>

      {open && (
        <ol className="flex flex-col gap-0 border-t border-border px-3 py-3">
          {nodes.map((node, i) => (
            <li key={node.step} className="flex flex-col">
              <div className={cn("flex flex-col gap-0.5 rounded-lg border p-2.5", ORIGIN_CLS[node.origin])}>
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">{node.step}</span>
                  <span className="ml-auto rounded border border-current/30 px-1 text-[8px] font-semibold uppercase opacity-80">
                    {PROVENANCE_ORIGIN_LABEL[node.origin]}
                  </span>
                </span>
                <span className="text-[11px] font-medium text-ink-subtle">{node.label}</span>
                <span className="text-xs leading-relaxed">{node.content}</span>
              </div>
              {i < nodes.length - 1 && (
                <ArrowDown size={12} className="my-0.5 ml-2 text-hairline-strong" aria-hidden />
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
