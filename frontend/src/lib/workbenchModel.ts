/**
 * Evidence Studio Workbench — pure state model.
 *
 * All "what should the UI show?" decisions live here as pure,
 * deterministic functions that can be tested without React or a DOM.
 * Same pattern as dashboardModel.ts / practiceStudioModel.ts.
 *
 * Covers: workflow stages, mobile panel routing, candidate filters,
 * credibility signals, source metadata display, rejection explanations,
 * save state, skeleton counts, and next-action labels.
 */

import type { CardDraft, SourceQuality } from "@/types";

// ── WorkbenchStage ─────────────────────────────────────────────────────────────

/**
 * The user's current stage in the Search → Verify → Cut → Save loop.
 * Derived entirely from observable state — never stored separately.
 */
export type WorkbenchStage =
  | "idle"        // No search has started yet
  | "searching"   // API call in progress (URL extract OR card search)
  | "reviewing"   // Results returned; user choosing a candidate
  | "selected"    // A candidate card is focused in the right panel
  | "saving"      // Save API call in progress
  | "saved";      // At least one card saved this session

export interface WorkbenchPhaseInput {
  isLoading: boolean;
  hasResults: boolean;
  selectedCardId: string | null;
  isSaving: boolean;
  savedCount: number;
}

export function deriveWorkbenchStage(input: WorkbenchPhaseInput): WorkbenchStage {
  if (input.isSaving) return "saving";
  if (input.isLoading) return "searching";
  if (input.selectedCardId) return "selected";
  if (input.hasResults) return "reviewing";
  if (input.savedCount > 0) return "saved";
  return "idle";
}

export const WORKBENCH_STAGE_LABEL: Record<WorkbenchStage, string> = {
  idle: "Ready to search",
  searching: "Finding sources…",
  reviewing: "Review candidates",
  selected: "Cut the card",
  saving: "Saving…",
  saved: "Card saved",
};

// ── MobileStage ───────────────────────────────────────────────────────────────

/** Which panel is visible on narrow viewports (one at a time). */
export type MobileStage = "search" | "candidates" | "card";

export const MOBILE_STAGE_LABELS: Record<MobileStage, string> = {
  search: "Search",
  candidates: "Candidates",
  card: "Card",
};

/**
 * Derive the default mobile stage from the current workbench stage.
 * The user can always override via the mobile stage nav.
 */
export function deriveMobileStageFromWorkbench(
  stage: WorkbenchStage,
): MobileStage {
  if (stage === "idle") return "search";
  if (stage === "searching") return "search";
  if (stage === "selected") return "card";
  return "candidates"; // reviewing | saving | saved
}

// ── Candidate filters ─────────────────────────────────────────────────────────

export interface CandidateFilterChip {
  key: "all" | "ready" | "review" | "weak" | "counter";
  label: string;
  count: number;
  active: boolean;
}

export interface CandidateSummary {
  readinessLevel: "ready" | "review_needed" | "weak";
  isCounter: boolean;
}

export function deriveCandidateFilters(
  cards: CandidateSummary[],
  activeKey: string,
): CandidateFilterChip[] {
  const allCt = cards.length;
  const readyCt = cards.filter((c) => c.readinessLevel === "ready" && !c.isCounter).length;
  const reviewCt = cards.filter((c) => c.readinessLevel === "review_needed").length;
  const weakCt = cards.filter((c) => c.readinessLevel === "weak").length;
  const counterCt = cards.filter((c) => c.isCounter).length;

  const base: Omit<CandidateFilterChip, "active">[] = [
    { key: "all", label: "All", count: allCt },
    { key: "ready", label: "Ready", count: readyCt },
    { key: "review", label: "Review", count: reviewCt },
    { key: "weak", label: "Verify", count: weakCt },
    ...(counterCt > 0 ? [{ key: "counter" as const, label: "Counter", count: counterCt }] : []),
  ];

  return base
    .filter((f) => f.key === "all" || f.count > 0)
    .map((f) => ({ ...f, active: f.key === activeKey }));
}

// ── Credibility signal (text-based, not color-only) ───────────────────────────

export interface CredibilitySignal {
  label: string;
  qualifier: string;
  level: "high" | "medium" | "low" | "unknown";
}

export function deriveCredibilitySignal(
  quality: SourceQuality | null | undefined,
  credibilityNotes?: string | null,
): CredibilitySignal {
  const level: CredibilitySignal["level"] = quality ?? "unknown";
  const label =
    level === "high"   ? "High credibility"   :
    level === "medium" ? "Medium credibility" :
    level === "low"    ? "Low credibility"    :
                         "Credibility unknown";
  const qualifier =
    credibilityNotes ??
    (level === "high"    ? "Established publication" :
     level === "medium"  ? "Check independently"     :
     level === "low"     ? "Use with care"            :
                           "Source not evaluated");
  return { label, qualifier, level };
}

// ── Source metadata display ───────────────────────────────────────────────────

export interface SourceMetaDisplay {
  primaryDisplay: string;   // "Author · Publication · 2023"
  domainDisplay: string;    // "nature.com"
  hasAuthor: boolean;
  hasDate: boolean;
}

