"use client";

/**
 * SelectedItemPanel — renders the Library item targeted by a deep link
 * (/library?card=…|argument=…|frontline=…), typically from Tournament Prep.
 *
 * Fetches the real item, moves keyboard focus to its heading when loaded,
 * and shows a safe "unavailable" state for missing/deleted/unowned items.
 * IDs stay in the URL; every visible label is a human title/tag.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Quote, Target, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import {
  cardVerdictTone,
  deriveCardWarnings,
  describeArgumentType,
  libraryItemA11yLabel,
  type LibraryItemKind,
  type PrepTone,
} from "@/lib/prepModel";
import { FrontlineBuilder } from "@/components/library/FrontlineBuilder";
import type {
  Argument,
  Frontline,
  LibraryCardMetadata,
  LibrarySearchResponse,
  LibrarySearchResult,
} from "@/types/library";

const TONE_TEXT: Record<PrepTone, string> = {
  green: "text-ok",
  amber: "text-warn",
  red: "text-danger",
  neutral: "text-ink-subtle",
};

const VERDICT_LABELS: Record<string, string> = {
  supported: "Supported",
  partially_supported: "Partially supported",
  unsupported: "Unsupported",
  contradicted: "Contradicted",
};

interface CardDetail {
  metadata: LibraryCardMetadata;
  /** Full search row when locatable (tag/cite/body live here). */
  searchRow: LibrarySearchResult | null;
}

type PanelData =
  | { kind: "card"; card: CardDetail }
  | { kind: "argument"; argument: Argument }
  | { kind: "frontline"; frontline: Frontline };

type PanelState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; data: PanelData };

export function SelectedItemPanel({
  kind, id, userId, onDismiss,
}: {
  kind: LibraryItemKind;
  id: string;
  userId: string;
  onDismiss: () => void;
}) {
  // The parent keys this component by `${kind}:${id}`, so a new selection
  // remounts fresh in the loading state — no sync resets inside effects.
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<PanelState> {
      try {
        if (kind === "argument") {
          const argument = await apiFetch<Argument>(`/library/arguments/${id}?user_id=${userId}`);
          return { status: "ready", data: { kind: "argument", argument } };
        }
        if (kind === "frontline") {
          const frontline = await apiFetch<Frontline>(`/library/frontlines/${id}?user_id=${userId}`);
          return { status: "ready", data: { kind: "frontline", frontline } };
        }
        // card: metadata first, then locate the full row (tag/cite/body) via a
        // scoped search — the detail endpoint returns metadata only.
        const metadata = await apiFetch<LibraryCardMetadata>(`/library/cards/${id}?user_id=${userId}`);
        let searchRow: LibrarySearchResult | null = null;
        try {
          const res = await apiFetch<LibrarySearchResponse>("/library/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: userId,
              resolution_id: metadata.resolution_id ?? undefined,
              limit: 100,
            }),
          });
          searchRow = res.results.find((r) => r.card_id === id) ?? null;
        } catch { /* metadata-only detail is still truthful */ }
        return { status: "ready", data: { kind: "card", card: { metadata, searchRow } } };
      } catch {
        return { status: "unavailable" };
      }
    }

    load().then((next) => { if (!cancelled) setState(next); });
    return () => { cancelled = true; };
  }, [kind, id, userId]);

  // Move focus to the panel heading once resolved (loaded or unavailable).
  useEffect(() => {
    if (state.status !== "loading") headingRef.current?.focus();
  }, [state.status]);

  const title =
    state.status !== "ready" ? null
    : state.data.kind === "card" ? (state.data.card.searchRow?.tag ?? "Saved card")
    : state.data.kind === "argument" ? state.data.argument.title
    : state.data.frontline.title;

  return (
    <section
      aria-label={state.status === "ready" ? libraryItemA11yLabel(kind, title) : "Selected library item"}
      className="rounded-xl border-2 border-lav/40 bg-lav/5 px-5 py-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow text-lav-hi">Selected {kind}</p>
          <h2 ref={headingRef} tabIndex={-1} className="mt-0.5 text-heading text-ink focus-visible:outline-none">
            {state.status === "loading" && "Loading…"}
            {state.status === "unavailable" && "Item not found or unavailable"}
            {state.status === "ready" && title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss selected item"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      {state.status === "unavailable" && (
        <p className="mt-2 text-sm leading-relaxed text-ink-subtle">
          It may have been deleted or belong to another account. Browse your library
          below, or head back to <Link href="/prep" className="text-lav hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 rounded">Tournament Prep</Link>.
        </p>
      )}

      {state.status === "ready" && state.data.kind === "card" && (
        <CardDetailBody detail={state.data.card} />
      )}

      {state.status === "ready" && state.data.kind === "argument" && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-hairline bg-surface-1 px-2 py-0.5 text-[10px] font-medium text-ink-subtle">
              {describeArgumentType(state.data.argument.argument_type)}
            </span>
            {state.data.argument.side && (
              <span className="rounded-full border border-hairline bg-surface-1 px-2 py-0.5 text-[10px] font-medium uppercase text-ink-subtle">
                {state.data.argument.side}
              </span>
            )}
          </div>
          {state.data.argument.summary && (
            <p className="text-sm leading-relaxed text-ink-subtle">{state.data.argument.summary}</p>
          )}
          <p className="text-xs text-ink-faint">
            Use the card filters below to see the evidence saved under this argument.
          </p>
        </div>
      )}

      {state.status === "ready" && state.data.kind === "frontline" && (
        <div className="mt-2 flex flex-col gap-3">
          {state.data.frontline.opponent_claim && (
            <div className="rounded-lg border border-warn/25 bg-warn/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-warn">Answers this response</p>
              <p className="mt-0.5 text-sm italic text-ink-subtle">
                &ldquo;{state.data.frontline.opponent_claim}&rdquo;
              </p>
              {state.data.frontline.opponent_warrant && (
                <p className="mt-1 text-xs text-ink-faint">Warrant: {state.data.frontline.opponent_warrant}</p>
              )}
              {state.data.frontline.opponent_impact && (
                <p className="text-xs text-ink-faint">Impact: {state.data.frontline.opponent_impact}</p>
              )}
            </div>
          )}
          <FrontlineBuilder frontline={state.data.frontline} userId={userId} />
        </div>
      )}

      {state.status === "ready" && (
        <Link
          href="/prep"
          className="mt-3 flex w-fit items-center gap-1.5 text-xs font-medium text-lav transition-colors hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 focus-visible:rounded"
        >
          <Target size={11} aria-hidden="true" /> Back to Tournament Prep
        </Link>
      )}
    </section>
  );
}

