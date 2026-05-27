"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import type { Speech } from "@/types";

const selectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm " +
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50";

export default function SessionPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [speechType, setSpeechType] = useState("constructive");
  const [side, setSide] = useState("");
  const [judgeType, setJudgeType] = useState("");
  const [topic, setTopic] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) {
          router.replace("/login");
        } else {
          setUserId(data.user.id);
        }
      })
      .finally(() => setUserLoading(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setError("");
    setSubmitting(true);

    try {
      const speech = await apiFetch<Speech>("/speeches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          title,
          speech_type: speechType,
          side: side || null,
          judge_type: judgeType || null,
          topic: topic || null,
        }),
      });
      router.push(`/speech/${speech.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (userLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-zinc-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          New Speech
        </h1>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← Back
        </button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Title
              </label>
              <Input
                required
                placeholder="e.g. 1AC Round 1 — State"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Speech Type
              </label>
              <select
                required
                className={selectClass}
                value={speechType}
                onChange={(e) => setSpeechType(e.target.value)}
                disabled={submitting}
              >
                <option value="constructive">Constructive</option>
                <option value="rebuttal">Rebuttal</option>
                <option value="summary">Summary</option>
                <option value="final_focus">Final Focus</option>
                <option value="crossfire">Crossfire</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Side
                </label>
                <select
                  className={selectClass}
                  value={side}
                  onChange={(e) => setSide(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">— optional —</option>
                  <option value="pro">Pro</option>
                  <option value="con">Con</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Judge Type
                </label>
                <select
                  className={selectClass}
                  value={judgeType}
                  onChange={(e) => setJudgeType(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">— optional —</option>
                  <option value="lay">Lay</option>
                  <option value="flow">Flow</option>
                  <option value="tech">Tech</option>
                  <option value="coach">Coach</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Resolution / Topic
              </label>
              <Input
                placeholder="e.g. Resolved: The United States federal government should…"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={submitting}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Saving…" : "Save Speech"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-zinc-400">
        Audio upload and AI analysis will be available after saving.
      </p>
    </main>
  );
}
