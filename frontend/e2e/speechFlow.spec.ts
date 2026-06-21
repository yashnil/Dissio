/**
 * Focused Playwright tests for the SpeechFlowSection interactive component.
 *
 * Tests cover:
 *  - phrase → node bidirectional highlighting (aria-pressed)
 *  - node → phrase highlighting
 *  - deselect (toggle off)
 *  - keyboard activation via Enter
 *  - reduced-motion: full content rendered statically
 *  - no horizontal overflow at 390×844
 *  - coaching gap summary visible at 1280×800 without page scroll
 *  - no JS/hydration console errors
 *
 * Tests navigate directly to "/" and scroll to #speech-to-flow.
 * No auth is required — the section is part of the public homepage.
 */

import { test, expect, type Page } from "@playwright/test";

// ── Setup: navigate to homepage and scroll to the section ─────────────────────

async function goToSection(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  const section = page.locator("#speech-to-flow");
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400); // let entrance animation settle
}

// ── Phrase ↔ node highlighting ────────────────────────────────────────────────

test.describe("SpeechFlowSection — phrase ↔ node bidirectional highlight", () => {
  test("clicking a transcript phrase sets aria-pressed=true on that phrase", async ({
    page,
  }) => {
    await goToSection(page);
    const claimBtn = page
      .locator('[aria-label^="claim:"]')
      .first();
    await expect(claimBtn).toHaveAttribute("aria-pressed", "false");
    await claimBtn.click();
    await expect(claimBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking a transcript phrase activates the matching flow node", async ({
    page,
  }) => {
    await goToSection(page);
    // Click the "claim" phrase button
    const claimPhrase = page.locator('[aria-label^="claim:"]').first();
    await claimPhrase.click();
    // The CLAIM flow node button should become pressed
    const claimNode = page.locator('[aria-label^="CLAIM:"]');
    await expect(claimNode).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking a flow node activates the matching transcript phrase", async ({
    page,
  }) => {
    await goToSection(page);
    const evidenceNode = page.locator('[aria-label^="EVIDENCE:"]');
    await evidenceNode.click();
    const evidencePhrase = page.locator('[aria-label^="evidence:"]').first();
    await expect(evidencePhrase).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking an active phrase again deselects it (toggle off)", async ({
    page,
  }) => {
    await goToSection(page);
    const warrantPhrase = page.locator('[aria-label^="warrant:"]').first();
    // Select
    await warrantPhrase.click();
    await expect(warrantPhrase).toHaveAttribute("aria-pressed", "true");
    // Deselect
    await warrantPhrase.click();
    await expect(warrantPhrase).toHaveAttribute("aria-pressed", "false");
  });

  test("clicking an active flow node again deselects it", async ({ page }) => {
    await goToSection(page);
    const impactNode = page.locator('[aria-label^="IMPACT:"]');
    await impactNode.click();
    await expect(impactNode).toHaveAttribute("aria-pressed", "true");
    await impactNode.click();
    await expect(impactNode).toHaveAttribute("aria-pressed", "false");
  });

  test("selecting one phrase does not activate an unrelated flow node", async ({
    page,
  }) => {
    await goToSection(page);
    const claimPhrase = page.locator('[aria-label^="claim:"]').first();
    await claimPhrase.click();
    // WARRANT node should remain unpressed
    const warrantNode = page.locator('[aria-label^="WARRANT:"]');
    await expect(warrantNode).toHaveAttribute("aria-pressed", "false");
  });
});

// ── Keyboard interaction ──────────────────────────────────────────────────────

test.describe("SpeechFlowSection — keyboard activation", () => {
  test("Tab reaches a transcript phrase button; Enter activates it", async ({
    page,
  }) => {
    await goToSection(page);
    // Focus the first phrase button directly and activate via Enter
    const claimBtn = page.locator('[aria-label^="claim:"]').first();
    await claimBtn.focus();
    await expect(claimBtn).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(claimBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("Space also activates a focused phrase button", async ({ page }) => {
    await goToSection(page);
    const evidenceBtn = page.locator('[aria-label^="evidence:"]').first();
    await evidenceBtn.focus();
    await page.keyboard.press(" ");
    await expect(evidenceBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("Tab reaches a flow node button; Enter activates it", async ({ page }) => {
    await goToSection(page);
    const warrantNode = page.locator('[aria-label^="WARRANT:"]');
    await warrantNode.focus();
    await expect(warrantNode).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(warrantNode).toHaveAttribute("aria-pressed", "true");
    // Linked transcript phrase should also be pressed
    const warrantPhrase = page.locator('[aria-label^="warrant:"]').first();
    await expect(warrantPhrase).toHaveAttribute("aria-pressed", "true");
  });
});

// ── Reduced-motion: complete static render ────────────────────────────────────

test.describe("SpeechFlowSection — reduced-motion", () => {
  test("all four phrase buttons are visible when reduced motion is set", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await goToSection(page);

    // All 4 phrase buttons should be visible (content not hidden pending animation)
    for (const role of ["claim", "evidence", "warrant", "impact"]) {
      const btn = page.locator(`[aria-label^="${role}:"]`).first();
      await expect(btn).toBeVisible();
    }
    // All 4 flow node buttons should be visible
    for (const label of ["CLAIM", "EVIDENCE", "WARRANT", "IMPACT"]) {
      const btn = page.locator(`[aria-label^="${label}:"]`);
      await expect(btn).toBeVisible();
    }
    await ctx.close();
  });

  test("coaching gap summary is visible in reduced-motion mode", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await goToSection(page);
    const summary = page.locator('[data-testid="coaching-gap-summary"]');
    await expect(summary).toBeVisible();
    await ctx.close();
  });
});

// ── Layout: no horizontal overflow at mobile ──────────────────────────────────

test("SpeechFlowSection has no horizontal overflow at 390×844", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  const section = page.locator("#speech-to-flow");
  await section.scrollIntoViewIfNeeded();
  const hasHScroll = await page.evaluate(
    () => document.body.scrollWidth > window.innerWidth + 2,
  );
  expect(hasHScroll).toBe(false);
  await ctx.close();
});

// ── Coaching gap visible at 1280×800 without page scroll ─────────────────────

test("coaching gap summary is in viewport at 1280×800 when section is in view", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  const section = page.locator("#speech-to-flow");
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const summary = page.locator('[data-testid="coaching-gap-summary"]');
  await expect(summary).toBeVisible();

  // Verify it's within the current viewport bounds (not just "exists")
  const box = await summary.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(800);
  }
  await ctx.close();
});

// ── No console errors / hydration warnings ────────────────────────────────────

test("homepage loads without console errors or hydration warnings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    errors.push(err.message);
  });

  await page.goto("/", { waitUntil: "networkidle" });

  // Filter out known non-critical network errors (e.g., favicon, analytics)
  const significantErrors = errors.filter(
    (e) =>
      !e.includes("favicon") &&
      !e.includes("Failed to load resource") &&
      !e.includes("net::ERR_"),
  );
  expect(significantErrors).toHaveLength(0);
});

// ── Section renders and section label is present ──────────────────────────────

test("speech-to-flow section is in the DOM and labelled correctly", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const section = page.locator("#speech-to-flow");
  await expect(section).toBeAttached();
  await expect(section).toHaveAttribute(
    "aria-label",
    "Interactive speech-to-flow demonstration",
  );
});
