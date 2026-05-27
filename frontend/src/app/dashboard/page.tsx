"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ApiStatusCard from "@/components/ApiStatusCard";
import LogoutButton from "@/components/LogoutButton";
import { createClient } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import type { Speech } from "@/types";

const SPEECH_TYPE_LABEL: Record<string, string> = {
  constructive: "Constructive",
  rebuttal: "Rebuttal",
  summary: "Summary",
  final_focus: "Final Focus",
  crossfire: "Crossfire",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  transcribing: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  analyzing: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  done: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

function SpeechCard({ speech }: { speech: Speech }) {
  const date = new Date(speech.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Link href={`/speech/${speech.id}`} className="block">
      <Card className="transition-colors hover:border-zinc-400 dark:hover:border-zinc-600">
        <CardContent className="flex flex-col gap-2 pt-4 pb-5">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-zinc-900 dark:text-zinc-50 leading-tight">
              {speech.title}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              {speech.audio_url ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                  Audio
                </span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  No audio
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[speech.status] ?? STATUS_STYLE.pending}`}
              >
                {speech.status}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
            <span>{SPEECH_TYPE_LABEL[speech.speech_type] ?? speech.speech_type}</span>
            {speech.side && <span className="capitalize">{speech.side}</span>}
            {speech.judge_type && (
              <span className="capitalize">{speech.judge_type} judge</span>
            )}
            <span>{date}</span>
          </div>

          {speech.topic && (
            <p className="text-sm text-zinc-400 line-clamp-1" title={speech.topic}>
              {speech.topic}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) {
          router.replace("/login");
          return;
        }
        setUserId(data.user.id);
        return apiFetch<Speech[]>(`/speeches?user_id=${data.user.id}`);
      })
      .then((rows) => {
        if (rows) setSpeeches(rows);
      })
      .catch(() => setError("Could not load speeches. Is the backend running?"))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h1>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/session">New Session</Link>
          </Button>
          <LogoutButton />
        </div>
      </div>

      <ApiStatusCard />

      {/* Speech list */}
      {loading && (
        <p className="text-sm text-zinc-400">Loading speeches…</p>
      )}

      {!loading && error && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && speeches.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-zinc-400">No speeches yet.</p>
            <p className="text-sm text-zinc-400">
              Save your first speech record to get started.
            </p>
            <Button asChild variant="outline" className="mt-2">
              <Link href="/session">New Session</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && speeches.length > 0 && (
        <div className="flex flex-col gap-3">
          {speeches.map((s) => (
            <SpeechCard key={s.id} speech={s} />
          ))}
        </div>
      )}
    </main>
  );
}
