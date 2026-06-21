/**
 * Playwright tests for the JudgeLensSection interactive component.
 *
 * Tests cover:
 *  - Default selection (Flow Judge)
 *  - Tab switching via click (Lay / Parent)
 *  - Content changes: decisive issue + ballot note update on judge change
 *  - Keyboard navigation: ArrowRight/Left/Home/End on the tablist
 *  - ARIA roles: tablist, tab, tabpanel, aria-selected
 *  - Reduced-motion: all tabs and content visible statically
 *  - No horizontal overflow at 390×844
 *  - "Same root cause" cross-link note present
 *  - Section in DOM with correct aria-label
 */

import { test, expect, type Page } from "@playwright/test";

async function goToSection(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#judge").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
}

// ── Section structure ─────────────────────────────────────────────────────────

test.describe("JudgeLensSection — DOM structure and ARIA", () => {
  test("section is in DOM and carries aria-label", async ({ page }) => {
    await goToSection(page);
    const section = page.locator("#judge");
    await expect(section).toBeAttached();
    await expect(section).toHaveAttribute("aria-label", "Judge lens demonstration");
  });

  test("tablist is present with aria-label", async ({ page }) => {
    await goToSection(page);
    const tablist = page.locator('[role="tablist"]');
    await expect(tablist).toBeAttached();
    await expect(tablist).toHaveAttribute("aria-label", "Select judge perspective");
  });

  test("exactly three tabs are rendered", async ({ page }) => {
    await goToSection(page);
    const tabs = page.locator('[role="tab"]');
    await expect(tabs).toHaveCount(3);
  });

  test("each tab has aria-controls pointing to a tabpanel", async ({ page }) => {
    await goToSection(page);
    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    for (let i = 0; i < count; i++) {
      const controls = await tabs.nth(i).getAttribute("aria-controls");
      expect(controls).toBeTruthy();
      const panel = page.locator(`#${controls}`);
      await expect(panel).toBeAttached();
      await expect(panel).toHaveAttribute("role", "tabpanel");
    }
  });
});

// ── Default state (Flow Judge) ────────────────────────────────────────────────

test.describe("JudgeLensSection — default Flow Judge state", () => {
  test("Flow Judge tab is selected by default", async ({ page }) => {
    await goToSection(page);
    const flowTab = page.locator('[role="tab"]').filter({ hasText: "Flow Judge" });
    await expect(flowTab).toHaveAttribute("aria-selected", "true");
  });

  test("Flow Judge tabIndex is 0 by default", async ({ page }) => {
    await goToSection(page);
    const flowTab = page.locator('[role="tab"]').filter({ hasText: "Flow Judge" });
    await expect(flowTab).toHaveAttribute("tabindex", "0");
  });

  test("other tabs have tabIndex -1 when Flow is selected", async ({ page }) => {
    await goToSection(page);
    const layTab = page.locator('[role="tab"]').filter({ hasText: "Lay Judge" });
    const parentTab = page.locator('[role="tab"]').filter({ hasText: "Parent Judge" });
    await expect(layTab).toHaveAttribute("tabindex", "-1");
    await expect(parentTab).toHaveAttribute("tabindex", "-1");
  });

  test("decisive issue shows 'Dropped weighing' content for flow judge", async ({
    page,
  }) => {
    await goToSection(page);
    const decisiveIssue = page.locator('[data-testid="decisive-issue"]');
    await expect(decisiveIssue).toContainText("weighing");
  });

  test("ballot note is shown for flow judge", async ({ page }) => {
    await goToSection(page);
    const ballotNote = page.locator('[data-testid="ballot-note"]');
    await expect(ballotNote).toBeVisible();
    // Flow ballot references the dropped weighing / flow terminology
    await expect(ballotNote).toContainText("weighing");
  });
});

// ── Tab switching via click ───────────────────────────────────────────────────

test.describe("JudgeLensSection — tab switching", () => {
  test("clicking Lay Judge updates aria-selected", async ({ page }) => {
    await goToSection(page);
    const layTab = page.locator('[role="tab"]').filter({ hasText: "Lay Judge" });
    await layTab.click();
    await expect(layTab).toHaveAttribute("aria-selected", "true");
    const flowTab = page.locator('[role="tab"]').filter({ hasText: "Flow Judge" });
    await expect(flowTab).toHaveAttribute("aria-selected", "false");
  });

  test("clicking Lay Judge updates decisive issue content", async ({ page }) => {
    await goToSection(page);
    await page.locator('[role="tab"]').filter({ hasText: "Lay Judge" }).click();
    const decisiveIssue = page.locator('[data-testid="decisive-issue"]');
    // Lay judge issue is about explanation/comparison, not flow terminology
    await expect(decisiveIssue).toContainText("short-run");
  });

  test("clicking Parent Judge updates ballot note content", async ({ page }) => {
    await goToSection(page);
    await page.locator('[role="tab"]').filter({ hasText: "Parent Judge" }).click();
    const ballotNote = page.locator('[data-testid="ballot-note"]');
    // Parent ballot talks about real people / feeling stakes
    await expect(ballotNote).toContainText("real people");
  });

  test("switching back to Flow Judge restores flow content", async ({ page }) => {
    await goToSection(page);
    // Go to Lay
    await page.locator('[role="tab"]').filter({ hasText: "Lay Judge" }).click();
    // Return to Flow
    await page.locator('[role="tab"]').filter({ hasText: "Flow Judge" }).click();
    const decisiveIssue = page.locator('[data-testid="decisive-issue"]');
    await expect(decisiveIssue).toContainText("weighing");
  });

  test("tabIndex moves to the newly-selected tab after click", async ({ page }) => {
    await goToSection(page);
    const parentTab = page.locator('[role="tab"]').filter({ hasText: "Parent Judge" });
    await parentTab.click();
    await expect(parentTab).toHaveAttribute("tabindex", "0");
  });
});

