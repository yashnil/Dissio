"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Clock, Target, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchTemplates, deleteTemplate, assignFromTemplate } from "@/lib/coachApi";
import type { AssignmentTemplate } from "@/types/coach";
import { SKILL_LABEL } from "@/types/coach";

interface Props {
  teamId: string;
  students: Array<{ user_id: string; display_name: string | null }>;
  onAssigned?: (assignmentId: string, title: string) => void;
}

const KIND_LABEL: Record<string, string> = {
  speech: "Speech", drill: "Drill", rerecord: "Re-record",
};

export default function AssignmentTemplatePanel({ teamId, students, onAssigned }: Props) {
  const [templates, setTemplates] = useState<AssignmentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AssignmentTemplate | null>(null);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignErr, setAssignErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetchTemplates(teamId)
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teamId]);

  const builtIns = templates.filter((t) => t.is_built_in);
  const teamTemplates = templates.filter((t) => !t.is_built_in);

  async function handleAssign() {
    if (!selected || recipientIds.length === 0) {
      setAssignErr("Select at least one student.");
      return;
    }
    setAssigning(true);
    setAssignErr("");
    try {
      const result = await assignFromTemplate(selected.id, teamId, recipientIds);
      setSuccessMsg(`Assigned "${result.title}" to ${result.recipient_count} student${result.recipient_count !== 1 ? "s" : ""}.`);
      setSelected(null);
      setRecipientIds([]);
      onAssigned?.(result.assignment_id, result.title);
    } catch {
      setAssignErr("Failed to create assignment. Try again.");
    } finally {
      setAssigning(false);
    }
  }

  async function handleDelete(t: AssignmentTemplate) {
    if (!confirm(`Delete template "${t.title}"?`)) return;
    try {
      await deleteTemplate(t.id);
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    } catch {
      alert("Could not delete template.");
    }
  }

  function toggleRecipient(uid: string) {
    setRecipientIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid],
    );
  }

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading templates">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
    );
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => { setSelected(null); setRecipientIds([]); setAssignErr(""); }}
          className="text-[12px] text-ink-subtle hover:text-ink flex items-center gap-1"
        >
          ← Back to templates
        </button>

        <div className="rounded-xl border border-hairline bg-surface-2 p-4 space-y-1">
          <p className="text-[13px] font-semibold text-ink">{selected.title}</p>
          {selected.description && <p className="text-[12px] text-ink-subtle">{selected.description}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-semibold text-ink-subtle">
              {KIND_LABEL[selected.kind] ?? selected.kind}
            </span>
            {selected.target_skill && (
              <span className="rounded-full border border-lav/30 bg-lav/10 px-2 py-0.5 text-[10px] font-semibold text-lav">
                {SKILL_LABEL[selected.target_skill] ?? selected.target_skill}
              </span>
            )}
            {selected.duration_minutes && (
              <span className="flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-subtle">
                <Clock size={9} aria-hidden /> {selected.duration_minutes} min
              </span>
            )}
          </div>
          {selected.success_criteria.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {selected.success_criteria.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[12px] text-ink-subtle">
                  <span className="mt-0.5 text-ok shrink-0">✓</span>{c}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Assign to</p>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-lav"
                checked={recipientIds.length === students.length && students.length > 0}
                onChange={(e) => setRecipientIds(e.target.checked ? students.map((s) => s.user_id) : [])}
                aria-label="Select all students"
              />
              <span className="text-[12px] font-medium text-ink">All students ({students.length})</span>
            </label>
            {students.map((s) => (
              <label key={s.user_id} className="flex items-center gap-2 cursor-pointer ml-4">
                <input
                  type="checkbox"
                  className="accent-lav"
                  checked={recipientIds.includes(s.user_id)}
                  onChange={() => toggleRecipient(s.user_id)}
                  aria-label={`Select ${s.display_name ?? "student"}`}
                />
                <span className="text-[12px] text-ink-subtle">{s.display_name ?? "Student"}</span>
              </label>
            ))}
          </div>
        </div>

        {assignErr && <p className="text-[12px] text-danger">{assignErr}</p>}
        {successMsg && <p className="text-[12px] text-ok">{successMsg}</p>}

        <Button
          onClick={handleAssign}
          disabled={assigning || recipientIds.length === 0}
          className="w-full"
          size="sm"
        >
          {assigning ? "Assigning…" : `Assign to ${recipientIds.length || "…"} student${recipientIds.length !== 1 ? "s" : ""}`}
        </Button>
      </div>
    );
  }

  const TemplateRow = ({ t }: { t: AssignmentTemplate }) => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => { setSelected(t); setSuccessMsg(""); }}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-hairline bg-surface-1 px-3 py-2.5 text-left hover:bg-surface-2 hover:border-lav/30 transition-all focus-visible:outline-2 focus-visible:outline-lav"
        aria-label={`Use template: ${t.title}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13px] font-medium text-ink">{t.title}</span>
            {t.target_skill && (
              <span className="shrink-0 rounded-full border border-lav/30 bg-lav/10 px-1.5 py-0.5 text-[9px] font-semibold text-lav">
                {SKILL_LABEL[t.target_skill] ?? t.target_skill}
              </span>
            )}
          </div>
          {t.description && (
            <p className="mt-0.5 truncate text-[11px] text-ink-subtle">{t.description}</p>
          )}
        </div>
        <ChevronRight size={14} className="shrink-0 text-ink-subtle/50 group-hover:text-ink-subtle" aria-hidden />
      </button>
      {!t.is_built_in && (
        <button
          onClick={() => handleDelete(t)}
          className="shrink-0 rounded-lg p-1.5 text-ink-subtle/50 hover:text-danger focus-visible:outline-2 focus-visible:outline-danger"
          aria-label={`Delete template ${t.title}`}
        >
          <Trash2 size={13} aria-hidden />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {successMsg && (
        <div className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-[12px] text-ok">
          {successMsg}
        </div>
      )}

      {teamTemplates.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">Your templates</p>
          {teamTemplates.map((t) => <TemplateRow key={t.id} t={t} />)}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">Starter templates</p>
        {builtIns.map((t) => <TemplateRow key={t.id} t={t} />)}
      </div>

      <button
        onClick={() => setShowCreate(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-hairline py-2 text-[12px] text-ink-subtle hover:border-lav/50 hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-lav"
        aria-label="Create new template"
      >
        <Plus size={13} aria-hidden /> New template
      </button>
    </div>
  );
}
