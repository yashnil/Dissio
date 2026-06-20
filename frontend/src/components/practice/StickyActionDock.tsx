"use client";

import { type ReactNode } from "react";

interface StickyActionDockProps {
  /** Compact context shown on the left (summary chips, status). */
  summary?: ReactNode;
  /** Primary + secondary actions, right-aligned. */
  children: ReactNode;
}

/**
 * A sticky bottom action dock — keeps the primary action reachable while the
 * student scrolls a builder or training room.
 *
 * On mobile it sits *above* the fixed bottom nav (h ≈ 3.5rem + safe area) so the
 * primary action is never hidden behind it; on md+ (no bottom nav) it sticks to
 * the viewport bottom. Reused by practice setup and the assignment builder.
 */
export default function StickyActionDock({ summary, children }: StickyActionDockProps) {
  return (
    <div
      className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-2 border-t border-hairline bg-canvas/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 md:bottom-0"
      style={{ paddingBottom: "0.75rem" }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {summary ? <div className="min-w-0 flex-1">{summary}</div> : <div />}
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
