"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { T, EASE } from "@/lib/motion";
import CoachMarginNote from "@/components/CoachMarginNote";
import { getPrimaryIssue, getCoachNote, deriveFlowCoachNoteType } from "@/lib/debateHelpers";
import type { JudgeViewMode } from "@/components/JudgeModeSelector";
import type { ArgumentMap, DebateIssue, FeedbackReport } from "@/types";

// Current scoring version — should match backend SCORING_VERSION
export const CURRENT_SCORING_VERSION = "pf_rubric_v3_recalibrated_2026_06_04";

export function StepHeader({ n, title, done, aside }: {
  n?: number; title: string; done: boolean; aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {(done || n !== undefined) && (
          <AnimatePresence mode="wait">
            {done ? (
              <motion.span
                key="done"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={T.snap}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lav text-white"
              >
                <Check size={10} strokeWidth={2.5} />
              </motion.span>
            ) : (
              <motion.span
                key="pending"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={T.snap}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border border-hairline-strong text-[11px] font-bold text-ink-faint"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {n}
              </motion.span>
            )}
          </AnimatePresence>
        )}
        <p className="text-heading text-ink">{title}</p>
      </div>
      {aside}
    </div>
  );
}

export function Collapsible({ label, children, open: defaultOpen = false }: {
  label: string; children: React.ReactNode; open?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-hairline">
      <button
        type="button"
        className="flex w-full items-center justify-between py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="section-stamp">{label}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={T.fast}
        >
          <ChevronDown size={12} className="text-ink-faint" />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InlineAlert({ variant, children }: { variant: "danger" | "warn"; children: React.ReactNode }) {
  const s = variant === "danger"
    ? "border-danger/20 bg-danger/5 text-danger/90"
    : "border-warn/20 bg-warn/5 text-warn/90";
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={T.base}
      className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${s}`}
    >
      <span className="mt-0.5 shrink-0">⚠</span>
      <p>{children}</p>
    </motion.div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  type V = "default" | "indigo" | "green" | "amber" | "red";
  const MAP: Record<string, [string, V]> = {
    pending:      ["Pending",      "default"],
    transcribing: ["Transcribing", "indigo" ],
    analyzing:    ["Analyzing",    "amber"  ],
    done:         ["Complete",     "green"  ],
    error:        ["Error",        "red"    ],
  };
  const [label, variant] = MAP[status] ?? [status, "default" as V];
  return <Badge variant={variant} className="shrink-0">{label}</Badge>;
}

export function CoachDiagnosis({ category, items, label }: { category: string; items: string[]; label: string }) {
  void category;
  if (!items || items.length === 0) return null;

  // Determine status based on content
  const rawText = items.join(" ").toLowerCase();
  let status: "strong" | "needs-work" | "missing";
  let statusColor: string;

  if (rawText.includes("none") || rawText.includes("absent") || rawText.includes("missing") || items.length === 0) {
    status = "missing";
    statusColor = "text-danger";
  } else if (rawText.includes("thin") || rawText.includes("weak") || rawText.includes("unclear")) {
    status = "needs-work";
    statusColor = "text-warn";
  } else {
    status = "strong";
    statusColor = "text-ok";
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-surface-2 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <span className={`text-xs font-medium ${statusColor} capitalize`}>
          {status === "needs-work" ? "Needs Work" : status === "missing" ? "Missing" : "Strong"}
        </span>
      </div>

      {/* Display actual diagnostics from LLM (includes topic-aware examples) */}
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <p key={i} className="text-sm leading-relaxed text-ink-muted whitespace-pre-wrap">{item}</p>
        ))}
      </div>

      {/* Disclaimer for examples */}
      {items.some(item => item.toLowerCase().includes("before:") || item.toLowerCase().includes("after:")) && (
        <div className="flex items-start gap-2 rounded-md border border-amber/20 bg-amber/5 px-3 py-2">
          <p className="text-xs text-amber">⚠ Model example only — adapt to your arguments, don&apos;t copy word-for-word</p>
        </div>
      )}
    </div>
  );
}

/** Wraps a workspace section card — animates in when it first appears */
export function WorkspaceCard({ children, glow }: { children: React.ReactNode; glow?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <Card
        className={glow ? "beam-top" : undefined}
        style={glow ? { boxShadow: "0 0 40px -12px oklch(0.510 0.156 278 / 0.18)" } : undefined}
      >
        {children}
      </Card>
    </motion.div>
  );
}

export function FlowSummary({ argMap }: { argMap: ArgumentMap }) {
  const offenseArgs = argMap.arguments.filter(a => a.argument_type === "offense");
  const allIssues = argMap.arguments.flatMap(a => a.issues);
  const warrantIssues = allIssues.filter(i => i.toLowerCase().includes("warrant")).length;
  const impactIssues = allIssues.filter(i => i.toLowerCase().includes("impact")).length;
  const evidenceIssues = allIssues.filter(i => i.toLowerCase().includes("evidence") || i.toLowerCase().includes("unsupported")).length;

  // Find strongest argument (highest confidence, offense type preferred)
  const strongestArg = argMap.arguments.reduce((best, curr) => {
    if (!best) return curr;
    const currScore = (curr.confidence ?? 0) + (curr.argument_type === "offense" ? 0.1 : 0);
    const bestScore = (best.confidence ?? 0) + (best.argument_type === "offense" ? 0.1 : 0);
    return currScore > bestScore ? curr : best;
  }, argMap.arguments[0]);

  // Determine most common weakness
  let commonWeakness = "";
  if (warrantIssues > Math.max(impactIssues, evidenceIssues)) {
    commonWeakness = "Warranting";
  } else if (impactIssues > Math.max(warrantIssues, evidenceIssues)) {
    commonWeakness = "Impact development";
  } else if (evidenceIssues > 0) {
    commonWeakness = "Evidence connection";
  } else if (allIssues.length > 0) {
    commonWeakness = "Argument structure";
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface-2 px-4 py-3">
        <p className="text-xs text-ink-faint">Total Arguments</p>
        <p className="text-2xl font-bold text-ink">{argMap.arguments.length}</p>
        <p className="text-xs text-ink-subtle">{offenseArgs.length} offense</p>
      </div>

      {strongestArg && (
        <div className="flex flex-col gap-1 rounded-lg border border-ok/20 bg-ok/5 px-4 py-3">
          <p className="text-xs text-ok">Strongest Argument</p>
          <p className="text-sm font-semibold text-ink line-clamp-2">{strongestArg.label}</p>
        </div>
      )}

      {commonWeakness && (
        <div className="flex flex-col gap-1 rounded-lg border border-amber/20 bg-amber/5 px-4 py-3">
          <p className="text-xs text-amber">Most Common Issue</p>
          <p className="text-sm font-semibold text-ink">{commonWeakness}</p>
          <p className="text-xs text-ink-subtle">{allIssues.length} total issues</p>
        </div>
      )}
    </div>
  );
}

/**
 * Renders a CoachMarginNote for the highest-severity structured issue.
 * Shows nothing if no structured issues exist.
 */
export function TopIssueCoachNote({ issues }: { issues?: DebateIssue[] }) {
  const top = getPrimaryIssue(issues);
  if (!top) return null;
  const cfg = getCoachNote(top.issue_type);
  if (!cfg) return null;
  return <CoachMarginNote type={cfg.type} note={cfg.note} />;
}

/**
 * Renders a CoachMarginNote derived from the argument map's most common issue.
 * Only appears when at least one argument has a flagged issue.
 */
export function FlowCoachNote({ args }: { args: Array<{ issues: string[] }> }) {
  const issueType = deriveFlowCoachNoteType(args);
  if (!issueType) return null;
  const cfg = getCoachNote(issueType);
  if (!cfg) return null;
  return <CoachMarginNote type={cfg.type} note={cfg.note} label="Flow note" />;
}

const LENS_NOTE_TEXT: Record<JudgeViewMode, string> = {
  coach: "Coach lens — showing fix actions and drill targets for each argument.",
  lay:   "Lay lens — highlighting impact clarity, persuasion, and judge comprehension.",
  flow:  "Flow lens — highlighting dropped arguments, extensions, and warrant depth.",
  tech:  "Tech lens — highlighting evidence quality, warrant support, and weighing.",
};

export function FlowLensNote({ judgeMode }: { judgeMode: JudgeViewMode }) {
  const isDetailLens = judgeMode === "flow" || judgeMode === "tech";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-lav/10 bg-lav/5 px-4 py-3 text-xs">
      <p className="text-ink-subtle">{LENS_NOTE_TEXT[judgeMode]}</p>
      <div className="flex flex-col gap-1 border-t border-lav/10 pt-2">
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span className="text-ink-faint"><span className="font-semibold text-ink-subtle">Offense</span> = winning argument</span>
          <span className="text-ink-faint"><span className="font-semibold text-ink-subtle">Defense</span> = answers opponent</span>
          <span className="text-ink-faint"><span className="font-semibold text-ink-subtle">Weighing</span> = impact comparison</span>
        </div>
        {isDetailLens && (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-0.5">
            <span className="text-ink-faint"><span className="font-semibold text-ink-subtle">Claim</span> = what you argue</span>
            <span className="text-ink-faint"><span className="font-semibold text-ink-subtle">Warrant</span> = why it&apos;s true</span>
            <span className="text-ink-faint"><span className="font-semibold text-ink-subtle">Evidence</span> = support</span>
            <span className="text-ink-faint"><span className="font-semibold text-ink-subtle">Impact</span> = why it matters</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ContextualHelp({ question, children }: { question: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="flex w-full items-start gap-2 rounded-lg border border-hairline bg-surface-2 px-3 py-2.5 text-left hover:border-hairline-strong hover:bg-surface-3 transition-colors"
    >
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-lav/30 text-[9px] font-bold text-lav">?</span>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="text-xs font-medium text-ink-subtle">{question}</span>
        {open && (
          <p className="text-[11px] leading-relaxed text-ink-faint mt-0.5">{children}</p>
        )}
      </div>
      <span className="shrink-0 text-ink-faint mt-0.5">
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </span>
    </button>
  );
}

/**
 * Defensively recompute overall score from visible dimension scores so the
 * displayed overall always matches the sum of dimension bars.
 */
export function getVerifiedOverallScore(feedback: FeedbackReport | null): number | null {
  if (!feedback?.scores) return feedback?.overall_score ?? null;

  const sum =
    feedback.scores.clash +
    feedback.scores.weighing +
    feedback.scores.extensions +
    feedback.scores.drops +
    feedback.scores.judge_adaptation;

  if (feedback.overall_score !== null && feedback.overall_score !== sum) {
    console.warn(
      `[Score Verification] Stored overall_score (${feedback.overall_score}) doesn't match dimension sum (${sum}). Using sum.`
    );
  }

  return sum;
}

/** True if a feedback report uses an older scoring version and needs regen. */
export function isReportStale(feedback: FeedbackReport | null): boolean {
  if (!feedback) return false;
  const reportVersion = feedback.raw_feedback?.scoring_version;
  if (reportVersion && reportVersion !== CURRENT_SCORING_VERSION) return true;
  if (!reportVersion) return true;
  return false;
}
