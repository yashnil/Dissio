"use client";

/**
 * Tournament Prep working sections (Phase 6B): the real saved materials
 * behind the coverage summaries — arguments, evidence cards, frontlines.
 *
 * Each section is a native <details> disclosure (keyboard accessible) whose
 * summary row carries the coverage label + explanation; sections with
 * red/amber coverage start open. Exact source text (body_preview) renders on
 * warm paper styling, visually distinct from user notes and system verdicts.
 * Labels come from titles/tags — never raw IDs.
 */

import Link from "next/link";
import { BarChart3, ChevronDown, ChevronRight, Quote, Shield, Swords } from "lucide-react";
import {
  cardVerdictTone,
  deriveCardWarnings,
  describeArgumentType,
  groupArgumentsBySide,
  groupCardsByArgument,
  groupFrontlinesBySide,
  type CoverageDisplay,
  type PrepTone,
} from "@/lib/prepModel";
import type { Argument, Frontline, LibrarySearchResult } from "@/types/library";

const TONE: Record<PrepTone, { dot: string; text: string }> = {
  green:   { dot: "bg-ok",        text: "text-ok" },
  amber:   { dot: "bg-warn",      text: "text-warn" },
  red:     { dot: "bg-danger",    text: "text-danger" },
  neutral: { dot: "bg-ink-faint", text: "text-ink-subtle" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Shared disclosure shell ───────────────────────────────────────────────────

function MaterialsSection({
  title, icon, display, children,
}: {
  title: string;
  icon: React.ReactNode;
  display: CoverageDisplay;
  children: React.ReactNode;
}) {
  const t = TONE[display.tone];
  // Sections that need attention start open; healthy/unknown start closed.
  const defaultOpen = display.tone === "red" || display.tone === "amber";
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-hairline bg-surface-1"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} className="shrink-0 text-ink-faint transition-transform group-open:hidden" aria-hidden="true" />
        <ChevronDown size={14} className="hidden shrink-0 text-ink-faint group-open:block" aria-hidden="true" />
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {icon} {title}
        </span>
        <span className={`ml-auto flex shrink-0 items-center gap-1.5 text-xs font-semibold ${t.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
          {display.label}
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-hairline px-4 py-4">
        <p className="text-xs leading-relaxed text-ink-subtle">{display.explanation}</p>
        {children}
      </div>
    </details>
  );
}

function EmptyMaterials({
  message, links,
}: {
  message: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-hairline px-4 py-4">
      <p className="text-sm text-ink-subtle">{message}</p>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.href + l.label}
            href={l.href}
            className="flex items-center gap-1 rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-lav transition-colors hover:text-lav-hi hover:border-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
          >
            {l.label} <ChevronRight size={10} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Arguments ─────────────────────────────────────────────────────────────────

function ArgumentRow({ a }: { a: Argument }) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-hairline bg-surface-2/50 px-3 py-2">
      <span className="mt-0.5 shrink-0 rounded-full border border-hairline bg-surface-1 px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
        {describeArgumentType(a.argument_type)}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-ink">{a.title}</p>
        {a.summary && <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">{a.summary}</p>}
      </div>
    </li>
  );
}

export function ArgumentsSection({
  args, display,
}: {
  args: Argument[] | null;
  display: CoverageDisplay;
}) {
  const grouped = args ? groupArgumentsBySide(args) : null;
  return (
    <MaterialsSection
      title="Arguments"
      icon={<Swords size={13} className="text-ink-faint" aria-hidden="true" />}
      display={display}
    >
      {!grouped || args!.length === 0 ? (
        <EmptyMaterials
          message="No arguments saved for this resolution yet. Build your positions in the Library."
          links={[{ href: "/library", label: "Open Library" }]}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["pro", "con"] as const).map((side) => (
            <div key={side} className="flex flex-col gap-1.5">
              <h4 className="text-eyebrow text-ink-subtle">
                {side.toUpperCase()} · {grouped[side].length}
              </h4>
              {grouped[side].length === 0 ? (
                <p className="rounded-lg border border-dashed border-warn/40 bg-warn/5 px-3 py-2 text-xs text-ink-subtle">
                  No {side.toUpperCase()} positions saved yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {grouped[side].map((a) => <ArgumentRow key={a.id} a={a} />)}
                </ul>
              )}
            </div>
          ))}
          {grouped.other.length > 0 && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <h4 className="text-eyebrow text-ink-subtle">Unassigned side · {grouped.other.length}</h4>
              <ul className="flex flex-col gap-1.5">
                {grouped.other.map((a) => <ArgumentRow key={a.id} a={a} />)}
              </ul>
            </div>
          )}
          <Link
            href="/library"
            className="flex w-fit items-center gap-1 text-xs font-medium text-lav transition-colors hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 focus-visible:rounded sm:col-span-2"
          >
            Manage arguments in Library <ChevronRight size={10} aria-hidden="true" />
          </Link>
        </div>
      )}
    </MaterialsSection>
  );
}

// ── Evidence cards ────────────────────────────────────────────────────────────

const VERDICT_LABELS: Record<string, string> = {
  supported: "Supported",
  partially_supported: "Partially supported",
  unsupported: "Unsupported",
  contradicted: "Contradicted",
};

function CardRow({ card }: { card: LibrarySearchResult }) {
  const warnings = deriveCardWarnings(card);
  const verdictTone = TONE[cardVerdictTone(card.support_verdict)];
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-2/60 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink">
          {card.tag ?? "Untitled card"}
        </p>
        {card.support_verdict && (
          <span className={`flex shrink-0 items-center gap-1 text-[10px] font-semibold ${verdictTone.text}`}>
            <span className={`h-1 w-1 rounded-full ${verdictTone.dot}`} aria-hidden="true" />
            {VERDICT_LABELS[card.support_verdict] ?? card.support_verdict}
          </span>
        )}
      </div>
      {card.cite && <p className="text-xs text-ink-subtle">{card.cite}</p>}
      {/* Exact source text — visually distinct from notes and verdicts */}
      {card.body_preview && (
        <blockquote className="flex gap-2 border-l-2 border-hairline-strong pl-2.5">
          <Quote size={11} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-ink-subtle">
            {card.body_preview}
            <span className="sr-only"> (exact source excerpt)</span>
          </p>
        </blockquote>
      )}
      {card.user_notes && (
        <p className="text-xs italic leading-relaxed text-ink-faint">
          Your note: {card.user_notes}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {card.tags.slice(0, 4).map((t) => (
          <span key={t} className="rounded-full border border-hairline bg-surface-1 px-1.5 py-0.5 text-[10px] text-ink-faint">
            {t}
          </span>
        ))}
        <span className="text-[10px] text-ink-faint">saved {fmtDate(card.saved_at)}</span>
        {warnings.map((w) => (
          <span key={w} className="rounded-full border border-warn/30 bg-warn/5 px-1.5 py-0.5 text-[10px] font-medium text-warn">
            {w}
          </span>
        ))}
      </div>
    </li>
  );
}

export function EvidenceCardsSection({
  cards, display,
}: {
  cards: LibrarySearchResult[] | null;
  display: CoverageDisplay;
}) {
  const groups = cards ? groupCardsByArgument(cards) : [];
  return (
    <MaterialsSection
      title="Evidence"
      icon={<Shield size={13} className="text-ink-faint" aria-hidden="true" />}
      display={display}
    >
      {!cards || cards.length === 0 ? (
        <EmptyMaterials
          message="No cards yet for this resolution. Cut evidence in Evidence Studio or organize saved cards in the Library."
          links={[
            { href: "/evidence", label: "Search Evidence Studio" },
            { href: "/library", label: "Open Library" },
          ]}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-1.5">
              <h4 className="text-eyebrow text-ink-subtle">
                {g.label} · {g.cards.length} card{g.cards.length === 1 ? "" : "s"}
              </h4>
              <ul className="flex flex-col gap-2">
                {g.cards.map((c) => <CardRow key={c.card_id} card={c} />)}
              </ul>
            </div>
          ))}
          <Link
            href="/evidence"
            className="flex w-fit items-center gap-1 text-xs font-medium text-lav transition-colors hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 focus-visible:rounded"
          >
            Add more evidence <ChevronRight size={10} aria-hidden="true" />
          </Link>
        </div>
      )}
    </MaterialsSection>
  );
}

// ── Frontlines ────────────────────────────────────────────────────────────────

function FrontlineRow({ f }: { f: Frontline }) {
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface-2/50 px-3 py-2">
      <p className="text-sm text-ink">{f.title}</p>
      {f.opponent_claim && (
        <p className="text-xs leading-relaxed text-ink-faint">
          Answers: <span className="italic">&ldquo;{f.opponent_claim}&rdquo;</span>
        </p>
      )}
    </li>
  );
}

export function FrontlinesSection({
  frontlines, missingGapTitles, display,
}: {
  frontlines: Frontline[] | null;
  /** Titles of frontline-category gaps from the readiness report (real absences). */
  missingGapTitles: { title: string; severity: string; action: string }[];
  display: CoverageDisplay;
}) {
  const grouped = frontlines ? groupFrontlinesBySide(frontlines) : null;
  const hasAny = (frontlines?.length ?? 0) > 0;
  return (
    <MaterialsSection
      title="Frontlines"
      icon={<BarChart3 size={13} className="text-ink-faint" aria-hidden="true" />}
      display={display}
    >
      {!hasAny && missingGapTitles.length === 0 ? (
        <EmptyMaterials
          message="No frontlines yet. Write answers to the responses you expect against your case."
          links={[{ href: "/library", label: "Build frontlines in Library" }]}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {hasAny && grouped && (
            <div className="flex flex-col gap-3">
              {(["pro", "con", "other"] as const).map((side) => {
                const list = grouped[side];
                if (list.length === 0) return null;
                return (
                  <div key={side} className="flex flex-col gap-1.5">
                    <h4 className="text-eyebrow text-ink-subtle">
                      {side === "other" ? "General" : side.toUpperCase()} · {list.length}
                    </h4>
                    <ul className="flex flex-col gap-1.5">
                      {list.map((f) => <FrontlineRow key={f.id} f={f} />)}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {missingGapTitles.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-eyebrow text-warn">
                Missing responses · {missingGapTitles.length}
              </h4>
              <ul className="flex flex-col gap-1.5">
                {missingGapTitles.map((m) => (
                  <li
                    key={m.title}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 text-sm text-ink">{m.title}</span>
                    <span className="shrink-0 rounded-full border border-warn/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warn">
                      {m.severity}
                    </span>
                    <Link
                      href="/library"
                      className="flex shrink-0 items-center gap-1 text-xs font-medium text-lav hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 focus-visible:rounded"
                    >
                      {m.action} <ChevronRight size={10} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </MaterialsSection>
  );
}
