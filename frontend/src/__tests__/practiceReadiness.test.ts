/**
 * Practice readiness + status display tests.
 *
 * Covers the truthfulness contract:
 *  - done + complete artifacts → Ready (green, actionable)
 *  - transcript exists but report missing → Transcript ready, analysis pending
 *  - processing statuses → amber processing states
 *  - failed → red retry state
 *  - missing/unknown data → neutral draft/incomplete/unknown
 *  - latest-practice summary + primary destination mapping
 *  - honest job-stage display from real current_step values
 */

import {
  getPracticeReadinessStatus,
  mapSpeechStatusToDisplay,
  isReportActionable,
  getPipelineProgress,
  getLatestPracticeSummary,
  getProcessingDisplayState,
  type ArtifactAvailability,
} from "@/lib/practiceReadiness";
import type { AnalysisJob, Speech, SpeechStatus } from "@/types";

function speech(over: Partial<Speech>): Speech {
  return {
    id: "s1",
    user_id: "u1",
    title: "Speech",
    speech_type: "constructive",
    side: "pro",
    judge_type: "flow",
    topic: null,
    audio_url: null,
    duration_seconds: 120,
    status: "done",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    parent_speech_id: null,
    source_drill_id: null,
    ...over,
  };
}

const fullArtifacts: ArtifactAvailability = {
  hasTranscript: true,
  hasFlow: true,
  hasBallot: true,
  hasDrills: true,
};

describe("getPracticeReadinessStatus", () => {
  it("done speech with complete artifacts → Ready (green, actionable)", () => {
    const r = getPracticeReadinessStatus(speech({ status: "done" }), fullArtifacts);
    expect(r.key).toBe("ready");
    expect(r.label).toBe("Ready");
    expect(r.tone).toBe("green");
    expect(r.isReportActionable).toBe(true);
  });

  it("done speech but ballot missing → Partial report (amber, NOT actionable)", () => {
    const r = getPracticeReadinessStatus(
      speech({ status: "done" }),
      { ...fullArtifacts, hasBallot: false, hasDrills: false },
    );
    expect(r.key).toBe("partial-report");
    expect(r.label).toBe("Partial report");
    expect(r.tone).toBe("amber");
    expect(r.isReportActionable).toBe(false);
  });

  it("pending speech with a transcript but no report → Transcript ready, analysis pending", () => {
    const r = getPracticeReadinessStatus(
      speech({ status: "pending" }),
      { hasTranscript: true, hasFlow: false, hasBallot: false, hasDrills: false },
    );
    expect(r.key).toBe("transcript-pending-analysis");
    expect(r.label).toBe("Transcript ready, analysis pending");
    expect(r.tone).toBe("amber");
  });

  it("transcribing / analyzing → amber processing states", () => {
    const t = getPracticeReadinessStatus(speech({ status: "transcribing" }));
    expect(t.label).toBe("Transcribing");
    expect(t.tone).toBe("amber");
    expect(t.isProcessing).toBe(true);

    const a = getPracticeReadinessStatus(speech({ status: "analyzing" }));
    expect(a.label).toBe("Analyzing arguments");
    expect(a.tone).toBe("amber");
    expect(a.isProcessing).toBe(true);
  });

  it("error → Needs retry (red)", () => {
    const r = getPracticeReadinessStatus(speech({ status: "error" }));
    expect(r.key).toBe("needs-retry");
    expect(r.label).toBe("Needs retry");
    expect(r.tone).toBe("red");
    expect(r.badge).toBe("red");
  });

  it("pending without audio → Draft (neutral); with audio → Incomplete (neutral)", () => {
    const draft = getPracticeReadinessStatus(speech({ status: "pending", audio_url: null }));
    expect(draft.key).toBe("draft");
    expect(draft.tone).toBe("neutral");

    const inc = getPracticeReadinessStatus(speech({ status: "pending", audio_url: "http://x/a.mp3" }));
    expect(inc.key).toBe("incomplete");
    expect(inc.label).toBe("Incomplete");
    expect(inc.tone).toBe("neutral");
  });

  it("unknown status → Unknown (neutral) — never green", () => {
    const r = getPracticeReadinessStatus(speech({ status: "mystery" as SpeechStatus }));
    expect(r.key).toBe("unknown");
    expect(r.tone).toBe("neutral");
    expect(r.isReportActionable).toBe(false);
  });

  it("never returns green for any non-done status", () => {
    const statuses: SpeechStatus[] = ["pending", "transcribing", "analyzing", "error"];
    for (const status of statuses) {
      expect(getPracticeReadinessStatus(speech({ status })).tone).not.toBe("green");
    }
  });
});

