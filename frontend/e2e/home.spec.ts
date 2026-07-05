/**
 * home.spec.ts — Playwright E2E for the root homepage "/" (the promoted V10
 * "Glass Loupe" hero), the /home-v2 archived baseline, and the /home-v10
 * compatibility redirect.
 *
 * Architecture under test:
 *  - There is NO intro overlay/veil of any kind. Nav + main render on first paint.
 *  - The hero centers on ONE designed object: a premium, dimensional magnifying
 *    glass whose lens reveals the deciding sentence on warm paper, with a judge
 *    note docked to the rim and a green next-move drill tab hanging off the
 *    handle. NO waveform, NO prism, NO dashboard, NO V9 card-centered layout.
 *  - The lens/sentence/note/tab render in their FINAL state in the initial HTML
 *    (SSR-visible), so the page is complete with JavaScript disabled. GSAP is
 *    enhancement only (pure DOM/CSS/SVG — no canvas, no Spline, no R3F).
 */

import { test, expect, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = "/";

const SENTENCE =
  "Our impact outweighs because long-run growth matters more than short-run cost.";

async function goto(page: Page) {
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => {});
}

// Count how many matches of a text are actually visible (display-aware).
async function visibleCount(page: Page, scope: string, text: string): Promise<number> {
  const loc = page.locator(scope).getByText(text, { exact: true });
  const n = await loc.count();
  let visible = 0;
  for (let i = 0; i < n; i++) {
    if (await loc.nth(i).isVisible()) visible++;
  }
  return visible;
}

// ── First paint — no intro, magnifier present ─────────────────────────────────

test.describe("First paint — no intro, magnifier present", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page);
    await page.waitForSelector("#v10-nav");
  });

  test("no fullscreen intro status overlay exists", async ({ page }) => {
    await expect(page.locator('[role="status"][aria-label*="intro" i]')).toHaveCount(0);
  });

  test("no veil element exists", async ({ page }) => {
    await expect(page.locator("[data-testid*='veil']")).toHaveCount(0);
  });

  test("navbar is visible on first paint", async ({ page }) => {
    await expect(page.locator("#v10-nav")).toBeVisible();
  });

  test("brand 'Dissio' text is visible", async ({ page }) => {
    await expect(page.locator("#v10-nav").getByText("Dissio").first()).toBeVisible();
  });

  test("h1 is visible and contains both key phrases", async ({ page }) => {
    const h1 = page.locator("#v10-hero h1").first();
    await expect(h1).toBeVisible();
    const text = await h1.textContent();
    expect(text).toContain("The round moves fast");
    expect(text).toContain("what decided it");
  });

  test("supporting copy is visible", async ({ page }) => {
    await expect(page.locator("#v10-hero")).toContainText("Record one speech");
  });

  test("primary CTA is visible, enabled, and links to /login", async ({ page }) => {
    const cta = page.locator("#v10-hero a[href='/login']").first();
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();
  });

  test("secondary CTA links to /demo", async ({ page }) => {
    await expect(page.locator("#v10-hero a[href='/demo']").first()).toBeVisible();
  });

  test("trust line is present", async ({ page }) => {
    await expect(page.locator("#v10-hero")).toContainText("Coaching, not case generation");
  });

  test("the magnifier lens assembly is attached and visible", async ({ page }) => {
    await expect(page.locator("#v10-hero .v10-lens-assembly")).toHaveCount(1);
    await expect(page.locator("#v10-hero .v10-lens-assembly")).toBeVisible();
  });

  test("the revealed sentence is present inside the lens", async ({ page }) => {
    await expect(page.locator("#v10-hero .v10-lens")).toContainText(SENTENCE);
  });

  test("the marked weak phrase is present", async ({ page }) => {
    await expect(page.locator("#v10-hero .v10-marked").first()).toContainText(
      "outweighs because"
    );
  });

  test("the judge note text is present", async ({ page }) => {
    await expect(page.locator("#v10-hero .v10-note")).toContainText("Missing warrant");
  });

  test("the next-move tab text is present", async ({ page }) => {
    await expect(page.locator("#v10-hero .v10-tab")).toContainText("Next move");
  });

  test("the lens carries an accessible description of the story", async ({ page }) => {
    const label = (await page.locator("#v10-hero .v10-lens-assembly .sr-only").textContent()) ?? "";
    expect(label.toLowerCase()).toContain("loupe");
    expect(label.toLowerCase()).toContain("magnif");
    expect(label.toLowerCase()).toContain("warrant");
    expect(label.toLowerCase()).toContain("drill");
  });

  test("the hidden debate layer is present and hidden from assistive tech", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const field = page.locator("#v10-hero .v10-field");
    await expect(field).toHaveCount(1);
    await expect(field).toHaveAttribute("aria-hidden", "true");
    const fragments = page.locator("#v10-hero .v10-fragment");
    expect(await fragments.count()).toBeGreaterThanOrEqual(5);
  });

  test("hero fills at least 90% of viewport height", async ({ page }) => {
    const vp = page.viewportSize()!;
    const box = await page.locator("#v10-hero").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(vp.height * 0.9);
  });
});

