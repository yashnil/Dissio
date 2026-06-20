"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Mic, Square, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T, EASE } from "@/lib/motion";
import RecordingMeter from "@/components/practice/RecordingMeter";
import { countdownAnnouncement, deriveSpeechTimeProgress } from "@/lib/practiceStudioModel";

export type RecordState =
  | "idle"
  | "requesting"
  | "countdown"
  | "recording"
  | "recorded"
  | "uploading"
  | "error";

interface RecordingStudioProps {
  recordState: RecordState;
  recordingSeconds: number;
  recordObjectUrl: string | null;
  recordError: string;
  /** Real 0..1 input level from the recorder's analyser (drives the meter). */
  level?: number;
  /** Time target in seconds for the selected speech type (for progress guidance). */
  targetSeconds?: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSaveRecording: () => void;
  onDiscardRecording: () => void;
}

function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

// ── Countdown (3-2-1-Speak) ────────────────────────────────────────────────────

function CountdownView({ count }: { count: number | "go" }) {
  return (
    <div className="flex flex-col items-center gap-5 py-8">
      {/* Live region: announces count to screen readers without polluting the visual timer */}
      <p className="sr-only" aria-live="assertive" aria-atomic="true">
        {countdownAnnouncement(count)}
      </p>

      <AnimatePresence mode="wait">
        <motion.div
          key={String(count)}
          initial={{ scale: 1.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-lav/50 bg-lav/10"
        >
          {count === "go" ? (
            <Mic size={28} className="text-lav" aria-hidden="true" />
          ) : (
            <span className="text-3xl font-bold tabular-nums text-lav">{count}</span>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-semibold text-ink">
          {count === "go" ? "Speak!" : "Get ready…"}
        </p>
        <p className="text-xs text-ink-subtle">3 · 2 · 1 · Go</p>
        <p className="mt-0.5 text-[10px] text-ink-faint">
          <kbd className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[9px]">Esc</kbd>
          {" "}to cancel
        </p>
      </div>
    </div>
  );
}

// ── Idle / requesting / error ──────────────────────────────────────────────────

function IdleView({
  state, error, onStart,
}: { state: RecordState; error: string; onStart: () => void }) {
  const isPermissionError = error.toLowerCase().includes("denied") ||
    error.toLowerCase().includes("permission") ||
    error.toLowerCase().includes("not allowed");
  const isUnsupportedError = error.toLowerCase().includes("not supported") ||
    error.toLowerCase().includes("mediarecorder");

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <p className="text-eyebrow text-ink-subtle">Practice Rep</p>

      {/* Live region: announces state transitions to screen readers */}
      <p className="sr-only" role="status" aria-live="polite">
        {state === "requesting"
          ? "Requesting microphone access"
          : state === "error"
            ? `Microphone error: ${error}`
            : "Ready to record. Press Space or the Start button to begin."}
      </p>

      {/* Mic button — no decorative ambient rings; shape and color carry sufficient meaning */}
      <button
        type="button"
        onClick={onStart}
        disabled={state === "requesting"}
        className={[
          "relative z-10 flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-lav",
          "transition-transform duration-150",
          "motion-safe:hover:scale-105 motion-safe:active:scale-95",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50",
        ].join(" ")}
        style={{ boxShadow: "0 0 32px -6px oklch(0.510 0.156 278 / 0.60)" }}
        aria-label={state === "requesting" ? "Requesting microphone access" : "Start recording"}
      >
        <Mic size={26} className="text-white" aria-hidden="true" />
      </button>

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-semibold text-ink">
          {state === "requesting" ? "Requesting microphone…" : "Ready when you are"}
        </p>
        <p className="text-xs text-ink-subtle">3-second countdown · speak for 30+ seconds</p>

        {state === "idle" && (
          <div className="mt-0.5 hidden items-center gap-2 rounded-full border border-hairline bg-surface-2 px-3 py-1.5 sm:flex">
            <kbd className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">Space</kbd>
            <span className="text-[10px] text-ink-faint">to begin</span>
            <span className="text-[10px] text-ink-faint/50">·</span>
            <kbd className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">Esc</kbd>
            <span className="text-[10px] text-ink-faint">to cancel</span>
          </div>
        )}
      </div>

      {state === "error" && error && (
        <div className="flex max-w-xs flex-col items-center gap-2 text-center">
          <p className="text-sm font-semibold text-danger">{error}</p>
          {isPermissionError && (
            <p className="text-xs text-ink-subtle">
              Allow microphone access in your browser settings, then refresh.
            </p>
          )}
          {isUnsupportedError && (
            <p className="text-xs text-ink-subtle">
              Try Chrome or Firefox, or use the Upload option instead.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Recording ──────────────────────────────────────────────────────────────────

function RecordingView({
  seconds, level, onStop, targetSeconds = 240,
}: { seconds: number; level: number; onStop: () => void; targetSeconds?: number }) {
  const progress = deriveSpeechTimeProgress(seconds, targetSeconds);

  return (
    <div className="flex flex-col items-center gap-5 py-5">
      {/* Live region: periodic announcement (every 30s) to avoid screen-reader spam */}
      {seconds > 0 && seconds % 30 === 0 && (
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          Recording: {formatTime(seconds)}
        </p>
      )}

      {/* LIVE badge — CSS pulse, respects prefers-reduced-motion */}
      <div
        className="flex items-center gap-2 rounded-full border border-danger/25 bg-danger/8 px-3 py-1.5"
        role="status"
        aria-label="Recording active"
      >
        <span
          className="h-1.5 w-1.5 rounded-full bg-danger motion-safe:animate-pulse"
          aria-hidden="true"
        />
        <span className="text-[10px] font-bold uppercase tracking-wider text-danger">
          Recording
        </span>
      </div>

      {/* Timer — dominant focal object; aria-hidden so screen readers don't tick per second */}
      <AnimatePresence mode="popLayout">
        <motion.span
          key={seconds}
          initial={{ opacity: 0.5, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.1, ease: EASE }}
          className="font-mono text-5xl font-bold tabular-nums tracking-tight text-ink"
          aria-hidden="true"
        >
          {formatTime(seconds)}
        </motion.span>
      </AnimatePresence>

      {/* Real input-level meter — reflects live mic, aria-hidden (visual confirmation only) */}
      <RecordingMeter level={level} bars={18} className="h-16" />

      {/* Stop button — single CSS ring; no JS-driven 3-ring pulse */}
      <div className="relative flex items-center justify-center">
        <span
          className="absolute h-[88px] w-[88px] rounded-full border border-danger/15 motion-safe:animate-ping"
          aria-hidden="true"
          style={{ animationDuration: "2.2s" }}
        />
        <button
          type="button"
          onClick={onStop}
          className={[
            "relative z-10 flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-danger",
            "transition-transform duration-150",
            "motion-safe:hover:scale-105 motion-safe:active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50",
          ].join(" ")}
          aria-label="Stop recording"
        >
          <Square size={20} className="fill-white text-white" aria-hidden="true" />
        </button>
      </div>

      {/* Progress nudge — text only, no fake percentage */}
      <div className="flex flex-col items-center gap-1 text-center">
        {progress.meetsMinimum ? (
          <p className="text-xs font-medium text-ok">{progress.nudge}</p>
        ) : (
          <p className="text-xs text-ink-subtle">
            Keep speaking ·{" "}
            <span className="tabular-nums">{progress.secondsToMinimum}s</span> to minimum
          </p>
        )}
        <p className="hidden text-[10px] text-ink-faint sm:block">
          <kbd className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[9px]">Space</kbd>
          {" "}to stop
        </p>
      </div>
    </div>
  );
}

// ── Recorded — playback + save/discard ────────────────────────────────────────

function RecordedView({
  url, seconds, onSave, onDiscard,
}: { url: string; seconds: number; onSave: () => void; onDiscard: () => void }) {
  return (
    <div className="flex flex-col gap-4 py-4">
      {/* SR announcement on mount */}
      <p className="sr-only" role="status" aria-live="polite">
        Recording complete — {formatTime(seconds)}. Review and save or discard.
      </p>

      <div className="rounded-xl border border-ok/20 bg-ok/5 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-ok">Rep complete</span>
          <span className="font-mono text-xs text-ink-faint">{formatTime(seconds)}</span>
        </div>
        <audio
          src={url}
          controls
          className="h-8 w-full"
          aria-label="Recorded speech playback"
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={onSave} size="sm" className="flex-1 gap-1.5">
          Analyze Speech
          <ArrowRight size={13} aria-hidden="true" />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onDiscard}
          className="gap-1.5 text-ink-subtle hover:border-danger/30 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
          aria-label="Discard recording and redo"
        >
          <Trash2 size={12} aria-hidden="true" />
          Redo
        </Button>
      </div>

      <p className="hidden text-center text-[10px] text-ink-faint sm:block">
        <kbd className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[9px]">Esc</kbd>
        {" "}to discard and redo
      </p>
    </div>
  );
}

// ── Uploading ─────────────────────────────────────────────────────────────────

function UploadingView() {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <p className="sr-only" role="status" aria-live="polite">Saving your recording</p>
      {/* CSS spin — respects prefers-reduced-motion automatically */}
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-lav">
        <RotateCcw
          size={15}
          className="text-white motion-safe:animate-spin"
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-semibold text-ink">Saving your rep…</p>
        <p className="text-xs text-ink-subtle">Analysis starts right after upload</p>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function RecordingStudio({
  recordState,
  recordingSeconds,
  recordObjectUrl,
  recordError,
  level = 0,
  targetSeconds = 240,
  onStartRecording,
  onStopRecording,
  onSaveRecording,
  onDiscardRecording,
}: RecordingStudioProps) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onStartRef = useRef(onStartRecording);
  useEffect(() => { onStartRef.current = onStartRecording; });

  const isCountingDown = countdown !== null;

  // Clear pending countdowns on unmount
  useEffect(() => {
    return () => { timerRefs.current.forEach(clearTimeout); };
  }, []);

  const handleStartWithCountdown = useCallback(() => {
    if (recordState !== "idle" && recordState !== "error") return;
    setCountdown(3);
    const t1 = setTimeout(() => setCountdown(2), 1000);
    const t2 = setTimeout(() => setCountdown(1), 2000);
    const t3 = setTimeout(() => {
      setCountdown(null);
      onStartRef.current();
    }, 3000);
    timerRefs.current = [t1, t2, t3];
  }, [recordState]);

  // Keep a ref so keyboard handler always calls the latest version
  const handleStartRef = useRef(handleStartWithCountdown);
  useEffect(() => { handleStartRef.current = handleStartWithCountdown; });

  function cancelCountdown() {
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
    setCountdown(null);
  }

  // Keyboard shortcuts: Space (start/stop), Esc (cancel/discard)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      const tag = el?.tagName?.toUpperCase();
      // Never intercept when the user is typing in a form field or a button/link is focused
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (!isCountingDown && (recordState === "idle" || recordState === "error")) {
          handleStartRef.current();
        } else if (recordState === "recording") {
          onStopRecording();
        }
      }

      if (e.code === "Escape") {
        if (isCountingDown) {
          cancelCountdown();
        } else if (recordState === "recorded") {
          onDiscardRecording();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isCountingDown, recordState, onStopRecording, onDiscardRecording]);

  return (
    <AnimatePresence mode="wait">
      {isCountingDown ? (
        <motion.div key="countdown" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T.fast}>
          <CountdownView count={countdown!} />
        </motion.div>
      ) : recordState === "recording" ? (
        <motion.div key="recording" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T.fast}>
          <RecordingView seconds={recordingSeconds} level={level} onStop={onStopRecording} targetSeconds={targetSeconds} />
        </motion.div>
      ) : recordState === "recorded" && recordObjectUrl ? (
        <motion.div key="recorded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T.fast}>
          <RecordedView url={recordObjectUrl} seconds={recordingSeconds} onSave={onSaveRecording} onDiscard={onDiscardRecording} />
        </motion.div>
      ) : recordState === "uploading" ? (
        <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T.fast}>
          <UploadingView />
        </motion.div>
      ) : (
        <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T.fast}>
          <IdleView state={recordState} error={recordError} onStart={handleStartWithCountdown} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
