/**
 * Coach Command Center API wrappers.
 * All requests are authenticated via the Supabase JWT (set by apiFetch).
 */

import { apiFetch } from "@/lib/api";
import type {
  CommandCenterData, WeeklyReport, UsageSummary,
  AssignmentTemplate, CoachNote, RichStudentProfile,
} from "@/types/coach";

export function fetchCommandCenter(teamId: string): Promise<CommandCenterData> {
  return apiFetch<CommandCenterData>(`/teams/${teamId}/command-center`);
}

export function fetchWeeklyReport(teamId: string): Promise<WeeklyReport> {
  return apiFetch<WeeklyReport>(`/teams/${teamId}/weekly-report`);
}

export function fetchUsageSummary(teamId: string): Promise<UsageSummary> {
  return apiFetch<UsageSummary>(`/teams/${teamId}/usage-summary`);
}

export function fetchTemplates(teamId?: string): Promise<AssignmentTemplate[]> {
  const qs = teamId ? `?team_id=${teamId}` : "";
  return apiFetch<AssignmentTemplate[]>(`/assignment-templates${qs}`);
}

export function createTemplate(
  data: Omit<AssignmentTemplate, "id" | "is_built_in" | "created_at" | "created_by">,
): Promise<AssignmentTemplate> {
  return apiFetch<AssignmentTemplate>("/assignment-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteTemplate(templateId: string): Promise<void> {
  return apiFetch<void>(`/assignment-templates/${templateId}`, { method: "DELETE" });
}

export function assignFromTemplate(
  templateId: string,
  teamId: string,
  recipientIds: string[],
  dueDate?: string,
): Promise<{ assignment_id: string; title: string; recipient_count: number }> {
  return apiFetch(`/assignment-templates/${templateId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ team_id: teamId, recipient_user_ids: recipientIds, due_date: dueDate ?? null }),
  });
}

export function fetchStudentProfile(teamId: string, studentId: string): Promise<RichStudentProfile> {
  return apiFetch<RichStudentProfile>(`/teams/${teamId}/students/${studentId}/profile`);
}

export function fetchCoachNotes(teamId: string, studentId: string): Promise<CoachNote[]> {
  return apiFetch<CoachNote[]>(`/teams/${teamId}/students/${studentId}/notes`);
}

export function addCoachNote(teamId: string, studentId: string, note: string): Promise<CoachNote> {
  return apiFetch<CoachNote>(`/teams/${teamId}/students/${studentId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
}
