"use client";

import AppShell from "@/components/shell/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Initial-load skeleton for the speech route (geometry matches the report). */
export default function SpeechLoadingState() {
  return (
    <AppShell maxWidth="full" bare>
      <div
        className="mx-auto flex max-w-5xl flex-col gap-5 px-6 py-9"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">Loading your speech…</span>
        <Skeleton className="h-6 w-48 rounded-lg" />
        <Skeleton className="h-4 w-60 rounded-lg" />
        <Skeleton className="h-8 w-full rounded-full" />
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="py-8">
              <Skeleton className="h-20 w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