describe("mapSpeechStatusToDisplay", () => {
  it("mirrors the status-only readiness mapping", () => {
    expect(mapSpeechStatusToDisplay("done").label).toBe("Ready");
    expect(mapSpeechStatusToDisplay("error").label).toBe("Needs retry");
    expect(mapSpeechStatusToDisplay("pending", "http://x/a.mp3").label).toBe("Incomplete");
    expect(mapSpeechStatusToDisplay("pending").label).toBe("Draft");
  });
});

describe("isReportActionable", () => {
  it("requires done status AND a ballot artifact", () => {
    expect(isReportActionable(speech({ status: "done" }), { hasBallot: true })).toBe(true);
    expect(isReportActionable(speech({ status: "done" }), { hasBallot: false })).toBe(false);
    expect(isReportActionable(speech({ status: "analyzing" }), { hasBallot: true })).toBe(false);
  });
});

describe("getPipelineProgress", () => {
  it("claims nothing beyond what the status guarantees", () => {
    const transcribing = getPipelineProgress(speech({ status: "transcribing", audio_url: "http://x/a.mp3" }));
    expect(transcribing.find((s) => s.key === "transcript")!.done).toBe(false);
    expect(transcribing.find((s) => s.key === "flow")!.done).toBe(false);

    const analyzing = getPipelineProgress(speech({ status: "analyzing" }));
    expect(analyzing.find((s) => s.key === "transcript")!.done).toBe(true);
    // Flow is only guaranteed at done — analyzing must not claim it.
    expect(analyzing.find((s) => s.key === "flow")!.done).toBe(false);
    expect(analyzing.find((s) => s.key === "ballot")!.done).toBe(false);

    const done = getPipelineProgress(speech({ status: "done" }));
    expect(done.every((s) => s.key === "audio" || s.done)).toBe(true);
  });

  it("does not include a drills step (never claimable from status)", () => {
    expect(getPipelineProgress(speech({})).map((s) => s.key)).toEqual([
      "audio", "transcript", "flow", "ballot",
    ]);
  });
});

describe("getLatestPracticeSummary", () => {
  it("returns null with no speeches (empty state)", () => {
    expect(getLatestPracticeSummary([])).toBeNull();
  });

  it("picks the newest speech by updated_at and maps the primary action", () => {
    const s = getLatestPracticeSummary([
      speech({ id: "old", status: "done", updated_at: "2026-06-01T00:00:00Z" }),
      speech({ id: "new", status: "error", updated_at: "2026-06-05T00:00:00Z" }),
    ])!;
    expect(s.speech.id).toBe("new");
    expect(s.href).toBe("/speech/new");
    expect(s.ctaLabel).toBe("Retry analysis");
  });

  it("ready report → Open report; processing → Check progress; draft → Record speech", () => {
    expect(getLatestPracticeSummary([speech({ status: "done" })])!.ctaLabel).toBe("Open report");
    expect(getLatestPracticeSummary([speech({ status: "analyzing" })])!.ctaLabel).toBe("Check progress");
    expect(getLatestPracticeSummary([speech({ status: "pending" })])!.ctaLabel).toBe("Record speech");
  });
});