function CardDetailBody({ detail }: { detail: CardDetail }) {
  const { metadata, searchRow } = detail;
  const warnings = deriveCardWarnings({
    support_verdict: metadata.support_verdict,
    card_status: metadata.card_status,
    cite: searchRow?.cite,
  });
  const verdict = metadata.support_verdict;

  return (
    <div className="mt-2 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {searchRow?.cite && <p className="text-sm text-ink-subtle">{searchRow.cite}</p>}
        {verdict && (
          <span className={`text-xs font-semibold ${TONE_TEXT[cardVerdictTone(verdict)]}`}>
            {VERDICT_LABELS[verdict] ?? verdict}
          </span>
        )}
      </div>

      {searchRow?.body_preview ? (
        <blockquote className="flex gap-2 rounded-lg border border-hairline bg-surface-1 px-3 py-2.5">
          <Quote size={12} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-ink-subtle">
            {searchRow.body_preview}
            <span className="sr-only"> (exact source excerpt)</span>
          </p>
        </blockquote>
      ) : (
        <p className="text-xs text-ink-faint">
          Full card text wasn&rsquo;t reachable from this view — open Evidence Studio to read the complete card.
        </p>
      )}

      {metadata.user_notes && (
        <p className="text-xs italic leading-relaxed text-ink-faint">Your note: {metadata.user_notes}</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {searchRow?.argument_title && (
          <span className="rounded-full border border-lav/25 bg-lav/10 px-2 py-0.5 text-[10px] font-medium text-lav">
            {searchRow.argument_title}
          </span>
        )}
        {metadata.side && (
          <span className="rounded-full border border-hairline bg-surface-1 px-2 py-0.5 text-[10px] font-medium uppercase text-ink-subtle">
            {metadata.side}
          </span>
        )}
        {metadata.tags.map((t) => (
          <span key={t} className="rounded-full border border-hairline bg-surface-1 px-1.5 py-0.5 text-[10px] text-ink-faint">
            {t}
          </span>
        ))}
        {warnings.map((w) => (
          <span key={w} className="rounded-full border border-warn/30 bg-warn/5 px-1.5 py-0.5 text-[10px] font-medium text-warn">
            {w}
          </span>
        ))}
      </div>
    </div>
  );
}