// ── Composition — one lens, no waveform, no V9 card layout, no leftovers ──────

test.describe("Composition — one magnifier, nothing generic", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await goto(page);
  });

  test("exactly one lens object exists", async ({ page }) => {
    await expect(page.locator("#v10-hero .v10-lens")).toHaveCount(1);
    await expect(page.locator("#v10-hero .v10-lens-assembly")).toHaveCount(1);
  });

  test("no waveform classes or wave paths exist in the hero", async ({ page }) => {
    await expect(
      page.locator("#v10-hero .v8-wave, #v10-hero .v9-wave, #v10-hero .v10-wave")
    ).toHaveCount(0);
    await expect(page.locator("#v10-hero path[class*='wave']")).toHaveCount(0);
  });

  test("no V9 card-centered layout remains", async ({ page }) => {
    await expect(page.locator("#v10-hero .v9-card, #v10-hero .v10-card")).toHaveCount(0);
  });

  test("no V7 prism/trajectory leftovers remain", async ({ page }) => {
    await expect(page.locator("#v10-hero .v7-pro")).toHaveCount(0);
    await expect(page.locator("#v10-hero .v7-con")).toHaveCount(0);
    await expect(page.locator("#v10-hero .perspective-grid")).toHaveCount(0);
  });

  test("no canvas anywhere on the page (no R3F/Spline)", async ({ page }) => {
    await expect(page.locator("canvas")).toHaveCount(0);
  });

  test("no <img> element in the hero (inline SVG only)", async ({ page }) => {
    await expect(page.locator("#v10-hero img")).toHaveCount(0);
  });

  test("hero contains no standalone 'ANALYSIS' label", async ({ page }) => {
    await expect(page.locator("#v10-hero").getByText("ANALYSIS", { exact: true })).toHaveCount(0);
  });

  test("the hidden layer stays restrained (no dense matrix)", async ({ page }) => {
    // A handful of fragments, one source line — never a wall of labels.
    expect(await page.locator("#v10-hero .v10-fragment").count()).toBeLessThanOrEqual(9);
    await expect(page.locator("#v10-hero .v10-source")).toHaveCount(1);
  });

  test("the lens body is glass, not an opaque disk (backdrop-filter present)", async ({
    page,
  }) => {
    const hasBackdrop = await page.evaluate(() => {
      const lens = document.querySelector(".v10-lens") as HTMLElement | null;
      if (!lens) return false;
      const s = getComputedStyle(lens);
      const bf = s.backdropFilter || (s as unknown as Record<string, string>)["webkitBackdropFilter"] || "";
      return bf.includes("blur");
    });
    expect(hasBackdrop).toBe(true);
  });

  test("the focal phrase is not swallowed by the lens (headline stays readable)", async ({
    page,
  }) => {
    // Wait out the entrance glide — the resting position is what matters.
    await page.waitForTimeout(3600);
    // The lens box must start at or past the right edge of the rendered phrase
    // minus a small tangent tolerance (the bezel may kiss the period).
    const geo = await page.evaluate(() => {
      const hl3 = document.querySelector(".v10-hl-3");
      const lens = document.querySelector(".v10-lens-assembly");
      if (!hl3 || !lens) return null;
      const range = document.createRange();
      range.selectNodeContents(hl3);
      return {
        phraseRight: range.getBoundingClientRect().right,
        lensLeft: lens.getBoundingClientRect().left,
      };
    });
    expect(geo).not.toBeNull();
    expect(geo!.lensLeft).toBeGreaterThanOrEqual(geo!.phraseRight - 20);
  });
});

// ── Structure — the story reads once ──────────────────────────────────────────

