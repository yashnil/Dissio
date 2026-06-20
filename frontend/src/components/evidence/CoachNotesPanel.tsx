"use client";

import { useState } from "react";
import type { CardIntelligence } from "@/types";

const bestUseColors: Record<string, string> = {
  contention:  "bg-lav/10 border-lav/30 text-lav",
  rebuttal:    "bg-lav/15 border-lav/30 text-lav",
  weighing:    "bg-ok/10 border-ok/30 text-ok",
  definition:  "bg-surface-2 border-hairline text-ink-subtle",
  frontline:   "bg-warn/15 border-warn/30 text-warn",
  crossfire:   "bg-warn/10 border-warn/30 text-warn",
  impact:      "bg-danger/10 border-danger/30 text-danger",
  default:     "bg-surface-2 border-hairline text-ink-subtle",
};

export function CoachNotesPanel({
  intelligence,
  slotLabel,
  slotTargetClaim,
}: {
  intelligence?: CardIntelligence | null;
  slotLabel?: string | null;
  slotTargetClaim?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!intelligence || !intelligence.why_this_card) return null;

  const colorClass = bestUseColors[intelligence.best_use] ?? bestUseColors.default;

  return (
    <div className="border border-hairline rounded-lg overflow-hidden">
      {/* Always-visible top: why + best use */}
      <div className="px-3 py-2.5 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-ink uppercase tracking-wide">
            Coach
          </span>
          <span className={`text-[9px] px-2 py-0.5 rounded border font-medium ${colorClass}`}>
            {intelligence.best_use}
          </span>
          {slotLabel && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-hairline text-ink-subtle">
              {slotLabel}
            </span>
          )}
        </div>
        <p className="text-[11px] text-ink leading-relaxed">{intelligence.why_this_card}</p>

        {/* This proves — always shown if present */}
        {intelligence.supports_claim_because.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {intelligence.supports_claim_because.slice(0, 2).map((r, i) => (
              <div key={i} className="flex items-start gap-1">
                <span className="text-ok text-[9px] mt-0.5 shrink-0" aria-hidden="true">✓</span>
                <span className="text-[10px] text-ink leading-snug">{r}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expandable section */}
      {(intelligence.debate_use_notes.length > 0 ||
        intelligence.limitations.length > 0 ||
        intelligence.opponent_response ||
        intelligence.crossfire_question) && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-ink-subtle bg-surface-2 hover:bg-surface-1 border-t border-hairline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lav/50"
          >
            <span>{expanded ? "Show less" : "Pair with / Limitations / Crossfire"}</span>
            <span aria-hidden="true">{expanded ? "▲" : "▼"}</span>
          </button>
          {expanded && (
            <div className="px-3 pb-3 flex flex-col gap-2.5 border-t border-hairline">
              {slotTargetClaim && (
                <p className="text-[10px] text-ink-subtle italic pt-2">
                  Slot goal: {slotTargetClaim}
                </p>
              )}
              {intelligence.debate_use_notes.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold text-lav uppercase tracking-wide mb-1 mt-2">
                    Pair with
                  </p>
                  <ul className="text-[10px] text-ink-subtle list-none space-y-0.5">
                    {intelligence.debate_use_notes.map((n, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-lav mt-0.5" aria-hidden="true">→</span>
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {intelligence.limitations.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold text-warn uppercase tracking-wide mb-1">
                    Does not prove
                  </p>
                  <ul className="text-[10px] text-warn list-none space-y-0.5">
                    {intelligence.limitations.map((l, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="mt-0.5" aria-hidden="true">⚠</span>
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {intelligence.opponent_response && (
                <div>
                  <p className="text-[9px] font-semibold text-danger uppercase tracking-wide mb-1">
                    Opponent response
                  </p>
                  <p className="text-[10px] text-danger leading-relaxed">
                    {intelligence.opponent_response}
                  </p>
                </div>
              )}
              {intelligence.crossfire_question && (
                <div>
                  <p className="text-[9px] font-semibold text-lav uppercase tracking-wide mb-1">
                    Crossfire question
                  </p>
                  <p className="text-[10px] text-lav leading-relaxed">
                    {intelligence.crossfire_question}
                  </p>
                </div>
              )}
              {intelligence.suggested_block_label && (
                <p className="text-[9px] font-mono text-ink-subtle border-t border-hairline pt-1.5">
                  Block label:{" "}
                  <span className="text-ink font-medium">{intelligence.suggested_block_label}</span>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default CoachNotesPanel;
