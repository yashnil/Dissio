"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { CardDraft } from "@/types";
import { computeSaveReadiness } from "@/components/evidence/SaveReadinessGate";
import { EvidenceStudioModal } from "@/components/evidence/EvidenceStudioModal";

interface CardDraftReviewProps {
  draft: CardDraft;
  onSave: (draft: CardDraft, confirmed: boolean) => Promise<void>;
  onDiscard: (draftId: string) => Promise<void>;
  onPatch: (draftId: string, updates: Partial<CardDraft>) => Promise<void>;
  saving?: boolean;
  discarding?: boolean;
}

const READINESS_DOT: Record<string, string> = {
  ready:         "bg-ok",
  review_needed: "bg-warn",
  verify_source: "bg-danger",
};
const READINESS_LABEL: Record<string, string> = {
  ready:         "Ready",
  review_needed: "Review needed",
  verify_source: "Verify source",
};

export default function CardDraftReview({
  draft,
  onSave,
  onDiscard,
  saving = false,
  discarding = false,
}: CardDraftReviewProps) {
  const [studioOpen, setStudioOpen] = useState(false);
  const { level: readiness } = computeSaveReadiness(draft);

  const displayTag = draft.tag || "Untitled card";
  const citeDisplay = draft.cite || draft.short_cite || draft.author || "";
  const publication = draft.publication || draft.citation?.publication_name || "";
  const evidencePreview = (draft.cut_text_with_ellipses || draft.body_text || "")
    .replace(/\n+/g, " ").trim().slice(0, 130);

  async function handleSave(card: CardDraft) {
    await onSave(card, true);
    setStudioOpen(false);
  }

  async function handleDiscard(id: string) {
    await onDiscard(id);
  }

  return (
    <>
      {studioOpen && (
        <EvidenceStudioModal
          card={draft}
          claimGoal={draft.claim_goal}
          onSave={(c) => { onSave(c, true); setStudioOpen(false); }}
          onDiscard={handleDiscard}
          onClose={() => setStudioOpen(false)}
        />
      )}

      <div
        className={`min-w-0 w-full rounded-xl border border-hairline bg-surface-1 hover:shadow-sm transition-shadow ${
          discarding ? "opacity-50" : ""
        }`}
      >
        <div className="flex items-stretch gap-0">
          {/* Left: tag + cite + preview */}
          <div className="flex-1 min-w-0 px-4 py-3.5 flex flex-col gap-1">
            {draft.url && (
              <p className="text-[10px] text-ink-faint truncate">
                {draft.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
              </p>
            )}
            <p
              className="text-[15px] font-semibold text-ink leading-snug break-words"
              style={{ fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif' }}
            >
              {displayTag}
            </p>
            {(citeDisplay || publication) && (
              <p
                className="text-[12px] text-ink-subtle truncate"
                style={{ fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif' }}
              >
                {citeDisplay}
                {publication && <span className="text-ink-faint"> — {publication}</span>}
              </p>
            )}
            {evidencePreview && (
              <p
                className="text-[12px] text-ink-faint leading-relaxed line-clamp-2 mt-0.5"
                style={{ fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif' }}
              >
                {evidencePreview}{evidencePreview.length >= 130 ? "…" : ""}
              </p>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex flex-col items-end justify-between px-3 py-3 gap-2 shrink-0 border-l border-hairline">
            {/* Readiness */}
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${READINESS_DOT[readiness] ?? "bg-hairline-strong"}`} />
              <span className="text-[10px] text-ink-subtle">{READINESS_LABEL[readiness] ?? readiness}</span>
            </div>
            {/* Open Studio */}
            <button
              onClick={() => setStudioOpen(true)}
              className="text-[11px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/85 transition-colors font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
            >
              Open Studio
            </button>
            {/* Quick save */}
            {readiness === "ready" && (
              <button
                onClick={() => handleSave(draft)}
                disabled={saving}
                className="text-[10px] px-2.5 py-1 rounded-lg border border-ok/40 text-ok hover:bg-ok/10 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ok/50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
            {/* Discard */}
            <button
              onClick={() => handleDiscard(draft.id)}
              disabled={discarding}
              aria-label="Discard draft"
              title="Discard draft"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
