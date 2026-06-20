import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusVariant =
  | "ok"
  | "warn"
  | "danger"
  | "info"
  | "neutral"
  | "active"
  | "processing";

const VARIANT_CLASSES: Record<StatusVariant, string> = {
  ok:         "bg-ok/10 text-ok border-ok/20",
  warn:       "bg-warn/10 text-warn border-warn/20",
  danger:     "bg-danger/10 text-danger border-danger/20",
  info:       "bg-info/10 text-info border-info/20",
  neutral:    "bg-surface-2 text-ink-subtle border-hairline",
  active:     "bg-lav/10 text-lav border-lav/20",
  processing: "bg-lav/10 text-lav border-lav/20",
};

const DOT_CLASSES: Record<StatusVariant, string> = {
  ok:         "bg-ok",
  warn:       "bg-warn",
  danger:     "bg-danger",
  info:       "bg-info",
  neutral:    "bg-ink-faint",
  active:     "bg-lav",
  processing: "bg-lav",
};

interface StatusChipProps {
  variant: StatusVariant;
  label: string;
  /** Animated pulse dot — auto-enabled for "active" and "processing" variants */
  dot?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * StatusChip — semantic status indicator.
 *
 * Uses design tokens only (no hardcoded colors). The `dot` prop renders a
 * pulsing indicator; it is suppressed when `prefers-reduced-motion` is active
 * via the `.rec-pulse` CSS class.
 *
 * Usage:
 *   <StatusChip variant="ok" label="Extended" />
 *   <StatusChip variant="active" label="Recording" dot />
 *   <StatusChip variant="processing" label="Analyzing" dot size="sm" />
 */
export function StatusChip({
  variant,
  label,
  dot,
  size = "sm",
  className,
}: StatusChipProps) {
  const showDot = dot ?? (variant === "active" || variant === "processing");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "h-5 px-2 text-xs" : "h-6 px-2.5 text-sm",
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className={cn(
            "relative flex shrink-0",
            size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"
          )}
        >
          <span
            className={cn(
              "rec-pulse absolute inline-flex h-full w-full rounded-full opacity-75",
              DOT_CLASSES[variant]
            )}
          />
          <span
            className={cn(
              "relative inline-flex h-full w-full rounded-full",
              DOT_CLASSES[variant]
            )}
          />
        </span>
      )}
      {label}
    </span>
  );
}
