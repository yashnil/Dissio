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
