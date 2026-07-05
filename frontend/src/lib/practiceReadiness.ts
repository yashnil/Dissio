/**
 * Practice readiness + status display model.
 *
 * One tested place that answers, from real fields only:
 *   - Is this practice's report actually ready?
 *   - What label/tone should its status badge show?
 *   - What is the most recent practice and where should its button go?
 *   - What honest stage is a processing job in?
 *
 * Semantics contract (see backend analysis_pipeline.py):
 *   - `speeches.status = "done"` is set only after transcript, argument map,
 *     and feedback all saved (those steps are fatal on failure). Drills are
 *     non-fatal — a done speech may have zero drills.
 *   - Tones: green = genuinely ready/actionable, amber = processing/incomplete,
 *     red = failed/needs retry, neutral = draft/unknown. Never green without
 *     the artifacts that make the report actionable.
 */

import type { AnalysisJob, Speech, SpeechStatus } from "@/types";

// ── Display model ─────────────────────────────────────────────────────────────

export type ReadinessTone = "green" | "amber" | "red" | "neutral";

export type ReadinessKey =
  | "draft"
  | "incomplete"
  | "transcript-pending-analysis"
  | "transcribing"
  | "analyzing"
  | "ready"
  | "partial-report"
  | "needs-retry"
  | "unknown";

export interface PracticeReadiness {
  key: ReadinessKey;
  label: string;
  tone: ReadinessTone;
  /** Badge variant for the shared Badge component. */
  badge: "default" | "indigo" | "green" | "amber" | "red";
  isProcessing: boolean;
  /** True when opening the speech lands on an actionable report. */
  isReportActionable: boolean;
}

/** What we actually know exists for a speech (from fetched artifacts). */
export interface ArtifactAvailability {
  hasTranscript: boolean;
  hasFlow: boolean;
  /** Ballot / feedback report — the artifact that makes a report actionable. */
  hasBallot: boolean;
  hasDrills: boolean;
}

const TONE_BADGE: Record<ReadinessTone, PracticeReadiness["badge"]> = {
  green: "green",
  amber: "amber",
  red: "red",
  neutral: "default",
};

function readiness(
  key: ReadinessKey,
  label: string,
  tone: ReadinessTone,
  opts: { isProcessing?: boolean; isReportActionable?: boolean; badge?: PracticeReadiness["badge"] } = {},
): PracticeReadiness {
  return {
    key,
    label,
    tone,
    badge: opts.badge ?? TONE_BADGE[tone],
    isProcessing: opts.isProcessing ?? false,
    isReportActionable: opts.isReportActionable ?? false,
  };
}

/**
 * Readiness for a speech. When `artifacts` is provided (speech page has
 * fetched them) it is authoritative; without it we fall back to the backend
 * status contract — `done` implies transcript+flow+ballot were saved.
 */
export function getPracticeReadinessStatus(
  speech: Pick<Speech, "status" | "audio_url">,
  artifacts?: ArtifactAvailability | null,
): PracticeReadiness {
  switch (speech.status) {
    case "done":
      if (artifacts && !artifacts.hasBallot) {
        return readiness("partial-report", "Partial report", "amber");
      }
      return readiness("ready", "Ready", "green", { isReportActionable: true });
    case "error":
      return readiness("needs-retry", "Needs retry", "red");
    case "transcribing":
      return readiness("transcribing", "Transcribing", "amber", { isProcessing: true, badge: "indigo" });
    case "analyzing":
      return readiness("analyzing", "Analyzing arguments", "amber", { isProcessing: true });
    case "pending":
      // Pasted/failed-midway sessions can hold a transcript while analysis never ran.
      if (artifacts?.hasTranscript) {
        return readiness("transcript-pending-analysis", "Transcript ready, analysis pending", "amber");
      }
      if (speech.audio_url) {
        return readiness("incomplete", "Incomplete", "neutral");
      }
      return readiness("draft", "Draft", "neutral");
    default:
      return readiness("unknown", "Unknown", "neutral");
  }
}

/** Status-only display mapping (list rows where artifacts aren't loaded). */
export function mapSpeechStatusToDisplay(
  status: SpeechStatus | string,
  audioUrl: string | null = null,
): PracticeReadiness {
  return getPracticeReadinessStatus({ status: status as SpeechStatus, audio_url: audioUrl });
}

/** A report is actionable only when the speech finished AND the ballot exists. */
export function isReportActionable(
  speech: Pick<Speech, "status">,
  artifacts: Pick<ArtifactAvailability, "hasBallot">,
): boolean {
  return speech.status === "done" && artifacts.hasBallot;
}

