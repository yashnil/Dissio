"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { HealthResponse } from "@/types";

type Status = "loading" | "online" | "offline";

export default function ApiStatusCard() {
  const [status, setStatus] = useState<Status>("loading");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    apiFetch<HealthResponse>("/health")
      .then((data) => {
        setStatus("online");
        setDetail(data.service);
      })
      .catch((err: unknown) => {
        setStatus("offline");
        setDetail(err instanceof Error ? err.message : "Unknown error");
      });
  }, []);

  const dot: Record<Status, string> = {
    loading: "bg-zinc-400 animate-pulse",
    online: "bg-green-500",
    offline: "bg-red-500",
  };

  const label: Record<Status, string> = {
    loading: "Checking API…",
    online: "API online",
    offline: "API offline",
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span className={`h-2.5 w-2.5 rounded-full ${dot[status]}`} />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label[status]}
        </span>
        {detail && (
          <span className="text-sm text-zinc-400 dark:text-zinc-500">
            — {detail}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
