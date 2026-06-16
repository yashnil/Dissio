"use client";

import Link from "next/link";
import { Mic, Check, Loader, AlertTriangle, Repeat, Upload, History } from "lucide-react";
import { deriveRecentActivity, type ActivityKind } from "@/lib/dashboardActivity";
import type { Speech } from "@/types";
import { cn } from "@/lib/utils";

interface RecentActivityProps {
  speeches: Speech[];
}

const kindMeta: Record<ActivityKind, { icon: typeof Mic; tone: string }> = {
  created: { icon: Mic, tone: "text-ink-subtle" },
  saved: { icon: Upload, tone: "text-info" },
  analyzing: { icon: Loader, tone: "text-proc-active" },
  "report-ready": { icon: Check, tone: "text-ok" },
  failed: { icon: AlertTriangle, tone: "text-danger" },
  "re-recorded": { icon: Repeat, tone: "text-lav-hi" },
};

function relativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const day = 86_400_000;
  const days = Math.floor(diffMs / day);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Recent debate-native activity stream with a contextual action per item. */
export default function RecentActivity({ speeches }: RecentActivityProps) {
  const items = deriveRecentActivity(speeches);
  if (items.length === 0) return null;

  return (
    <section aria-label="Recent activity" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <History size={14} className="text-ink-subtle" aria-hidden="true" />
        <h2 className="text-heading text-ink">Recent activity</h2>
      </div>
      <ul className="flex flex-col divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface-1">
        {items.map((item) => {
          const meta = kindMeta[item.kind];
          const Icon = meta.icon;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
              >
                <span className={cn("shrink-0", meta.tone)}>
                  <Icon size={16} className={item.kind === "analyzing" ? "motion-safe:animate-spin" : undefined} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{item.action}</p>
                  <p className="truncate text-xs text-ink-faint">{item.speechTitle}</p>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-ink-faint">{relativeDate(item.date)}</span>
                <span className="shrink-0 text-xs font-medium text-lav-hi opacity-0 transition-opacity group-hover:opacity-100">
                  {item.actionLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
