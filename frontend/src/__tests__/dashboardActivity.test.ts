import { deriveRecentActivity } from "@/lib/dashboardActivity";
import type { Speech } from "@/types";

function sp(over: Partial<Speech>): Speech {
  return {
    id: "s", user_id: "u", title: "Speech", speech_type: "constructive",
    side: null, judge_type: null, topic: null, audio_url: null,
    duration_seconds: null, status: "pending", created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z", parent_speech_id: null, source_drill_id: null,
    ...over,
  };
}

describe("deriveRecentActivity", () => {
  it("maps each speech status to a human-readable, debate-native action", () => {
    const items = deriveRecentActivity([
      sp({ id: "a", status: "error", updated_at: "2026-06-06T00:00:00Z" }),
      sp({ id: "b", status: "analyzing", updated_at: "2026-06-05T00:00:00Z" }),
      sp({ id: "c", status: "done", updated_at: "2026-06-04T00:00:00Z" }),
      sp({ id: "d", status: "done", parent_speech_id: "c", updated_at: "2026-06-03T00:00:00Z" }),
      sp({ id: "e", status: "pending", audio_url: "x", updated_at: "2026-06-02T00:00:00Z" }),
      sp({ id: "f", status: "pending", updated_at: "2026-06-01T00:00:00Z" }),
    ]);
    expect(items.map((i) => i.kind)).toEqual([
      "failed", "analyzing", "report-ready", "re-recorded", "saved", "created",
    ]);
    // no backend terminology leaks
    items.forEach((i) => {
      expect(i.action.toLowerCase()).not.toContain("status");
      expect(i.actionLabel.length).toBeGreaterThan(0);
      expect(i.href).toBe(`/speech/${i.id}`);
    });
  });

  it("sorts newest first and respects the limit", () => {
    const items = deriveRecentActivity(
      [
        sp({ id: "old", updated_at: "2026-06-01T00:00:00Z" }),
        sp({ id: "new", updated_at: "2026-06-09T00:00:00Z" }),
        sp({ id: "mid", updated_at: "2026-06-05T00:00:00Z" }),
      ],
      2,
    );
    expect(items.map((i) => i.id)).toEqual(["new", "mid"]);
  });

  it("returns empty for no speeches", () => {
    expect(deriveRecentActivity([])).toEqual([]);
  });
});