test.describe("Magnifier structure", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await goto(page);
    await page.waitForTimeout(3600);
  });

  test("exactly one visible 'Missing warrant' note in the hero", async ({ page }) => {
    expect(await visibleCount(page, "#v10-hero", "Missing warrant")).toBe(1);
  });

  test("exactly one lens, one note, one tab, one marked phrase", async ({ page }) => {
    await expect(page.locator("#v10-hero .v10-lens")).toHaveCount(1);
    await expect(page.locator("#v10-hero .v10-note")).toHaveCount(1);
    await expect(page.locator("#v10-hero .v10-tab")).toHaveCount(1);
    await expect(page.locator("#v10-hero .v10-marked")).toHaveCount(1);
  });

  test("the note sub-copy is present", async ({ page }) => {
    await expect(page.locator("#v10-hero .v10-note")).toContainText(
      "Judge cannot resolve the impact."
    );
  });

  test("the tab carries Next move + the drill", async ({ page }) => {
    await expect(page.locator("#v10-hero .v10-tab")).toContainText("Next move");
    await expect(page.locator("#v10-hero .v10-tab")).toContainText("90-second warrant extension");
  });

  test("the choreography hooks exist (sweep, fracture, leaders)", async ({ page }) => {
    await expect(page.locator("#v10-hero .v10-sweep")).toHaveCount(1);
    await expect(page.locator("#v10-hero .v10-fracture")).toHaveCount(1);
    await expect(page.locator("#v10-hero .v10-leader")).toHaveCount(1);
    await expect(page.locator("#v10-hero .v10-tab-leader")).toHaveCount(1);
  });
});

// ── Choreography ──────────────────────────────────────────────────────────────

test.describe("Choreography", () => {
  const hero = (page: Page) => page.locator("#v10-hero");

  test("note + tab are visible after settle (default visit, ≈3s timeline)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await goto(page);
    await page.waitForTimeout(3600);
    await expect(hero(page).getByText("Missing warrant", { exact: true }).first()).toBeVisible();
    await expect(hero(page).getByText("Next move", { exact: true }).first()).toBeVisible();
  });

  test("?replayIntro=1 loads a healthy hero with the full magnifier", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE + "?replayIntro=1", { waitUntil: "load" });
    await expect(page.locator("#v10-hero h1").first()).toBeVisible();
    await page.waitForTimeout(3600);
    await expect(hero(page).getByText("Missing warrant", { exact: true }).first()).toBeVisible();
    await expect(hero(page).getByText("Next move", { exact: true }).first()).toBeVisible();
    await expect(page.locator("#v10-hero .v10-lens")).toContainText(SENTENCE);
  });

  test("reduced motion — headline + lens + note + tab visible immediately", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await goto(page);
    await expect(page.locator("#v10-hero h1").first()).toBeVisible();
    await expect(hero(page).getByText("Missing warrant", { exact: true }).first()).toBeVisible();
    await expect(hero(page).getByText("Next move", { exact: true }).first()).toBeVisible();
    await expect(page.locator("#v10-hero .v10-lens")).toContainText(SENTENCE);
  });

  test("no unhandled page errors during load + settle", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page);
    await page.waitForTimeout(3600);
    expect(errors).toEqual([]);
  });
});

// ── JS-disabled resilience (proves SSR final state) ───────────────────────────

test.describe("JavaScript disabled — SSR final state", () => {
  test("h1 + lens sentence + note + tab are present without JS", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: "load" });

    const headline = (await page.locator("#v10-hero h1").first().textContent()) ?? "";
    expect(headline).toContain("The round moves fast");
    expect(headline).toContain("what decided it");

    await expect(page.locator("#v10-hero .v10-lens").first()).toBeVisible();
    const lens = (await page.locator("#v10-hero .v10-lens").first().textContent()) ?? "";
    expect(lens).toContain(SENTENCE);

    await expect(page.locator("#v10-hero .v10-note").first()).toBeVisible();
    await expect(page.locator("#v10-hero .v10-tab").first()).toBeVisible();

    await context.close();
  });
});

// ── Nav ───────────────────────────────────────────────────────────────────────

