"use client";

import Link from "next/link";
import { Mic, ArrowRight, Check, Circle, Minus, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { LatestPracticeSummary } from "@/lib/practiceReadiness";

const TYPE_LABEL: Record<string, string> = {
  constructive: "Constructive", rebuttal: "Rebuttal", summary: "Summary",
  final_focus: "Final Focus", crossfire: "Crossfire",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Cockpit preview of the student's most recent practice: truthful status
 * badge, which artifacts genuinely exist, and one button pointing at the
 * correct next action. When the latest analysis failed or stalled and its
 * job id is known, that single button retries in place (same endpoint the
 * speech page uses); otherwise it links to the right destination.
 */
export default function LatestPracticeCard({
  summary,
  onRetry,
  retrying = false,
  retryError = null,
}: {
  summary: LatestPracticeSummary;
  /** Present only when the row is directly retryable (job id known). */
  onRetry?: () => void;
  retrying?: boolean;
  retryError?: string | null;
}) {
  const { speech, readiness, href, ctaLabel, pipeline } = summary;

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-eyebrow text-ink-subtle">Latest practice</span>
          <Badge variant={readiness.badge}>
            {readiness.isProcessing ? `${readiness.label}…` : readiness.label}
          </Badge>
        </div>

        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-surface-2" aria-hidden="true">
            <Mic size={13} className="text-ink-faint" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate text-sm font-semibold text-ink">{speech.title}</p>
            <p className="text-xs text-ink-subtle">
              {TYPE_LABEL[speech.speech_type] ?? speech.speech_type}
              {speech.side && <span className="capitalize"> · {speech.side}</span>}
              {speech.judge_type && <span> · {speech.judge_type} judge</span>}
              <span className="text-ink-faint"> · {fmtDate(speech.created_at)}</span>
            </p>
          </div>
        </div>

        {/* Friendly one-line guidance for failed/stale states */}
        {readiness.detail && (
          <p
            role="status"
            className={`text-xs leading-relaxed ${readiness.tone === "red" ? "text-danger" : "text-ink-subtle"}`}
          >
            {readiness.detail}
          </p>
        )}

        {/* Artifact availability — only what the data actually supports */}
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Report artifacts">
          {pipeline.map((step) => (
            <li key={step.key} className="flex items-center gap-1 text-xs">
              {step.done ? (
                <Check size={11} className="text-ok" aria-hidden="true" />
              ) : step.unknown ? (
                <Minus size={9} className="text-ink-faint" aria-hidden="true" />
              ) : (
                <Circle size={7} className="text-ink-faint" aria-hidden="true" />
              )}
              <span className={step.done ? "text-ink-subtle" : "text-ink-faint"}>
                {step.label}
                <span className="sr-only">
                  {step.unknown ? " status unknown" : step.done ? " ready" : " not ready"}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          {onRetry ? (
            <Button
              size="sm"
              className="gap-1.5 self-start"
              onClick={onRetry}
              disabled={retrying}
            >
              <RotateCcw size={11} aria-hidden="true" />
              {retrying ? "Retrying…" : "Retry analysis"}
            </Button>
          ) : (
            <Button asChild size="sm" className="gap-1.5 self-start">
              <Link href={href}>
                {ctaLabel} <ArrowRight size={11} aria-hidden="true" />
              </Link>
            </Button>
          )}
          {retryError && (
            <p role="alert" className="text-xs text-danger">
              {retryError}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
