"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { fadeUpInView, reducedSafe, EASE } from "@/lib/motion";

// ── Types ─────────────────────────────────────────────────────────────────────

export type JudgeType = "flow" | "lay" | "parent";

export interface HeardItem {
  label: string;
  status: "landed" | "weak" | "missed";
  note: string;
}

export interface JudgeEvaluation {
  type: JudgeType;
  label: string;      // "Flow Judge"
  tagline: string;    // one-line identity
  priorities: string[];
  heard: HeardItem[]; // always 5: Claim, Evidence, Warrant, Impact, Weighing
  decisiveIssue: string;
  ballotNote: string; // 1–2 sentences in judge's voice
  correction: string;
  score: number;
  scoreLabel: string;
}

// ── Content — C1: Economic Burden Shift (same speech as SpeechFlowSection) ────
// Three judges, same speech, three meaningfully different readings.

export const JUDGE_EVALUATIONS: JudgeEvaluation[] = [
  {
    type: "flow",
    label: "Flow Judge",
    tagline: "Technical flow sheet · explicit weighing required",
    priorities: [
      "Dropped arguments are conceded lines",
      "Weighing must be explicit, not implied",
      "Internal links require a causal mechanism",
    ],
    heard: [
      { label: "Claim",    status: "landed", note: "Stated clearly — municipal cost burden" },
      { label: "Evidence", status: "landed", note: "Urban Institute 2023 — qualifying card" },
      { label: "Warrant",  status: "weak",   note: "Causation asserted, mechanism missing" },
      { label: "Impact",   status: "landed", note: "Integration suppression — offense on flow" },
      { label: "Weighing", status: "missed", note: "NC five-year return goes unanswered" },
    ],
    decisiveIssue: "Dropped weighing — NC's long-run return argument is uncontested on the flow",
    ballotNote:
      "Pro ran the contention well but left the weighing layer blank. NC's five-year return argument stands unchallenged. A dropped argument is a conceded argument — I have to resolve that line for the negative.",
    correction:
      "In the final speech, compare explicitly: '$8K short-run burden vs. $21K long-run return — we win year one, they need year five.' Name the timeframe. Win the comparison layer.",
    score: 62,
    scoreLabel: "Dropped weighing",
  },
  {
    type: "lay",
    label: "Lay Judge",
    tagline: "Clear story · accessible cause-and-effect · memorable impact",
    priorities: [
      "I follow the story, not the structure",
      "Numbers without context don't land",
      "Tell me why this outcome matters",
    ],
    heard: [
      { label: "Claim",    status: "landed", note: "Cost burden understood — relatable frame" },
      { label: "Evidence", status: "weak",   note: "$21K figure — unclear what it actually proves" },
      { label: "Warrant",  status: "missed", note: "Didn't follow the $8K → suppression link" },
      { label: "Impact",   status: "weak",   note: "Heard 'integration' — needed a human story" },
      { label: "Weighing", status: "missed", note: "Both sides talked money — couldn't choose" },
    ],
    decisiveIssue: "No clear reason why short-run burden outweighs the long-run return",
    ballotNote:
      "I understood there's a cost problem, but the other team said that cost pays off eventually. The affirmative didn't give me a plain reason to prefer their side. I needed one clear comparison I could hold onto.",
    correction:
      "Make the timeline the story: 'Rural communities can't wait five years — the harm happens now, and these families don't get a second chance.' One vivid sentence beats three statistics.",
    score: 51,
    scoreLabel: "Explanation gap",
  },
  {
    type: "parent",
    label: "Parent Judge",
    tagline: "Real-world stakes · plain language · confidence over precision",
    priorities: [
      "Who is hurt, and how badly?",
      "Connect to something I already understand",
      "Which team sounds more confident?",
    ],
    heard: [
      { label: "Claim",    status: "landed", note: "Cities bear refugee costs — understandable" },
      { label: "Evidence", status: "weak",   note: "Statistics without a face didn't stick" },
      { label: "Warrant",  status: "missed", note: "Causal chain was lost on me" },
      { label: "Impact",   status: "missed", note: "'Integration programs' — too abstract" },
      { label: "Weighing", status: "missed", note: "Other team's answer sounded simpler to follow" },
    ],
    decisiveIssue: "Opponent's answer felt more concrete — 'it pays off' is easy to remember",
    ballotNote:
      "Both teams talked about money, but I couldn't tell who was right. The other side said costs pay off, and that sounded reasonable. The affirmative needed to show me the real people who get hurt — not just a dollar figure.",
    correction:
      "Humanize the impact: 'Without this policy, rural counties cut integration services for hundreds of families this year.' Then compare that to the opponent's five-year number. Make me feel the stakes before the math.",
    score: 44,
    scoreLabel: "Persuasion gap",
  },
];

