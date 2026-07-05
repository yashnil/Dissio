import {
  deriveProcessingStages,
  processingHeadline,
  isProcessingTerminal,
  ANALYSIS_CATEGORIES,
} from "@/lib/practice/processingStages";

describe("deriveProcessingStages", () => {
  it("queued/running → analysis active, later stages upcoming", () => {
    const s = deriveProcessingStages({ jobStatus: "running", hasReport: false, failed: false });
    expect(s.find((x) => x.id === "input")!.status).toBe("done");
    expect(s.find((x) => x.id === "analysis")!.status).toBe("active");
    expect(s.find((x) => x.id === "assembling")!.status).toBe("upcoming");
    expect(s.find((x) => x.id === "ready")!.status).toBe("upcoming");
  });

  it("succeeded but report not loaded → assembling active", () => {
    const s = deriveProcessingStages({ jobStatus: "succeeded", hasReport: false, failed: false });
    expect(s.find((x) => x.id === "analysis")!.status).toBe("done");
    expect(s.find((x) => x.id === "assembling")!.status).toBe("active");
  });

  it("report loaded → all done", () => {
    const s = deriveProcessingStages({ jobStatus: "succeeded", hasReport: true, failed: false });
    expect(s.every((x) => x.status === "done")).toBe(true);
  });

  it("failed → analysis failed, never marks later stages done", () => {
    const s = deriveProcessingStages({ jobStatus: "failed", hasReport: false, failed: true });
    expect(s.find((x) => x.id === "analysis")!.status).toBe("failed");
    expect(s.find((x) => x.id === "ready")!.status).toBe("upcoming");
  });

  it("never marks a stage done from elapsed time alone (no time input exists)", () => {
    // The model has no time input — proves stages can't be faked by elapsed time.
    const s = deriveProcessingStages({ jobStatus: "running", hasReport: false, failed: false });
    expect(s.filter((x) => x.status === "done")).toHaveLength(1); // only "input secured"
  });
});

describe("deriveProcessingStages — fine-grained (real current_step)", () => {
  it("running with a known step shows the real stage sequence", () => {
    const s = deriveProcessingStages({
      jobStatus: "running", hasReport: false, failed: false, currentStep: "generating_feedback",
    });
    expect(s.map((x) => x.label)).toEqual([
      "Input secured", "Transcribing", "Analyzing arguments",
      "Generating ballot", "Creating drills", "Validating", "Report ready",
    ]);
    // Ordered pipeline: earlier stages genuinely complete, current active, rest upcoming.
    expect(s.find((x) => x.id === "transcribing")!.status).toBe("done");
    expect(s.find((x) => x.id === "extracting")!.status).toBe("done");
    expect(s.find((x) => x.id === "ballot")!.status).toBe("active");
    expect(s.find((x) => x.id === "drills")!.status).toBe("upcoming");
    expect(s.find((x) => x.id === "ready")!.status).toBe("upcoming");
  });

  it("delivery_analysis maps into the Analyzing arguments stage (transcription done)", () => {
    const s = deriveProcessingStages({
      jobStatus: "running", hasReport: false, failed: false, currentStep: "delivery_analysis",
    });
    expect(s.find((x) => x.id === "transcribing")!.status).toBe("done");
    expect(s.find((x) => x.id === "extracting")!.status).toBe("active");
  });

  it("unknown step falls back to the coarse honest stages", () => {
    const s = deriveProcessingStages({
      jobStatus: "running", hasReport: false, failed: false, currentStep: "mystery_step",
    });
    expect(s.find((x) => x.id === "analysis")!.status).toBe("active");
  });

  it("queued jobs never use current_step (no work has started)", () => {
    const s = deriveProcessingStages({
      jobStatus: "queued", hasReport: false, failed: false, currentStep: "generating_drills",
    });
    expect(s.find((x) => x.id === "analysis")!.status).toBe("active");
    expect(s.find((x) => x.id === "drills")).toBeUndefined();
  });

  it("failure overrides fine-grained display", () => {
    const s = deriveProcessingStages({
      jobStatus: "running", hasReport: false, failed: true, currentStep: "transcribing",
    });
    expect(s.some((x) => x.status === "failed")).toBe(true);
  });
});

describe("processingHeadline", () => {
  it("reflects the active stage / terminal states", () => {
    expect(processingHeadline(deriveProcessingStages({ jobStatus: "running", hasReport: false, failed: false }))).toBe("Analysis running");
    expect(processingHeadline(deriveProcessingStages({ jobStatus: "succeeded", hasReport: true, failed: false }))).toBe("Report ready");
    expect(processingHeadline(deriveProcessingStages({ jobStatus: "failed", hasReport: false, failed: true }))).toContain("didn’t finish");
  });
});

describe("isProcessingTerminal", () => {
  it("true only when complete or failed", () => {
    expect(isProcessingTerminal(deriveProcessingStages({ jobStatus: "running", hasReport: false, failed: false }))).toBe(false);
    expect(isProcessingTerminal(deriveProcessingStages({ jobStatus: "succeeded", hasReport: true, failed: false }))).toBe(true);
    expect(isProcessingTerminal(deriveProcessingStages({ jobStatus: "failed", hasReport: false, failed: true }))).toBe(true);
  });
});

describe("ANALYSIS_CATEGORIES", () => {
  it("names the real debate categories examined", () => {
    expect(ANALYSIS_CATEGORIES).toContain("Clash");
    expect(ANALYSIS_CATEGORIES).toContain("Weighing");
    expect(ANALYSIS_CATEGORIES).toContain("Judge adaptation");
    expect(ANALYSIS_CATEGORIES.length).toBe(7);
  });
});
