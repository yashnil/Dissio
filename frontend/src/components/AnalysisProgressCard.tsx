"use client";

import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import type { AnalysisJob } from "@/types";
import { Button } from "@/components/ui/button";
import { getJobFailureMessage, getJobStepLabel } from "@/lib/jobHelpers";

interface Props {
  job: AnalysisJob;
  onRetry?: () => void;
  retrying?: boolean;
}

export function AnalysisProgressCard({ job, onRetry, retrying }: Props) {
  const progress = job.progress ?? 0;
  const isFailed = job.status === "failed";
  const isRunning = job.status === "running" || job.status === "queued";

  if (isFailed) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger/5 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0 text-danger" size={18} aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-danger">Analysis failed</p>
            <p className="text-sm text-danger/70">
              {getJobFailureMessage(job)}
            </p>
            {job.attempt_count > 1 && (
              <p className="text-xs text-ink-subtle">
                Attempt {job.attempt_count}
              </p>
            )}
          </div>
        </div>
        {onRetry && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onRetry}
            disabled={retrying}
            className="gap-2"
          >
            {retrying ? (
              <Loader2 className="animate-spin" size={14} aria-hidden="true" />
            ) : (
              <RefreshCw size={14} aria-hidden="true" />
            )}
            {retrying ? "Retrying…" : "Retry analysis"}
          </Button>
        )}
      </div>
    );
  }

  if (isRunning) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-1 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin text-lav shrink-0" size={18} aria-hidden="true" />
          <p className="text-sm font-medium text-ink">
            {getJobStepLabel(job)}
          </p>
        </div>
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-lav transition-all duration-700"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="text-xs text-ink-subtle">{progress}%</p>
        </div>
      </div>
    );
  }

  return null;
}