// ── Style helpers ─────────────────────────────────────────────────────────────

type StatusIcon = React.ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

const STATUS_CONFIG: Record<HeardItem["status"], {
  dot: string;
  Icon: StatusIcon;
  iconClass: string;
  label: string;
}> = {
  landed: { dot: "bg-ok",     Icon: CheckCircle2, iconClass: "text-ok",     label: "Landed" },
  weak:   { dot: "bg-warn",   Icon: AlertTriangle, iconClass: "text-warn",  label: "Weak"   },
  missed: { dot: "bg-danger", Icon: XCircle,       iconClass: "text-danger", label: "Missed" },
};

function scoreColor(n: number): string {
  return n >= 60 ? "bg-warn" : "bg-danger";
}
function scoreTextColor(n: number): string {
  return n >= 60 ? "text-warn" : "text-danger";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HeardRow({ item }: { item: HeardItem }) {
  const cfg = STATUS_CONFIG[item.status];
  const { Icon } = cfg;
  return (
    <div className="flex items-start gap-2">
      <Icon
        size={12}
        className={`mt-[3px] shrink-0 ${cfg.iconClass}`}
        aria-label={cfg.label}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-eyebrow font-semibold text-ink">{item.label}</span>
          <span className={`text-xs ${cfg.iconClass}`}>· {cfg.label}</span>
        </div>
        <p className="text-xs text-ink-subtle">{item.note}</p>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function JudgeLensSection() {
  const [activeJudge, setActiveJudge] = useState<JudgeType>("flow");
  const [isMounted, setIsMounted] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => setIsMounted(true), []);
  const prefersReducedMotion = useReducedMotion();
  const animated = isMounted && prefersReducedMotion === false;

  const evaluation = JUDGE_EVALUATIONS.find((j) => j.type === activeJudge)!;

  function selectAndFocus(type: JudgeType, index: number) {
    setActiveJudge(type);
    tabRefs.current[index]?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent, index: number) {
    const n = JUDGE_EVALUATIONS.length;
    const NAV: Record<string, number> = {
      ArrowRight: (index + 1) % n,
      ArrowLeft:  (index - 1 + n) % n,
      Home: 0,
      End:  n - 1,
    };
    if (e.key in NAV) {
      e.preventDefault();
      const nextIdx = NAV[e.key];
      selectAndFocus(JUDGE_EVALUATIONS[nextIdx].type, nextIdx);
    }
  }

  // Motion helpers
  function fade() {
    return animated
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.12, ease: EASE } }
      : {};
  }

  return (
    <section
      id="judge"
      className="scroll-mt-16 border-t border-hairline bg-surface-1/40"
      aria-label="Judge lens demonstration"
    >
      {/* Screen-reader announcement outside the animated region */}
      <div
        role="status"
        aria-live="polite"
        className="sr-only"
        data-testid="judge-live-region"
      >
        {evaluation.label}: {evaluation.scoreLabel}
      </div>

      <div className="mx-auto max-w-6xl px-6 py-14">
        {/* Section heading */}
        <motion.div {...reducedSafe(fadeUpInView(0))} className="mb-7 flex flex-col gap-2">
          <p className="section-stamp">Judge lens</p>
          <h2 className="text-headline text-ink max-w-2xl">
            One speech. Three judges.{" "}
            <br className="hidden sm:block" />
            Three different ballots.
          </h2>
          <p className="mt-1 max-w-lg text-sm leading-relaxed text-ink-subtle">
            The same C1 argument — a flow judge, a lay judge, and a parent judge each hear
            something different. Select a lens to see the ballot shift.
          </p>
        </motion.div>

        {/* Two-panel interactive layout */}
        <motion.div
          {...reducedSafe(fadeUpInView(0.08))}
          className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-5"
        >
          {/* ── LEFT: Judge selector + interpretation ──────────────────── */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-1">
            {/* Tab controls */}
            <div className="border-b border-hairline p-3">
              <div
                role="tablist"
                aria-label="Select judge perspective"
                className="flex gap-1 rounded-lg border border-hairline bg-surface-2 p-1"
              >
                {JUDGE_EVALUATIONS.map((j, i) => (
                  <button
                    key={j.type}
                    ref={(el) => { tabRefs.current[i] = el; }}
                    role="tab"
                    id={`jl-tab-${j.type}`}
                    aria-selected={j.type === activeJudge}
                    aria-controls={`jl-panel-${j.type}`}
                    tabIndex={j.type === activeJudge ? 0 : -1}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    onClick={() => setActiveJudge(j.type)}
                    className={[
                      "flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50",
                      j.type === activeJudge
                        ? "bg-surface-1 text-ink shadow-sm"
                        : "text-ink-subtle hover:text-ink",
                    ].join(" ")}
                  >
                    {j.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tabpanels — all three in DOM, only active holds content */}
            {JUDGE_EVALUATIONS.map((j) => (
              <div
                key={j.type}
                role="tabpanel"
                id={`jl-panel-${j.type}`}
                aria-labelledby={`jl-tab-${j.type}`}
                hidden={j.type !== activeJudge}
              >
                {j.type === activeJudge && (
                  <motion.div
                    key={activeJudge}
                    {...fade()}
                    className="flex flex-col gap-5 p-5"
                  >
                    {/* Judge identity */}
                    <p className="text-xs text-ink-subtle">{j.tagline}</p>

                    {/* Priority list */}
                    <div className="flex flex-col gap-1.5">
                      <p className="section-stamp mb-1">Judge priority</p>
                      {j.priorities.map((p) => (
                        <div key={p} className="flex items-start gap-2">
                          <span
                            className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-lav/60"
                            aria-hidden
                          />
                          <span className="text-xs text-ink-subtle">{p}</span>
                        </div>
                      ))}
                    </div>

                    {/* What they heard */}
                    <div className="flex flex-col gap-2">
                      <p className="section-stamp mb-1">What they heard</p>
                      {j.heard.map((item) => (
                        <HeardRow key={item.label} item={item} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            ))}
          </div>

          {/* ── RIGHT: Ballot artifact ────────────────────────────────── */}
          <div
            className="beam-top flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-1"
            style={{
              boxShadow:
                "0 0 48px -16px oklch(0.510 0.156 278 / 0.18)," +
                "0 0 0 1px oklch(0.510 0.156 278 / 0.06)",
            }}
          >
            {/* Static header */}
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
              <span className="section-stamp">Draft ballot</span>
              <span className="text-xs text-ink-subtle">C1 · Economic Burden Shift</span>
            </div>

            {/* Animated ballot content */}
            <motion.div
              key={activeJudge}
              {...fade()}
              className="flex flex-col gap-0 divide-y divide-hairline"
            >
              {/* Judge type row */}
              <div className="flex items-center gap-2 px-5 py-3">
                <span
                  className="rounded bg-lav/15 px-1.5 py-0.5 text-eyebrow font-semibold text-lav"
                >
                  {evaluation.label.toUpperCase()}
                </span>
                <span className="text-xs text-ink-subtle">{evaluation.tagline.split("·")[0].trim()}</span>
              </div>

              {/* Decisive issue */}
              <div className="flex flex-col gap-1 px-5 py-4">
                <p className="section-stamp text-warn mb-1">Decisive issue</p>
                <p className="text-sm font-medium leading-snug text-ink" data-testid="decisive-issue">
                  {evaluation.decisiveIssue}
                </p>
              </div>

              {/* Ballot note — judge's voice */}
              <div className="flex flex-col gap-1.5 bg-surface-2/40 px-5 py-4">
                <p className="section-stamp mb-1">Ballot note</p>
                <p
                  className="text-sm leading-relaxed text-ink-subtle"
                  data-testid="ballot-note"
                  style={{ fontStyle: "italic" }}
                >
                  &ldquo;{evaluation.ballotNote}&rdquo;
                </p>
              </div>

              {/* Correction */}
              <div className="flex flex-col gap-1 px-5 py-4">
                <p className="section-stamp mb-1">Correction</p>
                <p className="text-xs leading-relaxed text-ink-subtle">
                  {evaluation.correction}
                </p>
              </div>

              {/* Confidence indicator */}
              <div className="flex flex-col gap-2 px-5 py-4">
                <p className="section-stamp mb-1">Ballot confidence</p>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-2xl font-bold tabular-nums leading-none ${scoreTextColor(evaluation.score)}`}
                    aria-label={`${evaluation.score} out of 100`}
                  >
                    {evaluation.score}
                  </span>
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="h-1 overflow-hidden rounded-full bg-hairline">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${scoreColor(evaluation.score)}`}
                        style={{ width: `${evaluation.score}%` }}
                        role="progressbar"
                        aria-valuenow={evaluation.score}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Ballot confidence: ${evaluation.score}%`}
                      />
                    </div>
                    <p className="text-xs text-ink-subtle">{evaluation.scoreLabel}</p>
                  </div>
                </div>
                {/* Visual link back to SpeechFlowSection diagnosis */}
                <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-warn/20 bg-warn/5 px-2.5 py-1.5">
                  <AlertTriangle size={11} className="shrink-0 text-warn" aria-hidden />
                  <span className="text-xs text-warn">Same root cause: no weighing in C1</span>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