// ── Keyboard navigation (roving tabIndex) ─────────────────────────────────────

test.describe("JudgeLensSection — keyboard navigation", () => {
  test("ArrowRight moves selection from Flow → Lay", async ({ page }) => {
    await goToSection(page);
    const flowTab = page.locator('[role="tab"]').filter({ hasText: "Flow Judge" });
    await flowTab.focus();
    await page.keyboard.press("ArrowRight");
    const layTab = page.locator('[role="tab"]').filter({ hasText: "Lay Judge" });
    await expect(layTab).toHaveAttribute("aria-selected", "true");
    await expect(layTab).toBeFocused();
  });

  test("ArrowRight wraps: Parent → Flow", async ({ page }) => {
    await goToSection(page);
    // Navigate to Parent first
    const parentTab = page.locator('[role="tab"]').filter({ hasText: "Parent Judge" });
    await parentTab.click();
    await parentTab.focus();
    await page.keyboard.press("ArrowRight");
    const flowTab = page.locator('[role="tab"]').filter({ hasText: "Flow Judge" });
    await expect(flowTab).toHaveAttribute("aria-selected", "true");
  });

  test("ArrowLeft moves selection from Lay → Flow", async ({ page }) => {
    await goToSection(page);
    // Select Lay first
    await page.locator('[role="tab"]').filter({ hasText: "Lay Judge" }).click();
    const layTab = page.locator('[role="tab"]').filter({ hasText: "Lay Judge" });
    await layTab.focus();
    await page.keyboard.press("ArrowLeft");
    const flowTab = page.locator('[role="tab"]').filter({ hasText: "Flow Judge" });
    await expect(flowTab).toHaveAttribute("aria-selected", "true");
  });

  test("End key jumps to Parent Judge (last tab)", async ({ page }) => {
    await goToSection(page);
    const flowTab = page.locator('[role="tab"]').filter({ hasText: "Flow Judge" });
    await flowTab.focus();
    await page.keyboard.press("End");
    const parentTab = page.locator('[role="tab"]').filter({ hasText: "Parent Judge" });
    await expect(parentTab).toHaveAttribute("aria-selected", "true");
    await expect(parentTab).toBeFocused();
  });

  test("Home key jumps to Flow Judge (first tab)", async ({ page }) => {
    await goToSection(page);
    const parentTab = page.locator('[role="tab"]').filter({ hasText: "Parent Judge" });
    await parentTab.click();
    await parentTab.focus();
    await page.keyboard.press("Home");
    const flowTab = page.locator('[role="tab"]').filter({ hasText: "Flow Judge" });
    await expect(flowTab).toHaveAttribute("aria-selected", "true");
    await expect(flowTab).toBeFocused();
  });
});

// ── Reduced-motion: fully static ──────────────────────────────────────────────

test.describe("JudgeLensSection — reduced-motion", () => {
  test("all three tabs are visible when prefers-reduced-motion is set", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await goToSection(page);

    for (const label of ["Flow Judge", "Lay Judge", "Parent Judge"]) {
      const tab = page.locator('[role="tab"]').filter({ hasText: label });
      await expect(tab).toBeVisible();
    }
    await ctx.close();
  });

  test("ballot note content is visible in reduced-motion mode", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await goToSection(page);
    const ballotNote = page.locator('[data-testid="ballot-note"]');
    await expect(ballotNote).toBeVisible();
    await ctx.close();
  });

  test("switching tabs works without animation in reduced-motion mode", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await goToSection(page);
    await page.locator('[role="tab"]').filter({ hasText: "Lay Judge" }).click();
    const layTab = page.locator('[role="tab"]').filter({ hasText: "Lay Judge" });
    await expect(layTab).toHaveAttribute("aria-selected", "true");
    const decisiveIssue = page.locator('[data-testid="decisive-issue"]');
    await expect(decisiveIssue).toContainText("short-run");
    await ctx.close();
  });
});

// ── Layout: no horizontal overflow ────────────────────────────────────────────

test("JudgeLensSection has no horizontal overflow at 390×844", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator("#judge").scrollIntoViewIfNeeded();
  const hasHScroll = await page.evaluate(
    () => document.body.scrollWidth > window.innerWidth + 2,
  );
  expect(hasHScroll).toBe(false);
  await ctx.close();
});

// ── Narrative continuity cross-link ──────────────────────────────────────────

test("cross-link note 'Same root cause: no weighing in C1' is present", async ({
  page,
}) => {
  await goToSection(page);
  // This note links back to the SpeechFlowSection's coaching gap summary
  const crossLink = page.locator("text=Same root cause: no weighing in C1");
  await expect(crossLink).toBeVisible();
});

// ── Screen reader live region ─────────────────────────────────────────────────

test("sr-only status region updates when tab changes", async ({ page }) => {
  await goToSection(page);
  // Use the scoped testid to avoid matching SpeechFlowSection's empty live region
  const liveRegion = page.locator('[data-testid="judge-live-region"]');
  await expect(liveRegion).toContainText("Flow Judge");

  await page.locator('[role="tab"]').filter({ hasText: "Lay Judge" }).click();
  await expect(liveRegion).toContainText("Lay Judge");
});
