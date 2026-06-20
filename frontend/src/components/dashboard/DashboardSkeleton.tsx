import { Skeleton } from "@/components/ui/skeleton";

/**
 * DashboardSkeleton — loading placeholder that mirrors the 6-tier hierarchy.
 * Structurally similar to the real content so there's no layout shift on load.
 */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading dashboard">

      {/* Tier 1: Next Best Action hero */}
      <div className="rounded-xl border border-hairline bg-surface-1 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Skeleton className="mt-0.5 h-11 w-11 shrink-0 rounded-lg" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-3.5 w-80 max-w-full" />
              <Skeleton className="h-3.5 w-64 max-w-full" />
            </div>
          </div>
          <Skeleton className="h-10 w-36 shrink-0 rounded-xl" />
        </div>
      </div>

      {/* Tier 3: Training loop */}
      <div className="rounded-xl border border-hairline bg-surface-1 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex flex-1 flex-col gap-2.5">
            <Skeleton className="h-3 w-24" />
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                  <Skeleton className="h-1.5 w-full rounded-full" />
                  <Skeleton className="h-2.5 w-12" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <Skeleton className="h-6 w-8" />
                <Skeleton className="h-2 w-10" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tiers 5 + 6: Drill queue + speech list */}
      <div className="flex flex-col gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-hairline bg-surface-1 px-5 py-4">
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
