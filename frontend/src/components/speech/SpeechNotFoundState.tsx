"use client";

import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown when a speech can’t be found (missing, deleted, or inaccessible).
 * Intentionally does not distinguish nonexistent from unauthorized so private
 * speeches aren’t disclosed.
 */
export default function SpeechNotFoundState() {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-hairline-strong bg-surface-2 text-ink-subtle">
        <FileQuestion size={22} aria-hidden="true" />
      </div>
      <h1 className="text-title font-semibold text-ink">Speech not found</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-subtle">
        This speech doesn’t exist or is no longer available. It may have been
        deleted. Head back to your practice history to keep going.
      </p>
      <div className="mt-6 flex items-center justify-center gap-2">
        <Button asChild size="sm">
          <Link href="/dashboard">Go to Home</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/session">Start a practice</Link>
        </Button>
      </div>
    </div>
  );
}
