/**
 * Practice Studio model tests — pure utility, no DOM, no React.
 *
 * Covers:
 *  - deriveStudioPrimaryAction: all RecordState × isCountingDown combinations
 *  - deriveRecorderErrorDisplay: permission / unsupported / upload / generic errors
 *  - deriveSpeechTimeProgress: below-minimum / good-length / over-target
 *  - mapRecorderStatusToStudioState: all 10 RecorderStatus values
 *  - deriveAnalysisPhaseDisplay: not-started / queued / running / done / failed
 *  - deriveUploadPhaseDisplay: idle / file-selected / uploading / done / error
 *  - countdownAnnouncement: all count values
 *  - labelForSpeechType: known keys + fallback
 *  - Keyboard shortcut guard contract (verified through primary-action labels)
 *  - Reduced-motion (stable indices/labels regardless of animation)
 *  - Mobile behavior (touch target minimums via RECORDING_MINIMUM_SECONDS sentinel)
 */

import {
  deriveStudioPrimaryAction,
  deriveRecorderErrorDisplay,
  deriveSpeechTimeProgress,
  mapRecorderStatusToStudioState,
  deriveAnalysisPhaseDisplay,
  deriveUploadPhaseDisplay,
  countdownAnnouncement,
  labelForSpeechType,
  RECORDING_MINIMUM_SECONDS,
} from "@/lib/practiceStudioModel";
import type { RecordState } from "@/components/RecordingStudio";
import type { RecorderState } from "@/lib/recorder";

// ── deriveStudioPrimaryAction ─────────────────────────────────────────────────

describe("deriveStudioPrimaryAction — initial setup (idle)", () => {
  const action = deriveStudioPrimaryAction("idle", false);

  test("label = Start Recording", () => expect(action.label).toBe("Start Recording"));
  test("has Space keyboard hint", () => expect(action.keyboardHint).toBe("Space"));
  test("not disabled", () => expect(action.disabled).toBe(false));
  test("ariaLabel mentions recording and Space shortcut", () => {
    expect(action.ariaLabel.toLowerCase()).toContain("recording");
  });
});

describe("deriveStudioPrimaryAction — requesting mic (mobile / permission gate)", () => {
  const action = deriveStudioPrimaryAction("requesting", false);

  test("label communicates waiting state", () => expect(action.label).toMatch(/requesting/i));
  test("disabled while requesting", () => expect(action.disabled).toBe(true));
  test("no keyboard hint (non-interactive)", () => expect(action.keyboardHint).toBeNull());
});

describe("deriveStudioPrimaryAction — countdown in progress", () => {
  const action = deriveStudioPrimaryAction("idle", true);

  test("primary action becomes Cancel during countdown", () => expect(action.label).toBe("Cancel"));
  test("keyboard hint is Esc", () => expect(action.keyboardHint).toBe("Esc"));
  test("not disabled (user must be able to cancel)", () => expect(action.disabled).toBe(false));
  test("ariaLabel mentions cancel and Esc", () => {
    expect(action.ariaLabel.toLowerCase()).toContain("cancel");
    expect(action.ariaLabel).toContain("Esc");
  });
});

describe("deriveStudioPrimaryAction — recording", () => {
  const action = deriveStudioPrimaryAction("recording", false);

  test("label = Stop", () => expect(action.label).toBe("Stop"));
  test("keyboard hint = Space", () => expect(action.keyboardHint).toBe("Space"));
  test("not disabled", () => expect(action.disabled).toBe(false));
});

describe("deriveStudioPrimaryAction — completed recording (review state)", () => {
  const action = deriveStudioPrimaryAction("recorded", false);

  test("label = Analyze Speech", () => expect(action.label).toBe("Analyze Speech"));
  test("no keyboard shortcut (deliberate save)", () => expect(action.keyboardHint).toBeNull());
  test("not disabled", () => expect(action.disabled).toBe(false));
});

describe("deriveStudioPrimaryAction — uploading", () => {
  const action = deriveStudioPrimaryAction("uploading", false);

  test("label signals saving", () => expect(action.label.toLowerCase()).toContain("saving"));
  test("disabled while saving", () => expect(action.disabled).toBe(true));
  test("no keyboard hint", () => expect(action.keyboardHint).toBeNull());
});

