"use client";

import Link from "next/link";
import { AlertTriangle, Check, Circle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PartialReportNoticeProps {
  hasTranscript: boolean;
  hasFlow: boolean;
  hasDrills: boolean;
  onGenerateFeedback: () => void;
  generating: boolean;
}

function ArtifactRow({ label, present }: { label: string; present: boolean }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {present ? (
        <Check size={12} className="shrink-0 text-ok" aria-hidden="true" />
      ) : (
        <Circle size={8} className="shrink-0 text-warn" aria-hidden="true" />
      )}
      <span className={present ? "text-ink-subtle" : "font-medium text-ink"}>
        {label}
        <span className="sr-only">{present ? " — ready" : " — missing"}</span>
        {!present && <span aria-hidden="true"> — missing</span>}
      </span>
    </li>
  );
}

/**
 * Shown when a speech is marked done but the ballot/feedback artifact is
 * missing. Makes the gap explicit instead of implying the report is ready,
 * and offers the honest next actions.
 */
export default function PartialReportNotice({
  hasTranscript,
  hasFlow,
  hasDrills,
  onGenerateFeedback,
  generating,
}: PartialReportNoticeProps) {
  return (
    <section
      role="status"
      aria-label="Partial report"
      className="flex flex-col gap-3 rounded-xl border border-warn/25 bg-warn/5 px-5 py-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-semibold text-ink">Partial report</p>
          <p className="text-xs leading-relaxed text-ink-subtle">
            This practice finished processing, but the ballot didn&rsquo;t save — so the
            report isn&rsquo;t complete yet. Here&rsquo;s what exists so far:
          </p>
        </div>
      </div>

      <ul className="ml-8 flex flex-col gap-1">
        <ArtifactRow label="Transcript" present={hasTranscript} />
        <ArtifactRow label="Flow" present={hasFlow} />
        <ArtifactRow label="Ballot & feedback" present={false} />
        <ArtifactRow label="Drills" present={hasDrills} />
      </ul>

      <div className="ml-8 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={onGenerateFeedback} disabled={generating} className="gap-1.5">
          {generating ? (
            <>
              <RefreshCw size={11} className="motion-safe:animate-spin" aria-hidden="true" />
              Generating ballot…
            </>
          ) : (
            <>
              <RefreshCw size={11} aria-hidden="true" />
              Generate the ballot
            </>
          )}
        </Button>
        <Link
          href="/session"
          className="text-xs font-medium text-ink-subtle transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 focus-visible:rounded"
        >
          Start a new practice instead
        </Link>
      </div>
    </section>
  );
}
