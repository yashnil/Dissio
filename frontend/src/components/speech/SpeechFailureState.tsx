"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import AppShell from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";

interface SpeechFailureStateProps {
  /** User-facing message (no stack traces). */
  message: string;
  /** Whether the saved audio is confirmed preserved. */
  audioSaved?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * Recoverable route/analysis failure for the speech page. States plainly what
 * was preserved and offers retry + a safe way out. No raw error details.
 */
export default function SpeechFailureState({
  message,
  audioSaved,
  onRetry,
  retryLabel = "Try again",
}: SpeechFailureStateProps) {
  return (
    <AppShell maxWidth="full" bare>
      <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-warn/30 bg-warn/10 text-warn">
          <AlertTriangle size={22} aria-hidden="true" />
        </div>
        <h1 className="text-title font-semibold text-ink">This speech didn’t load</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-subtle">{message}</p>
        {audioSaved && (
          <p className="mt-2 text-xs font-medium text-ok">Your recording is saved.</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-2">
          {onRetry && (
            <Button onClick={onRetry} size="sm">
              <RotateCcw size={15} aria-hidden="true" />
              {retryLabel}
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">
              <Home size={15} aria-hidden="true" />
              Go home
            </Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