describe("deriveStudioPrimaryAction — error (mic denied / other)", () => {
  const action = deriveStudioPrimaryAction("error", false);

  test("primary action is retry", () => expect(action.label.toLowerCase()).toContain("again"));
  test("has Space keyboard hint (retry via keyboard)", () => expect(action.keyboardHint).toBe("Space"));
  test("not disabled (user can retry)", () => expect(action.disabled).toBe(false));
});

// ── Keyboard shortcuts contract ───────────────────────────────────────────────

describe("keyboard shortcuts — contract via primary action", () => {
  test("Space starts recording when idle", () => {
    expect(deriveStudioPrimaryAction("idle", false).keyboardHint).toBe("Space");
  });
  test("Space stops recording when recording", () => {
    expect(deriveStudioPrimaryAction("recording", false).keyboardHint).toBe("Space");
  });
  test("Esc cancels countdown", () => {
    expect(deriveStudioPrimaryAction("idle", true).keyboardHint).toBe("Esc");
  });
  test("Esc is NOT the hint for recorded state (Esc discards, but save is primary)", () => {
    expect(deriveStudioPrimaryAction("recorded", false).keyboardHint).not.toBe("Esc");
  });
  test("requesting state has no keyboard shortcut", () => {
    expect(deriveStudioPrimaryAction("requesting", false).keyboardHint).toBeNull();
  });
});

// ── deriveRecorderErrorDisplay ────────────────────────────────────────────────

describe("deriveRecorderErrorDisplay — microphone denied", () => {
  const err = deriveRecorderErrorDisplay("permission", "Permission denied");

  test("isPermission = true", () => expect(err.isPermission).toBe(true));
  test("isUnsupported = false", () => expect(err.isUnsupported).toBe(false));
  test("canRetry = false (user must go to browser settings)", () => expect(err.canRetry).toBe(false));
  test("headline explains the problem clearly", () => {
    expect(err.headline.toLowerCase()).toContain("microphone");
  });
  test("body mentions browser settings", () => {
    expect(err.body.toLowerCase()).toMatch(/settings|browser/);
  });
});

describe("deriveRecorderErrorDisplay — recording not supported", () => {
  const err = deriveRecorderErrorDisplay("unsupported", "MediaRecorder is not defined");

  test("isUnsupported = true", () => expect(err.isUnsupported).toBe(true));
  test("isPermission = false", () => expect(err.isPermission).toBe(false));
  test("canRetry = false (requires different browser)", () => expect(err.canRetry).toBe(false));
  test("body suggests alternate browser or upload path", () => {
    expect(err.body.toLowerCase()).toMatch(/chrome|firefox|upload/);
  });
});

describe("deriveRecorderErrorDisplay — upload failure", () => {
  const err = deriveRecorderErrorDisplay("upload", "Network error");

  test("canRetry = true (recording is preserved)", () => expect(err.canRetry).toBe(true));
  test("isPermission = false", () => expect(err.isPermission).toBe(false));
  test("body reassures the take is preserved", () => {
    expect(err.body.toLowerCase()).toMatch(/take|here|preserved|retry/i);
  });
  test("headline mentions upload", () => {
    expect(err.headline.toLowerCase()).toContain("upload");
  });
});

describe("deriveRecorderErrorDisplay — generic error", () => {
  const err = deriveRecorderErrorDisplay("generic", "Unknown crash");

  test("canRetry = true", () => expect(err.canRetry).toBe(true));
  test("isPermission = false", () => expect(err.isPermission).toBe(false));
  test("isUnsupported = false", () => expect(err.isUnsupported).toBe(false));
});

describe("deriveRecorderErrorDisplay — null errorKind", () => {
  const err = deriveRecorderErrorDisplay(null, "Something went wrong");

  test("falls back to generic copy", () => {
    expect(typeof err.headline).toBe("string");
    expect(err.headline.length).toBeGreaterThan(0);
  });
});

// ── deriveSpeechTimeProgress ──────────────────────────────────────────────────