describe("getProcessingDisplayState", () => {
  function job(over: Partial<AnalysisJob>): Pick<AnalysisJob, "status" | "current_step"> {
    return { status: "running", current_step: null, ...over };
  }

  it("maps real pipeline steps to honest debate-native labels", () => {
    expect(getProcessingDisplayState(job({ current_step: "transcribing" })).label).toBe("Transcribing");
    expect(getProcessingDisplayState(job({ current_step: "extracting_flow" })).label).toBe("Analyzing arguments");
    expect(getProcessingDisplayState(job({ current_step: "generating_feedback" })).label).toBe("Generating ballot");
    expect(getProcessingDisplayState(job({ current_step: "generating_drills" })).label).toBe("Creating drills");
    expect(getProcessingDisplayState(job({ current_step: "finalizing" })).label).toBe("Validating");
  });

  it("queued → Preparing (amber, active); failed → red; succeeded → green", () => {
    const q = getProcessingDisplayState(job({ status: "queued" }));
    expect(q.label).toBe("Preparing");
    expect(q.tone).toBe("amber");
    expect(q.isActive).toBe(true);

    const f = getProcessingDisplayState(job({ status: "failed" }));
    expect(f.label).toBe("Failed");
    expect(f.tone).toBe("red");
    expect(f.isActive).toBe(false);

    expect(getProcessingDisplayState(job({ status: "succeeded" })).tone).toBe("green");
  });

  it("unknown step falls back to a simpler honest status, not a fake stage", () => {
    const r = getProcessingDisplayState(job({ current_step: "quantum_reticulation" }));
    expect(r.label).toBe("Analyzing arguments");
    expect(r.stepIndex).toBeNull();
  });

  it("missing job → Unknown (neutral)", () => {
    const r = getProcessingDisplayState(null);
    expect(r.label).toBe("Unknown");
    expect(r.tone).toBe("neutral");
  });
});

// ── Phase 5B: backend-verified artifact_summary ──────────────────────────────

import {
  getSpeechListReadiness,
  summaryToAvailability,
} from "@/lib/practiceReadiness";
import type { SpeechArtifactSummary } from "@/types";

function summary(over: Partial<SpeechArtifactSummary> = {}): SpeechArtifactSummary {
  return {
    has_transcript: false,
    has_flow: false,
    has_ballot: false,
    has_feedback: false,
    drill_count: 0,
    latest_job_status: null,
    latest_job_current_step: null,
    latest_job_error: null,
    ...over,
  };
}

describe("getSpeechListReadiness — prefers artifact_summary over status", () => {
  it("done + verified ballot → Ready (the only green)", () => {
    const r = getSpeechListReadiness(speech({
      status: "done",
      artifact_summary: summary({ has_transcript: true, has_flow: true, has_ballot: true }),
    }));
    expect(r.key).toBe("ready");
    expect(r.tone).toBe("green");
    expect(r.isReportActionable).toBe(true);
  });

  it("done WITHOUT verified ballot → Partial report, never Ready", () => {
    const r = getSpeechListReadiness(speech({
      status: "done",
      artifact_summary: summary({ has_transcript: true, has_flow: true, has_ballot: false }),
    }));
    expect(r.key).toBe("partial-report");
    expect(r.tone).toBe("amber");
    expect(r.isReportActionable).toBe(false);
  });

  it("transcript-only summary → Transcript ready, analysis pending (even when status says done)", () => {
    // Legacy transcribe/paste path marks speeches done after saving only a transcript.
    const r = getSpeechListReadiness(speech({
      status: "done",
      artifact_summary: summary({ has_transcript: true }),
    }));
    expect(r.key).toBe("transcript-pending-analysis");
    expect(r.label).toBe("Transcript ready, analysis pending");
  });

  it("running job with current_step → specific live stage, not generic Analyzing", () => {
    const r = getSpeechListReadiness(speech({
      status: "analyzing",
      artifact_summary: summary({
        has_transcript: true,
        latest_job_status: "running",
        latest_job_current_step: "generating_feedback",
      }),
    }));
    expect(r.key).toBe("processing");
    expect(r.label).toBe("Generating ballot");
    expect(r.tone).toBe("amber");
    expect(r.isProcessing).toBe(true);
  });

  it("each known current_step maps to its debate-native stage label", () => {
    const cases: Array<[string, string]> = [
      ["transcribing", "Transcribing"],
      ["extracting_flow", "Analyzing arguments"],
      ["generating_feedback", "Generating ballot"],
      ["generating_drills", "Creating drills"],
      ["finalizing", "Validating"],
    ];
    for (const [step, label] of cases) {
      const r = getSpeechListReadiness(speech({
        status: "analyzing",
        artifact_summary: summary({ latest_job_status: "running", latest_job_current_step: step }),
      }));
      expect(r.label).toBe(label);
    }
  });

  it("queued job → Preparing (amber)", () => {
    const r = getSpeechListReadiness(speech({
      status: "pending",
      audio_url: "http://x/a.mp3",
      artifact_summary: summary({ latest_job_status: "queued" }),
    }));
    expect(r.label).toBe("Preparing");
    expect(r.tone).toBe("amber");
  });

  it("failed latest job → Needs retry (red), even when status is stale", () => {
    const r = getSpeechListReadiness(speech({
      status: "analyzing",
      artifact_summary: summary({
        has_transcript: true,
        latest_job_status: "failed",
        latest_job_error: "Model timeout",
      }),
    }));
    expect(r.key).toBe("needs-retry");
    expect(r.tone).toBe("red");
  });

  it("done + ballot wins over an old failed job (report is genuinely ready)", () => {
    const r = getSpeechListReadiness(speech({
      status: "done",
      artifact_summary: summary({
        has_transcript: true, has_flow: true, has_ballot: true,
        latest_job_status: "failed",
      }),
    }));
    expect(r.key).toBe("ready");
  });

  it("missing artifact_summary → conservative Phase 5A status fallback", () => {
    expect(getSpeechListReadiness(speech({ status: "done", artifact_summary: null })).label).toBe("Ready");
    expect(getSpeechListReadiness(speech({ status: "error" })).label).toBe("Needs retry");
    expect(getSpeechListReadiness(speech({ status: "analyzing" })).label).toBe("Analyzing arguments");
  });
});

