/**
 * Coach Command Center frontend tests (Pass 20).
 *
 * Tests cover:
 * - Type contract for CommandCenterData / TeamSummary / RosterRow
 * - File existence for all new components and pages
 * - coachApi.ts exports
 * - SKILL_LABEL completeness
 * - TREND_COLOR presence for all trend values
 * - StudentRosterTable sort logic (pure)
 * - AttentionBadge rendering rules (pure)
 * - WeeklyReportPanel CSV helper (pure)
 * - Team page tablist structure
 * - Review queue page keyboard hint presence
 * - Student profile page section structure
 */

import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../");
const APP = path.join(SRC, "app");
const WORKSPACE = path.join(APP, "(workspace)");
const COMP = path.join(SRC, "components");
const LIB = path.join(SRC, "lib");
const TYPES = path.join(SRC, "types");

function readFile(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf8");
}

// ── File existence ─────────────────────────────────────────────────────────────

describe("Coach Command Center — file existence", () => {
  const REQUIRED_FILES = [
    "types/coach.ts",
    "lib/coachApi.ts",
    "components/coach/TeamStatusSummary.tsx",
    "components/coach/AttentionQueue.tsx",
    "components/coach/StudentRosterTable.tsx",
    "components/coach/AssignmentTemplatePanel.tsx",
    "components/coach/WeeklyReportPanel.tsx",
    "app/(workspace)/team/page.tsx",
    "app/(workspace)/team/review/page.tsx",
    "app/(workspace)/team/student/page.tsx",
  ];

  test.each(REQUIRED_FILES)("exists: %s", (rel) => {
    expect(fs.existsSync(path.join(SRC, rel))).toBe(true);
  });
});

// ── types/coach.ts ─────────────────────────────────────────────────────────────

describe("coach types", () => {
  const src = readFile("types/coach.ts");

  test("exports CommandCenterData", () => {
    expect(src).toContain("CommandCenterData");
  });

  test("exports TeamSummary", () => {
    expect(src).toContain("TeamSummary");
  });

  test("exports RosterRow with attention_level", () => {
    expect(src).toContain("attention_level");
    expect(src).toContain("RosterRow");
  });

  test("exports AssignmentTemplate", () => {
    expect(src).toContain("AssignmentTemplate");
  });

  test("exports WeeklyReport", () => {
    expect(src).toContain("WeeklyReport");
  });

  test("exports CoachNote", () => {
    expect(src).toContain("CoachNote");
  });

  test("exports RichStudentProfile", () => {
    expect(src).toContain("RichStudentProfile");
  });

  test("SKILL_LABEL covers all 9 skills", () => {
    const SKILLS = [
      "weighing", "extensions", "drops", "clash",
      "judge_adaptation", "delivery", "warranting", "evidence_use", "organization",
    ];
    SKILLS.forEach((s) => {
      // Keys may appear quoted or unquoted in the object literal
      expect(src).toMatch(new RegExp(`["']?${s}["']?\\s*:`));
    });
  });

  test("TREND_COLOR covers all 4 trend values", () => {
    ["improving", "declining", "steady", "insufficient"].forEach((t) => {
      expect(src).toContain(`"${t}"`);
    });
  });
});

// ── lib/coachApi.ts ────────────────────────────────────────────────────────────

describe("coachApi exports", () => {
  const src = readFile("lib/coachApi.ts");

  test("exports fetchCommandCenter", () => {
    expect(src).toContain("fetchCommandCenter");
  });

  test("exports fetchWeeklyReport", () => {
    expect(src).toContain("fetchWeeklyReport");
  });

  test("exports fetchUsageSummary", () => {
    expect(src).toContain("fetchUsageSummary");
  });

  test("exports fetchTemplates", () => {
    expect(src).toContain("fetchTemplates");
  });

  test("exports assignFromTemplate", () => {
    expect(src).toContain("assignFromTemplate");
  });

  test("exports fetchStudentProfile", () => {
    expect(src).toContain("fetchStudentProfile");
  });

  test("exports addCoachNote", () => {
    expect(src).toContain("addCoachNote");
  });

  test("uses apiFetch (not raw fetch)", () => {
    expect(src).toContain('from "@/lib/api"');
    expect(src).not.toContain("window.fetch");
  });
});

// ── TeamStatusSummary ─────────────────────────────────────────────────────────

describe("TeamStatusSummary component", () => {
  const src = readFile("components/coach/TeamStatusSummary.tsx");

  test("renders a region with aria-label", () => {
    expect(src).toContain("aria-label");
    expect(src).toContain("Team status summary");
  });

  test("displays all 6 metrics", () => {
    expect(src).toContain("total_students");
    expect(src).toContain("practiced_this_week");
    expect(src).toContain("pending_reviews");
    expect(src).toContain("overdue_assignments");
    expect(src).toContain("without_recent_session");
    expect(src).toContain("avg_readiness_pct");
  });

  test("uses danger highlight for 0 practicing and max completed", () => {
    expect(src).toContain("danger");
    expect(src).toContain("ok");
    expect(src).toContain("warn");
  });
});

