"use client";

/**
 * PracticePanel (Phase 7C) — "practice this adaptation" loop foundation.
 *
 * Only renders after a REAL adaptation result. Shows the judge, the material,
 * the delivery goal, and 2–4 success criteria pulled from real result fields.
 * The practice input is a pasted delivery attempt (recording reuse would
 * require a Speech-entity pipeline this feature doesn't have — documented as
 * a future contract, not built here). Scoring is truthfully NOT connected:
 * /readiness-score scores the source material, not what a student typed, so
 * this panel says so plainly instead of faking a score.
 */

import { useState } from "react";
import { Check, Info, Mic } from "lucide-react";
import {
  derivePracticeSuccessCriteria,
  validatePracticeAttempt,
  describeAttemptPersistence,
  practiceScoringGapMessage,
  PRACTICE_ATTEMPT_MIN_LENGTH,
  type SelectedMaterial,
} from "@/lib/judgeAdaptationModel";
import { JUDGE_TYPE_LABELS, type JudgeAdaptationResult, type JudgeType } from "@/types/judgeAdaptation";

export function PracticePanel({
  material, result, judgeType,
}: {
  material: SelectedMaterial;
  result: JudgeAdaptationResult;
  judgeType: JudgeType;
}) {
  const criteria = derivePracticeSuccessCriteria(result);
  const [attemptText, setAttemptText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const validation = validatePracticeAttempt(attemptText);

  return (
    <section aria-label="Practice this adaptation" className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface-1 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Mic size={14} className="text-lav" aria-hidden="true" />
        <h3 className="text-heading text-ink">Practice this adaptation</h3>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
        <span>Judge: <span className="font-medium text-ink">{JUDGE_TYPE_LABELS[judgeType]}</span></span>
        <span>Material: <span className="font-medium text-ink">{material.title}</span></span>
      </div>

      {result.judge_goal && (
        <p className="text-sm leading-relaxed text-ink-subtle">
          Delivery goal: <span className="text-ink">{result.judge_goal}</span>
        </p>
      )}

      {criteria.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            What success looks like
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-subtle">
                <Check size={11} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!submitted ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => { e.preventDefault(); if (validation.valid) setSubmitted(true); }}
        >
          <label htmlFor="practice-attempt" className="text-xs font-medium text-ink">
            Paste or type how you&rsquo;d actually deliver this
          </label>
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Write it the way you&rsquo;d say it out loud for this judge. Keep any quoted
            evidence, statistics, or citations exactly as saved — only your delivery,
            framing, and wording change here.
          </p>
          <textarea
            id="practice-attempt"
            value={attemptText}
            onChange={(e) => setAttemptText(e.target.value)}
            rows={5}
            placeholder="e.g. One in five tons of carbon — gone. That's what this policy does…"
            className="w-full resize-y rounded-lg border border-hairline bg-surface-2/50 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-faint">
              {attemptText.trim().length}/{PRACTICE_ATTEMPT_MIN_LENGTH}+ characters
            </p>
            <button
              type="submit"
              disabled={!validation.valid}
              className="rounded-lg bg-lav px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Submit practice attempt
            </button>
          </div>
          {!validation.valid && attemptText.length > 0 && (
            <p className="text-[11px] text-ink-faint">{validation.reason}</p>
          )}
        </form>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="rounded-lg border border-hairline bg-surface-2/50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Your attempt</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{attemptText}</p>
          </div>

          <div role="status" className="flex items-start gap-2 rounded-lg border border-hairline bg-surface-2/40 px-3 py-2.5">
            <Info size={13} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-ink-subtle">{practiceScoringGapMessage()}</p>
          </div>

          <p className="text-[11px] text-ink-faint">{describeAttemptPersistence()}</p>

          <button
            type="button"
            onClick={() => { setSubmitted(false); setAttemptText(""); }}
            className="w-fit rounded-lg border border-hairline bg-surface-1 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
          >
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