describe("summaryToAvailability", () => {
  it("maps booleans and treats null drill_count as no drills", () => {
    expect(summaryToAvailability(summary({ has_ballot: true, drill_count: null }))).toEqual({
      hasTranscript: false, hasFlow: false, hasBallot: true, hasDrills: false,
    });
    expect(summaryToAvailability(summary({ drill_count: 2 })).hasDrills).toBe(true);
  });
});

describe("getPipelineProgress — with artifact_summary", () => {
  it("uses verified artifact booleans and a real drill count", () => {
    const steps = getPipelineProgress(speech({
      status: "analyzing",
      artifact_summary: summary({ has_transcript: true, has_flow: true, drill_count: 3 }),
    }));
    expect(steps.map((s) => [s.key, s.done])).toEqual([
      ["audio", false],
      ["transcript", true],
      ["flow", true],
      ["ballot", false],
      ["drills", true],
    ]);
  });

  it("null drill_count → drills step is unknown, not failed", () => {
    const steps = getPipelineProgress(speech({
      status: "done",
      artifact_summary: summary({ has_transcript: true, has_ballot: true, drill_count: null }),
    }));
    const drills = steps.find((s) => s.key === "drills")!;
    expect(drills.unknown).toBe(true);
    expect(drills.done).toBe(false);
  });

  it("without a summary keeps the Phase 5A status-contract steps (no drills step)", () => {
    const steps = getPipelineProgress(speech({ status: "done", artifact_summary: null }));
    expect(steps.map((s) => s.key)).toEqual(["audio", "transcript", "flow", "ballot"]);
  });
});

describe("getLatestPracticeSummary — with artifact_summary", () => {
  it("done without verified ballot → Review report CTA (not Open report)", () => {
    const s = getLatestPracticeSummary([speech({
      status: "done",
      artifact_summary: summary({ has_transcript: true, has_flow: true }),
    })])!;
    expect(s.readiness.key).toBe("partial-report");
    expect(s.ctaLabel).toBe("Review report");
  });

  it("live processing stage → Check progress CTA with the real stage label", () => {
    const s = getLatestPracticeSummary([speech({
      status: "analyzing",
      artifact_summary: summary({ latest_job_status: "running", latest_job_current_step: "generating_drills" }),
    })])!;
    expect(s.readiness.label).toBe("Creating drills");
    expect(s.ctaLabel).toBe("Check progress");
  });
});