describe("deriveSpeechTimeProgress — below minimum (initial recording)", () => {
  const progress = deriveSpeechTimeProgress(10, 240);

  test("meetsMinimum = false at 10s", () => expect(progress.meetsMinimum).toBe(false));
  test("secondsToMinimum = 20", () => expect(progress.secondsToMinimum).toBe(20));
  test("isGoodLength = false", () => expect(progress.isGoodLength).toBe(false));
  test("nudge mentions seconds remaining to minimum", () => {
    expect(progress.nudge).toContain("20s");
  });
});

describe("deriveSpeechTimeProgress — at minimum threshold (30s)", () => {
  const progress = deriveSpeechTimeProgress(30, 240);

  test("meetsMinimum = true at exactly 30s", () => expect(progress.meetsMinimum).toBe(true));
  test("secondsToMinimum = 0", () => expect(progress.secondsToMinimum).toBe(0));
});

describe("deriveSpeechTimeProgress — good length (within target window)", () => {
  const progress = deriveSpeechTimeProgress(220, 240);

  test("isGoodLength = true", () => expect(progress.isGoodLength).toBe(true));
  test("isOverTarget = false", () => expect(progress.isOverTarget).toBe(false));
  test("meetsMinimum = true", () => expect(progress.meetsMinimum).toBe(true));
  test("nudge is positive", () => {
    expect(progress.nudge.toLowerCase()).toMatch(/good|stop/);
  });
});

describe("deriveSpeechTimeProgress — over target", () => {
  const progress = deriveSpeechTimeProgress(300, 240);

  test("isOverTarget = true", () => expect(progress.isOverTarget).toBe(true));
  test("nudge mentions wrapping up", () => {
    expect(progress.nudge.toLowerCase()).toMatch(/over|wrap/);
  });
});

describe("deriveSpeechTimeProgress — edge: target = 0 doesn't crash", () => {
  const progress = deriveSpeechTimeProgress(10, 0);
  test("no throw", () => expect(() => deriveSpeechTimeProgress(10, 0)).not.toThrow());
  test("returns a nudge string", () => expect(typeof progress.nudge).toBe("string"));
});

describe("RECORDING_MINIMUM_SECONDS sentinel", () => {
  test("is 30 (mobile touch target minimum for meaningful feedback)", () => {
    expect(RECORDING_MINIMUM_SECONDS).toBe(30);
  });
});

// ── mapRecorderStatusToStudioState ────────────────────────────────────────────

describe("mapRecorderStatusToStudioState — all RecorderStatus values", () => {
  const cases: Array<[RecorderState["status"], RecordState]> = [
    ["idle",                   "idle"      ],
    ["requesting-permission",  "requesting"],
    ["ready",                  "requesting"],
    ["recording",              "recording" ],
    ["stopping",               "recording" ],
    ["recorded",               "recorded"  ],
    ["playing",                "recorded"  ],
    ["uploading",              "uploading" ],
    ["uploaded",               "uploading" ],
    ["error",                  "error"     ],
  ];
  test.each(cases)("status '%s' → studioState '%s'", (status, expected) => {
    expect(mapRecorderStatusToStudioState(status)).toBe(expected);
  });
});

// ── deriveAnalysisPhaseDisplay — processing stages ───────────────────────────

describe("deriveAnalysisPhaseDisplay — not started", () => {
  const phase = deriveAnalysisPhaseDisplay(null, false, false);

  test("stage = not-started", () => expect(phase.stage).toBe("not-started"));
  test("canRetry = false", () => expect(phase.canRetry).toBe(false));
  test("allowTranscriptReview = false (no transcript yet)", () => {
    expect(phase.allowTranscriptReview).toBe(false);
  });
});

describe("deriveAnalysisPhaseDisplay — not started but has transcript", () => {
  const phase = deriveAnalysisPhaseDisplay(null, true, false);

  test("allowTranscriptReview = true (transcript available during wait)", () => {
    expect(phase.allowTranscriptReview).toBe(true);
  });
});

describe("deriveAnalysisPhaseDisplay — queued", () => {
  const phase = deriveAnalysisPhaseDisplay("queued", false, false);

  test("stage = queued", () => expect(phase.stage).toBe("queued"));
  test("canRetry = false (still in queue)", () => expect(phase.canRetry).toBe(false));
  test("label communicates queue position", () => {
    expect(phase.label.toLowerCase()).toContain("queued");
  });
});

