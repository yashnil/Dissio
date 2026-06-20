import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateAction {
  label: string;
  /** Renders a Next.js Link when provided. */
  href?: string;
  /** Renders a Button with onClick handler when provided. */
  onClick?: () => void;
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  hint?: string;
  /** Optional content rendered below the description (e.g., a preview). */
  preview?: React.ReactNode;
  /** Controls icon size and padding. Defaults to "md". */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE = {
  sm: { container: "px-5 py-10", icon: "h-10 w-10", iconSize: 16, iconRadius: "rounded-xl" },
  md: { container: "px-6 py-14", icon: "h-14 w-14", iconSize: 22, iconRadius: "rounded-2xl" },
  lg: { container: "px-8 py-16", icon: "h-16 w-16", iconSize: 26, iconRadius: "rounded-2xl" },
} as const;

/**
 * EmptyState — unified empty state primitive.
 *
 * Supersedes the legacy `EmptyState.tsx` (href-only) and `EmptyStateCard.tsx`
 * (inconsistent API + motion wrapper). This component has no built-in entrance
 * animation — callers may wrap with motion.div if desired.
 *
 * Usage:
 *   <EmptyState icon={Mic} title="No speeches yet"
 *     description="Record a PF speech to start your practice loop."
 *     action={{ label: "Start practice", href: "/session" }} />
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  hint,
  preview,
  size = "md",
  className,
}: EmptyStateProps) {
  const s = SIZE[size];

  const actionEl = action ? (
    action.href ? (
      <Button asChild size="sm" className="mt-1">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    ) : (
      <Button size="sm" className="mt-1" onClick={action.onClick}>
        {action.label}
      </Button>
    )
  ) : null;

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-hairline bg-surface-1 text-center",
        s.container,
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            "mb-5 flex shrink-0 items-center justify-center border border-lav/20 bg-lav/10",
            s.icon,
            s.iconRadius
          )}
          style={{ boxShadow: "0 0 24px -6px oklch(0.510 0.156 278 / 0.25)" }}
        >
          <Icon size={s.iconSize} className="text-lav" aria-hidden="true" />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-heading text-ink">{title}</p>
        {description && (
          <p className="max-w-xs text-sm leading-relaxed text-ink-subtle">
            {description}
          </p>
        )}
        {hint && (
          <p className="max-w-xs text-xs text-ink-faint">{hint}</p>
        )}
      </div>
      {preview && <div className="mt-6 w-full max-w-md">{preview}</div>}
      {actionEl}
    </div>
  );
}
