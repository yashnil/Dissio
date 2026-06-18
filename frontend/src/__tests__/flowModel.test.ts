import {
  toFlowRow,
  toFlowRows,
  filterFlowRows,
  statusFiltersFor,
  weakCount,
  humanizeIssue,
} from "@/lib/flowModel";
import type { ArgumentItem } from "@/types";

function arg(over: Partial<ArgumentItem>): ArgumentItem {
  return {
    label: "C1",
    claim: "We should do X",
    warrant: "Because mechanism Y",
    evidence: "Smith 2023",
    impact: "Saves lives",
    argument_type: "offense",
    issues: [],
    confidence: 0.8,
    ...over,
  };
}

describe("toFlowRow node states", () => {
  it("marks a complete offense argument live", () => {
    const row = toFlowRow(arg({}), 0);
    expect(row.status).toBe("live");
    expect(row.nodes.every((n) => n.state === "present")).toBe(true);
  });

  it("flags missing evidence as unsupported", () => {
    const row = toFlowRow(arg({ evidence: null }), 0);
    expect(row.nodes.find((n) => n.kind === "evidence")!.state).toBe("missing");
    expect(row.status).toBe("unsupported_evidence");
  });

  it("flags a missing-warrant issue as weak warrant", () => {
    const row = toFlowRow(arg({ issues: ["missing_warrant"] }), 0);
    expect(row.nodes.find((n) => n.kind === "warrant")!.state).toBe("weak");
    expect(row.status).toBe("weak_warrant");
  });

  it("missing impact outranks other issues", () => {
    const row = toFlowRow(arg({ impact: "", issues: ["weak_evidence"] }), 0);
    expect(row.status).toBe("missing_impact");
  });

  it("weighing and response types keep their semantic status", () => {
    expect(toFlowRow(arg({ argument_type: "weighing" }), 0).status).toBe("weighing");
    expect(toFlowRow(arg({ argument_type: "response" }), 0).status).toBe("response");
  });

  it("falls back to a stable id and label", () => {
    const row = toFlowRow(arg({ id: null, label: "" }), 2);
    expect(row.id).toBe("arg_3");
    expect(row.label).toBe("Argument 3");
  });
});

describe("filterFlowRows", () => {
  const rows = toFlowRows([
    arg({ label: "C1", claim: "Carbon pricing works" }),
    arg({ label: "C2", evidence: null, claim: "Jobs argument" }),
  ]);

  it("filters by free-text query across the chain", () => {
    expect(filterFlowRows(rows, { query: "carbon" }).map((r) => r.label)).toEqual(["C1"]);
  });

  it("filters by status", () => {
    const out = filterFlowRows(rows, { status: "unsupported_evidence" });
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("C2");
  });

  it("returns everything for an empty filter", () => {
    expect(filterFlowRows(rows, {})).toHaveLength(2);
  });
});

describe("statusFiltersFor + weakCount", () => {
  const rows = toFlowRows([
    arg({}),
    arg({ evidence: null }),
    arg({ impact: "" }),
  ]);

  it("only lists statuses present, with counts", () => {
    const filters = statusFiltersFor(rows);
    const values = filters.map((f) => f.value);
    expect(values).toContain("live");
    expect(values).toContain("unsupported_evidence");
    expect(values).toContain("missing_impact");
    expect(filters.every((f) => f.count > 0)).toBe(true);
  });

  it("counts structurally weak arguments", () => {
    expect(weakCount(rows)).toBe(2);
  });
});

describe("humanizeIssue", () => {
  it("title-cases token issues", () => {
    expect(humanizeIssue("missing_warrant")).toBe("Missing warrant");
    expect(humanizeIssue("weak-evidence")).toBe("Weak evidence");
  });
});
