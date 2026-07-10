"use client";

/**
 * AdaptationResultView (Phase 7B) — the structured adaptation workspace.
 *
 * Original material (exact source text in a labeled quote) sits beside the
 * adapted DELIVERY guidance; below: what changed, what did not change, the
 * evidence-integrity checklist, delivery notes, saved notes, and the next
 * practice action. Every rendered field comes from the real backend response
 * or real material state — missing fields render truthful empty lines.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Circle, Loader2, OctagonAlert, Quote, TriangleAlert } from "lucide-react";
import { AdaptationChangesPanel } from "@/components/judge-adaptation/AdaptationChangesPanel";
import {
  normalizeAdaptationResult,
  deriveUnchangedItems,
  deriveNextPracticeAction,
  deriveIntegrityChecklist,
  formatNoteLabel,
  type AdaptationNote,
  type ChecklistStatus,
  type SelectedMaterial,
} from "@/lib/judgeAdaptationModel";
import { JUDGE_TYPE_LABELS, type JudgeAdaptationResult } from "@/types/judgeAdaptation";

const CHECK_ICONS: Record<ChecklistStatus, React.ReactNode> = {
  pass: <Check size={12} className="text-ok" aria-hidden="true" />,
  warn: <TriangleAlert size={12} className="text-warn" aria-hidden="true" />,
  blocked: <OctagonAlert size={12} className="text-danger" aria-hidden="true" />,
  verify: <Circle size={9} className="text-ink-faint" aria-hidden="true" />,
};

const CHECK_STATUS_TEXT: Record<ChecklistStatus, string> = {
  pass: "OK",
  warn: "Warning",
  blocked: "Blocked",
  verify: "You verify",
};

function GuidanceList({ title, items, tone }: { title: string; items: string[]; tone: "ok" | "warn" | "neutral" }) {
  if (items.length === 0) return null;
  const toneClass = tone === "ok" ? "border-ok/20 bg-ok/5" : tone === "warn" ? "border-warn/20 bg-warn/5" : "border-hairline bg-surface-1";
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">{title}</h4>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs leading-relaxed text-ink-subtle">{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function AdaptationResultView({
  material, result, notes, onAddNote, noteSaving, noteError,
}: {
  material: SelectedMaterial;
  result: JudgeAdaptationResult;
  notes: AdaptationNote[] | null;
  /** Present only when the backend persisted this adaptation (id exists). */
  onAddNote: ((text: string) => void) | null;
  noteSaving: boolean;
  noteError: string | null;
}) {
  const view = normalizeAdaptationResult(result);
  const unchanged = deriveUnchangedItems(result);
  const checklist = deriveIntegrityChecklist(material, result);
  const nextAction = deriveNextPracticeAction(view);
  const [noteText, setNoteText] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move keyboard focus to the result once it renders (announced heading).
  useEffect(() => { headingRef.current?.focus(); }, []);

  return (
    <section aria-label="Adaptation result" className="flex flex-col gap-4">
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="text-heading text-ink focus-visible:outline-none"
      >
        Delivery plan for a {JUDGE_TYPE_LABELS[result.judge_type].toLowerCase()}
      </h3>
      <p role="status" className="sr-only">Adaptation generated.</p>

      {/* Original vs adapted */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border border-hairline bg-surface-1 px-4 py-3.5">
          <h4 className="text-eyebrow text-ink-subtle">Original material</h4>
          <p className="text-sm font-semibold text-ink">{material.title}</p>
          {view.originalPurpose && (
            <p className="text-xs text-ink-subtle">Purpose: {view.originalPurpose}</p>
          )}
          {material.cite && <p className="text-xs text-ink-faint">{material.cite}</p>}
          {material.exactText ? (
            <blockquote className="flex gap-2 rounded-lg border border-hairline bg-surface-2/60 px-3 py-2.5">
              <Quote size={11} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  Exact source text — unchanged
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-subtle">{material.exactText}</p>
              </div>
            </blockquote>
          ) : (
            material.contextText && (
              <p className="text-xs leading-relaxed text-ink-subtle">{material.contextText}</p>
            )
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-lav/25 bg-lav/5 px-4 py-3.5">
          <h4 className="text-eyebrow text-lav-hi">Adapted delivery — coaching advice</h4>
          {view.judgeGoal && (
            <p className="text-sm leading-relaxed text-ink">{view.judgeGoal}</p>
          )}
          {view.suggestedPhrasing.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                Suggested phrasing (say it like this)
              </p>
              <ul className="mt-1 flex flex-col gap-1.5">
                {view.suggestedPhrasing.map((p, i) => (
                  <li key={i} className="rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 text-xs italic leading-relaxed text-ink-subtle">
                    &ldquo;{p}&rdquo;
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-ink-faint">
              No suggested phrasing returned for this material — use the emphasis and
              simplification guidance below.
            </p>
          )}
          {view.estimatedSeconds && (
            <p className="text-xs text-ink-faint">Estimated delivery: ~{view.estimatedSeconds}s</p>
          )}
        </div>
      </div>

      {/* Guidance lists — real backend fields */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <GuidanceList title="Emphasize" items={view.emphasize} tone="ok" />
        <GuidanceList title="Simplify" items={view.simplify} tone="warn" />
        <GuidanceList title="Can be shortened" items={view.canBeShortened} tone="neutral" />
        <GuidanceList title="Delivery notes" items={view.deliveryNotes} tone="neutral" />
      </div>

      {/* What did not change */}
      <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3">
        <h4 className="text-eyebrow text-ink-subtle">What did not change</h4>
        {unchanged.length > 0 ? (
          <ul className="mt-1.5 flex flex-col gap-1">
            {unchanged.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-subtle">
                <Check size={11} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-ink-faint">
            This generation returned no explicit keep-list — your quoted evidence and
            citations are never altered regardless (see checklist below).
          </p>
        )}
      </div>

      {/* What changed + risks (existing panel, real fields) */}
      <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3">
        <h4 className="mb-2 text-eyebrow text-ink-subtle">What changed</h4>
        {view.changes.length === 0 && view.risks.length === 0 ? (
          <p className="text-xs text-ink-faint">No delivery changes were returned for this judge.</p>
        ) : (
          <AdaptationChangesPanel changes={view.changes} risks={view.risks} />
        )}
      </div>

      {/* Evidence integrity checklist */}
      <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3">
        <h4 className="text-eyebrow text-ink-subtle">Evidence integrity checklist</h4>
        <ul className="mt-2 flex flex-col gap-2">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">{CHECK_ICONS[item.status]}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink">
                  {item.label}
                  <span className="ml-1.5 text-[10px] font-semibold uppercase text-ink-faint">
                    {CHECK_STATUS_TEXT[item.status]}
                  </span>
                </p>
                <p className="text-[11px] leading-relaxed text-ink-faint">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Next practice action */}
      <div className="rounded-xl border border-lav/20 bg-lav/5 px-4 py-3">
        <h4 className="text-eyebrow text-lav-hi">Next practice move</h4>
        <p className="mt-1 text-sm text-ink">{nextAction}</p>
      </div>

      {/* Notes — only when the adaptation persisted (real id exists) */}
      {onAddNote ? (
        <div className="flex flex-col gap-2 rounded-xl border border-hairline bg-surface-1 px-4 py-3">
          <h4 className="text-eyebrow text-ink-subtle">Your notes</h4>
          {notes === null && (
            <p role="status" className="flex items-center gap-1.5 text-xs text-ink-subtle">
              <Loader2 size={11} className="motion-safe:animate-spin" aria-hidden="true" /> Loading notes…
            </p>
          )}
          {notes !== null && notes.length === 0 && (
            <p className="text-xs text-ink-faint">No notes yet on this adaptation.</p>
          )}
          {notes !== null && notes.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {notes.map((n) => (
                <li key={n.id} className="rounded-md border border-hairline bg-surface-2/50 px-2.5 py-1.5">
                  <p className="text-[10px] font-medium text-ink-faint">{formatNoteLabel(n)}</p>
                  <p className="text-xs leading-relaxed text-ink-subtle">{n.note_text}</p>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); if (noteText.trim()) { onAddNote(noteText.trim()); setNoteText(""); } }}
          >
            <label htmlFor="adaptation-note" className="sr-only">Add a note</label>
            <input
              id="adaptation-note"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. Worked well at practice — slow down on the statistic"
              className="min-w-0 flex-1 rounded-lg border border-hairline bg-surface-2/50 px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
            />
            <button
              type="submit"
              disabled={noteSaving || !noteText.trim()}
              className="shrink-0 rounded-lg border border-hairline bg-surface-1 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
            >
              {noteSaving ? "Saving…" : "Add note"}
            </button>
          </form>
          {noteError && <p role="alert" className="text-xs text-danger">{noteError}</p>}
        </div>
      ) : (
        <p className="text-xs text-ink-faint">
          This adaptation wasn&rsquo;t saved by the server, so notes aren&rsquo;t available for it.
        </p>
      )}
    </section>
  );
}