test.describe("Nav — NavV10", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page);
    await page.waitForSelector("#v10-nav");
  });

  test("nav island is a single container", async ({ page }) => {
    await expect(page.locator("#v10-nav nav[aria-label='Main navigation']")).toHaveCount(1);
  });

  test("4 section links on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator("#v10-nav [role='list'] [role='listitem']")).toHaveCount(4);
  });

  test("nav links target reused v6-* section ids", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator("#v10-nav a[href='#v6-pipeline']").first()).toBeVisible();
    await expect(page.locator("#v10-nav a[href='#v6-judges']").first()).toBeVisible();
    await expect(page.locator("#v10-nav a[href='#v6-evidence']").first()).toBeVisible();
    await expect(page.locator("#v10-nav a[href='#v6-paths']").first()).toBeVisible();
  });

  test("primary CTA links to /login", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator("#v10-nav a[href='/login']").first()).toBeVisible();
  });

  test("skip link targets #v10-main-content", async ({ page }) => {
    await expect(page.locator("#v10-nav a[href='#v10-main-content']").first()).toBeAttached();
  });

  test("mobile menu toggle opens drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const toggle = page.locator("button[aria-label='Open navigation']");
    await expect(toggle).toHaveAttribute("aria-expanded", "false", { timeout: 5000 });
    await toggle.click();
    await expect(page.locator("#nav-v10-mobile")).toBeVisible();
  });

  test("mobile drawer has at least 4 links", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const toggle = page.locator("button[aria-label='Open navigation']");
    await expect(toggle).toHaveAttribute("aria-expanded", "false", { timeout: 5000 });
    await toggle.click();
    const drawer = page.locator("#nav-v10-mobile");
    await drawer.waitFor({ state: "attached" });
    expect(await drawer.locator("a").count()).toBeGreaterThanOrEqual(4);
  });
});

// ── Reliability — CTAs clickable after settle ─────────────────────────────────

test.describe("Reliability", () => {
  test("primary CTA is functional after settle", async ({ page }) => {
    await goto(page);
    await page.waitForTimeout(3600);
    const cta = page.locator("#v10-hero a[href='/login']").first();
    await expect(cta).toBeVisible();
    await cta.click();
    await page.waitForURL(/\/login/);
  });

  test("page is scrollable to the pipeline section", async ({ page }) => {
    await goto(page);
    await page.locator("#v6-pipeline").scrollIntoViewIfNeeded();
    await expect(page.locator("#v6-pipeline")).toBeVisible();
  });
});

// ── Lower page (reused V6 sections) ───────────────────────────────────────────

test.describe("Lower page — reused V6 sections", () => {
  test.beforeEach(async ({ page }) => {
    await goto(page);
  });

  test("pipeline heading is visible", async ({ page }) => {
    await page.locator("#v6-pipeline").scrollIntoViewIfNeeded();
    await expect(page.locator("#v6-pipeline h2")).toContainText("One speech.");
  });

  test("ballot section is present", async ({ page }) => {
    await page.locator("#v6-ballot").scrollIntoViewIfNeeded();
    await expect(page.locator("#v6-ballot h2")).toBeVisible();
  });

  test("4 judge tabs render", async ({ page }) => {
    await page.locator("#v6-judges").scrollIntoViewIfNeeded();
    await expect(page.locator("[aria-label='Judge perspectives'] [role='tab']")).toHaveCount(4);
  });

  test("drill before/after scores reachable", async ({ page }) => {
    await page.locator("#v6-drill").scrollIntoViewIfNeeded();
    await expect(page.locator("#v6-drill").getByLabel("45")).toBeAttached();
    await expect(page.locator("#v6-drill").getByLabel("74")).toBeAttached();
  });

  test("3 evidence layer toggles exist", async ({ page }) => {
    await page.locator("#v6-evidence").scrollIntoViewIfNeeded();
    await expect(page.locator("#v6-evidence button[aria-pressed]")).toHaveCount(3);
  });

  test("paths section shows Students and Coaches", async ({ page }) => {
    await page.locator("#v6-paths").scrollIntoViewIfNeeded();
    await expect(page.locator("#v6-paths")).toContainText("Students");
    await expect(page.locator("#v6-paths")).toContainText("Coaches");
  });

  test("final CTA heading present", async ({ page }) => {
    await page.locator("#v6-cta").scrollIntoViewIfNeeded();
    await expect(page.locator("#v6-cta h2")).toContainText("The round ends.");
  });

  test("footer has privacy and terms links", async ({ page }) => {
    await page.locator("#v6-footer").scrollIntoViewIfNeeded();
    await expect(page.locator("#v6-footer a[href='/privacy']")).toBeAttached();
    await expect(page.locator("#v6-footer a[href='/terms']")).toBeAttached();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

test.describe("Accessibility — WCAG 2.x AA", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await goto(page);
  });

  test("hero has no critical violations", async ({ page }) => {
    await expect(page.locator("#v10-hero")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include("#v10-hero")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations.filter((v) => v.impact === "critical")).toHaveLength(0);
  });

  test("nav has no critical violations", async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .include("#v10-nav")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations.filter((v) => v.impact === "critical")).toHaveLength(0);
  });

  test("full page has no critical violations", async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(results.violations.filter((v) => v.impact === "critical")).toHaveLength(0);
  });

  test("nav links are keyboard focusable", async ({ page }) => {
    const link = page.locator("#v10-nav [role='list'] a").first();
    await link.focus();
    await expect(link).toBeFocused();
  });

  test("primary CTA is keyboard focusable", async ({ page }) => {
    const cta = page.locator("#v10-hero a[href='/login']").first();
    await cta.focus();
    await expect(cta).toBeFocused();
  });

  test("decorative lens layers are hidden from assistive tech", async ({ page }) => {
    // Every SVG inside the lens assembly is decorative (the story is told by
    // real DOM text + the sr-only description).
    const undescribed = await page
      .locator("#v10-hero .v10-lens-assembly svg:not([aria-hidden='true'])")
      .count();
    expect(undescribed).toBe(0);
  });

  test("no horizontal overflow", async ({ page }) => {
    const ok = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    );
    expect(ok).toBe(true);
  });
});