// ── Truthful pipeline progress (list rows) ────────────────────────────────────

export interface PipelineStepProgress {
  key: "audio" | "transcript" | "flow" | "ballot";
  label: string;
  done: boolean;
}

/**
 * What we can truthfully claim from a Speech row alone. Transcription completes
 * before `analyzing`; flow and ballot are only guaranteed at `done`. Drills are
 * never claimable from status (non-fatal step) so they are not listed.
 */
export function getPipelineProgress(
  speech: Pick<Speech, "status" | "audio_url">,
): PipelineStepProgress[] {
  const s = speech.status;
  const pastTranscription = s === "analyzing" || s === "done";
  return [
    { key: "audio", label: "Audio", done: !!speech.audio_url },
    { key: "transcript", label: "Transcript", done: pastTranscription },
    { key: "flow", label: "Flow", done: s === "done" },
    { key: "ballot", label: "Ballot", done: s === "done" },
  ];
}

// ── Latest practice summary ───────────────────────────────────────────────────

export interface LatestPracticeSummary {
  speech: Speech;
  readiness: PracticeReadiness;
  /** Where the primary button should take the student. */
  href: string;
  ctaLabel: string;
  pipeline: PipelineStepProgress[];
}

const CTA_BY_KEY: Record<ReadinessKey, string> = {
  ready: "Open report",
  "partial-report": "Review report",
  "needs-retry": "Retry analysis",
  transcribing: "Check progress",
  analyzing: "Check progress",
  "transcript-pending-analysis": "Continue analysis",
  incomplete: "Continue setup",
  draft: "Record speech",
  unknown: "Open session",
};

/** The newest practice by updated_at, with its truthful status + destination. */
export function getLatestPracticeSummary(speeches: Speech[]): LatestPracticeSummary | null {
  if (speeches.length === 0) return null;
  const latest = [...speeches].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )[0];
  const r = getPracticeReadinessStatus(latest);
  return {
    speech: latest,
    readiness: r,
    href: `/speech/${latest.id}`,
    ctaLabel: CTA_BY_KEY[r.key],
    pipeline: getPipelineProgress(latest),
  };
}

// ── Processing display (job stages) ───────────────────────────────────────────

/**
 * Ordered pipeline steps as reported by the backend job's `current_step`.
 * `delivery_analysis` is a non-fatal sub-step between transcription and
 * extraction; it displays under the transcription→analysis transition.
 */
const JOB_STEP_ORDER = [
  "transcribing",
  "delivery_analysis",
  "extracting_flow",
  "generating_feedback",
  "generating_drills",
  "finalizing",
] as const;

const JOB_STEP_DISPLAY: Record<(typeof JOB_STEP_ORDER)[number], string> = {
  transcribing: "Transcribing",
  delivery_analysis: "Analyzing arguments",
  extracting_flow: "Analyzing arguments",
  generating_feedback: "Generating ballot",
  generating_drills: "Creating drills",
  finalizing: "Validating",
};

export interface ProcessingDisplayState {
  /** Honest human label for the current moment. */
  label: string;
  tone: ReadinessTone;
  /** True while the job is queued or running. */
  isActive: boolean;
  /** 0-based index into the known step order, or null when unknown. */
  stepIndex: number | null;
}

/** Honest processing state from a job's real status + current_step. */
export function getProcessingDisplayState(
  job: Pick<AnalysisJob, "status" | "current_step"> | null,
): ProcessingDisplayState {
  if (!job) return { label: "Unknown", tone: "neutral", isActive: false, stepIndex: null };

  if (job.status === "failed") {
    return { label: "Failed", tone: "red", isActive: false, stepIndex: null };
  }
  if (job.status === "cancelled") {
    return { label: "Incomplete", tone: "neutral", isActive: false, stepIndex: null };
  }
  if (job.status === "succeeded") {
    return { label: "Ready", tone: "green", isActive: false, stepIndex: null };
  }
  if (job.status === "queued") {
    return { label: "Preparing", tone: "amber", isActive: true, stepIndex: null };
  }

  // running — trust current_step only when it's a step we recognize.
  const idx = JOB_STEP_ORDER.indexOf(job.current_step as (typeof JOB_STEP_ORDER)[number]);
  if (idx === -1) {
    return { label: "Analyzing arguments", tone: "amber", isActive: true, stepIndex: null };
  }
  return {
    label: JOB_STEP_DISPLAY[JOB_STEP_ORDER[idx]],
    tone: "amber",
    isActive: true,
    stepIndex: idx,
  };
}