// ── Phase 5C: liveness, staleness, friendly errors ───────────────────────────

import {
  isJobStale,
  isSpeechActive,
  hasActiveSpeeches,
  STALE_JOB_THRESHOLD_MS,
  ACTIVE_POLL_INTERVAL_MS,
} from "@/lib/practiceReadiness";

const NOW = new Date("2026-07-05T12:00:00Z").getTime();
const FRESH_TS = new Date(NOW - 60_000).toISOString(); // 1 min ago
const STALE_TS = new Date(NOW - STALE_JOB_THRESHOLD_MS - 60_000).toISOString();

describe("isJobStale", () => {
  it("fresh timestamps are not stale; ones past the threshold are", () => {
    expect(isJobStale(FRESH_TS, NOW)).toBe(false);
    expect(isJobStale(STALE_TS, NOW)).toBe(true);
  });

  it("exactly at the threshold is not yet stale (conservative)", () => {
    const atThreshold = new Date(NOW - STALE_JOB_THRESHOLD_MS).toISOString();
    expect(isJobStale(atThreshold, NOW)).toBe(false);
  });

  it("never claims stale without evidence (null/invalid timestamps)", () => {
    expect(isJobStale(null, NOW)).toBe(false);
    expect(isJobStale(undefined, NOW)).toBe(false);
    expect(isJobStale("not-a-date", NOW)).toBe(false);
  });

  it("threshold is conservative (at least 10 minutes)", () => {
    expect(STALE_JOB_THRESHOLD_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });
});

describe("getSpeechListReadiness — stale jobs", () => {
  it("fresh running job → live processing stage", () => {
    const r = getSpeechListReadiness(speech({
      status: "analyzing",
      artifact_summary: summary({
        latest_job_status: "running",
        latest_job_current_step: "generating_feedback",
        latest_job_updated_at: FRESH_TS,
      }),
    }), NOW);
    expect(r.key).toBe("processing");
    expect(r.label).toBe("Generating ballot");
  });

  it("running job silent past the threshold → Taking longer than expected", () => {
    const r = getSpeechListReadiness(speech({
      status: "analyzing",
      artifact_summary: summary({
        latest_job_status: "running",
        latest_job_current_step: "generating_feedback",
        latest_job_updated_at: STALE_TS,
      }),
    }), NOW);
    expect(r.key).toBe("stale");
    expect(r.label).toBe("Taking longer than expected");
    expect(r.tone).toBe("amber");
    expect(r.detail).toContain("retry");
  });

  it("running job without a timestamp is treated as healthy, not stale", () => {
    const r = getSpeechListReadiness(speech({
      status: "analyzing",
      artifact_summary: summary({ latest_job_status: "running", latest_job_updated_at: null }),
    }), NOW);
    expect(r.key).toBe("processing");
  });
});

describe("getSpeechListReadiness — friendly errors", () => {
  it("known error code maps to the coached message, not raw text", () => {
    const r = getSpeechListReadiness(speech({
      status: "error",
      artifact_summary: summary({
        latest_job_status: "failed",
        latest_job_error_code: "transcription_failed",
        latest_job_error_message: "whisper: HTTP 500 at provider xyz…",
      }),
    }), NOW);
    expect(r.key).toBe("needs-retry");
    expect(r.detail).toContain("transcription failed");
    expect(r.detail).not.toContain("provider");
    expect(r.detail).not.toContain("HTTP 500");
  });

  it("unknown error code falls back to a safe generic message", () => {
    const r = getSpeechListReadiness(speech({
      status: "error",
      artifact_summary: summary({
        latest_job_status: "failed",
        latest_job_error_code: "quantum_flux_error",
        latest_job_error_message: "Traceback (most recent call last): …",
      }),
    }), NOW);
    expect(r.detail).toContain("retry");
    expect(r.detail).not.toContain("Traceback");
  });
});

describe("isSpeechActive / hasActiveSpeeches — polling gate", () => {
  it("fresh queued/running jobs are active", () => {
    expect(isSpeechActive(speech({
      status: "analyzing",
      artifact_summary: summary({ latest_job_status: "running", latest_job_updated_at: FRESH_TS }),
    }), NOW)).toBe(true);
    expect(isSpeechActive(speech({
      status: "pending",
      artifact_summary: summary({ latest_job_status: "queued", latest_job_updated_at: FRESH_TS }),
    }), NOW)).toBe(true);
  });

  it("stale running jobs are NOT active (no polling forever)", () => {
    expect(isSpeechActive(speech({
      status: "analyzing",
      artifact_summary: summary({ latest_job_status: "running", latest_job_updated_at: STALE_TS }),
    }), NOW)).toBe(false);
  });

  it("ready, failed, draft, and transcript-waiting rows are inactive", () => {
    expect(isSpeechActive(speech({
      status: "done",
      artifact_summary: summary({ has_transcript: true, has_flow: true, has_ballot: true }),
    }), NOW)).toBe(false);
    expect(isSpeechActive(speech({
      status: "error",
      artifact_summary: summary({ latest_job_status: "failed" }),
    }), NOW)).toBe(false);
    expect(isSpeechActive(speech({ status: "pending" }), NOW)).toBe(false);
    expect(isSpeechActive(speech({
      status: "pending",
      artifact_summary: summary({ has_transcript: true }),
    }), NOW)).toBe(false);
  });

  it("transitional statuses without job telemetry are active", () => {
    expect(isSpeechActive(speech({ status: "transcribing" }), NOW)).toBe(true);
    expect(isSpeechActive(speech({ status: "analyzing" }), NOW)).toBe(true);
  });

  it("hasActiveSpeeches gates polling on any active row", () => {
    const done = speech({
      id: "d", status: "done",
      artifact_summary: summary({ has_transcript: true, has_ballot: true }),
    });
    const running = speech({
      id: "r", status: "analyzing",
      artifact_summary: summary({ latest_job_status: "running", latest_job_updated_at: FRESH_TS }),
    });
    expect(hasActiveSpeeches([done], NOW)).toBe(false);
    expect(hasActiveSpeeches([done, running], NOW)).toBe(true);
  });

  it("poll interval is in the required 5–8 second band", () => {
    expect(ACTIVE_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(5000);
    expect(ACTIVE_POLL_INTERVAL_MS).toBeLessThanOrEqual(8000);
  });
});

describe("getLatestPracticeSummary — readiness transitions (polling updates)", () => {
  const base = {
    id: "s-live",
    status: "analyzing" as const,
    updated_at: "2026-07-05T11:00:00Z",
  };

  it("processing → ready: badge green, CTA Open report", () => {
    const before = getLatestPracticeSummary([speech({
      ...base,
      artifact_summary: summary({ latest_job_status: "running", latest_job_current_step: "finalizing", latest_job_updated_at: FRESH_TS }),
    })], NOW)!;
    expect(before.readiness.label).toBe("Validating");
    expect(before.ctaLabel).toBe("Check progress");

    const after = getLatestPracticeSummary([speech({
      ...base,
      status: "done",
      artifact_summary: summary({
        has_transcript: true, has_flow: true, has_ballot: true, drill_count: 3,
        latest_job_status: "succeeded",
      }),
    })], NOW)!;
    expect(after.readiness.tone).toBe("green");
    expect(after.ctaLabel).toBe("Open report");
  });

  it("processing → failed: badge red, CTA Retry analysis", () => {
    const after = getLatestPracticeSummary([speech({
      ...base,
      status: "error",
      artifact_summary: summary({ latest_job_status: "failed", latest_job_error_code: "feedback_failed" }),
    })], NOW)!;
    expect(after.readiness.tone).toBe("red");
    expect(after.ctaLabel).toBe("Retry analysis");
  });

  it("processing → stale: amber with an Open & retry CTA", () => {
    const after = getLatestPracticeSummary([speech({
      ...base,
      artifact_summary: summary({ latest_job_status: "running", latest_job_updated_at: STALE_TS }),
    })], NOW)!;
    expect(after.readiness.key).toBe("stale");
    expect(after.ctaLabel).toBe("Open & retry");
  });
});
