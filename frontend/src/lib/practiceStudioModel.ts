/**
 * Practice Studio model — pure, framework-free utility functions.
 *
 * All "what should the UI show?" decisions for the recording and upload flow
 * live here so they can be unit-tested without mounting any components.
 */

import type { RecordState } from "@/components/RecordingStudio";
import type { RecorderState } from "@/lib/recorder";

// ── Primary action derivation ─────────────────────────────────────────────────

export interface StudioPrimaryAction {
  /** Button label. */
  label: string;
  /** Keyboard shortcut hint text, or null if none. */
  keyboardHint: string | null;
  /** Accessible name for the primary control. */
  ariaLabel: string;
  /** Whether the primary control is currently disabled. */
  disabled: boolean;
}

/**
 * Returns the one primary action the user should take in the current
 * recorder state. The countdown is a transient UI state, not a RecordState,
 * so it is passed as a separate boolean.
 */
export function deriveStudioPrimaryAction(
  state: RecordState,
  isCountingDown: boolean,
): StudioPrimaryAction {
  if (isCountingDown) {
    return {
      label: "Cancel",
      keyboardHint: "Esc",
      ariaLabel: "Cancel countdown (Esc)",
      disabled: false,
    };
  }
  switch (state) {
    case "idle":
      return {
        label: "Start Recording",
        keyboardHint: "Space",
        ariaLabel: "Start recording (Space)",
        disabled: false,
      };
    case "requesting":
      return {
        label: "Requesting mic…",
        keyboardHint: null,
        ariaLabel: "Requesting microphone access",
        disabled: true,
      };
    case "recording":
      return {
        label: "Stop",
        keyboardHint: "Space",
        ariaLabel: "Stop recording (Space)",
        disabled: false,
      };
    case "recorded":
      return {
        label: "Analyze Speech",
        keyboardHint: null,
        ariaLabel: "Analyze this speech",
        disabled: false,
      };
    case "uploading":
      return {
        label: "Saving…",
        keyboardHint: null,
        ariaLabel: "Saving recording",
        disabled: true,
      };
    case "error":
      return {
        label: "Try Again",
        keyboardHint: "Space",
        ariaLabel: "Try starting recording again",
        disabled: false,
      };
    default:
      return {
        label: "Start Recording",
        keyboardHint: "Space",
        ariaLabel: "Start recording",
        disabled: false,
      };
  }
}

// ── Error display ─────────────────────────────────────────────────────────────

export interface RecorderErrorDisplay {
  headline: string;
  body: string;
  isPermission: boolean;
  isUnsupported: boolean;
  canRetry: boolean;
}

/**
 * Maps recorder error kinds to user-facing copy.
 * Never exposes raw error messages from the browser — those are technical
 * and confusing for novice students.
 */
export function deriveRecorderErrorDisplay(
  errorKind: RecorderState["errorKind"],
  error: string | null,
): RecorderErrorDisplay {
  switch (errorKind) {
    case "permission":
      return {
        headline: "Microphone access denied",
        body: "Allow microphone access in your browser settings, then refresh the page.",
        isPermission: true,
        isUnsupported: false,
        canRetry: false,
      };
    case "unsupported":
      return {
        headline: "Recording not supported",
        body: "Your browser doesn't support audio recording. Try Chrome or Firefox, or use the Upload option instead.",
        isPermission: false,
        isUnsupported: true,
        canRetry: false,
      };
    case "upload":
      return {
        headline: "Upload failed",
        body: "Could not save your recording — your take is still here. Try again.",
        isPermission: false,
        isUnsupported: false,
        canRetry: true,
      };
    default:
      return {
        headline: "Something went wrong",
        body: error ?? "An unexpected error occurred. Try again.",
        isPermission: false,
        isUnsupported: false,
        canRetry: true,
      };
  }
}

// ── Speech time progress ──────────────────────────────────────────────────────

export const RECORDING_MINIMUM_SECONDS = 30;

export interface SpeechTimeProgress {
  seconds: number;
  targetSeconds: number;
  meetsMinimum: boolean;
  isGoodLength: boolean;
  isOverTarget: boolean;
  secondsToMinimum: number;
  nudge: string;
}

/**
 * Derives progress nudge text for display during an active recording.
 * Never shows a percentage — only honest time-based feedback.
 */
export function deriveSpeechTimeProgress(
  seconds: number,
  targetSeconds: number,
): SpeechTimeProgress {
  const meetsMinimum = seconds >= RECORDING_MINIMUM_SECONDS;
  const isGoodLength = seconds >= targetSeconds * 0.9 && seconds <= targetSeconds * 1.15;
  const isOverTarget = seconds > targetSeconds * 1.15;
  const secondsToMinimum = Math.max(0, RECORDING_MINIMUM_SECONDS - seconds);

  let nudge: string;
  if (seconds < RECORDING_MINIMUM_SECONDS) {
    nudge = `${secondsToMinimum}s to minimum`;
  } else if (isOverTarget) {
    nudge = "Over target — consider wrapping up";
  } else if (isGoodLength) {
    nudge = "Good length — stop when ready";
  } else {
    nudge = "Keep speaking";
  }

  return {
    seconds,
    targetSeconds,
    meetsMinimum,
    isGoodLength,
    isOverTarget,
    secondsToMinimum,
    nudge,
  };
}

