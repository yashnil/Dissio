"use client";

import { GitBranch, Search } from "lucide-react";
import { decomposeClaim } from "@/lib/claimDecomposition";

interface ClaimDecompositionProps {
  claim: string;
  /** Search a single branch's refined query. */
  onSearchBranch: (query: string) => void;
  disabled?: boolean;
}

/**
 * Research plan: breaks the claim into angles (causal warrant, empirical
 * support, impact, counterargument, limitation). The student can search one
 * angle, or run the main search (which covers all of them).
 */
export default function ClaimDecomposition({ claim, onSearchBranch, disabled }: ClaimDecompositionProps) {
  const branches = decomposeClaim(claim);
  if (branches.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <GitBranch size={13} className="text-accent" aria-hidden />
        <p className="text-xs font-semibold text-ink">Research plan</p>
        <span className="text-[11px] text-ink-muted">Search one angle, or run the full search below for all.</span>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {branches.map((b) => (
          <li key={b.key}>
            <div className="flex h-full flex-col gap-1.5 rounded-lg border border-border bg-surface p-3">
              <p className="text-xs font-semibold text-ink">{b.label}</p>
              <p className="flex-1 text-[11px] leading-relaxed text-ink-muted">{b.description}</p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSearchBranch(b.query)}
                className="inline-flex w-fit items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/15 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Search size={10} aria-hidden /> Search this angle
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
