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

import type { AnalysisJob, Speech, SpeechArtifactSummary, SpeechStatus } from "@/types";
import { getFriendlyJobError } from "@/lib/jobHelpers";

// ── Display model ─────────────────────────────────────────────────────────────

export type ReadinessTone = "green" | "amber" | "red" | "neutral";

export type ReadinessKey =
  | "draft"
  | "incomplete"
  | "transcript-pending-analysis"
  | "transcribing"
  | "analyzing"
  /** Live job stage from artifact_summary (label carries the real stage). */
  | "processing"
  /** Job still marked running but silent past the stale threshold. */
  | "stale"
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
  /** Optional one-line explanation (friendly error, stale-job guidance). */
  detail?: string;
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
  opts: {
    isProcessing?: boolean;
    isReportActionable?: boolean;
    badge?: PracticeReadiness["badge"];
    detail?: string;
  } = {},
): PracticeReadiness {
  return {
    key,
    label,
    tone,
    badge: opts.badge ?? TONE_BADGE[tone],
    isProcessing: opts.isProcessing ?? false,
    isReportActionable: opts.isReportActionable ?? false,
    ...(opts.detail ? { detail: opts.detail } : {}),
  };
}

// ── Job liveness / staleness ──────────────────────────────────────────────────

/**
 * How long a queued/running job may go without its row moving before we stop
 * presenting it as healthy. update_job_progress touches updated_at at every
 * pipeline stage, and a full analysis normally completes in a few minutes —
 * 12 minutes of silence conservatively means the worker is gone.
 */
export const STALE_JOB_THRESHOLD_MS = 12 * 60 * 1000;

/** True when a job's last movement is older than the stale threshold. */
export function isJobStale(
  updatedAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!updatedAt) return false; // no evidence — never claim stale without it
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t > STALE_JOB_THRESHOLD_MS;
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

// ── Backend-verified list readiness (artifact_summary) ───────────────────────

/** Adapt a backend artifact summary to the local availability shape. */
export function summaryToAvailability(s: SpeechArtifactSummary): ArtifactAvailability {
  return {
    hasTranscript: s.has_transcript,
    hasFlow: s.has_flow,
    hasBallot: s.has_ballot,
    hasDrills: (s.drill_count ?? 0) > 0,
  };
}

function summaryJob(s: SpeechArtifactSummary): Pick<AnalysisJob, "status" | "current_step"> | null {
  if (!s.latest_job_status) return null;
  return {
    status: s.latest_job_status as AnalysisJob["status"],
    current_step: s.latest_job_current_step,
  };
}

/**
 * Readiness for a list/dashboard row. Prefers the backend-verified
 * artifact_summary when present; falls back to the status-contract mapping
 * (Phase 5A behavior) when it isn't.
 *
 * Priority with a summary:
 *   1. done + verified ballot            → Ready (the only green)
 *   2. queued/running job, fresh         → live processing stage (amber)
 *      queued/running job, gone quiet    → Taking longer than expected (stale)
 *   3. failed job or error status        → Needs retry (red, friendly message)
 *   4. transcript only, nothing else     → Transcript ready, analysis pending
 *   5. anything done without a ballot,
 *      or flow without a ballot          → Partial report (amber)
 *   6. otherwise                         → status mapping with verified artifacts
 */
export function getSpeechListReadiness(
  speech: Pick<Speech, "status" | "audio_url" | "artifact_summary">,
  nowMs: number = Date.now(),
): PracticeReadiness {
  const sum = speech.artifact_summary;
  if (!sum) return getPracticeReadinessStatus(speech);

  if (speech.status === "done" && sum.has_ballot) {
    return readiness("ready", "Ready", "green", { isReportActionable: true });
  }

  const job = summaryJob(sum);
  if (job && (job.status === "queued" || job.status === "running")) {
    if (isJobStale(sum.latest_job_updated_at, nowMs)) {
      return readiness("stale", "Taking longer than expected", "amber", {
        detail:
          "Analysis hasn’t reported progress for a while. Open the practice to retry — your recording is saved.",
      });
    }
    const stage = getProcessingDisplayState(job);
    return readiness("processing", stage.label, "amber", { isProcessing: true });
  }

  if (speech.status === "error" || job?.status === "failed") {
    return readiness("needs-retry", "Needs retry", "red", {
      detail: getFriendlyJobError(sum.latest_job_error_code),
    });
  }

  if (sum.has_transcript && !sum.has_flow && !sum.has_ballot) {
    return readiness("transcript-pending-analysis", "Transcript ready, analysis pending", "amber");
  }

  if ((speech.status === "done" || sum.has_flow) && !sum.has_ballot) {
    return readiness("partial-report", "Partial report", "amber");
  }

  return getPracticeReadinessStatus(speech, summaryToAvailability(sum));
}

