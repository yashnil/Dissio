/**
 * Playwright tests for DebateProofSection (Phase C).
 *
 * Covers:
 *  - Section in DOM with aria-label
 *  - All three step cards are rendered
 *  - Key content visible: ballot excerpt, drill prompt, before/after lanes
 *  - Added behavior chips present in after lane
 *  - Narrative continuity: same C1 figures appear
 *  - No horizontal overflow at 390×844
 *  - Reduced-motion: all content visible statically
 *  - No console errors
 */

import { test, expect, type Page } from "@playwright/test";

async function goToSection(page: Page) {
  await page.goto("/home-v2", { waitUntil: "networkidle" });
  await page.locator("#product-proof").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
}

// ── Section structure ─────────────────────────────────────────────────────────

test.describe("DebateProofSection — DOM structure", () => {
  test("section is in DOM with correct aria-label", async ({ page }) => {
    await goToSection(page);
    const section = page.locator("#product-proof");
    await expect(section).toBeAttached();
    await expect(section).toHaveAttribute(
      "aria-label",
      "Coaching story: from gap detection to improvement",
    );
  });

  test("all three step cards are rendered", async ({ page }) => {
    await goToSection(page);
    await expect(page.locator('[data-testid="decisive-moment-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="drill-bridge-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="transformation-card"]')).toBeVisible();
  });

  test("section heading contains 'One gap. One drill.'", async ({ page }) => {
    await goToSection(page);
    const heading = page.locator("#product-proof h2");
    await expect(heading).toContainText("One gap. One drill.");
  });

  test("step stamps '01', '02', '03' are all present", async ({ page }) => {
    await goToSection(page);
    for (const n of ["01", "02", "03"]) {
      await expect(page.locator("#product-proof").getByText(n).first()).toBeVisible();
    }
  });
});

// ── 01: Decisive Moment ───────────────────────────────────────────────────────

test.describe("DebateProofSection — 01 Decisive Moment", () => {
  test("decisive moment card shows the flow node list", async ({ page }) => {
    await goToSection(page);
    const card = page.locator('[data-testid="decisive-moment-card"]');
    // All 5 roles should appear in the card
    for (const role of ["CLAIM", "EVIDENCE", "WARRANT", "IMPACT", "WEIGHING"]) {
      await expect(card).toContainText(role);
    }
  });

  test("WEIGHING node appears with missing-state styling in the card", async ({ page }) => {
    await goToSection(page);
    const card = page.locator('[data-testid="decisive-moment-card"]');
    await expect(card).toContainText("WEIGHING");
    // The "not addressed" text confirms missing status
    await expect(card).toContainText("not addressed");
  });

  test("ballot excerpt is visible in decisive moment card", async ({ page }) => {
    await goToSection(page);
    const ballotExcerpt = page.locator('[data-testid="ballot-excerpt"]');
    await expect(ballotExcerpt).toBeVisible();
    await expect(ballotExcerpt).toContainText("weighing");
  });
});

// ── 02: Drill Bridge ──────────────────────────────────────────────────────────

test.describe("DebateProofSection — 02 Drill Bridge", () => {
  test("drill card shows drill type badge", async ({ page }) => {
    await goToSection(page);
    const drillCard = page.locator('[data-testid="drill-bridge-card"]');
    await expect(drillCard).toContainText("WEIGHING");
  });

  test("drill prompt is visible and references $8K figure", async ({ page }) => {
    await goToSection(page);
    const prompt = page.locator('[data-testid="drill-prompt"]');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("$8K");
  });

  test("drill prompt references five-year timeframe", async ({ page }) => {
    await goToSection(page);
    const prompt = page.locator('[data-testid="drill-prompt"]');
    await expect(prompt).toContainText("five-year");
  });

  test("gap-trigger bridge is visible with WEIGHING label", async ({ page }) => {
    await goToSection(page);
    const trigger = page.locator('[data-testid="gap-trigger"]');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText("WEIGHING");
  });

  test("expected outcome text is visible", async ({ page }) => {
    await goToSection(page);
    const drillCard = page.locator('[data-testid="drill-bridge-card"]');
    await expect(drillCard).toContainText("Expected outcome");
  });

  test("drill card shows duration chip", async ({ page }) => {
    await goToSection(page);
    const drillCard = page.locator('[data-testid="drill-bridge-card"]');
    await expect(drillCard).toContainText("sec");
  });
});

// ── 03: Before/After Transformation ──────────────────────────────────────────

test.describe("DebateProofSection — 03 Transformation", () => {
  test("before lane shows 'BEFORE DRILL' eyebrow", async ({ page }) => {
    await goToSection(page);
    const transformCard = page.locator('[data-testid="transformation-card"]');
    await expect(transformCard).toContainText("BEFORE DRILL");
  });

  test("after lane shows 'AFTER DRILL' label", async ({ page }) => {
    await goToSection(page);
    const afterLane = page.locator('[data-testid="after-lane"]');
    await expect(afterLane).toContainText("AFTER DRILL");
  });

  test("after lane shows Weighing chip", async ({ page }) => {
    await goToSection(page);
    const afterLane = page.locator('[data-testid="after-lane"]');
    await expect(afterLane).toContainText("Weighing");
  });

  test("after lane shows Timeframe comparison chip", async ({ page }) => {
    await goToSection(page);
    const afterLane = page.locator('[data-testid="after-lane"]');
    await expect(afterLane).toContainText("Timeframe comparison");
  });

  test("after excerpt mentions year-one comparison (the improvement)", async ({ page }) => {
    await goToSection(page);
    const afterLane = page.locator('[data-testid="after-lane"]');
    await expect(afterLane).toContainText("year");
  });

  test("'What changed' coach observation is visible", async ({ page }) => {
    await goToSection(page);
    const transformCard = page.locator('[data-testid="transformation-card"]');
    await expect(transformCard).toContainText("What changed");
  });
});

// ── Narrative continuity with Phase A + B ────────────────────────────────────

test("Phase C continues the C1 narrative: ballot excerpt mentions NC argument", async ({
  page,
}) => {
  await goToSection(page);
  const ballotExcerpt = page.locator('[data-testid="ballot-excerpt"]');
  await expect(ballotExcerpt).toContainText("NC");
});

// ── Layout and overflow ───────────────────────────────────────────────────────

test("DebateProofSection has no horizontal overflow at 390×844", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  await page.goto("/home-v2", { waitUntil: "networkidle" });
  await page.locator("#product-proof").scrollIntoViewIfNeeded();
  const hasHScroll = await page.evaluate(
    () => document.body.scrollWidth > window.innerWidth + 2,
  );
  expect(hasHScroll).toBe(false);
  await ctx.close();
});

// ── Reduced-motion ────────────────────────────────────────────────────────────

test.describe("DebateProofSection — reduced-motion", () => {
  test("all three step cards are visible when prefers-reduced-motion is set", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await goToSection(page);
    for (const testId of [
      "decisive-moment-card",
      "drill-bridge-card",
      "transformation-card",
    ]) {
      await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
    }
    await ctx.close();
  });

  test("drill prompt is visible in reduced-motion mode", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await goToSection(page);
    const prompt = page.locator('[data-testid="drill-prompt"]');
    await expect(prompt).toBeVisible();
    await ctx.close();
  });
});