// ── Recorder status → studio display state ────────────────────────────────────

/**
 * Maps the raw hook `RecorderStatus` to the five presentational `RecordState`
 * values consumed by `RecordingStudio`. Centralises the mapping so both the
 * page and tests use the same logic.
 */
export function mapRecorderStatusToStudioState(
  status: RecorderState["status"],
): RecordState {
  switch (status) {
    case "idle":        return "idle";
    case "requesting-permission":
    case "ready":       return "requesting";
    case "recording":
    case "stopping":    return "recording";
    case "recorded":
    case "playing":     return "recorded";
    case "uploading":
    case "uploaded":    return "uploading";
    case "error":       return "error";
    default:            return "idle";
  }
}

// ── Analysis phase display ────────────────────────────────────────────────────

export type AnalysisStage = "not-started" | "queued" | "running" | "done" | "failed";

export interface AnalysisPhaseDisplay {
  stage: AnalysisStage;
  label: string;
  /** Can the user read a transcript while this stage is active? */
  allowTranscriptReview: boolean;
  /** Should a retry action be offered? */
  canRetry: boolean;
}

/**
 * Derives the analysis phase display from the current job status and
 * what data is already available. Used to decide which sections show and
 * whether a retry button is appropriate — without fake percentage progress.
 */
export function deriveAnalysisPhaseDisplay(
  jobStatus: string | null | undefined,
  hasTranscript: boolean,
  hasFeedback: boolean,
): AnalysisPhaseDisplay {
  if (hasFeedback) {
    return {
      stage: "done",
      label: "Analysis complete",
      allowTranscriptReview: true,
      canRetry: false,
    };
  }
  if (!jobStatus) {
    return {
      stage: "not-started",
      label: "Ready to analyze",
      allowTranscriptReview: hasTranscript,
      canRetry: false,
    };
  }
  if (jobStatus === "queued") {
    return {
      stage: "queued",
      label: "Queued for analysis",
      allowTranscriptReview: hasTranscript,
      canRetry: false,
    };
  }
  if (jobStatus === "running") {
    return {
      stage: "running",
      label: "Analyzing your speech",
      allowTranscriptReview: hasTranscript,
      canRetry: false,
    };
  }
  if (jobStatus === "done") {
    return {
      stage: "done",
      label: "Analysis complete",
      allowTranscriptReview: true,
      canRetry: false,
    };
  }
  if (jobStatus === "failed") {
    return {
      stage: "failed",
      label: "Analysis didn't finish",
      allowTranscriptReview: hasTranscript,
      canRetry: true,
    };
  }
  return {
    stage: "not-started",
    label: "Processing",
    allowTranscriptReview: hasTranscript,
    canRetry: false,
  };
}

// ── Upload mode state ─────────────────────────────────────────────────────────

export type UploadPhase = "idle" | "file-selected" | "uploading" | "done" | "error";

export interface UploadPhaseDisplay {
  phase: UploadPhase;
  label: string;
  canUpload: boolean;
  isBusy: boolean;
}

/**
 * Derives upload phase from the upload hook's status string.
 * Also checks whether there's a file selected (ready) or an error.
 */
export function deriveUploadPhaseDisplay(
  status: "idle" | "ready" | "uploading" | "uploaded" | "error",
  hasFile: boolean,
  hasError: boolean,
): UploadPhaseDisplay {
  if (hasError) {
    return { phase: "error", label: "Upload failed — try again", canUpload: hasFile, isBusy: false };
  }
  switch (status) {
    case "idle":
      return { phase: "idle", label: "Select an audio file", canUpload: false, isBusy: false };
    case "ready":
      return { phase: "file-selected", label: "Ready to upload", canUpload: true, isBusy: false };
    case "uploading":
      return { phase: "uploading", label: "Uploading…", canUpload: false, isBusy: true };
    case "uploaded":
      return { phase: "done", label: "Upload complete", canUpload: false, isBusy: false };
    case "error":
      return { phase: "error", label: "Upload failed — try again", canUpload: hasFile, isBusy: false };
    default:
      return { phase: "idle", label: "Select an audio file", canUpload: false, isBusy: false };
  }
}

// ── Countdown accessible copy ─────────────────────────────────────────────────

/**
 * Screen-reader-friendly countdown announcement text.
 * Used in the aria-live region of the countdown overlay.
 */
export function countdownAnnouncement(count: number | "go"): string {
  if (count === "go") return "Speak now";
  if (count === 3) return "Starting in 3";
  if (count === 2) return "Starting in 2";
  if (count === 1) return "Starting in 1";
  return `Starting in ${count}`;
}

// ── Speech stage context label ────────────────────────────────────────────────

const SPEECH_TYPE_LABELS: Record<string, string> = {
  constructive:  "Constructive",
  rebuttal:      "Rebuttal",
  summary:       "Summary",
  final_focus:   "Final Focus",
  crossfire:     "Crossfire",
};

/**
 * Returns a human-readable label for a speech type key, falling back
 * to a title-cased version of the key.
 */
export function labelForSpeechType(speechType: string): string {
  return (
    SPEECH_TYPE_LABELS[speechType] ??
    speechType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
