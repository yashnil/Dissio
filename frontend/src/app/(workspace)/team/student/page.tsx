"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Mic, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase";
import { fetchStudentProfile, addCoachNote } from "@/lib/coachApi";
import { SKILL_LABEL, TREND_COLOR } from "@/types/coach";
import type { RichStudentProfile, AttentionFlag } from "@/types/coach";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "improving") return <TrendingUp size={13} className="text-ok" aria-hidden />;
  if (trend === "declining") return <TrendingDown size={13} className="text-danger" aria-hidden />;
  return <Minus size={13} className="text-ink-subtle/50" aria-hidden />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{title}</p>
      {children}
    </div>
  );
}

export default function StudentProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<RichStudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteErr, setNoteErr] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const tid = params?.get("team");
    const sid = params?.get("student");
    setTeamId(tid ?? null);
    setStudentId(sid ?? null);

    createClient()
      .auth.getUser()
      .then(async ({ data }) => {
        if (!data.user) { router.replace("/login"); return; }
        if (!tid || !sid) { setErr("Missing team or student parameter."); return; }
        const p = await fetchStudentProfile(tid, sid);
        setProfile(p);
      })
      .catch(() => setErr("Could not load student profile. You may not have coach access."))
      .finally(() => setLoading(false));
  }, [router]);

  async function saveNote() {
    if (!teamId || !studentId || !note.trim()) return;
    setSavingNote(true);
    setNoteErr("");
    try {
      const saved = await addCoachNote(teamId, studentId, note.trim());
      setProfile((prev) =>
        prev ? { ...prev, coach_notes: [saved, ...prev.coach_notes] } : prev,
      );
      setNote("");
    } catch {
      setNoteErr("Failed to save note.");
    } finally {
      setSavingNote(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  if (err || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/team" className="text-[12px] text-ink-subtle hover:text-ink flex items-center gap-1 mb-4">
          <ArrowLeft size={12} aria-hidden /> Back
        </Link>
        <p className="text-[13px] text-danger">{err || "Student not found."}</p>
      </div>
    );
  }

  const rosterRow = profile.roster_row;
  const trend = rosterRow?.score_trend ?? "insufficient";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-8">
      <Link
        href={teamId ? `/team?team=${teamId}` : "/team"}
        className="flex w-fit items-center gap-1 text-[12px] text-ink-subtle hover:text-ink"
      >
        <ArrowLeft size={12} aria-hidden /> Back to Command Center
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">{profile.display_name ?? "Student"}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-ink-subtle">
            <span>{profile.speech_count} speeches</span>
            <span aria-hidden>·</span>
            <span>{profile.drill_attempts_count} drill attempts</span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1">
              <TrendIcon trend={trend} />
              <span className={TREND_COLOR[trend] ?? "text-ink-subtle"}>
                {trend === "insufficient" ? "New student" : trend}
              </span>
            </span>
          </div>
        </div>
        {rosterRow?.active_mission_skill && (
          <div className="rounded-xl border border-lav/30 bg-lav/5 px-4 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-lav">Current focus</p>
            <p className="text-[13px] font-medium text-ink mt-0.5">
              {SKILL_LABEL[rosterRow.active_mission_skill] ?? rosterRow.active_mission_skill}
            </p>
            <p className="text-[11px] text-ink-subtle capitalize">
              Mission {rosterRow.active_mission_status}
            </p>
          </div>
        )}
      </div>

      {/* Attention flags */}
      {profile.attention_flags.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 space-y-1.5" role="alert">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-warn">
            <AlertTriangle size={12} aria-hidden /> Needs attention
          </div>
          {profile.attention_flags.map((f: AttentionFlag) => (
            <p key={f.rule} className="text-[12px] text-ink-subtle">{f.reason}</p>
          ))}
        </div>
      )}

      {/* Completed missions / score trajectory */}
      {profile.completed_missions.length > 0 && (
        <Section title="Score trajectory">
          <div className="space-y-1.5" role="list">
            {profile.completed_missions.slice(0, 5).map((m: Record<string, unknown>, i) => {
              const delta = m.score_delta as Record<string, number> | null;
              const vals = delta ? Object.values(delta) : [];
              const avgDelta = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
              return (
                <div
                  key={String(m.id || i)}
                  className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-1 px-3 py-2"
                  role="listitem"
                >
                  <span className="flex-1 text-[12px] font-medium text-ink">
                    {SKILL_LABEL[String(m.skill)] ?? String(m.skill)}
                  </span>
                  <span className="text-[11px] text-ink-subtle">{fmtDate(String(m.completed_at))}</span>
                  {avgDelta !== null && (
                    <span className={`text-[12px] font-semibold tabular-nums ${avgDelta > 0 ? "text-ok" : avgDelta < 0 ? "text-danger" : "text-ink-subtle"}`}>
                      {avgDelta > 0 ? "+" : ""}{avgDelta.toFixed(1)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Assignments */}
      {profile.assignments.length > 0 && (
        <Section title="Assignment history">
          <div className="space-y-1.5" role="list">
            {profile.assignments.map((a) => (
              <div
                key={a.recipient_id}
                className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-1 px-3 py-2"
                role="listitem"
              >
                <span className="flex-1 truncate text-[12px] font-medium text-ink">{a.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                  a.status === "reviewed"
                    ? "border-ok/30 bg-ok/10 text-ok"
                    : a.status === "revision_requested"
                    ? "border-danger/30 bg-danger/10 text-danger"
                    : a.status === "ready_for_review"
                    ? "border-warn/30 bg-warn/10 text-warn"
                    : "border-hairline bg-surface-2 text-ink-subtle"
                }`}>
                  {a.status}
                </span>
                {a.submission_speech_id && (
                  <Link
                    href={`/speech/${a.submission_speech_id}`}
                    className="shrink-0 text-[11px] text-lav hover:underline"
                  >
                    Report
                  </Link>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recent speeches */}
      {profile.speeches.length > 0 && (
        <Section title="Recent speeches">
          <div className="space-y-1.5" role="list">
            {profile.speeches.slice(0, 6).map((s) => (
              <Link
                key={s.id}
                href={`/speech/${s.id}`}
                className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-1 px-3 py-2 hover:bg-surface-2 transition-colors"
                role="listitem"
              >
                <Mic size={13} className="shrink-0 text-ink-subtle/60" aria-hidden />
                <span className="flex-1 truncate text-[12px] font-medium text-ink">
                  {s.title || s.speech_type || "Speech"}
                </span>
                <span className={`shrink-0 text-[10px] font-medium ${
                  s.status === "done" ? "text-ok" : s.status === "error" ? "text-danger" : "text-ink-subtle"
                }`}>
                  {s.status === "done" ? "Analyzed" : s.status}
                </span>
                <span className="shrink-0 text-[11px] text-ink-subtle">{fmtDate(s.created_at)}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* Coach notes */}
      <Section title="Coach notes">
        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <textarea
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Private note about this student…"
              className="h-20 w-full resize-none rounded-xl border border-hairline bg-surface-2 px-3 py-2.5 text-[13px] text-ink outline-none focus-visible:border-lav/50 focus-visible:ring-2 focus-visible:ring-lav/20"
              aria-label="Coach note"
            />
            {noteErr && <p className="text-[12px] text-danger">{noteErr}</p>}
            <Button
              size="sm"
              onClick={saveNote}
              disabled={savingNote || !note.trim()}
              className="self-end"
            >
              <Plus size={13} className="mr-1" aria-hidden /> Save note
            </Button>
          </div>
          {profile.coach_notes.length > 0 ? (
            <div className="space-y-2" role="list" aria-label="Coach notes">
              {profile.coach_notes.map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl border border-hairline bg-surface-1 px-3 py-2.5"
                  role="listitem"
                >
                  <p className="text-[12px] text-ink">{n.note}</p>
                  <p className="mt-1 text-[10px] text-ink-subtle">{fmtDate(n.created_at)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-ink-subtle/60">No notes yet.</p>
          )}
        </div>
      </Section>
    </div>
  );
}