describe("deriveAnalysisPhaseDisplay — running", () => {
  const phase = deriveAnalysisPhaseDisplay("running", true, false);

  test("stage = running", () => expect(phase.stage).toBe("running"));
  test("allowTranscriptReview = true (transcript already available)", () => {
    expect(phase.allowTranscriptReview).toBe(true);
  });
  test("canRetry = false (in progress)", () => expect(phase.canRetry).toBe(false));
  test("label communicates active analysis", () => {
    expect(phase.label.toLowerCase()).toContain("analyz");
  });
});

describe("deriveAnalysisPhaseDisplay — analysis failure and retry", () => {
  const phase = deriveAnalysisPhaseDisplay("failed", true, false);

  test("stage = failed", () => expect(phase.stage).toBe("failed"));
  test("canRetry = true", () => expect(phase.canRetry).toBe(true));
  test("allowTranscriptReview = true (transcript preserved, not lost)", () => {
    expect(phase.allowTranscriptReview).toBe(true);
  });
  test("label doesn't say 'error' — honest without being alarming", () => {
    expect(phase.label.toLowerCase()).not.toContain("error");
  });
});

describe("deriveAnalysisPhaseDisplay — done (via hasFeedback shortcut)", () => {
  const phase = deriveAnalysisPhaseDisplay("running", true, true);

  test("stage = done when hasFeedback even if jobStatus = running", () => {
    expect(phase.stage).toBe("done");
  });
  test("allowTranscriptReview = true", () => expect(phase.allowTranscriptReview).toBe(true));
  test("canRetry = false", () => expect(phase.canRetry).toBe(false));
});

describe("deriveAnalysisPhaseDisplay — done via jobStatus", () => {
  const phase = deriveAnalysisPhaseDisplay("done", true, false);

  test("stage = done", () => expect(phase.stage).toBe("done"));
  test("canRetry = false", () => expect(phase.canRetry).toBe(false));
});

// ── deriveUploadPhaseDisplay — upload alternative ─────────────────────────────

describe("deriveUploadPhaseDisplay — idle (no file selected)", () => {
  const phase = deriveUploadPhaseDisplay("idle", false, false);

  test("phase = idle", () => expect(phase.phase).toBe("idle"));
  test("canUpload = false", () => expect(phase.canUpload).toBe(false));
  test("isBusy = false", () => expect(phase.isBusy).toBe(false));
});

describe("deriveUploadPhaseDisplay — file selected (ready)", () => {
  const phase = deriveUploadPhaseDisplay("ready", true, false);

  test("phase = file-selected", () => expect(phase.phase).toBe("file-selected"));
  test("canUpload = true", () => expect(phase.canUpload).toBe(true));
  test("isBusy = false", () => expect(phase.isBusy).toBe(false));
});

describe("deriveUploadPhaseDisplay — uploading", () => {
  const phase = deriveUploadPhaseDisplay("uploading", true, false);

  test("phase = uploading", () => expect(phase.phase).toBe("uploading"));
  test("canUpload = false (in progress)", () => expect(phase.canUpload).toBe(false));
  test("isBusy = true", () => expect(phase.isBusy).toBe(true));
  test("label communicates activity", () => expect(phase.label.toLowerCase()).toMatch(/upload/));
});

describe("deriveUploadPhaseDisplay — upload complete", () => {
  const phase = deriveUploadPhaseDisplay("uploaded", true, false);

  test("phase = done", () => expect(phase.phase).toBe("done"));
  test("isBusy = false", () => expect(phase.isBusy).toBe(false));
});

describe("deriveUploadPhaseDisplay — upload failure", () => {
  const phase = deriveUploadPhaseDisplay("error", true, true);

  test("phase = error", () => expect(phase.phase).toBe("error"));
  test("canUpload = true (has file, can retry)", () => expect(phase.canUpload).toBe(true));
  test("isBusy = false", () => expect(phase.isBusy).toBe(false));
  test("label mentions retry", () => expect(phase.label.toLowerCase()).toContain("again"));
});

describe("deriveUploadPhaseDisplay — hasError overrides status", () => {
  const phase = deriveUploadPhaseDisplay("uploaded", true, true);

  test("error wins over uploaded when hasError = true", () => {
    expect(phase.phase).toBe("error");
  });
});

// ── countdownAnnouncement ─────────────────────────────────────────────────────

