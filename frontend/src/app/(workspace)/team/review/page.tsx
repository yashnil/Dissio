"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Check,
  RotateCcw, ExternalLink, Inbox, Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase";
import { fetchReviewQueue, reviewAssignment } from "@/lib/assignments";
import type { ReviewQueueItem } from "@/types";

/**
 * Coach review queue.
 *
 * Keyboard shortcuts (when not focused in the textarea):
 *   →  /  ]  →  next student
 *   ←  /  [  →  previous student
 *   r        →  mark reviewed
 *   v        →  request revision
 */
export default function ReviewQueuePage() {
  const router = useRouter();
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const tid = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("team") : null;
    setTeamId(tid);
    createClient()
      .auth.getUser()
      .then(async ({ data }) => {
        if (!data.user) { router.replace("/login"); return; }
        if (!tid) { setErr("No team selected."); return; }
        const q = await fetchReviewQueue(tid);
        setQueue(q);
      })
      .catch(() => setErr("Could not load the review queue. You may not have coach access."))
      .finally(() => setLoading(false));
  }, [router]);

  const item = queue[active];

  const act = useCallback(async (action: "reviewed" | "revision_requested") => {
    if (!item) return;
    setBusy(true);
    try {
      await reviewAssignment(item.recipient_id, action, feedback || undefined);
      setQueue((q) => {
        const next = q.filter((_, i) => i !== active);
        return next;
      });
      setActive((a) => Math.min(a, Math.max(0, queue.length - 2)));
      setFeedback("");
    } catch {
      setErr("Could not save your review. Try again.");
    } finally {
      setBusy(false);
    }
  }, [item, active, feedback, queue.length]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inTextarea = document.activeElement === textareaRef.current;
      if (inTextarea) return;
      if (e.key === "ArrowRight" || e.key === "]") {
        setActive((a) => Math.min(queue.length - 1, a + 1));
      } else if (e.key === "ArrowLeft" || e.key === "[") {
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
        if (!busy && item) act("reviewed");
      } else if (e.key === "v" && !e.metaKey && !e.ctrlKey) {
        if (!busy && item) act("revision_requested");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue.length, busy, item, act]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href={teamId ? `/team?team=${teamId}` : "/team"}
            className="flex w-fit items-center gap-1 text-[12px] text-ink-subtle transition-colors hover:text-ink"
          >
            <ArrowLeft size={12} aria-hidden /> Back to team
          </Link>
          <h1 className="text-xl font-bold text-ink">Review queue</h1>
          <p className="text-[12px] text-ink-subtle">
            Submitted speeches waiting on your feedback.
          </p>
        </div>
        <button
          onClick={() => setShowShortcuts((s) => !s)}
          className="mt-1 flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[11px] text-ink-subtle hover:text-ink"
          aria-label="Toggle keyboard shortcuts"
        >
          <Keyboard size={12} aria-hidden /> Shortcuts
        </button>
      </div>

      {/* Keyboard hint */}
      {showShortcuts && (
        <div className="rounded-xl border border-hairline bg-surface-2 px-4 py-3 text-[12px]">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-ink-subtle">
            <span><kbd className="rounded border border-hairline px-1 font-mono text-[10px]">→</kbd> or <kbd className="rounded border border-hairline px-1 font-mono text-[10px]">]</kbd> — Next student</span>
            <span><kbd className="rounded border border-hairline px-1 font-mono text-[10px]">←</kbd> or <kbd className="rounded border border-hairline px-1 font-mono text-[10px]">[</kbd> — Previous student</span>
            <span><kbd className="rounded border border-hairline px-1 font-mono text-[10px]">r</kbd> — Mark reviewed</span>
            <span><kbd className="rounded border border-hairline px-1 font-mono text-[10px]">v</kbd> — Request revision</span>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-subtle/70">Shortcuts disabled while typing in the feedback field.</p>
        </div>
      )}

      {loading ? (
        <Skeleton className="h-56 w-full rounded-xl" />
      ) : err ? (
        <p className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger">{err}</p>
      ) : queue.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-hairline bg-surface-1 px-6 py-14 text-center">
          <Inbox size={28} className="text-ink-faint" aria-hidden />
          <p className="text-[13px] font-semibold text-ink">Queue is clear</p>
          <p className="max-w-xs text-[12px] text-ink-subtle">
            No submissions are waiting for review. Students{"’"} work appears here automatically once analysis completes.
          </p>
          <Link href={teamId ? `/team?team=${teamId}` : "/team"} className="mt-2 text-[12px] text-lav hover:underline">
            Return to Command Center
          </Link>
        </div>
      ) : item ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface-1 p-5">
          {/* Position + nav */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-ink-faint tabular-nums">
              {active + 1} of {queue.length} submission{queue.length !== 1 ? "s" : ""}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setActive((a) => Math.max(0, a - 1))}
                disabled={active === 0}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline text-ink-subtle transition-colors hover:text-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-lav"
                aria-label="Previous submission"
              >
                <ChevronLeft size={14} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setActive((a) => Math.min(queue.length - 1, a + 1))}
                disabled={active >= queue.length - 1}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline text-ink-subtle transition-colors hover:text-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-lav"
                aria-label="Next submission"
              >
                <ChevronRight size={14} aria-hidden />
              </button>
            </div>
          </div>

          {/* Student + assignment context */}
          <div className="flex flex-col gap-1">
            <p className="text-[16px] font-semibold text-ink">
              {item.student_name || `Student ${item.student_id.slice(0, 6)}`}
            </p>
            <p className="text-[13px] text-ink-subtle">{item.assignment_title}</p>
            {item.submitted_at && (
              <p className="text-[11px] text-ink-faint">
                Submitted {new Date(item.submitted_at).toLocaleDateString(undefined, {
                  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                })}
              </p>
            )}
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-2">
            {item.submission_speech_id && (
              <Link
                href={`/speech/${item.submission_speech_id}`}
                className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-surface-3"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={12} aria-hidden /> Open speech report
              </Link>
            )}
            <Link
              href={`/team/student?team=${teamId}&student=${item.student_id}`}
              className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-surface-3"
            >
              Student profile
            </Link>
          </div>

          {/* Feedback */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="coach-fb" className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              Coach annotation
            </label>
            <textarea
              id="coach-fb"
              ref={textareaRef}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What landed well, the one thing to improve, and the next rep to run…"
              className="h-28 w-full resize-none rounded-xl border border-hairline bg-surface-2 px-3 py-2.5 text-[13px] text-ink outline-none focus-visible:border-lav/50 focus-visible:ring-2 focus-visible:ring-lav/20"
            />
            <p className="text-[11px] text-ink-subtle/60">
              Sent to the student. Be specific and constructive.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => act("reviewed")}
              disabled={busy}
              className="gap-1.5"
            >
              <Check size={13} aria-hidden /> Mark reviewed
              <kbd className="ml-1 rounded border border-white/20 px-1 font-mono text-[10px] opacity-70">r</kbd>
            </Button>
            <Button
              onClick={() => act("revision_requested")}
              disabled={busy}
              variant="secondary"
              className="gap-1.5"
            >
              <RotateCcw size={13} aria-hidden /> Request revision
              <kbd className="ml-1 rounded border border-hairline px-1 font-mono text-[10px] opacity-60">v</kbd>
            </Button>
            {active < queue.length - 1 && (
              <Button
                onClick={() => setActive((a) => a + 1)}
                variant="secondary"
                className="ml-auto gap-1.5 text-ink-subtle"
              >
                Skip <ArrowRight size={13} aria-hidden />
                <kbd className="rounded border border-hairline px-1 font-mono text-[10px] opacity-60">→</kbd>
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
