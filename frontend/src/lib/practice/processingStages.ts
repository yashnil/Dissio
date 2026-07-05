/**
 * Honest processing-stage model.
 *
 * The analysis job reports a real `current_step` while running (transcribing →
 * extracting_flow → generating_feedback → generating_drills → finalizing).
 * When we have it, we show the matching fine-grained stage sequence — earlier
 * stages are genuinely complete because the pipeline is strictly ordered.
 * When we don't (queued, legacy jobs, unknown steps), we fall back to a coarse
 * truthful set of stages. Never a fake percentage, never time-based progress.
 */

export type ProcStageStatus = "done" | "active" | "upcoming" | "failed";

export interface ProcStage {
  id: string;
  label: string;
  status: ProcStageStatus;
}

/** Coarse job status mirrored from the analysis hook. */
export type ProcJobStatus = "queued" | "running" | "succeeded" | "failed" | null;

export interface ProcessingStageInput {
  jobStatus: ProcJobStatus;
  /** True once the report data (feedback) has loaded. */
  hasReport: boolean;
  /** True when analysis failed (and not recovered). */
  failed: boolean;
  /** The job's real current_step, when known. Enables fine-grained stages. */
  currentStep?: string | null;
}

// ── Fine-grained stages (from the job's real current_step) ───────────────────

/** Backend current_step → 0-based index in FINE_STAGES. */
const STEP_TO_FINE_INDEX: Record<string, number> = {
  transcribing: 0,
  delivery_analysis: 1, // runs after transcription, within argument analysis
  extracting_flow: 1,
  generating_feedback: 2,
  generating_drills: 3,
  finalizing: 4,
};

const FINE_STAGES: { id: string; label: string }[] = [
  { id: "transcribing", label: "Transcribing" },
  { id: "extracting", label: "Analyzing arguments" },
  { id: "ballot", label: "Generating ballot" },
  { id: "drills", label: "Creating drills" },
  { id: "validating", label: "Validating" },
];

/**
 * The categories Dissio examines during "analysis running". Shown as an
 * explanatory checklist — they are NOT independently completed in the UI.
 */
export const ANALYSIS_CATEGORIES = [
  "Argument structure",
  "Evidence use",
  "Clash",
  "Weighing",
  "Judge adaptation",
  "Delivery",
  "Drill opportunities",
] as const;

export function deriveProcessingStages(input: ProcessingStageInput): ProcStage[] {
  const { jobStatus, hasReport, failed, currentStep } = input;

  // Input is always secured by the time processing renders.
  const inputStage: ProcStage = { id: "input", label: "Input secured", status: "done" };

  // Fine-grained path: a running job with a recognized real step.
  const fineIndex =
    jobStatus === "running" && currentStep != null
      ? STEP_TO_FINE_INDEX[currentStep]
      : undefined;
  if (fineIndex !== undefined && !failed && !hasReport) {
    return [
      inputStage,
      ...FINE_STAGES.map((s, i): ProcStage => ({
        ...s,
        status: i < fineIndex ? "done" : i === fineIndex ? "active" : "upcoming",
      })),
      { id: "ready", label: "Report ready", status: "upcoming" },
    ];
  }

  if (failed) {
    return [
      inputStage,
      { id: "analysis", label: "Analysis running", status: "failed" },
      { id: "assembling", label: "Report assembling", status: "upcoming" },
      { id: "ready", label: "Report ready", status: "upcoming" },
    ];
  }

  if (hasReport) {
    return [
      inputStage,
      { id: "analysis", label: "Analysis running", status: "done" },
      { id: "assembling", label: "Report assembling", status: "done" },
      { id: "ready", label: "Report ready", status: "done" },
    ];
  }

  const analysisActive = jobStatus === "queued" || jobStatus === "running";
  const analysisDone = jobStatus === "succeeded";

  return [
    inputStage,
    {
      id: "analysis",
      label: "Analysis running",
      status: analysisDone ? "done" : analysisActive ? "active" : "upcoming",
    },
    {
      id: "assembling",
      label: "Report assembling",
      status: analysisDone ? "active" : "upcoming",
    },
    { id: "ready", label: "Report ready", status: "upcoming" },
  ];
}

/** The current active (or failed) stage's label, for the live-region headline. */
export function processingHeadline(stages: ProcStage[]): string {
  const failed = stages.find((s) => s.status === "failed");
  if (failed) return "Analysis didn’t finish";
  const active = stages.find((s) => s.status === "active");
  if (active) return active.label;
  return stages.every((s) => s.status === "done") ? "Report ready" : "Preparing analysis";
}

/** Whether the timeline is in a terminal state (no further animation needed). */
export function isProcessingTerminal(stages: ProcStage[]): boolean {
  return stages.every((s) => s.status === "done") || stages.some((s) => s.status === "failed");
}
