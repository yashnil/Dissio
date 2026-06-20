import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  /** Renders a .section-stamp eyebrow label above the title. */
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  badge?: string;
  /** Semantic heading level. Defaults to "h2". Use "h3" inside a card that already has an h2. */
  level?: "h2" | "h3";
  className?: string;
}

/**
 * SectionHeader — consistent section titles across all pages.
 *
 * Usage:
 *   <SectionHeader title="Recent Activity" />
 *   <SectionHeader eyebrow="Practice Loop" title="Recent Activity" description="Last 10 speeches" />
 *   <SectionHeader title="Drills" badge="3" action={<Button size="sm">View all</Button>} />
 *   <SectionHeader level="h3" title="Claim Analysis" />
 */
export default function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  badge,
  level = "h2",
  className,
}: SectionHeaderProps) {
  const Heading = level;

  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex-1">
        {eyebrow && (
          <p className="section-stamp mb-1.5">{eyebrow}</p>
        )}
        <div className="flex items-center gap-2">
          <Heading className="text-title text-ink">{title}</Heading>
          {badge && (
            <span className="rounded-full bg-lav/10 px-2 py-0.5 text-xs font-medium text-lav">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-sm text-ink-subtle leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