export function deriveSourceMetaDisplay(
  author: string | null | undefined,
  publication: string | null | undefined,
  date: string | null | undefined,
  url: string | null | undefined,
): SourceMetaDisplay {
  const parts: string[] = [];
  if (author) parts.push(author);
  if (publication) parts.push(publication);
  if (date) {
    const year = String(date).match(/(19|20)\d{2}/)?.[0];
    if (year) parts.push(year);
  }
  const primaryDisplay = parts.join(" · ") || url || "Unknown source";

  let domainDisplay = "";
  if (url) {
    try { domainDisplay = new URL(url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
  }

  return {
    primaryDisplay,
    domainDisplay,
    hasAuthor: !!author,
    hasDate: !!date,
  };
}

// ── Rejection explanation ─────────────────────────────────────────────────────

export type RejectionCategory = "quality" | "relevance" | "credibility" | "technical" | "other";

export interface RejectionExplanation {
  shortLabel: string;
  detail: string;
  category: RejectionCategory;
}

export function deriveRejectionExplanation(
  reason: string | null | undefined,
): RejectionExplanation {
  const r = (reason ?? "").toLowerCase();

  if (r.includes("low quality") || r.includes("low credibility") || r.includes("poor quality")) {
    return {
      shortLabel: "Low credibility",
      detail: "This source was excluded because it doesn't meet minimum credibility standards.",
      category: "credibility",
    };
  }
  if (r.includes("no support") || r.includes("does not support") || r.includes("no matching")) {
    return {
      shortLabel: "Doesn't support claim",
      detail: "The source was found but doesn't contain passages that support this specific claim.",
      category: "relevance",
    };
  }
  if (r.includes("extraction") || r.includes("could not extract") || r.includes("parse")) {
    return {
      shortLabel: "Could not read",
      detail: "Text couldn't be extracted — the source may be paywalled, a PDF, or JavaScript-heavy.",
      category: "technical",
    };
  }
  if (r.includes("overclaim") || r.includes("too strong")) {
    return {
      shortLabel: "Overclaim risk",
      detail: "A passage was found, but using it would overstate what the source actually says.",
      category: "quality",
    };
  }
  if (r.includes("filtered") || r.includes("useful")) {
    return {
      shortLabel: "Below usefulness threshold",
      detail: "The passage scored too low on debate usefulness to be cut as a card.",
      category: "relevance",
    };
  }

  const shortLabel = reason ? String(reason).slice(0, 50) : "Not used";
  return {
    shortLabel,
    detail: reason ?? "This source was not selected for the evidence packet.",
    category: "other",
  };
}

// ── Save state ────────────────────────────────────────────────────────────────

export type SaveStatus = "unsaved" | "saving" | "saved" | "error";

export function deriveSaveStatus(
  draftStatus: CardDraft["status"] | null | undefined,
  isSaving: boolean,
  hasError: boolean,
): SaveStatus {
  if (isSaving) return "saving";
  if (hasError) return "error";
  if (draftStatus === "saved") return "saved";
  return "unsaved";
}

export const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  unsaved: "Save card",
  saving: "Saving…",
  saved: "Saved to library",
  error: "Save failed — retry",
};

// ── Primary next-action per stage ─────────────────────────────────────────────

export interface NextAction {
  label: string;
  hint: string;
  isEnabled: boolean;
}

export function deriveNextAction(
  stage: WorkbenchStage,
  hasClaim: boolean,
  hasResults: boolean,
): NextAction {
  switch (stage) {
    case "idle":
      return {
        label: hasClaim ? "Search for evidence" : "Enter a claim to start",
        hint: hasClaim
          ? "Click Search to find sources supporting your claim"
          : "Type your debate claim in the left panel",
        isEnabled: hasClaim,
      };
    case "searching":
      return {
        label: "Searching sources…",
        hint: "Finding and ranking candidate evidence cards",
        isEnabled: false,
      };
    case "reviewing":
      return {
        label: hasResults ? "Select a candidate" : "Try a different claim",
        hint: hasResults
          ? "Click any card to preview it in the right panel"
          : "Refine your claim or try a URL or paste source",
        isEnabled: hasResults,
      };
    case "selected":
      return {
        label: "Save card to library",
        hint: "Review the tag, citation, and evidence body, then save",
        isEnabled: true,
      };
    case "saving":
      return { label: "Saving…", hint: "Persisting to your evidence library", isEnabled: false };
    case "saved":
      return {
        label: "Find another card",
        hint: "Run another search to build out your evidence packet",
        isEnabled: true,
      };
  }
}

// ── Skeleton count ────────────────────────────────────────────────────────────

/** Number of loading skeletons to show per search mode. */
export function deriveSkeletonCount(mode: "url" | "paste" | "search"): number {
  return mode === "search" ? 3 : 1;
}

// ── Unsaved-edit guard ────────────────────────────────────────────────────────

export interface UnsavedEditGuard {
  hasUnsavedMarkup: boolean;
  message: string;
}

export function deriveUnsavedEditGuard(card: CardDraft | null): UnsavedEditGuard {
  if (!card) return { hasUnsavedMarkup: false, message: "" };
  const m = card.user_markup_json;
  const hasUnsavedMarkup =
    !!m &&
    ((m.highlight?.length ?? 0) > 0 ||
      (m.underline?.length ?? 0) > 0 ||
      (m.bold?.length ?? 0) > 0 ||
      (m.italic?.length ?? 0) > 0);
  return {
    hasUnsavedMarkup,
    message: hasUnsavedMarkup
      ? "You have unsaved markup edits on this card. Save or discard before switching."
      : "",
  };
}

// ── Evidence text immutability guard ─────────────────────────────────────────

/**
 * Verify that a saved cut text is a substring of the original body.
 * Returns false if the body was rewritten (should never happen).
 * Used in tests as a regression guard.
 */
export function isCutTextSubstringOfBody(
  cutText: string | null | undefined,
  bodyText: string | null | undefined,
): boolean {
  if (!cutText || !bodyText) return true; // no cut yet — not a violation
  // Split on ellipsis markers; check each non-empty segment is in the body
  const parts = cutText.split(/\s*\[…\]\s*/);
  return parts.every((p) => p.trim() === "" || bodyText.includes(p.trim()));
}