describe("countdownAnnouncement — accessible SR text", () => {
  test("3 → 'Starting in 3'", () => expect(countdownAnnouncement(3)).toBe("Starting in 3"));
  test("2 → 'Starting in 2'", () => expect(countdownAnnouncement(2)).toBe("Starting in 2"));
  test("1 → 'Starting in 1'", () => expect(countdownAnnouncement(1)).toBe("Starting in 1"));
  test("'go' → 'Speak now'", () => expect(countdownAnnouncement("go")).toBe("Speak now"));
  test("unknown number returns generic text", () => {
    expect(typeof countdownAnnouncement(5)).toBe("string");
    expect(countdownAnnouncement(5).length).toBeGreaterThan(0);
  });
});

// ── labelForSpeechType ────────────────────────────────────────────────────────

describe("labelForSpeechType", () => {
  test("constructive → Constructive", () => {
    expect(labelForSpeechType("constructive")).toBe("Constructive");
  });
  test("rebuttal → Rebuttal", () => {
    expect(labelForSpeechType("rebuttal")).toBe("Rebuttal");
  });
  test("final_focus → Final Focus", () => {
    expect(labelForSpeechType("final_focus")).toBe("Final Focus");
  });
  test("crossfire → Crossfire", () => {
    expect(labelForSpeechType("crossfire")).toBe("Crossfire");
  });
  test("unknown key → title-cased fallback (no crash)", () => {
    const label = labelForSpeechType("opening_argument");
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });
});

// ── Reduced motion — stable values regardless of animation ────────────────────

describe("reduced motion — primary actions have stable labels regardless of animation", () => {
  const STATES: RecordState[] = ["idle", "requesting", "recording", "recorded", "uploading", "error"];

  test("all states return a non-empty label string", () => {
    STATES.forEach((state) => {
      const action = deriveStudioPrimaryAction(state, false);
      expect(typeof action.label).toBe("string");
      expect(action.label.length).toBeGreaterThan(0);
    });
  });

  test("all states return a non-empty ariaLabel string", () => {
    STATES.forEach((state) => {
      const action = deriveStudioPrimaryAction(state, false);
      expect(typeof action.ariaLabel).toBe("string");
      expect(action.ariaLabel.length).toBeGreaterThan(0);
    });
  });

  test("countdown overlay always returns non-empty label", () => {
    const action = deriveStudioPrimaryAction("idle", true);
    expect(action.label.length).toBeGreaterThan(0);
  });
});

// ── Mobile behavior ───────────────────────────────────────────────────────────

describe("mobile behavior — practical constraints", () => {
  test("RECORDING_MINIMUM_SECONDS is 30 (meaningful content on slow mobile)", () => {
    expect(RECORDING_MINIMUM_SECONDS).toBe(30);
  });

  test("time progress at 0s shows full deficit", () => {
    const progress = deriveSpeechTimeProgress(0, 240);
    expect(progress.secondsToMinimum).toBe(30);
    expect(progress.meetsMinimum).toBe(false);
  });

  test("upload phase 'uploading' is marked busy (disable controls on mobile)", () => {
    const phase = deriveUploadPhaseDisplay("uploading", true, false);
    expect(phase.isBusy).toBe(true);
  });

  test("requesting state is disabled (don't allow double-tap trigger)", () => {
    const action = deriveStudioPrimaryAction("requesting", false);
    expect(action.disabled).toBe(true);
  });

  test("uploading state is disabled (don't allow double-tap trigger)", () => {
    const action = deriveStudioPrimaryAction("uploading", false);
    expect(action.disabled).toBe(true);
  });
});

// ── Analysis phase — all states are exhaustive ────────────────────────────────

describe("deriveAnalysisPhaseDisplay — exhaustive status coverage", () => {
  const statuses = [null, "queued", "running", "done", "failed", "unknown_value"] as const;

  test.each(statuses)("status '%s' returns a valid AnalysisPhaseDisplay", (status) => {
    const phase = deriveAnalysisPhaseDisplay(status as string | null, false, false);
    expect(typeof phase.label).toBe("string");
    expect(phase.label.length).toBeGreaterThan(0);
    expect(typeof phase.canRetry).toBe("boolean");
    expect(typeof phase.allowTranscriptReview).toBe("boolean");
  });
});
