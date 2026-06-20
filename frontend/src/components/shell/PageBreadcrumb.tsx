import Link from "next/link";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  /** When provided and not the last item, renders as a link. */
  href?: string;
}

interface PageBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * PageBreadcrumb — contextual location breadcrumb for page headers.
 *
 * Usage in a page:
 *   <AppShell headerLeft={<PageBreadcrumb items={[
 *     { label: "Home", href: "/dashboard" },
 *     { label: "Speech Report" },
 *   ]} />}>
 */
export function PageBreadcrumb({ items, className }: PageBreadcrumbProps) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <span aria-hidden="true" className="shrink-0 text-xs text-ink-faint">
                  /
                </span>
              )}
              {!isLast && item.href ? (
                <Link
                  href={item.href}
                  className={cn(
                    "truncate text-sm text-ink-subtle transition-colors hover:text-ink",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 rounded",
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(
                    "truncate text-sm",
                    isLast ? "font-medium text-ink" : "text-ink-subtle",
                  )}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
