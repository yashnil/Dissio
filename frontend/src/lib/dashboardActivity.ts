/**
 * Recent-activity feed derivation for the dashboard. Turns the student's
 * speeches into a human-readable, debate-native activity stream — no backend
 * terminology, each item with a contextual next action. Pure + tested.
 */

import type { Speech } from "@/types";

export type ActivityKind =
  | "created"
  | "saved"
  | "analyzing"
  | "report-ready"
  | "failed"
  | "re-recorded";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** Human-readable action line. */
  action: string;
  speechTitle: string;
  speechType: string;
  /** ISO date of the event. */
  date: string;
  /** Where the contextual action goes. */
  href: string;
  /** Short next-action label. */
  actionLabel: string;
}

const TYPE_LABEL: Record<string, string> = {
  constructive: "Constructive",
  rebuttal: "Rebuttal",
  summary: "Summary",
  final_focus: "Final Focus",
  crossfire: "Crossfire",
};

function speechTypeLabel(t: string): string {
  return TYPE_LABEL[t] ?? t.replace(/_/g, " ");
}

function activityForSpeech(s: Speech): ActivityItem {
  const type = speechTypeLabel(s.speech_type);
  const base = { id: s.id, speechTitle: s.title, speechType: type, date: s.updated_at, href: `/speech/${s.id}` };

  if (s.status === "error") {
    return { ...base, kind: "failed", action: `Analysis didn’t finish for your ${type.toLowerCase()}`, actionLabel: "Retry analysis" };
  }
  if (s.status === "analyzing" || s.status === "transcribing") {
    return { ...base, kind: "analyzing", action: `Analyzing your ${type.toLowerCase()}`, actionLabel: "Check progress" };
  }
  if (s.status === "done") {
    if (s.parent_speech_id) {
      return { ...base, kind: "re-recorded", action: `Re-recorded ${type.toLowerCase()} — see your improvement`, actionLabel: "Compare" };
    }
    return { ...base, kind: "report-ready", action: `Report ready for your ${type.toLowerCase()}`, actionLabel: "Open report" };
  }
  // pending
  if (s.audio_url) {
    return { ...base, kind: "saved", action: `Saved your ${type.toLowerCase()} — ready to analyze`, actionLabel: "Analyze" };
  }
  return { ...base, kind: "created", action: `Started a ${type.toLowerCase()}`, actionLabel: "Record" };
}

/** The newest activity items, most-recent first. */
export function deriveRecentActivity(speeches: Speech[], limit = 6): ActivityItem[] {
  return [...speeches]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, limit)
    .map(activityForSpeech);
}
