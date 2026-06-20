import { decomposeClaim, RESEARCH_DEPTH_OPTIONS } from "@/lib/claimDecomposition";
import {
  deriveResearchStages, rejectedSources, classifyOutcome,
} from "@/lib/researchStages";
import { buildProvenance } from "@/lib/evidenceProvenance";
import type { CardDraft, GenerateCardsResponse } from "@/types";

// ── claim decomposition ─────────────────────────────────────────────────────────

describe("decomposeClaim", () => {
  it("produces the five research branches with refined queries", () => {
    const branches = decomposeClaim("Carbon pricing cuts emissions.");
    expect(branches.map((b) => b.key)).toEqual([
      "causal_warrant", "empirical_support", "impact", "counterargument", "limitation",
    ]);
    for (const b of branches) {
      expect(b.query.toLowerCase()).toContain("carbon pricing cuts emissions");
      expect(b.query).not.toMatch(/\.$/); // trailing punctuation stripped
    }
  });

  it("returns nothing for an empty claim", () => {
    expect(decomposeClaim("   ")).toEqual([]);
  });

  it("offers research depth options", () => {
    expect(RESEARCH_DEPTH_OPTIONS.map((o) => o.key)).toEqual(["quick", "standard", "deep"]);
  });
});

// ── research stages + rejection ──────────────────────────────────────────────────

function resp(over: Partial<GenerateCardsResponse>): GenerateCardsResponse {
  return { search_configured: true, cards: [], ...over } as GenerateCardsResponse;
}

describe("deriveResearchStages", () => {
  it("reports real counts and never a percentage", () => {
    const stages = deriveResearchStages(resp({
      normalized_claim: "carbon pricing reduces emissions",
      diagnostics: {
        sources_found: 8, sources_attempted: 20, passages_considered: 40,
        candidates_generated: 5, filtered_low_quality: 3, filtered_no_support: 2,
        query_variants_used: ["a", "b", "c"], sources_extracted: 6, candidates: 0,
      } as never,
      cards: [{} as never],
    }));
    const byKey = Object.fromEntries(stages.map((s) => [s.key, s.detail]));
    expect(byKey.find).toContain("8 found");
    expect(byKey.expand).toContain("3 quer");
    expect(byKey.reject).toContain("5 filtered");
    expect(byKey.rank).toContain("1 card");
    expect(JSON.stringify(stages)).not.toContain("%");
  });

  it("is empty without a response", () => {
    expect(deriveResearchStages(null)).toEqual([]);
  });
});

describe("rejectedSources", () => {
  it("lists non-used sources with their reason", () => {
    const out = rejectedSources(resp({
      sources_considered: [
        { url: "a.com", status: "used" },
        { url: "b.com", status: "rejected", reason: "low credibility" },
        { url: "c.com", status: "filtered", quality: "weak" },
      ],
    }));
    expect(out.map((r) => r.url)).toEqual(["b.com", "c.com"]);
    expect(out[0].reason).toBe("low credibility");
  });
});

describe("classifyOutcome", () => {
  it("flags a retrieval failure from a fetch error without blaming the claim", () => {
    const o = classifyOutcome(null, "network down")!;
    expect(o.outcome).toBe("retrieval_failure");
    expect(o.message.toLowerCase()).toContain("claim is fine");
  });

  it("distinguishes overly-narrow (had candidates) from no-credible", () => {
    const narrow = classifyOutcome(resp({ cards: [], diagnostics: { sources_found: 5 } as never }))!;
    expect(narrow.outcome).toBe("overly_narrow");
    const none = classifyOutcome(resp({ cards: [], diagnostics: { sources_found: 0 } as never }))!;
    expect(none.outcome).toBe("no_credible_candidates");
  });

  it("passes through suggested revised claims", () => {
    const o = classifyOutcome(resp({ cards: [], suggested_revised_claims: ["try this"] }))!;
    expect(o.revisedClaims).toEqual(["try this"]);
  });

  it("returns cards_found when cards exist", () => {
    expect(classifyOutcome(resp({ cards: [{} as never] }))!.outcome).toBe("cards_found");
  });
});

// ── provenance ────────────────────────────────────────────────────────────────

function card(over: Partial<CardDraft>): CardDraft {
  return {
    id: "c1", user_id: "u", research_source_id: null, url: "https://nature.com/x",
    topic: null, claim_goal: "carbon pricing cuts emissions", side: null,
    tag: "Carbon pricing drives near-term cuts", cite: "", body_text: "A $40/ton price cut covered emissions 8.5%.",
    highlighted_spans_json: [], underline_spans_json: [], author: "Smith", publication: "Nature Energy",
    title: null, published_date: "2023", author_credentials: null, warrant_summary: null, impact_summary: null,
    source_quality: null, credibility_notes: null, extraction_confidence: null, generated_tag: true,
    missing_metadata_json: {}, card_source_type: null, status: "ready" as never, saved_card_id: null,
    cut_text_with_ellipses: "A $40/ton price … cut … 8.5%", created_at: "", updated_at: "",
    ...over,
  } as CardDraft;
}

describe("buildProvenance", () => {
  it("builds the query→source→passage→quote→card chain with distinct authorship", () => {
    const nodes = buildProvenance(card({}));
    const byStep = Object.fromEntries(nodes.map((n) => [n.step, n]));
    expect(byStep.Search.origin).toBe("query");
    expect(byStep.Source.origin).toBe("source");
    expect(byStep.Passage.origin).toBe("source");
    expect(byStep.Quote.origin).toBe("user");
    expect(byStep.Card.origin).toBe("ai"); // generated tag
  });

  it("marks a user-authored tag as user origin", () => {
    const nodes = buildProvenance(card({ generated_tag: false }));
    expect(nodes.find((n) => n.step === "Card")!.origin).toBe("user");
  });

  it("preserves exact source passage text (truncated only when long)", () => {
    const nodes = buildProvenance(card({ body_text: "short exact passage" }));
    expect(nodes.find((n) => n.step === "Passage")!.content).toBe("short exact passage");
  });
});
