import {
  REPORT_SECTIONS,
  availableSections,
  sectionFromHash,
} from "@/lib/reportSections";

describe("REPORT_SECTIONS", () => {
  it("is ordered Overview → Flow → Ballot → Skills → Transcript → Drills", () => {
    expect(REPORT_SECTIONS.map((s) => s.id)).toEqual([
      "overview",
      "flow",
      "ballot",
      "skills",
      "transcript",
      "drills",
    ]);
  });
});

describe("availableSections", () => {
  it("hides sections with no content", () => {
    const result = availableSections({
      hasFeedback: true,
      hasFlow: false,
      hasDrills: true,
      hasTranscript: false,
    });
    // feedback present → overview + ballot + skills; drills present too
    expect(result.map((s) => s.id)).toEqual(["overview", "ballot", "skills", "drills"]);
  });

  it("returns all six when everything is present", () => {
    const result = availableSections({
      hasFeedback: true,
      hasFlow: true,
      hasDrills: true,
      hasTranscript: true,
    });
    expect(result).toHaveLength(6);
  });

  it("returns none for an empty report", () => {
    expect(
      availableSections({
        hasFeedback: false,
        hasFlow: false,
        hasDrills: false,
        hasTranscript: false,
      }),
    ).toHaveLength(0);
  });
});

describe("sectionFromHash", () => {
  it("parses known section hashes", () => {
    expect(sectionFromHash("#flow")).toBe("flow");
    expect(sectionFromHash("transcript")).toBe("transcript");
  });

  it("rejects unknown or empty hashes", () => {
    expect(sectionFromHash("#nope")).toBeNull();
    expect(sectionFromHash("")).toBeNull();
    expect(sectionFromHash(null)).toBeNull();
  });
});
