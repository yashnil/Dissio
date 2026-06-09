"use client";

/**
 * ConfusionReport — tiny "Report confusing output" control for AI output surfaces.
 * Not visually prominent. Opens inline when clicked, submits to /output-feedback.
 * Used on: speech report, drill feedback, evidence support check.
 */

import { useState } from "react";
import { Flag, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import type { OutputFeedbackCategory, OutputFeedbackTargetType } from "@/types";

const CATEGORIES: Array<{ value: OutputFeedbackCategory; label: string }> = [
  { value: "incorrect_issue",    label: "Incorrect issue flagged" },
  { value: "generic_feedback",   label: "Feedback too generic" },
  { value: "evidence_mismatch",  label: "Evidence mismatch" },
  { value: "confusing_wording",  label: "Confusing wording" },
  { value: "technical_bug",      label: "Technical bug" },
  { value: "other",              label: "Other" },
];

interface Props {
  targetType: OutputFeedbackTargetType;
  targetId?: string | null;
  userId: string;
}

export default function ConfusionReport({ targetType, targetId, userId }: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<OutputFeedbackCategory | "">("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category || submitting) return;
    setSubmitting(true);
    setErr("");
    try {
      const { apiFetch } = await import("@/lib/api");
      await apiFetch(`/output-feedback?user_id=${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId ?? undefined,
          category,
          comment: comment || undefined,
        }),
      });
      setSubmitted(true);
    } catch {
      setErr("Could not submit. Try again.");
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-ink-faint">
        <CheckCircle2 size={10} className="text-ok" />
        Reported — thanks for the pilot feedback.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-fit items-center gap-1 text-[10px] text-ink-faint transition-colors hover:text-ink-subtle"
      >
        <Flag size={9} />
        Report confusing output
        {open ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
      </button>

      {open && (
        <form
          onSubmit={submit}
          className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-2 p-3"
        >
          <p className="text-[10px] font-medium text-ink-subtle">What was the issue?</p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={[
                  "rounded-full border px-2 py-0.5 text-[10px] transition-all",
                  category === value
                    ? "border-lav/40 bg-lav/10 text-lav"
                    : "border-hairline text-ink-faint hover:border-lav/20 hover:text-ink-subtle",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional: describe what was wrong (pilot notes)"
            rows={2}
            className="w-full resize-none rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 text-[10px] text-ink placeholder:text-ink-faint focus:border-lav/40 focus:outline-none"
          />

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={!category || submitting}
              className="rounded-md border border-hairline bg-surface-1 px-3 py-1 text-[10px] font-medium text-ink-subtle transition-colors hover:border-lav/30 hover:text-ink disabled:opacity-40"
            >
              {submitting ? "Sending…" : "Submit"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10px] text-ink-faint hover:text-ink-subtle"
            >
              Cancel
            </button>
          </div>

          {err && <p className="text-[10px] text-danger">{err}</p>}
        </form>
      )}
    </div>
  );
}
