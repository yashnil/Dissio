"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Square, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T } from "@/lib/motion";

type RecordState = "idle" | "requesting" | "recording" | "recorded" | "uploading" | "error";

interface DrillAttemptRecorderProps {
  drillId: string;
  userId: string;
  speechId: string;
  onAttemptSaved: () => void;
}

function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function getBestMime(): { mimeType: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mimeType: "", ext: "webm" };
  for (const c of [
    { mimeType: "audio/webm;codecs=opus", ext: "webm" },
    { mimeType: "audio/webm", ext: "webm" },
    { mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
    { mimeType: "audio/mp4", ext: "mp4" },
  ]) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: "", ext: "webm" };
}

export default function DrillAttemptRecorder({
  drillId,
  userId,
  speechId,
  onAttemptSaved,
}: DrillAttemptRecorderProps) {
  const [state, setState] = useState<RecordState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const extRef = useRef("webm");
  const urlRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  async function startRec() {
    setError("");
    setState("requesting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const { mimeType, ext } = getBestMime();
      extRef.current = ext;
      const mr = new MediaRecorder(s, mimeType ? { mimeType } : {});
      mrRef.current = mr;
      chunks.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      mr.onstop = () => {
        const newBlob = new Blob(chunks.current, { type: mimeType || "audio/webm" });
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const newUrl = URL.createObjectURL(newBlob);
        urlRef.current = newUrl;
        setBlob(newBlob);
        setUrl(newUrl);
        setState("recorded");
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        if (timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
      };

      mr.start();
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((n) => n + 1), 1000);
      setState("recording");
    } catch (err: unknown) {
      setState("error");
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone permission denied."
          : "Could not access microphone."
      );
    }
  }

  function stopRec() {
    mrRef.current?.stop();
  }

  function discardRec() {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setUrl(null);
    setBlob(null);
    setState("idle");
    setSeconds(0);
    setError("");
  }

  async function saveRec() {
    if (!blob) return;
    setState("uploading");
    const timestamp = Date.now();
    const path = `${userId}/${speechId}/drills/${drillId}/attempt-${timestamp}.${extRef.current}`;

    try {
      // 1. Upload to Supabase Storage
      const { createClient } = await import("@/lib/supabase");
      const sb = createClient();
      const { error: uploadErr } = await sb.storage.from("audio").upload(path, blob, {
        upsert: false,
        contentType: blob.type || "audio/webm",
      });

      if (uploadErr) {
        setState("error");
        setError(`Upload failed: ${uploadErr.message}`);
        return;
      }

      // 2. Save attempt record via API
      const { apiFetch } = await import("@/lib/api");
      await apiFetch(`/drills/${drillId}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_url: path }),
      });

      // 3. Clean up and notify parent
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setUrl(null);
      setBlob(null);
      setState("idle");
      setSeconds(0);
      onAttemptSaved();
    } catch (err: unknown) {
      setState("error");
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface-2 p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <Mic size={12} className="text-lav" />
        <span className="text-eyebrow text-ink-subtle">Record Attempt</span>
      </div>

      <AnimatePresence mode="wait">
        {state === "idle" || state === "requesting" || state === "error" ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={T.fast}
            className="flex flex-col items-center gap-3 py-4"
          >
            <motion.button
              type="button"
              onClick={startRec}
              disabled={state === "requesting"}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={T.fast}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-lav disabled:opacity-50"
            >
              <Mic size={20} className="text-white" />
            </motion.button>
            <p className="text-xs text-ink-subtle">
              {state === "requesting" ? "Requesting mic…" : "Tap to record"}
            </p>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-danger"
              >
                {error}
              </motion.p>
            )}
          </motion.div>
        ) : state === "recording" ? (
          <motion.div
            key="recording"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={T.fast}
            className="flex flex-col items-center gap-3 py-4"
          >
            <motion.button
              type="button"
              onClick={stopRec}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={T.fast}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-danger"
            >
              <Square size={14} className="fill-white text-white" />
            </motion.button>
            <motion.span
              key={seconds}
              initial={{ opacity: 0.5, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.12 }}
              className="font-mono text-xl font-semibold tabular-nums text-ink"
            >
              {formatTime(seconds)}
            </motion.span>
            <p className="text-xs text-ink-subtle">Recording…</p>
          </motion.div>
        ) : state === "recorded" && url ? (
          <motion.div
            key="recorded"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={T.base}
            className="flex flex-col gap-3"
          >
            <div className="rounded-md border border-hairline bg-surface-3 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-ink-subtle">Preview</span>
                <span className="font-mono text-xs text-ink-faint">{formatTime(seconds)}</span>
              </div>
              <audio src={url} controls className="h-8 w-full" />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveRec} size="sm" className="flex-1 gap-1.5">
                <Upload size={12} />
                Save Attempt
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={discardRec}
                className="gap-1.5 text-ink-subtle hover:border-danger/30 hover:text-danger"
              >
                <Trash2 size={12} />
                Discard
              </Button>
            </div>
          </motion.div>
        ) : state === "uploading" ? (
          <motion.div
            key="uploading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={T.fast}
            className="flex flex-col items-center gap-2 py-4"
          >
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-lav border-t-transparent" />
            <p className="text-xs text-ink-subtle">Saving attempt…</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
