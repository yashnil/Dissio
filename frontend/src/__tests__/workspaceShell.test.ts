/**
 * Workspace shell architecture tests.
 *
 * Verifies that:
 * 1. Authenticated routes live inside the (workspace) route group
 * 2. Public routes remain outside the group
 * 3. Every workspace page does NOT import its own AppShell (shell is in the layout)
 * 4. The workspace layout correctly imports AppShell
 * 5. navItems active-route matching is correct for all sidebar links
 * 6. Library icon is distinct from Evidence Studio
 */

import * as fs from "fs";
import * as path from "path";

const APP = path.resolve(__dirname, "../app");
const WORKSPACE = path.join(APP, "(workspace)");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(APP, rel), "utf8");
}

function workspaceSrc(rel: string): string {
  return fs.readFileSync(path.join(WORKSPACE, rel), "utf8");
}

// ── Route group existence ────────────────────────────────────────────────────

describe("(workspace) route group", () => {
  test("workspace directory exists", () => {
    expect(fs.existsSync(WORKSPACE)).toBe(true);
  });

  test("workspace layout.tsx exists", () => {
    expect(fs.existsSync(path.join(WORKSPACE, "layout.tsx"))).toBe(true);
  });

  test("workspace layout imports AppShell", () => {
    const layout = workspaceSrc("layout.tsx");
    expect(layout).toContain("AppShell");
  });

  const WORKSPACE_ROUTES = [
    "dashboard/page.tsx",
    "round-simulation/page.tsx",
    "session/page.tsx",
    "progress/page.tsx",
    "learn/page.tsx",
    "evidence/page.tsx",
    "library/page.tsx",
    "prep/page.tsx",
    "judge-adaptation/page.tsx",
    "team/page.tsx",
    "team/assign/page.tsx",
    "team/review/page.tsx",
    "team/student/page.tsx",
    "pilot/page.tsx",
    "drills/[id]/page.tsx",
    "speech/[id]/page.tsx",
    "missions/[id]/page.tsx",
    "evals/page.tsx",
  ];

  test.each(WORKSPACE_ROUTES)("workspace page exists: %s", (rel) => {
    const full = path.join(WORKSPACE, rel);
    expect(fs.existsSync(full)).toBe(true);
  });
});

// ── Public routes stay outside workspace ─────────────────────────────────────

describe("public routes outside workspace shell", () => {
  const PUBLIC_ROUTES = [
    "page.tsx",
    "login/page.tsx",
    "auth/callback/page.tsx",
    "demo/page.tsx",
    "share/[token]/page.tsx",
  ];

  test.each(PUBLIC_ROUTES)("public route exists at root: %s", (rel) => {
    const full = path.join(APP, rel);
    expect(fs.existsSync(full)).toBe(true);
  });

  test.each(PUBLIC_ROUTES)("public route is NOT inside (workspace): %s", (rel) => {
    const inWorkspace = path.join(WORKSPACE, rel);
    expect(fs.existsSync(inWorkspace)).toBe(false);
  });
});

// ── No duplicated AppShell in workspace pages ─────────────────────────────────

const PAGES_SHOULD_NOT_IMPORT_APPSHELL = [
  "dashboard/page.tsx",
  "round-simulation/page.tsx",
  "session/page.tsx",
  "progress/page.tsx",
  "library/page.tsx",
  "prep/page.tsx",
  "judge-adaptation/page.tsx",
  "team/page.tsx",
  "pilot/page.tsx",
  "missions/[id]/page.tsx",
];

describe("no duplicate AppShell in workspace pages", () => {
  test.each(PAGES_SHOULD_NOT_IMPORT_APPSHELL)("%s does not import AppShell", (rel) => {
    const content = workspaceSrc(rel);
    expect(content).not.toContain('import AppShell from "@/components/shell/AppShell"');
    expect(content).not.toContain('<AppShell');
  });
});

// ── learn and evidence pages use content wrappers instead ────────────────────

