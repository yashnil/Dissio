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

import { useState } from "react";
import Link from "next/link";
import { BarChart3, ChevronDown, ChevronRight, Loader2, Quote, Shield, Swords } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  cardVerdictTone,
  deriveCardWarnings,
  describeArgumentType,
  describeResponseType,
  frontlineResponseWarning,
  groupArgumentsBySide,
  groupCardsByArgument,
  groupFrontlinesBySide,
  libraryItemHref,
  withPrepReturnContext,
  type CoverageDisplay,
  type PrepReturnContext,
  type PrepTone,
} from "@/lib/prepModel";
import type {
  Argument, Frontline, FrontlineResponse, FrontlineResponseCard, LibrarySearchResult,
} from "@/types/library";

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

function ArgumentRow({ a, ctx }: { a: Argument; ctx?: PrepReturnContext }) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-hairline bg-surface-2/50 px-3 py-2">
      <span className="mt-0.5 shrink-0 rounded-full border border-hairline bg-surface-1 px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
        {describeArgumentType(a.argument_type)}
      </span>
      <div className="min-w-0">
        <Link
          href={withPrepReturnContext(libraryItemHref("argument", a.id), ctx)}
          className="rounded text-sm text-ink transition-colors hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
        >
          {a.title}
        </Link>
        {a.summary && <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">{a.summary}</p>}
      </div>
    </li>
  );
}

export function ArgumentsSection({
  args, display, returnContext,
}: {
  args: Argument[] | null;
  display: CoverageDisplay;
  returnContext?: PrepReturnContext;
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
                  {grouped[side].map((a) => <ArgumentRow key={a.id} a={a} ctx={returnContext} />)}
                </ul>
              )}
            </div>
          ))}
          {grouped.other.length > 0 && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <h4 className="text-eyebrow text-ink-subtle">Unassigned side · {grouped.other.length}</h4>
              <ul className="flex flex-col gap-1.5">
                {grouped.other.map((a) => <ArgumentRow key={a.id} a={a} ctx={returnContext} />)}
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

function CardRow({ card, ctx }: { card: LibrarySearchResult; ctx?: PrepReturnContext }) {
  const warnings = deriveCardWarnings(card);
  const verdictTone = TONE[cardVerdictTone(card.support_verdict)];
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-2/60 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          href={withPrepReturnContext(libraryItemHref("card", card.card_id), ctx)}
          className="min-w-0 flex-1 rounded text-sm font-semibold text-ink transition-colors hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
        >
          {card.tag ?? "Untitled card"}
        </Link>
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
  cards, display, returnContext,
}: {
  cards: LibrarySearchResult[] | null;
  display: CoverageDisplay;
  returnContext?: PrepReturnContext;
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
                {g.cards.map((c) => <CardRow key={c.card_id} card={c} ctx={returnContext} />)}
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

interface LoadedResponse {
  response: FrontlineResponse;
  /** Linked card count; null while unknown (lookup failed). */
  linkedCardCount: number | null;
}

/**
 * Expandable frontline row: header shows title + the opponent claim it
 * answers; expanding lazily loads the real saved responses and, per
 * response, its linked-evidence count. Warnings come only from known
 * counts — a failed lookup stays silent rather than guessing.
 */
function FrontlineRow({ f, userId, ctx }: { f: Frontline; userId: string | null; ctx?: PrepReturnContext }) {
  const [responses, setResponses] = useState<LoadedResponse[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  async function loadResponses() {
    if (responses !== null || loading || !userId) return;
    setLoading(true);
    try {
      const rows = await apiFetch<FrontlineResponse[]>(
        `/library/frontlines/${f.id}/responses?user_id=${userId}`,
      );
      const loaded: LoadedResponse[] = await Promise.all(
        rows.map(async (response) => {
          try {
            const cards = await apiFetch<FrontlineResponseCard[]>(
              `/library/responses/${response.id}/cards?user_id=${userId}`,
            );
            return { response, linkedCardCount: cards.length };
          } catch {
            return { response, linkedCardCount: null };
          }
        }),
      );
      setResponses(loaded.sort((a, b) => a.response.position - b.response.position));
    } catch {
      setLoadFailed(true);
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <li>
      <details
        className="group/fl rounded-lg border border-hairline bg-surface-2/50"
        onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void loadResponses(); }}
      >
        <summary className="flex cursor-pointer list-none items-start gap-2 rounded-lg px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 [&::-webkit-details-marker]:hidden">
          <ChevronRight size={12} className="mt-1 shrink-0 text-ink-faint group-open/fl:hidden" aria-hidden="true" />
          <ChevronDown size={12} className="mt-1 hidden shrink-0 text-ink-faint group-open/fl:block" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">{f.title}</p>
            {f.opponent_claim && (
              <p className="text-xs leading-relaxed text-ink-faint">
                Answers: <span className="italic">&ldquo;{f.opponent_claim}&rdquo;</span>
              </p>
            )}
          </div>
          <Link
            href={withPrepReturnContext(libraryItemHref("frontline", f.id), ctx)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded text-xs font-medium text-lav hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
          >
            Open in Library
          </Link>
        </summary>

        <div className="flex flex-col gap-2 border-t border-hairline px-3 py-2.5">
          {loading && (
            <p role="status" className="flex items-center gap-1.5 text-xs text-ink-subtle">
              <Loader2 size={11} className="motion-safe:animate-spin" aria-hidden="true" />
              Loading saved responses…
            </p>
          )}
          {!loading && loadFailed && (
            <p className="text-xs text-ink-subtle">
              Couldn&rsquo;t load response details here — they&rsquo;re available in the Library.
            </p>
          )}
          {!loading && !loadFailed && responses !== null && responses.length === 0 && (
            <p className="text-xs text-warn">
              No responses written yet for this frontline.
            </p>
          )}
          {!loading && responses !== null && responses.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {responses.map(({ response, linkedCardCount }) => {
                const warning = frontlineResponseWarning(response, linkedCardCount);
                return (
                  <li key={response.id} className="flex flex-col gap-1 rounded-md border border-hairline bg-surface-1 px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-hairline bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle">
                        {describeResponseType(response.response_type)}
                      </span>
                      {response.is_analytical && (
                        <span className="text-[10px] text-ink-faint">analytical</span>
                      )}
                      {linkedCardCount !== null && linkedCardCount > 0 && (
                        <span className="text-[10px] text-ink-faint">
                          {linkedCardCount} linked card{linkedCardCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink">{response.response_claim}</p>
                    {response.explanation && (
                      <p className="text-[11px] leading-relaxed text-ink-faint">{response.explanation}</p>
                    )}
                    {warning && (
                      <p className="w-fit rounded-full border border-warn/30 bg-warn/5 px-1.5 py-0.5 text-[10px] font-medium text-warn">
                        {warning}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}

export function FrontlinesSection({
  frontlines, missingGapTitles, display, userId, returnContext,
}: {
  frontlines: Frontline[] | null;
  /** Frontline-category gaps from the readiness report (real absences). */
  missingGapTitles: { title: string; severity: string; action: string; href: string }[];
  display: CoverageDisplay;
  userId: string | null;
  returnContext?: PrepReturnContext;
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
                      {list.map((f) => <FrontlineRow key={f.id} f={f} userId={userId} ctx={returnContext} />)}
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
                      href={m.href}
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
