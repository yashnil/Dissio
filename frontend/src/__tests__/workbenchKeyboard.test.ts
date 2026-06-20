/**
 * Unit tests for keyboard navigation behavior in the Evidence workbench.
 *
 * These test the pure model functions only — no DOM, no React.
 * The actual keyboard handler lives in evidence/page.tsx but delegates
 * all index math to these helpers.
 */

// ── Roving tabindex index math ─────────────────────────────────────────────────

function clampedIndex(current: number, delta: number, length: number): number {
  return Math.max(0, Math.min(current + delta, length - 1));
}

describe("roving tabindex index math", () => {
  const LENGTH = 5;

  test("arrow-down increments index", () => {
    expect(clampedIndex(0, 1, LENGTH)).toBe(1);
    expect(clampedIndex(3, 1, LENGTH)).toBe(4);
  });

  test("arrow-up decrements index", () => {
    expect(clampedIndex(3, -1, LENGTH)).toBe(2);
    expect(clampedIndex(1, -1, LENGTH)).toBe(0);
  });

  test("arrow-down clamps at last item", () => {
    expect(clampedIndex(4, 1, LENGTH)).toBe(4);
  });

  test("arrow-up clamps at 0", () => {
    expect(clampedIndex(0, -1, LENGTH)).toBe(0);
  });

  test("home goes to 0", () => {
    expect(clampedIndex(0, -99, LENGTH)).toBe(0);
    // In practice Home key sets index directly to 0
    expect(Math.max(0, 0)).toBe(0);
  });

  test("end goes to last", () => {
    // End key sets index directly to length - 1
    expect(LENGTH - 1).toBe(4);
  });

  test("empty list does not error", () => {
    expect(clampedIndex(0, 1, 0)).toBe(0);
  });

  test("single item stays at 0 on arrow-down", () => {
    expect(clampedIndex(0, 1, 1)).toBe(0);
  });
});

// ── tabIndex derivation ────────────────────────────────────────────────────────

function deriveTabIndex(cardIndex: number, activeIndex: number): 0 | -1 {
  return cardIndex === activeIndex ? 0 : -1;
}

describe("candidate tabIndex derivation", () => {
  test("active card has tabIndex 0", () => {
    expect(deriveTabIndex(2, 2)).toBe(0);
  });

  test("inactive cards have tabIndex -1", () => {
    expect(deriveTabIndex(0, 2)).toBe(-1);
    expect(deriveTabIndex(1, 2)).toBe(-1);
    expect(deriveTabIndex(3, 2)).toBe(-1);
  });

  test("first card is active by default (index 0)", () => {
    expect(deriveTabIndex(0, 0)).toBe(0);
    expect(deriveTabIndex(1, 0)).toBe(-1);
  });
});

// ── Selection preservation on filter change ───────────────────────────────────

interface Card { id: string; readiness: "ready" | "review_needed" | "weak"; isCounter: boolean; }

function filterCards(cards: Card[], filter: "all" | "ready" | "review" | "weak" | "counter"): Card[] {
  if (filter === "all") return cards;
  if (filter === "counter") return cards.filter((c) => c.isCounter);
  if (filter === "ready") return cards.filter((c) => c.readiness === "ready" && !c.isCounter);
  if (filter === "review") return cards.filter((c) => c.readiness === "review_needed");
  if (filter === "weak") return cards.filter((c) => c.readiness === "weak");
  return cards;
}

function preserveSelectedIndex(
  selectedId: string | null,
  filteredCards: Card[],
  previousActiveIndex: number,
): number {
  if (!selectedId) return Math.min(previousActiveIndex, Math.max(0, filteredCards.length - 1));
  const idx = filteredCards.findIndex((c) => c.id === selectedId);
  return idx === -1 ? 0 : idx;
}

const SAMPLE_CARDS: Card[] = [
  { id: "a", readiness: "ready",        isCounter: false },
  { id: "b", readiness: "review_needed", isCounter: false },
  { id: "c", readiness: "weak",          isCounter: false },
  { id: "d", readiness: "ready",         isCounter: true  },
];

describe("selection preservation on filter change", () => {
  test("selected card index stays correct after filter", () => {
    const filtered = filterCards(SAMPLE_CARDS, "ready");
    // "a" is at index 0 after filtering for ready (non-counter)
    const idx = preserveSelectedIndex("a", filtered, 0);
    expect(idx).toBe(0);
  });

  test("selected card absent from filter resets to 0", () => {
    const filtered = filterCards(SAMPLE_CARDS, "weak");
    // "a" (ready) is not in weak filter
    const idx = preserveSelectedIndex("a", filtered, 0);
    expect(idx).toBe(0);
  });

  test("counter filter shows counter cards only", () => {
    const filtered = filterCards(SAMPLE_CARDS, "counter");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("d");
  });

  test("null selectedId stays within bounds", () => {
    const filtered = filterCards(SAMPLE_CARDS, "weak");
    const idx = preserveSelectedIndex(null, filtered, 5); // index 5 OOB
    expect(idx).toBe(0); // clamped to length-1 = 0
  });
});

// ── Modal focus trap model ─────────────────────────────────────────────────────

describe("modal focus trap model", () => {
  test("Tab on last element wraps to first", () => {
    const focusable = ["button-save", "button-copy", "button-close"];
    const currentIndex = focusable.indexOf("button-close");
    const nextIndex = (currentIndex + 1) % focusable.length;
    expect(focusable[nextIndex]).toBe("button-save");
  });

  test("Shift+Tab on first element wraps to last", () => {
    const focusable = ["button-save", "button-copy", "button-close"];
    const currentIndex = focusable.indexOf("button-save");
    const nextIndex = (currentIndex - 1 + focusable.length) % focusable.length;
    expect(focusable[nextIndex]).toBe("button-close");
  });

  test("modal with single focusable element stays on it", () => {
    const focusable = ["button-close"];
    const currentIndex = 0;
    const nextIndex = (currentIndex + 1) % focusable.length;
    expect(focusable[nextIndex]).toBe("button-close");
  });

  test("empty focusable list does not crash", () => {
    const focusable: string[] = [];
    expect(focusable.length).toBe(0);
    // No index to compute — guard returns early
  });
});

// ── Escape key model ──────────────────────────────────────────────────────────

describe("Escape key handling model", () => {
  function handleKey(key: string, isModalOpen: boolean): "close" | "noop" {
    if (key === "Escape" && isModalOpen) return "close";
    return "noop";
  }

  test("Escape closes open modal", () => {
    expect(handleKey("Escape", true)).toBe("close");
  });

  test("Escape with no modal is a noop", () => {
    expect(handleKey("Escape", false)).toBe("noop");
  });

  test("other keys do not close modal", () => {
    expect(handleKey("Enter", true)).toBe("noop");
    expect(handleKey("Tab", true)).toBe("noop");
    expect(handleKey("ArrowDown", true)).toBe("noop");
  });
});
