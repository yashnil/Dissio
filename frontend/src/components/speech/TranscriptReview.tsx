"use client";

import { useMemo, useState } from "react";
import { Search, Copy, Check, GitBranch, Info } from "lucide-react";
import type { Transcript } from "@/types";
import { useCopy } from "@/lib/useCopy";
import {
  segmentTranscript, searchSegments, annotateSegment, countFillers, estimateReadTime,
} from "@/lib/transcriptModel";
import { cn } from "@/lib/utils";

interface TranscriptReviewProps {
  transcript: Transcript;
  audioUrl?: string | null;
  /** Anchor to the flow section for cross-linking. */
  flowHref?: string;
}

/**
 * Transcript-first review. Search, clean/annotated modes (annotated highlights
 * fillers + search matches), copy, jump-to-flow, and whole-speech audio when
 * available. Honest about the lack of word-level audio sync.
 */
export default function TranscriptReview({ transcript, audioUrl, flowHref = "#flow" }: TranscriptReviewProps) {
  const [query, setQuery] = useState("");
  const [annotated, setAnnotated] = useState(false);
  const [copyText, copied] = useCopy();

  const segments = useMemo(() => segmentTranscript(transcript.text), [transcript.text]);
  const visible = useMemo(() => searchSegments(segments, query), [segments, query]);
  const fillerTotal = useMemo(() => countFillers(transcript.text), [transcript.text]);
  const wc = transcript.word_count ?? transcript.text.split(/\s+/).filter(Boolean).length;

  return (
    <section id="transcript" className="flex flex-col gap-3 scroll-mt-20" aria-label="Transcript">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-heading text-ink">Transcript</h3>
        <span className="font-mono text-[11px] tabular-nums text-ink-faint">
          {wc} words · ~{estimateReadTime(wc)}
        </span>
      </div>

      {/* Controls */}
      <div className="sticky top-16 z-[1] flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-canvas/90 p-2 backdrop-blur-sm">
        <div className="relative min-w-0 flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcript…"
            aria-label="Search transcript"
            className="h-8 w-full rounded-md border border-hairline bg-surface-2 pl-8 pr-2 text-xs text-ink outline-none focus-visible:border-lav/50 focus-visible:ring-2 focus-visible:ring-lav/20"
          />
        </div>
        <div className="flex gap-0.5 rounded-md border border-hairline bg-surface-2 p-0.5" role="radiogroup" aria-label="Transcript mode">
          {([["clean", "Clean"], ["annotated", "Annotated"]] as const).map(([val, label]) => {
            const active = (val === "annotated") === annotated;
            return (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setAnnotated(val === "annotated")}
                className={cn("rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50",
                  active ? "bg-surface-3 text-ink" : "text-ink-subtle hover:text-ink")}
              >
                {label}
              </button>
            );
          })}
        </div>
        <a href={flowHref} className="flex h-8 items-center gap-1 rounded-md border border-hairline bg-surface-1 px-2.5 text-xs text-ink-subtle transition-colors hover:text-ink">
          <GitBranch size={12} aria-hidden /> <span className="hidden sm:inline">Flow</span>
        </a>
        <button
          type="button"
          onClick={() => copyText(transcript.text)}
          className="flex h-8 items-center gap-1 rounded-md border border-hairline bg-surface-1 px-2.5 text-xs text-ink-subtle transition-colors hover:text-ink"
        >
          {copied ? <Check size={12} className="text-ok" aria-hidden /> : <Copy size={12} aria-hidden />}
          <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      {audioUrl && (
        <div className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface-1 p-3">
          <audio src={audioUrl} controls className="h-8 w-full" />
          <p className="flex items-center gap-1 text-[10px] text-ink-faint">
            <Info size={10} aria-hidden /> Plays the full speech — word-level transcript sync isn&apos;t available.
          </p>
        </div>
      )}

      {annotated && (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          Highlights: <span className="rounded bg-warn/15 px-1 text-warn">filler</span>
          {query && <span className="rounded bg-lav/15 px-1 text-lav">match</span>}
          {fillerTotal > 0 && <span>· {fillerTotal} filler phrase{fillerTotal !== 1 ? "s" : ""} detected</span>}
        </p>
      )}

      {/* Segments — editorial reading width */}
      {visible.length === 0 ? (
        <p className="rounded-lg border border-hairline bg-surface-1 px-4 py-6 text-center text-xs text-ink-subtle">
          No transcript lines match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {visible.map((seg) => (
            <li key={seg.index} className="flex gap-3">
              <span className="select-none pt-0.5 font-mono text-[10px] tabular-nums text-ink-faint">
                {(seg.index + 1).toString().padStart(2, "0")}
              </span>
              <p className="max-w-prose flex-1 text-[15px] leading-7 text-ink">
                {annotated
                  ? annotateSegment(seg.text, query, true).map((t, i) => (
                      <span
                        key={i}
                        className={cn(
                          t.kind === "filler" && "rounded bg-warn/15 px-0.5 text-warn",
                          t.kind === "match" && "rounded bg-lav/15 px-0.5 text-lav",
                        )}
                      >
                        {t.text}
                      </span>
                    ))
                  : seg.text}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
