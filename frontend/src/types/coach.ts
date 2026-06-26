/** Coach Command Center types (Pass 20). */

export interface AttentionFlag {
  rule: string;
  reason: string;
  link: string;
}

export interface RosterRow {
  user_id: string;
  display_name: string | null;
  last_practice_at: string | null;
  days_inactive: number | null;
  speech_count: number;
  active_mission_skill: string | null;
  active_mission_status: string | null;
  active_mission_id: string | null;
  priority_skill: string | null;
  score_trend: "improving" | "declining" | "steady" | "insufficient";
  top_assignment_status: string | null;
  drill_attempts_count: number;
  drills_assigned_count: number;
  attention_level: "none" | "medium" | "high";
  attention_flags: AttentionFlag[];
}

export interface TeamSummary {
  total_students: number;
  practiced_this_week: number;
  practiced_this_month: number;
  without_recent_session: number;
  pending_reviews: number;
  overdue_assignments: number;
  avg_readiness_pct: number | null;
}

export interface CommandCenterData {
  team_id: string;
  team_name: string;
  invite_code: string;
  summary: TeamSummary;
  roster: RosterRow[];
  attention_queue: RosterRow[];
  onboarding_done: boolean;
}

export interface WeeklyReportRosterItem {
  user_id: string;
  display_name: string | null;
  speeches_this_week: number;
  drills_this_week: number;
  active_mission_skill: string | null;
}

export interface WeeklyReport {
  period_start: string;
  period_end: string;
  students_participated: number;
  total_students: number;
  speeches_analyzed: number;
  drills_completed: number;
  assignments_completed: number;
  students_improving: number;
  students_needing_attention: number;
  common_team_weakness: string | null;
  recommended_focus: string;
  roster: WeeklyReportRosterItem[];
}

export interface UsageSummary {
  team_id: string;
  active_seats: number;
  speeches_analyzed: number;
  evidence_searches: number;
  drills_completed: number;
  assignments_created: number;
  storage_used_mb: number;
}

export interface AssignmentTemplate {
  id: string;
  team_id: string | null;
  created_by: string | null;
  title: string;
  description: string | null;
  kind: "speech" | "drill" | "rerecord";
  speech_type: string | null;
  target_skill: string | null;
  success_criteria: string[];
  goal: string | null;
  duration_minutes: number | null;
  due_offset_days: number;
  is_built_in: boolean;
  created_at: string | null;
}

export interface CoachNote {
  id: string;
  team_id: string;
  coach_id: string;
  student_id: string;
  note: string;
  created_at: string;
}

export interface RichStudentProfile {
  student_id: string;
  display_name: string | null;
  speech_count: number;
  feedback_ready_count: number;
  speeches: Array<{
    id: string;
    title: string;
    speech_type: string;
    status: string;
    created_at: string;
  }>;
  assignments: Array<{
    recipient_id: string;
    title: string;
    status: string;
    submission_speech_id: string | null;
    coach_feedback: string | null;
    reviewed_at: string | null;
  }>;
  active_mission: Record<string, unknown> | null;
  completed_missions: Array<Record<string, unknown>>;
  drill_attempts_count: number;
  drills_assigned_count: number;
  coach_notes: CoachNote[];
  attention_flags: AttentionFlag[];
  roster_row: RosterRow | null;
}

export const SKILL_LABEL: Record<string, string> = {
  weighing: "Weighing",
  extensions: "Extensions",
  drops: "Drops",
  clash: "Clash",
  judge_adaptation: "Judge Adapt.",
  delivery: "Delivery",
  warranting: "Warranting",
  evidence_use: "Evidence",
  organization: "Organization",
};

export const TREND_LABEL: Record<string, string> = {
  improving: "Improving",
  declining: "Declining",
  steady: "Steady",
  insufficient: "New",
};

export const TREND_COLOR: Record<string, string> = {
  improving: "text-ok",
  declining: "text-danger",
  steady: "text-ink-subtle",
  insufficient: "text-ink-subtle",
};