describe("non-bare pages use content wrappers", () => {
  test("learn/page.tsx uses max-w-5xl wrapper (was AppShell maxWidth=5xl)", () => {
    const content = workspaceSrc("learn/page.tsx");
    expect(content).not.toContain("<AppShell");
    expect(content).toContain("max-w-5xl");
  });

  test("evidence/page.tsx uses max-w-7xl wrapper (was AppShell maxWidth=7xl)", () => {
    const content = workspaceSrc("evidence/page.tsx");
    expect(content).not.toContain("<AppShell");
    expect(content).toContain("max-w-7xl");
  });
});

// ── round-simulation has no min-h-screen ─────────────────────────────────────

describe("round-simulation adapted for workspace", () => {
  test("does not use min-h-screen (would fight the shell layout)", () => {
    const content = workspaceSrc("round-simulation/page.tsx");
    expect(content).not.toContain("min-h-screen");
  });
});

// ── navItems active-route matching ──────────────────────────────────────────

import { isNavItemActive, APP_NAV_GROUPS, flattenNavGroups } from "@/lib/navItems";

describe("navItems active-route matching correctness", () => {
  const flatItems = flattenNavGroups();

  function findItem(href: string) {
    return flatItems.find((i) => i.href === href);
  }

  test("/round-simulation activates Full Round nav item", () => {
    const item = findItem("/round-simulation");
    expect(item).toBeDefined();
    expect(isNavItemActive(item!, "/round-simulation")).toBe(true);
  });

  test("/library activates Library nav item", () => {
    const item = findItem("/library");
    expect(item).toBeDefined();
    expect(isNavItemActive(item!, "/library")).toBe(true);
  });

  test("/team/assign activates Team nav item", () => {
    const item = findItem("/team");
    expect(item).toBeDefined();
    expect(isNavItemActive(item!, "/team/assign")).toBe(true);
  });

  test("/team/review activates Team nav item", () => {
    const item = findItem("/team");
    expect(item!).toBeDefined();
    expect(isNavItemActive(item!, "/team/review")).toBe(true);
  });

  test("/team/student activates Team nav item", () => {
    const item = findItem("/team");
    expect(item!).toBeDefined();
    expect(isNavItemActive(item!, "/team/student")).toBe(true);
  });

  test("/drills/abc activates Drills & Learn nav item", () => {
    const item = findItem("/learn");
    expect(item!).toBeDefined();
    expect(isNavItemActive(item!, "/drills/abc")).toBe(true);
  });

  test("/speech/abc activates Practice nav item", () => {
    const item = findItem("/session");
    expect(item!).toBeDefined();
    expect(isNavItemActive(item!, "/speech/abc")).toBe(true);
  });

  test("/missions/abc activates Home nav item", () => {
    const item = findItem("/dashboard");
    expect(item!).toBeDefined();
    expect(isNavItemActive(item!, "/missions/abc")).toBe(true);
  });

  test("only one item active per route", () => {
    const routes = [
      "/round-simulation",
      "/library",
      "/evidence",
      "/prep",
      "/judge-adaptation",
      "/dashboard",
      "/session",
      "/progress",
      "/learn",
      "/team",
      "/pilot",
    ];
    routes.forEach((route) => {
      const activeItems = flatItems.filter((i) => isNavItemActive(i, route));
      expect(activeItems.length).toBeLessThanOrEqual(1);
    });
  });
});

// ── Library icon distinct from Evidence Studio ───────────────────────────────

describe("navItems icon uniqueness", () => {
  test("Library and Evidence Studio use different icons", () => {
    const items = flattenNavGroups();
    const evidence = items.find((i) => i.href === "/evidence");
    const library = items.find((i) => i.href === "/library");
    expect(evidence).toBeDefined();
    expect(library).toBeDefined();
    // Icons are the component references — they must not be the same object
    expect(evidence!.icon).not.toBe(library!.icon);
  });
});

// ── Workspace layout is bare (no double-padding) ─────────────────────────────

describe("workspace layout configuration", () => {
  test("layout uses bare=true to avoid double padding", () => {
    const layout = workspaceSrc("layout.tsx");
    expect(layout).toContain("bare");
  });

  test("layout uses maxWidth=full so pages control their own width", () => {
    const layout = workspaceSrc("layout.tsx");
    expect(layout).toContain("full");
  });
});