// ── Responsive ────────────────────────────────────────────────────────────────

test.describe("Responsive layout", () => {
  const viewports = [
    { name: "mobile-sm", width: 375, height: 812 },
    { name: "mobile-390", width: 390, height: 844 },
    { name: "mobile-lg", width: 430, height: 932 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop-1024", width: 1024, height: 768 },
    { name: "desktop-sm", width: 1280, height: 800 },
    { name: "desktop-lg", width: 1440, height: 900 },
  ] as const;

  for (const vp of viewports) {
    test(`h1 visible at ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await goto(page);
      await expect(page.locator("#v10-hero h1").first()).toBeVisible();
    });

    test(`lens + sentence visible at ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await goto(page);
      await expect(page.locator("#v10-hero .v10-lens")).toBeVisible();
      await expect(page.locator("#v10-hero .v10-lens")).toContainText("outweighs because");
    });

    test(`no horizontal overflow at ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await goto(page);
      const ok = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      );
      expect(ok).toBe(true);
    });
  }

  test("at 375px the primary CTA is within the first 1.5 viewport heights", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await goto(page);
    const cta = page.locator("#v10-hero a[href='/login']").first();
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(812 * 1.5);
  });

  test("at desktop the CTAs sit above the fold", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await goto(page);
    const cta = page.locator("#v10-hero a[href='/login']").first();
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(900);
  });
});

// ── /home-v10 — compatibility redirect to the promoted root ──────────────────

test.describe("/home-v10 redirect", () => {
  test("navigating to /home-v10 lands on /", async ({ page }) => {
    await page.goto("/home-v10", { waitUntil: "load" });
    await page.waitForURL(/\/$/);
    await expect(page.locator("#v10-hero h1").first()).toBeVisible();
  });
});

// ── /home-v2 — the archived original homepage baseline ───────────────────────

test.describe("/home-v2 archived baseline", () => {
  test("renders the original homepage structure", async ({ page }) => {
    await page.goto("/home-v2", { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.locator("#practice")).toBeAttached();
    await expect(
      page.getByText("Watch a speech become a flow", { exact: true })
    ).toBeVisible();
  });

  test("does not render the V10 hero", async ({ page }) => {
    await page.goto("/home-v2", { waitUntil: "load" });
    await expect(page.locator("#v10-hero")).toHaveCount(0);
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/home-v2", { waitUntil: "load" });
    const ok = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    );
    expect(ok).toBe(true);
  });
});

// ── Removed experimental routes are gone ──────────────────────────────────────

test.describe("Removed experimental routes", () => {
  for (const route of ["/home-v5", "/home-v7", "/home-v8", "/home-v9"]) {
    test(`${route} no longer renders a live page`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: "load" });
      expect(response?.status()).toBe(404);
    });
  }
});