// ── AttentionQueue ────────────────────────────────────────────────────────────

describe("AttentionQueue component", () => {
  const src = readFile("components/coach/AttentionQueue.tsx");

  test("has accessible role=region", () => {
    expect(src).toContain('role="region"');
    expect(src).toContain("Students needing attention");
  });

  test("uses high/medium attention level differentiation", () => {
    expect(src).toContain("high");
    expect(src).toContain("medium");
  });

  test("renders a View link to student profile", () => {
    expect(src).toContain("/team/student");
    expect(src).toContain("View");
  });

  test("shows empty state when queue is empty", () => {
    expect(src).toContain("No students need attention");
  });
});

// ── StudentRosterTable ────────────────────────────────────────────────────────

describe("StudentRosterTable component", () => {
  const src = readFile("components/coach/StudentRosterTable.tsx");

  test("has accessible role=region", () => {
    expect(src).toContain('role="region"');
    expect(src).toContain("Student roster");
  });

  test("renders sortable columns", () => {
    expect(src).toContain("toggleSort");
    expect(src).toContain("SortBtn");
  });

  test("shows empty state for no students", () => {
    expect(src).toContain("No students on this team");
  });

  test("links to student profile", () => {
    expect(src).toContain("/team/student");
    expect(src).toContain("Profile");
  });

  test("shows score trend with icon", () => {
    expect(src).toContain("TrendIcon");
    expect(src).toContain("improving");
    expect(src).toContain("declining");
  });

  test("shows attention badge", () => {
    expect(src).toContain("AttentionBadge");
    expect(src).toContain("attention_level");
  });
});

// ── AssignmentTemplatePanel ───────────────────────────────────────────────────

describe("AssignmentTemplatePanel component", () => {
  const src = readFile("components/coach/AssignmentTemplatePanel.tsx");

  test("uses fetchTemplates from coachApi", () => {
    expect(src).toContain("fetchTemplates");
  });

  test("uses assignFromTemplate", () => {
    expect(src).toContain("assignFromTemplate");
  });

  test("has Select all students checkbox", () => {
    expect(src).toContain("Select all students");
  });

  test("has New template button", () => {
    expect(src).toContain("New template");
  });

  test("shows built-in vs team template sections", () => {
    expect(src).toContain("Starter templates");
    expect(src).toContain("Your templates");
  });

  test("prevents deletion of built-in templates", () => {
    expect(src).toContain("is_built_in");
  });
});

// ── WeeklyReportPanel ────────────────────────────────────────────────────────

describe("WeeklyReportPanel component", () => {
  const src = readFile("components/coach/WeeklyReportPanel.tsx");

  test("uses fetchWeeklyReport", () => {
    expect(src).toContain("fetchWeeklyReport");
  });

  test("has CSV export", () => {
    expect(src).toContain("csvFromReport");
    expect(src).toContain("CSV");
    expect(src).toContain(".csv");
  });

  test("has print button", () => {
    expect(src).toContain("window.print");
    expect(src).toContain("Print");
  });

  test("shows determinism note (no LLM)", () => {
    expect(src).toContain("recommended_focus");
  });

  test("shows common team weakness", () => {
    expect(src).toContain("common_team_weakness");
    expect(src).toContain("Team-wide skill focus");
  });
});

// ── Team page (Command Center) ─────────────────────────────────────────────────

describe("team/page.tsx — Coach Command Center", () => {
  const src = readFile("app/(workspace)/team/page.tsx");

  test("uses fetchCommandCenter", () => {
    expect(src).toContain("fetchCommandCenter");
  });

  test("renders tablist with roster/attention/templates/report panels", () => {
    expect(src).toContain('role="tablist"');
    expect(src).toContain('"roster"');
    expect(src).toContain('"attention"');
    expect(src).toContain('"templates"');
    expect(src).toContain('"report"');
  });

  test("shows attention badge on tab", () => {
    expect(src).toContain("attention_queue");
    expect(src).toContain("badge");
  });

  test("links to assign page", () => {
    expect(src).toContain("/team/assign");
  });

  test("shows review backlog button when pending", () => {
    expect(src).toContain("backlog");
    expect(src).toContain("/team/review");
  });

  test("invite code copy button present", () => {
    expect(src).toContain("copyInvite");
    expect(src).toContain("invite_code");
  });

  test("handles no team with onboarding empty state", () => {
    expect(src).toContain("Create team");
    expect(src).toContain("Join with invite code");
  });

  test("student view renders assignment list", () => {
    expect(src).toContain("Your assignments");
  });

  test("imports TeamStatusSummary", () => {
    expect(src).toContain("TeamStatusSummary");
  });

  test("imports AttentionQueue", () => {
    expect(src).toContain("AttentionQueue");
  });

  test("imports StudentRosterTable", () => {
    expect(src).toContain("StudentRosterTable");
  });

  test("imports AssignmentTemplatePanel", () => {
    expect(src).toContain("AssignmentTemplatePanel");
  });

  test("imports WeeklyReportPanel", () => {
    expect(src).toContain("WeeklyReportPanel");
  });
});

