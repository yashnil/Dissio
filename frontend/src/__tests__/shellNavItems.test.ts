/**
 * Pure utility tests for shell navigation logic.
 * Node environment only — no DOM, no React.
 */
import {
  isNavItemActive,
  flattenNavGroups,
  deriveLoopStep,
  APP_NAV_GROUPS,
  type LoopStep,
} from "@/lib/navItems";
import { reducedSafe, MOTION_NOOP } from "@/lib/motion";

// ── isNavItemActive ───────────────────────────────────────────────────────────

describe("isNavItemActive", () => {
  const item = { match: ["/dashboard"] };
  const prefixItem = { match: ["/session", "/speech"] };

  test("exact match returns true", () => {
    expect(isNavItemActive(item, "/dashboard")).toBe(true);
  });

  test("prefix match returns true", () => {
    expect(isNavItemActive(prefixItem, "/speech/abc-123")).toBe(true);
  });

  test("sibling path does NOT match (no false positives)", () => {
    expect(isNavItemActive(item, "/dashboardExtra")).toBe(false);
    expect(isNavItemActive(item, "/dashboardx/foo")).toBe(false);
  });

  test("null pathname returns false", () => {
    expect(isNavItemActive(item, null)).toBe(false);
    expect(isNavItemActive(item, undefined)).toBe(false);
    expect(isNavItemActive(item, "")).toBe(false);
  });

  test("unrelated path returns false", () => {
    expect(isNavItemActive(item, "/evidence")).toBe(false);
  });

  test("second match entry works", () => {
    expect(isNavItemActive(prefixItem, "/session")).toBe(true);
    expect(isNavItemActive(prefixItem, "/session/new")).toBe(true);
  });
});

// ── flattenNavGroups ──────────────────────────────────────────────────────────

describe("flattenNavGroups", () => {
  test("returns all non-coachOnly items by default", () => {
    const items = flattenNavGroups();
    expect(items.every((i) => !i.coachOnly)).toBe(true);
  });

  test("includes coachOnly items when isCoach=true", () => {
    // Inject a coach-only item temporarily by reading current groups
    // (no coach-only items exist yet — just verify the filter passes through)
    const allItems = flattenNavGroups({ isCoach: true });
    const defaultItems = flattenNavGroups({ isCoach: false });
    // At minimum, all default items are in the full list
    defaultItems.forEach((d) => {
      expect(allItems.some((a) => a.href === d.href)).toBe(true);
    });
  });

  test("flattens all groups into a single array", () => {
    const items = flattenNavGroups();
    const totalGroupItems = APP_NAV_GROUPS.flatMap((g) => g.items).filter((i) => !i.coachOnly).length;
    expect(items.length).toBe(totalGroupItems);
  });
});

// ── deriveLoopStep ────────────────────────────────────────────────────────────

describe("deriveLoopStep", () => {
  const cases: [string | null | undefined, LoopStep | null][] = [
    ["/session", "practice"],
    ["/session/new", "practice"],
    ["/speech/abc-123", "practice"],
    ["/speech/abc/report", "practice"],
    ["/learn", "drill"],
    ["/learn/warrants", "drill"],
    ["/drills", "drill"],
    ["/drills/123", "drill"],
    ["/progress", "improve"],
    ["/progress/weekly", "improve"],
    ["/dashboard", null],
    ["/evidence", null],
    ["/team", null],
    ["/pilot", null],
    [null, null],
    [undefined, null],
    ["", null],
  ];

  test.each(cases)("deriveLoopStep(%s) → %s", (pathname, expected) => {
    expect(deriveLoopStep(pathname)).toBe(expected);
  });
});

// ── loopStep metadata on nav items ───────────────────────────────────────────

describe("nav item loopStep metadata", () => {
  const trainGroup = APP_NAV_GROUPS.find((g) => g.id === "train");

  test("train group exists", () => {
    expect(trainGroup).toBeDefined();
  });

  test("Practice item has loopStep='practice'", () => {
    const practice = trainGroup!.items.find((i) => i.href === "/session");
    expect(practice?.loopStep).toBe("practice");
  });

  test("Progress item has loopStep='improve'", () => {
    const progress = trainGroup!.items.find((i) => i.href === "/progress");
    expect(progress?.loopStep).toBe("improve");
  });

  test("Learn/Drills item has loopStep='drill'", () => {
    const learn = trainGroup!.items.find((i) => i.href === "/learn");
    expect(learn?.loopStep).toBe("drill");
  });

  test("Research/Team/Resources items have no loopStep", () => {
    const nonTrainItems = APP_NAV_GROUPS
      .filter((g) => g.id !== "train")
      .flatMap((g) => g.items);
    nonTrainItems.forEach((item) => {
      expect(item.loopStep).toBeUndefined();
    });
  });
});

// ── reducedSafe SSR path ──────────────────────────────────────────────────────

describe("reducedSafe", () => {
  const motionProps = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2 },
  };

  test("returns original props when window is undefined (SSR)", () => {
    // In a node/jest test environment, window is typically not defined.
    // If jest defines it, temporarily delete it.
    const savedWindow = globalThis.window;
    // @ts-expect-error — intentionally deleting window to test SSR branch
    delete globalThis.window;

    expect(reducedSafe(motionProps)).toEqual(motionProps);

    // Restore
    globalThis.window = savedWindow;
  });

  test("MOTION_NOOP has zero-duration transition", () => {
    expect(MOTION_NOOP.transition?.duration).toBe(0);
  });

  test("MOTION_NOOP has empty initial and animate", () => {
    expect(MOTION_NOOP.initial).toEqual({});
    expect(MOTION_NOOP.animate).toEqual({});
  });
});

// ── Brand link (top-left logo) ────────────────────────────────────────────────

import { BRAND_LINK } from "@/lib/navItems";

describe("BRAND_LINK", () => {
  test("brand href points at the public homepage", () => {
    expect(BRAND_LINK.href).toBe("/");
  });

  test("accessible label names the homepage destination", () => {
    expect(BRAND_LINK.ariaLabel).toContain("Dissio");
    expect(BRAND_LINK.ariaLabel.toLowerCase()).toContain("homepage");
  });

  test("Home nav item still points at /dashboard", () => {
    const allItems = flattenNavGroups();
    const home = allItems.find((i) => i.href === "/dashboard");
    expect(home).toBeDefined();
  });

  test("brand and Home nav are intentionally different destinations", () => {
    // Brand → public homepage front door; Home nav item → in-app dashboard.
    const allItems = flattenNavGroups();
    const home = allItems.find((i) => i.href === "/dashboard");
    expect(BRAND_LINK.href).not.toBe(home!.href);
  });
});
