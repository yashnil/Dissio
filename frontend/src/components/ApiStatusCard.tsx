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
    loading: "bg-ink-subtle animate-pulse",
    online: "bg-ok",
    offline: "bg-danger",
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
        <span className="text-sm font-medium text-ink">
          {label[status]}
        </span>
        {detail && (
          <span className="text-sm text-ink-subtle">
            — {detail}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