// ── Active-row detection (dashboard polling gate) ────────────────────────────

/** Background refetch cadence while any speech is actively analyzing. */
export const ACTIVE_POLL_INTERVAL_MS = 6000;

/**
 * Whether background work may still change this row — the gate for dashboard
 * polling. Ready, failed, draft, and transcript-waiting-on-user rows are
 * inactive; so are stale jobs (polling a worker that stopped reporting would
 * poll forever).
 */
export function isSpeechActive(
  speech: Pick<Speech, "status" | "audio_url" | "artifact_summary">,
  nowMs: number = Date.now(),
): boolean {
  const sum = speech.artifact_summary;
  const jobStatus = sum?.latest_job_status;

  if (jobStatus === "queued" || jobStatus === "running") {
    return !isJobStale(sum?.latest_job_updated_at, nowMs);
  }
  if (jobStatus === "failed" || speech.status === "error") return false;
  if (speech.status === "done" && sum?.has_ballot) return false;

  // No job telemetry — the backend-transitional statuses are the only honest
  // signal that work is in flight. pending/draft rows wait on the user.
  return speech.status === "transcribing" || speech.status === "analyzing";
}

/** True when at least one row justifies background polling. */
export function hasActiveSpeeches(speeches: Speech[], nowMs: number = Date.now()): boolean {
  return speeches.some((s) => isSpeechActive(s, nowMs));
}

// ── Truthful pipeline progress (list rows) ────────────────────────────────────

export interface PipelineStepProgress {
  key: "audio" | "transcript" | "flow" | "ballot" | "drills";
  label: string;
  done: boolean;
  /** True when the data can't tell us either way (render neutral, not missing). */
  unknown?: boolean;
}

/**
 * Which artifacts genuinely exist. With a backend artifact_summary this is
 * verified per artifact (including a real drill count); from a Speech row
 * alone it claims only what the status contract guarantees — transcription
 * completes before `analyzing`, flow and ballot only at `done`, and drills
 * are never claimable from status (non-fatal step) so the step is omitted.
 */
export function getPipelineProgress(
  speech: Pick<Speech, "status" | "audio_url" | "artifact_summary">,
): PipelineStepProgress[] {
  const audio: PipelineStepProgress = { key: "audio", label: "Audio", done: !!speech.audio_url };
  const sum = speech.artifact_summary;

  if (sum) {
    return [
      audio,
      { key: "transcript", label: "Transcript", done: sum.has_transcript },
      { key: "flow", label: "Flow", done: sum.has_flow },
      { key: "ballot", label: "Ballot", done: sum.has_ballot },
      sum.drill_count == null
        ? { key: "drills", label: "Drills", done: false, unknown: true }
        : { key: "drills", label: "Drills", done: sum.drill_count > 0 },
    ];
  }

  const s = speech.status;
  const pastTranscription = s === "analyzing" || s === "done";
  return [
    audio,
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
  processing: "Check progress",
  stale: "Open & retry",
  "transcript-pending-analysis": "Continue analysis",
  incomplete: "Continue setup",
  draft: "Record speech",
  unknown: "Open session",
};

/**
 * The newest practice by updated_at, with its truthful status + destination.
 * Uses backend-verified artifact data when the speech carries a summary.
 */
export function getLatestPracticeSummary(
  speeches: Speech[],
  nowMs: number = Date.now(),
): LatestPracticeSummary | null {
  if (speeches.length === 0) return null;
  const latest = [...speeches].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )[0];
  const r = getSpeechListReadiness(latest, nowMs);
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
