/**
 * Transcript review model. The stored transcript is plain text with a word count
 * and no timestamps, so we segment honestly (by paragraph, falling back to
 * sentences) and support search + filler annotation — never faking word-level
 * audio sync. Pure + tested.
 */

export interface TranscriptSegment {
  index: number;
  text: string;
  wordCount: number;
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z"'])/;

export function segmentTranscript(text: string): TranscriptSegment[] {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return [];

  // Prefer paragraph breaks; if there's only one block, fall back to sentences.
  let parts = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    parts = trimmed.split(SENTENCE_SPLIT).map((p) => p.trim()).filter(Boolean);
  }
  return parts.map((text, index) => ({
    index,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  }));
}

export function searchSegments(segments: TranscriptSegment[], query: string): TranscriptSegment[] {
  const q = query.trim().toLowerCase();
  if (!q) return segments;
  return segments.filter((s) => s.text.toLowerCase().includes(q));
}

/** Common spoken fillers — used to highlight delivery issues in annotated mode. */
export const FILLER_WORDS = ["um", "uh", "like", "you know", "kind of", "sort of", "basically", "literally", "i mean"];

const FILLER_RE = new RegExp(`\\b(${FILLER_WORDS.map((f) => f.replace(/ /g, "\\s+")).join("|")})\\b`, "gi");

export function countFillers(text: string): number {
  const m = (text ?? "").match(FILLER_RE);
  return m ? m.length : 0;
}

export type TokenKind = "text" | "filler" | "match";

export interface Token {
  kind: TokenKind;
  text: string;
}

/**
 * Tokenize a segment for annotated rendering: marks filler phrases and (when a
 * query is present) search matches. Order: matches take precedence over fillers.
 */
export function annotateSegment(text: string, query: string, showFillers: boolean): Token[] {
  const q = query.trim();
  const markers: { start: number; end: number; kind: TokenKind }[] = [];

  if (showFillers) {
    for (const m of text.matchAll(FILLER_RE)) {
      if (m.index != null) markers.push({ start: m.index, end: m.index + m[0].length, kind: "filler" });
    }
  }
  if (q) {
    const qre = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    for (const m of text.matchAll(qre)) {
      if (m.index != null) markers.push({ start: m.index, end: m.index + m[0].length, kind: "match" });
    }
  }
  if (markers.length === 0) return [{ kind: "text", text }];

  // Sort; matches win over overlapping fillers.
  markers.sort((a, b) => a.start - b.start || (a.kind === "match" ? -1 : 1));
  const tokens: Token[] = [];
  let cursor = 0;
  for (const mk of markers) {
    if (mk.start < cursor) continue; // skip overlap
    if (mk.start > cursor) tokens.push({ kind: "text", text: text.slice(cursor, mk.start) });
    tokens.push({ kind: mk.kind, text: text.slice(mk.start, mk.end) });
    cursor = mk.end;
  }
  if (cursor < text.length) tokens.push({ kind: "text", text: text.slice(cursor) });
  return tokens;
}

/** Estimated read-aloud time at ~140 wpm, formatted m:ss. */
export function estimateReadTime(wordCount: number): string {
  const secs = Math.round((wordCount / 140) * 60);
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ── Transcript action model ───────────────────────────────────────────────────

export type TranscriptReadiness = "too_short" | "low" | "ready";

export function deriveTranscriptReadiness(wordCount: number | null): TranscriptReadiness {
  if (wordCount === null || wordCount < 25) return "too_short";
  if (wordCount < 75) return "low";
  return "ready";
}

export interface TranscriptCopyState {
  label: string;
  ariaLabel: string;
}

/** Labels for the copy button in its default and success states. */
export function deriveTranscriptCopyState(copied: boolean): TranscriptCopyState {
  return copied
    ? { label: "Copied", ariaLabel: "Transcript copied to clipboard" }
    : { label: "Copy", ariaLabel: "Copy transcript to clipboard" };
}

export interface TranscriptReRecordDecision {
  show: boolean;
  isDestructive: boolean;
  label: string;
}

/** Derive whether the re-record action should be shown and its display label. */
export function deriveReRecordDecision(
  readiness: TranscriptReadiness,
  canReRecord: boolean,
): TranscriptReRecordDecision {
  return {
    show: canReRecord && readiness === "too_short",
    isDestructive: true,
    label: "Delete audio & re-record",
  };
}
