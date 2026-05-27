"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import type { ArgumentMap, FeedbackReport, Speech, Transcript } from "@/types";

const ALLOWED_EXTENSIONS = ["mp3", "wav", "m4a", "webm", "ogg", "mp4"];
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — Supabase free tier limit

const SPEECH_TYPE_LABEL: Record<string, string> = {
  constructive: "Constructive",
  rebuttal: "Rebuttal",
  summary: "Summary",
  final_focus: "Final Focus",
  crossfire: "Crossfire",
};

type RecordState =
  | "idle"
  | "requesting"
  | "recording"
  | "recorded"
  | "uploading"
  | "error";

type AudioInputMode = "record" | "upload";

function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Unsupported file type ".${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`;
  }
  if (file.size > MAX_BYTES) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 50 MB.`;
  }
  return null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function getBestMimeType(): { mimeType: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mimeType: "", ext: "webm" };
  const candidates = [
    { mimeType: "audio/webm;codecs=opus", ext: "webm" },
    { mimeType: "audio/webm", ext: "webm" },
    { mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
    { mimeType: "audio/mp4", ext: "mp4" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: "", ext: "webm" };
}

export default function SpeechDetailPage() {
  const { id: speechId } = useParams<{ id: string }>();
  const router = useRouter();

  // ── Page state ─────────────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);
  const [speech, setSpeech] = useState<Speech | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  // ── Audio input mode toggle ────────────────────────────────────────────────
  const [audioInputMode, setAudioInputMode] = useState<AudioInputMode>("record");

  // ── Recording state ────────────────────────────────────────────────────────
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordBlob, setRecordBlob] = useState<Blob | null>(null);
  const [recordObjectUrl, setRecordObjectUrl] = useState<string | null>(null);
  const [recordError, setRecordError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordExtRef = useRef<string>("webm");
  const recordObjectUrlRef = useRef<string | null>(null);

  // ── File upload state ──────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // ── Transcript state ───────────────────────────────────────────────────────
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState("");

  // ── Argument map state ─────────────────────────────────────────────────────
  const [argumentMap, setArgumentMap] = useState<ArgumentMap | null>(null);
  const [generatingFlow, setGeneratingFlow] = useState(false);
  const [flowError, setFlowError] = useState("");

  // ── Feedback report state ──────────────────────────────────────────────────
  const [feedbackReport, setFeedbackReport] = useState<FeedbackReport | null>(null);
  const [generatingFeedback, setGeneratingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");

  // Cleanup media resources on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (recordObjectUrlRef.current) URL.revokeObjectURL(recordObjectUrlRef.current);
    };
  }, []);

  // Load user + speech + existing transcript on mount
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) {
          router.replace("/login");
          return null;
        }
        setUserId(data.user.id);
        return apiFetch<Speech>(`/speeches/${speechId}`);
      })
      .then(async (s) => {
        if (!s) return;
        setSpeech(s);
        try {
          const t = await apiFetch<Transcript>(`/speeches/${speechId}/transcript`);
          setTranscript(t);
        } catch {
          // 404 expected when no transcript yet — ignore
        }
        try {
          const m = await apiFetch<ArgumentMap>(`/speeches/${speechId}/argument-map`);
          setArgumentMap(m);
        } catch {
          // 404 expected when no argument map yet — ignore
        }
        try {
          const fb = await apiFetch<FeedbackReport>(`/speeches/${speechId}/feedback`);
          setFeedbackReport(fb);
        } catch {
          // 404 expected when no feedback yet — ignore
        }
      })
      .catch(() => setPageError("Could not load speech. Is the backend running?"))
      .finally(() => setPageLoading(false));
  }, [speechId, router]);

  // ── Recording handlers ─────────────────────────────────────────────────────

  async function handleStartRecording() {
    setRecordError("");
    setRecordState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const { mimeType, ext } = getBestMimeType();
      recordExtRef.current = ext;

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });

        // Revoke previous URL before creating a new one
        if (recordObjectUrlRef.current) {
          URL.revokeObjectURL(recordObjectUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        recordObjectUrlRef.current = url;

        setRecordBlob(blob);
        setRecordObjectUrl(url);
        setRecordState("recorded");

        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      recorder.start();
      setRecordingSeconds(0);
      timerRef.current = setInterval(
        () => setRecordingSeconds((s) => s + 1),
        1000,
      );
      setRecordState("recording");
    } catch (err: unknown) {
      setRecordState("error");
      if (err instanceof Error && err.name === "NotAllowedError") {
        setRecordError(
          "Microphone permission denied. Allow microphone access in your browser settings and try again.",
        );
      } else {
        setRecordError(
          "Could not access microphone. Check your browser settings.",
        );
      }
    }
  }

  function handleStopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function handleDiscardRecording() {
    if (recordObjectUrlRef.current) {
      URL.revokeObjectURL(recordObjectUrlRef.current);
      recordObjectUrlRef.current = null;
    }
    setRecordObjectUrl(null);
    setRecordBlob(null);
    setRecordState("idle");
    setRecordingSeconds(0);
    setRecordError("");
  }

  async function handleSaveRecording() {
    if (!recordBlob || !userId) return;
    setRecordState("uploading");

    const ext = recordExtRef.current;
    const storagePath = `${userId}/${speechId}/audio.${ext}`;

    try {
      const supabase = createClient();
      const { error: storageError } = await supabase.storage
        .from("audio")
        .upload(storagePath, recordBlob, {
          upsert: true,
          contentType: recordBlob.type || "audio/webm",
        });

      if (storageError) {
        setRecordState("error");
        setRecordError(`Upload failed: ${storageError.message}`);
        return;
      }

      const updated = await apiFetch<Speech>(`/speeches/${speechId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_url: storagePath }),
      });

      setSpeech(updated);
      if (recordObjectUrlRef.current) {
        URL.revokeObjectURL(recordObjectUrlRef.current);
        recordObjectUrlRef.current = null;
      }
      setRecordObjectUrl(null);
      setRecordBlob(null);
      setRecordState("idle");
    } catch (err: unknown) {
      setRecordState("error");
      setRecordError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    }
  }

  // ── File upload handlers ───────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError("");
    setUploadError("");
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const err = validateFile(file);
    if (err) {
      setFileError(err);
      setSelectedFile(null);
      e.target.value = "";
    } else {
      setSelectedFile(file);
    }
  }

  async function handleUpload() {
    if (!selectedFile || !userId || !speech) return;
    setUploadError("");
    setUploading(true);

    const ext = selectedFile.name.split(".").pop()!.toLowerCase();
    const storagePath = `${userId}/${speechId}/audio.${ext}`;

    try {
      const supabase = createClient();
      const { error: storageError } = await supabase.storage
        .from("audio")
        .upload(storagePath, selectedFile, { upsert: true });

      if (storageError) {
        setUploadError(`Upload failed: ${storageError.message}`);
        return;
      }

      const updated = await apiFetch<Speech>(`/speeches/${speechId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_url: storagePath }),
      });

      setSpeech(updated);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  // ── Transcription handler ──────────────────────────────────────────────────

  async function handleTranscribe() {
    if (!speech?.audio_url) return;
    setTranscribeError("");
    setTranscribing(true);
    try {
      const t = await apiFetch<Transcript>(`/speeches/${speechId}/transcribe`, {
        method: "POST",
      });
      setTranscript(t);
      setSpeech((prev) => (prev ? { ...prev, status: "done" } : prev));
    } catch (err: unknown) {
      setTranscribeError(
        err instanceof Error ? err.message : "Transcription failed. Please try again.",
      );
      setSpeech((prev) => (prev ? { ...prev, status: "error" } : prev));
    } finally {
      setTranscribing(false);
    }
  }

  // ── Feedback generation handler ────────────────────────────────────────────

  async function handleGenerateFeedback() {
    if (!argumentMap) return;
    setFeedbackError("");
    setGeneratingFeedback(true);
    try {
      const fb = await apiFetch<FeedbackReport>(
        `/speeches/${speechId}/generate-feedback`,
        { method: "POST" },
      );
      setFeedbackReport(fb);
      setSpeech((prev) => (prev ? { ...prev, status: "done" } : prev));
    } catch (err: unknown) {
      setFeedbackError(
        err instanceof Error ? err.message : "Feedback generation failed. Please try again.",
      );
      setSpeech((prev) => (prev ? { ...prev, status: "error" } : prev));
    } finally {
      setGeneratingFeedback(false);
    }
  }

  // ── Flow generation handler ────────────────────────────────────────────────

  async function handleGenerateFlow() {
    if (!transcript) return;
    setFlowError("");
    setGeneratingFlow(true);
    try {
      const m = await apiFetch<ArgumentMap>(
        `/speeches/${speechId}/extract-arguments`,
        { method: "POST" },
      );
      setArgumentMap(m);
      setSpeech((prev) => (prev ? { ...prev, status: "done" } : prev));
    } catch (err: unknown) {
      setFlowError(
        err instanceof Error ? err.message : "Flow generation failed. Please try again.",
      );
      setSpeech((prev) => (prev ? { ...prev, status: "error" } : prev));
    } finally {
      setGeneratingFlow(false);
    }
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (pageLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-zinc-400">Loading…</p>
      </main>
    );
  }

  if (pageError || !speech) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Dashboard
        </Link>
        <p className="text-sm text-red-600">{pageError || "Speech not found."}</p>
      </main>
    );
  }

  const date = new Date(speech.created_at).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Disable mode toggle while actively using mic or uploading a recording
  const recordingBusy =
    recordState === "requesting" ||
    recordState === "recording" ||
    recordState === "uploading";

  // ── Page ───────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← Dashboard
        </Link>
      </div>

      {/* Speech metadata */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {speech.title}
        </h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
          <span>{SPEECH_TYPE_LABEL[speech.speech_type] ?? speech.speech_type}</span>
          {speech.side && <span className="capitalize">{speech.side}</span>}
          {speech.judge_type && (
            <span className="capitalize">{speech.judge_type} judge</span>
          )}
          <span>{date}</span>
        </div>
        {speech.topic && (
          <p className="mt-1 text-sm text-zinc-400">{speech.topic}</p>
        )}
      </div>

      {/* Audio card */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 pb-6">
          <p className="font-medium text-zinc-800 dark:text-zinc-100">Audio</p>

          {speech.audio_url ? (
            // ── Audio already uploaded ──────────────────────────────────────
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  Audio uploaded
                </span>
              </div>
              <p className="break-all font-mono text-xs text-zinc-400">
                {speech.audio_url}
              </p>
              <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <p className="mb-2 text-xs text-zinc-400">Replace audio file:</p>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,.wav,.m4a,.webm,.ogg,.mp4"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-300"
                  />
                  {selectedFile && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploading}
                      onClick={handleUpload}
                    >
                      {uploading ? "Uploading…" : "Replace"}
                    </Button>
                  )}
                </div>
                {uploadError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {uploadError}
                  </p>
                )}
              </div>
            </div>
          ) : (
            // ── No audio yet ────────────────────────────────────────────────
            <div className="flex flex-col gap-4">
              {/* Mode toggle */}
              <div className="flex gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-700">
                {(["record", "upload"] as AudioInputMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={recordingBusy}
                    onClick={() => setAudioInputMode(mode)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                      audioInputMode === mode
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                        : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    }`}
                  >
                    {mode === "record" ? "Record" : "Upload file"}
                  </button>
                ))}
              </div>

              {audioInputMode === "record" ? (
                // ── Record mode ───────────────────────────────────────────
                <div className="flex flex-col gap-3">
                  {recordState === "idle" && (
                    <Button onClick={handleStartRecording} className="w-full">
                      Start Recording
                    </Button>
                  )}

                  {recordState === "requesting" && (
                    <p className="text-center text-sm text-zinc-500">
                      Requesting microphone permission…
                    </p>
                  )}

                  {recordState === "recording" && (
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                        <span className="font-mono text-lg font-semibold text-zinc-800 dark:text-zinc-200">
                          {formatTime(recordingSeconds)}
                        </span>
                      </div>
                      <Button
                        onClick={handleStopRecording}
                        className="w-full border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                        variant="outline"
                      >
                        Stop Recording
                      </Button>
                    </div>
                  )}

                  {recordState === "recorded" && recordObjectUrl && (
                    <div className="flex flex-col gap-3">
                      <audio src={recordObjectUrl} controls className="w-full" />
                      <p className="text-center text-xs text-zinc-400">
                        {formatTime(recordingSeconds)} recorded
                      </p>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleSaveRecording}
                          className="flex-1"
                        >
                          Save Recording
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleDiscardRecording}
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
                  )}

                  {recordState === "uploading" && (
                    <p className="text-center text-sm text-zinc-500">
                      Saving recording…
                    </p>
                  )}

                  {recordState === "error" && (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {recordError}
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setRecordState("idle");
                          setRecordError("");
                        }}
                        className="w-full"
                      >
                        Try Again
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                // ── Upload mode ───────────────────────────────────────────
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-zinc-500">
                    Accepted formats: {ALLOWED_EXTENSIONS.join(", ")}. Max 50 MB.
                  </p>

                  <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-zinc-200 p-8 text-center transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500">
                    <span className="text-2xl">📁</span>
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {selectedFile ? selectedFile.name : "Click to select a file"}
                    </span>
                    {selectedFile && (
                      <span className="text-xs text-zinc-400">
                        {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".mp3,.wav,.m4a,.webm,.ogg,.mp4"
                      onChange={handleFileChange}
                      disabled={uploading}
                      className="sr-only"
                    />
                  </label>

                  {fileError && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {fileError}
                    </p>
                  )}

                  {uploadError && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {uploadError}
                      {uploadError.includes("403") || uploadError.includes("policy") ? (
                        <span className="mt-1 block text-xs text-zinc-500">
                          Check that the Supabase Storage &quot;audio&quot; bucket has
                          INSERT policy for authenticated users.
                        </span>
                      ) : null}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      disabled={!selectedFile || uploading}
                      onClick={handleUpload}
                      className="w-full"
                    >
                      {uploading ? "Uploading…" : "Upload Audio"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push("/dashboard")}
                      disabled={uploading}
                    >
                      Skip
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transcript card — only shown once audio is uploaded */}
      {speech.audio_url && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 pb-6">
            <p className="font-medium text-zinc-800 dark:text-zinc-100">Transcript</p>

            {transcript ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    Transcribed
                    {transcript.word_count != null
                      ? ` · ${transcript.word_count} words`
                      : ""}
                  </span>
                </div>
                <p className="whitespace-pre-wrap rounded-md bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  {transcript.text}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-zinc-500">
                  Transcribe your speech using OpenAI Whisper. This usually takes
                  10–30 seconds depending on length.
                </p>
                {transcribeError && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {transcribeError}
                  </p>
                )}
                <Button
                  disabled={transcribing}
                  onClick={handleTranscribe}
                  className="w-full"
                >
                  {transcribing ? "Transcribing…" : "Transcribe Audio"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Flow card — only shown once a transcript exists */}
      {transcript && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 pb-6">
            <p className="font-medium text-zinc-800 dark:text-zinc-100">Flow</p>

            {argumentMap ? (
              // ── Flow table ──────────────────────────────────────────────
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      {["Label", "Claim", "Warrant", "Evidence", "Impact", "Type", "Issues"].map(
                        (h) => (
                          <th
                            key={h}
                            className="pb-2 pr-4 font-medium text-zinc-500 dark:text-zinc-400"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {argumentMap.arguments.map((arg, i) => (
                      <tr
                        key={i}
                        className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800"
                      >
                        <td className="py-3 pr-4 font-medium text-zinc-800 dark:text-zinc-200 min-w-[120px]">
                          {arg.label}
                        </td>
                        <td className="py-3 pr-4 text-zinc-700 dark:text-zinc-300 max-w-[180px]">
                          {arg.claim}
                        </td>
                        <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400 max-w-[180px]">
                          {arg.warrant}
                        </td>
                        <td className="py-3 pr-4 text-zinc-500 dark:text-zinc-500 max-w-[160px] italic">
                          {arg.evidence ?? <span className="not-italic text-zinc-300 dark:text-zinc-600">—</span>}
                        </td>
                        <td className="py-3 pr-4 text-zinc-700 dark:text-zinc-300 max-w-[180px]">
                          {arg.impact}
                        </td>
                        <td className="py-3 pr-4">
                          <ArgumentTypeBadge type={arg.argument_type} />
                        </td>
                        <td className="py-3 text-zinc-500 dark:text-zinc-400 max-w-[180px]">
                          {arg.issues.length === 0 ? (
                            <span className="text-green-600 dark:text-green-400">none</span>
                          ) : (
                            <ul className="list-inside list-disc space-y-0.5">
                              {arg.issues.map((issue, j) => (
                                <li key={j} className="text-xs">
                                  {issue}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {argumentMap.arguments.length === 0 && (
                  <p className="mt-3 text-sm text-zinc-400">
                    No arguments were extracted from this transcript.
                  </p>
                )}
              </div>
            ) : (
              // ── No flow yet ─────────────────────────────────────────────
              <div className="flex flex-col gap-3">
                <p className="text-sm text-zinc-500">
                  Generate a structured flow from your transcript using AI.
                  This extracts claims, warrants, evidence, and impacts.
                </p>
                {flowError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{flowError}</p>
                )}
                <Button
                  disabled={generatingFlow}
                  onClick={handleGenerateFlow}
                  className="w-full"
                >
                  {generatingFlow ? "Generating flow…" : "Generate Flow"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Feedback card — only shown once an argument map exists */}
      {argumentMap && (
        <Card>
          <CardContent className="flex flex-col gap-6 pt-6 pb-6">
            <p className="font-medium text-zinc-800 dark:text-zinc-100">Feedback</p>

            {feedbackReport ? (
              <div className="flex flex-col gap-8">
                {/* Section 1: Judge Ballot Overview */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-3">
                    <span className="text-5xl font-bold text-zinc-900 dark:text-zinc-50">
                      {feedbackReport.overall_score ?? "—"}
                    </span>
                    <span className="text-sm text-zinc-500">/ 100</span>
                  </div>
                  {feedbackReport.summary && (
                    <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {feedbackReport.summary}
                    </p>
                  )}
                </div>

                {/* Section 2: Score Breakdown */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                    Score Breakdown
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {(
                      [
                        ["Clash", feedbackReport.scores.clash],
                        ["Weighing", feedbackReport.scores.weighing],
                        ["Extensions", feedbackReport.scores.extensions],
                        ["Drops", feedbackReport.scores.drops],
                        ["Judge Adapt.", feedbackReport.scores.judge_adaptation],
                      ] as [string, number][]
                    ).map(([label, score]) => (
                      <div
                        key={label}
                        className="flex flex-col items-center rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900"
                      >
                        <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                          {score}
                        </span>
                        <span className="text-xs text-zinc-400">/ 20</span>
                        <span className="mt-1 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 3: Decision Logic / RFD */}
                {feedbackReport.raw_feedback?.decision_logic && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                      Decision Logic (RFD)
                    </p>
                    <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {feedbackReport.raw_feedback.decision_logic}
                    </p>
                  </div>
                )}

                {/* Section 4: Argument-Level Diagnostics */}
                {(feedbackReport.raw_feedback?.dropped_or_undercovered_arguments?.length ||
                  feedbackReport.raw_feedback?.warranting_diagnostics?.length ||
                  feedbackReport.raw_feedback?.weighing_diagnostics?.length ||
                  feedbackReport.raw_feedback?.evidence_diagnostics?.length) ? (
                  <div className="flex flex-col gap-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                      Argument-Level Diagnostics
                    </p>
                    {feedbackReport.raw_feedback?.dropped_or_undercovered_arguments?.length ? (
                      <DiagnosticList
                        label="Dropped / Undercovered Arguments"
                        items={feedbackReport.raw_feedback.dropped_or_undercovered_arguments}
                        variant="warn"
                      />
                    ) : null}
                    {feedbackReport.raw_feedback?.warranting_diagnostics?.length ? (
                      <DiagnosticList
                        label="Warranting"
                        items={feedbackReport.raw_feedback.warranting_diagnostics}
                      />
                    ) : null}
                    {feedbackReport.raw_feedback?.weighing_diagnostics?.length ? (
                      <DiagnosticList
                        label="Weighing"
                        items={feedbackReport.raw_feedback.weighing_diagnostics}
                      />
                    ) : null}
                    {feedbackReport.raw_feedback?.evidence_diagnostics?.length ? (
                      <DiagnosticList
                        label="Evidence"
                        items={feedbackReport.raw_feedback.evidence_diagnostics}
                      />
                    ) : null}
                  </div>
                ) : null}

                {/* Section 5: Strengths & Weaknesses */}
                {(feedbackReport.strengths.length > 0 || feedbackReport.weaknesses.length > 0) && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {feedbackReport.strengths.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-green-600 dark:text-green-400">
                          Strengths
                        </p>
                        <ul className="flex flex-col gap-1.5">
                          {feedbackReport.strengths.map((s, i) => (
                            <li
                              key={i}
                              className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                            >
                              <span className="mt-0.5 shrink-0 text-green-500">✓</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {feedbackReport.weaknesses.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-red-500 dark:text-red-400">
                          Weaknesses
                        </p>
                        <ul className="flex flex-col gap-1.5">
                          {feedbackReport.weaknesses.map((w, i) => (
                            <li
                              key={i}
                              className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                            >
                              <span className="mt-0.5 shrink-0 text-red-500">✕</span>
                              {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Section 6: Judge Adaptation */}
                {feedbackReport.raw_feedback?.judge_adaptation_notes && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                      Judge Adaptation
                    </p>
                    <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {feedbackReport.raw_feedback.judge_adaptation_notes}
                    </p>
                  </div>
                )}

                {/* Section 7: Top 3 Priorities & Recommendations */}
                {(feedbackReport.raw_feedback?.top_3_priorities?.length ||
                  feedbackReport.raw_feedback?.recommendations?.length) ? (
                  <div className="flex flex-col gap-4">
                    {feedbackReport.raw_feedback?.top_3_priorities?.length ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                          Top 3 Priorities for Next Recording
                        </p>
                        <ol className="flex flex-col gap-2">
                          {feedbackReport.raw_feedback.top_3_priorities.map((p, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300"
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                                {i + 1}
                              </span>
                              {p}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {feedbackReport.raw_feedback?.recommendations?.length ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                          Recommendations
                        </p>
                        <ul className="flex flex-col gap-1.5">
                          {feedbackReport.raw_feedback.recommendations.map((r, i) => (
                            <li
                              key={i}
                              className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                            >
                              <span className="mt-0.5 shrink-0 text-zinc-400">→</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-zinc-500">
                  Generate an AI ballot from your speech. The judge evaluates argument
                  structure, clash, weighing, drops, and judge adaptation.
                </p>
                {feedbackError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{feedbackError}</p>
                )}
                <Button
                  disabled={generatingFeedback}
                  onClick={handleGenerateFeedback}
                  className="w-full"
                >
                  {generatingFeedback ? "Generating feedback…" : "Generate Feedback"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Button
        variant="outline"
        className="w-full"
        onClick={() => router.push("/dashboard")}
      >
        Back to Dashboard
      </Button>
    </main>
  );
}

function DiagnosticList({
  label,
  items,
  variant = "default",
}: {
  label: string;
  items: string[];
  variant?: "default" | "warn";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li
            key={i}
            className={`text-sm ${
              variant === "warn"
                ? "text-amber-700 dark:text-amber-400"
                : "text-zinc-700 dark:text-zinc-300"
            }`}
          >
            · {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArgumentTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    offense:
      "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    defense:
      "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    weighing:
      "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    response:
      "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    unclear:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        styles[type] ?? styles.unclear
      }`}
    >
      {type}
    </span>
  );
}
