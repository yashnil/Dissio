/**
 * Pure data-integrity tests for SpeechFlowSection.
 * No DOM, no React — validates that the transcript segments and flow nodes
 * are internally consistent (every phrase links to a node and vice versa).
 */

import {
  TRANSCRIPT_SEGMENTS,
  FLOW_NODES,
  isPhraseActive,
  isNodeActive,
} from "@/components/marketing/SpeechFlowSection";

// ── Helpers ───────────────────────────────────────────────────────────────────

function phraseSegments() {
  return TRANSCRIPT_SEGMENTS.filter((s) => s.type === "phrase");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SpeechFlowSection data integrity", () => {
  test("all phrase segments have a phraseId", () => {
    for (const seg of phraseSegments()) {
      expect(seg.phraseId).toBeTruthy();
    }
  });

  test("all phrase segments have a role", () => {
    for (const seg of phraseSegments()) {
      expect(seg.role).toBeTruthy();
    }
  });

  test("phrase IDs are unique", () => {
    const ids = phraseSegments().map((s) => s.phraseId!);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("flow node IDs are unique", () => {
    const ids = FLOW_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every transcript phrase maps to exactly one flow node", () => {
    const nodeByPhrase = new Map(FLOW_NODES.map((n) => [n.phraseId, n]));
    for (const seg of phraseSegments()) {
      expect(nodeByPhrase.has(seg.phraseId!)).toBe(true);
    }
  });

  test("every flow node phraseId references an existing transcript phrase", () => {
    const phraseIds = new Set(phraseSegments().map((s) => s.phraseId!));
    for (const node of FLOW_NODES) {
      if (node.phraseId !== undefined) {
        expect(phraseIds.has(node.phraseId)).toBe(true);
      }
    }
  });

  test("no flow node has an empty excerpt", () => {
    for (const node of FLOW_NODES) {
      expect(node.excerpt.trim().length).toBeGreaterThan(0);
    }
  });

  test("no transcript phrase has empty content", () => {
    for (const seg of phraseSegments()) {
      expect(seg.content.trim().length).toBeGreaterThan(0);
    }
  });

  test("all flow node statuses are valid values", () => {
    const valid = new Set(["strong", "weak", "missing"]);
    for (const node of FLOW_NODES) {
      expect(valid.has(node.status)).toBe(true);
    }
  });

  test("at least one weak or missing node exists to show a coaching gap", () => {
    const hasGap = FLOW_NODES.some(
      (n) => n.status === "weak" || n.status === "missing"
    );
    expect(hasGap).toBe(true);
  });

  test("node labels are uppercase and non-empty", () => {
    for (const node of FLOW_NODES) {
      expect(node.label).toBe(node.label.toUpperCase());
      expect(node.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("isPhraseActive / isNodeActive logic (pure)", () => {
  test("clicking a phraseId activates itself", () => {
    expect(isPhraseActive("ph-claim", "ph-claim")).toBe(true);
  });

  test("clicking a node id activates the linked phrase", () => {
    const node = FLOW_NODES.find((n) => n.phraseId === "ph-claim")!;
    expect(isPhraseActive("ph-claim", node.id)).toBe(true);
  });

  test("clicking a different phraseId does not activate another phrase", () => {
    expect(isPhraseActive("ph-claim", "ph-evidence")).toBe(false);
  });

  test("null active id does not activate any phrase", () => {
    for (const seg of phraseSegments()) {
      expect(isPhraseActive(seg.phraseId!, null)).toBe(false);
    }
  });

  test("clicking a phraseId activates the corresponding node", () => {
    const node = FLOW_NODES.find((n) => n.phraseId === "ph-warrant")!;
    expect(isNodeActive(node, "ph-warrant")).toBe(true);
  });

  test("clicking a node id activates itself", () => {
    const node = FLOW_NODES[0];
    expect(isNodeActive(node, node.id)).toBe(true);
  });

  test("null active id does not activate any node", () => {
    for (const node of FLOW_NODES) {
      expect(isNodeActive(node, null)).toBe(false);
    }
  });
});