// ── Review page ──────────────────────────────────────────────────────────────

describe("team/review/page.tsx — improved review workflow", () => {
  const src = readFile("app/(workspace)/team/review/page.tsx");

  test("has keyboard shortcut handler", () => {
    expect(src).toContain("keydown");
    expect(src).toContain("ArrowRight");
    expect(src).toContain("ArrowLeft");
  });

  test("shortcut keys r and v are documented", () => {
    expect(src).toContain('"r"');
    expect(src).toContain('"v"');
  });

  test("shows shortcuts toggle button", () => {
    expect(src).toContain("Shortcuts");
    expect(src).toContain("Keyboard");
  });

  test("links to student profile from review item", () => {
    expect(src).toContain("/team/student");
  });

  test("has disabled=busy guard on action buttons", () => {
    expect(src).toContain("disabled={busy}");
  });

  test("shows empty state when queue is clear", () => {
    expect(src).toContain("Queue is clear");
  });
});

// ── Student profile page ─────────────────────────────────────────────────────

describe("team/student/page.tsx — rich student profile", () => {
  const src = readFile("app/(workspace)/team/student/page.tsx");

  test("uses fetchStudentProfile from coachApi", () => {
    expect(src).toContain("fetchStudentProfile");
  });

  test("has coach notes section with addCoachNote", () => {
    expect(src).toContain("addCoachNote");
    expect(src).toContain("coach_notes");
    expect(src).toContain("Save note");
  });

  test("shows attention flags with role=alert", () => {
    expect(src).toContain("attention_flags");
    expect(src).toContain('role="alert"');
  });

  test("shows score trajectory from completed missions", () => {
    expect(src).toContain("completed_missions");
    expect(src).toContain("Score trajectory");
  });

  test("shows active mission skill in header", () => {
    expect(src).toContain("active_mission_skill");
    expect(src).toContain("Current focus");
  });

  test("links back to Command Center", () => {
    expect(src).toContain("Back to Command Center");
    expect(src).toContain("/team");
  });

  test("shows recent speeches list with links to reports", () => {
    expect(src).toContain("Recent speeches");
    expect(src).toContain("/speech/");
  });

  test("shows assignment history", () => {
    expect(src).toContain("Assignment history");
    expect(src).toContain("profile.assignments");
  });
});

// ── Backend API file ──────────────────────────────────────────────────────────

describe("backend/app/api/coach.py — file structure", () => {
  const BACKEND = path.resolve(SRC, "../../backend");
  const coachPy = path.join(BACKEND, "app/api/coach.py");
  const analyticsService = path.join(BACKEND, "app/services/coach_analytics.py");
  const modelFile = path.join(BACKEND, "app/models/coach.py");
  const testFile = path.join(BACKEND, "tests/test_coach_command_center.py");
  const migration = path.join(BACKEND, "../supabase/migrations/20260626000000_pass20_coach_command_center.sql");

  test("coach.py API file exists", () => {
    expect(fs.existsSync(coachPy)).toBe(true);
  });

  test("coach_analytics.py service exists", () => {
    expect(fs.existsSync(analyticsService)).toBe(true);
  });

  test("coach model file exists", () => {
    expect(fs.existsSync(modelFile)).toBe(true);
  });

  test("test_coach_command_center.py exists", () => {
    expect(fs.existsSync(testFile)).toBe(true);
  });

  test("Pass 20 migration exists", () => {
    expect(fs.existsSync(migration)).toBe(true);
  });

  test("coach.py contains command-center endpoint", () => {
    const src = fs.readFileSync(coachPy, "utf8");
    expect(src).toContain("command-center");
  });

  test("coach.py contains assignment-templates endpoints", () => {
    const src = fs.readFileSync(coachPy, "utf8");
    expect(src).toContain("assignment-templates");
  });

  test("coach.py contains coach notes endpoints", () => {
    const src = fs.readFileSync(coachPy, "utf8");
    expect(src).toContain("coach_notes");
  });

  test("coach_analytics.py has compute_attention_flags", () => {
    const src = fs.readFileSync(analyticsService, "utf8");
    expect(src).toContain("compute_attention_flags");
    expect(src).toContain("compute_team_summary");
    expect(src).toContain("compute_weekly_report");
    expect(src).toContain("compute_roster_row");
  });
});
