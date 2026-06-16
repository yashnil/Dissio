"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { isJobActive } from "@/lib/jobHelpers";
import type { AnalysisJob, AnalyzeResponse, ArgumentMap, Drill, FeedbackReport, Speech, Transcript } from "@/types";

const POLL_INTERVAL_MS = 2000;

export interface SpeechAnalysisResults {
  transcript?: Transcript;
  argMap?: ArgumentMap;
  feedback?: FeedbackReport;
  drills?: Drill[];
}

interface UseSpeechProcessingOptions {
  speechId: string;
  userId: string | null;
  /** Whether a coaching report already exists (auto-analysis guard). */
  hasFeedback: boolean;
  /** Legacy manual-analysis-in-progress guard (preserved from original). */
  analyzing: boolean;
  /** Apply fetched report data once a job succeeds. */
  onResults: (results: SpeechAnalysisResults) => void;
  /** Receive the refreshed speech record once a job succeeds. */
  onSpeechRefresh: (speech: Speech) => void;
}

export interface UseSpeechProcessing {
  activeJob: AnalysisJob | null;
  error: string;
  isRetrying: boolean;
  startAnalysis: () => Promise<void>;
  retryAnalysis: () => Promise<void>;
  /** Auto-start analysis once, after an audio upload completes. */
  autoStartAfterUpload: (uploadedSpeech: Speech) => Promise<void>;
  /** Resume from a recovered job found on initial load (uid from the load). */
  resumeFromRecovery: (job: AnalysisJob, kind: "in_progress" | "failed", uid: string) => void;
  /** Allow auto-analysis to fire again (e.g. after the audio is reset). */
  resetAutoStart: () => void;
  stopPolling: () => void;
}

export function useSpeechProcessing(opts: UseSpeechProcessingOptions): UseSpeechProcessing {
  const { speechId, userId } = opts;
  const [activeJob, setActiveJob] = useState<AnalysisJob | null>(null);
  const [error, setError] = useState("");
  const [isRetrying, setIsRetrying] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStartedRef = useRef(false);
  const mountedRef = useRef(true);
  /** Generation token — only the newest poll loop may apply results. */
  const genRef = useRef(0);

  // Keep the latest callbacks/guards without re-creating poll loops.
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, []);

  const startPoll = useCallback(
    (jobId: string, uid: string) => {
      stopPolling();
      const gen = ++genRef.current;
      pollRef.current = setInterval(async () => {
        try {
          const job = await apiFetch<AnalysisJob>(`/jobs/${jobId}?user_id=${uid}`);
          // Ignore stale responses (newer poll loop started, or unmounted).
          if (gen !== genRef.current || !mountedRef.current) return;
          setActiveJob(job);
          if (!isJobActive(job.status)) {
            stopPolling();
            if (job.status === "succeeded") {
              const [txData, argData, fbData, drillData] = await Promise.allSettled([
                apiFetch<Transcript>(`/speeches/${speechId}/transcript?user_id=${uid}`),
                apiFetch<ArgumentMap>(`/speeches/${speechId}/argument-map?user_id=${uid}`),
                apiFetch<FeedbackReport>(`/speeches/${speechId}/feedback?user_id=${uid}`),
                apiFetch<Drill[]>(`/speeches/${speechId}/drills?user_id=${uid}`),
              ]);
              if (gen !== genRef.current || !mountedRef.current) return;
              optsRef.current.onResults({
                transcript: txData.status === "fulfilled" ? txData.value : undefined,
                argMap: argData.status === "fulfilled" ? argData.value : undefined,
                feedback: fbData.status === "fulfilled" ? fbData.value : undefined,
                drills: drillData.status === "fulfilled" ? drillData.value : undefined,
              });
              const updatedSpeech = await apiFetch<Speech>(`/speeches/${speechId}?user_id=${uid}`).catch(() => null);
              if (updatedSpeech && gen === genRef.current && mountedRef.current) {
                optsRef.current.onSpeechRefresh(updatedSpeech);
              }
              if (mountedRef.current) setActiveJob(null);
            }
          }
        } catch {
          /* transient poll error — keep polling until terminal status */
        }
      }, POLL_INTERVAL_MS);
    },
    [speechId, stopPolling],
  );

  const startAnalysis = useCallback(async () => {
    if (!userId) return;
    setError("");
    try {
      const resp = await apiFetch<AnalyzeResponse>(
        `/speeches/${speechId}/analyze?user_id=${userId}`,
        { method: "POST" },
      );
      const job = await apiFetch<AnalysisJob>(`/jobs/${resp.job_id}?user_id=${userId}`);
      if (!mountedRef.current) return;
      setActiveJob(job);
      if (isJobActive(job.status)) startPoll(job.id, userId);
    } catch (e: unknown) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : "Analysis failed. Please try again.");
    }
  }, [speechId, userId, startPoll]);

  const retryAnalysis = useCallback(async () => {
    if (!activeJob || !userId) return;
    setIsRetrying(true);
    setError("");
    try {
      const job = await apiFetch<AnalysisJob>(
        `/jobs/${activeJob.id}/retry?user_id=${userId}`,
        { method: "POST" },
      );
      if (!mountedRef.current) return;
      setActiveJob(job);
      if (isJobActive(job.status)) startPoll(job.id, userId);
    } catch (e: unknown) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : "Retry failed. Please try again.");
    } finally {
      if (mountedRef.current) setIsRetrying(false);
    }
  }, [activeJob, userId, startPoll]);

  const autoStartAfterUpload = useCallback(async (uploadedSpeech: Speech) => {
    if (autoStartedRef.current) return;
    if (optsRef.current.analyzing) return;
    if (optsRef.current.hasFeedback) return;
    if (!uploadedSpeech.audio_url) return;
    autoStartedRef.current = true;
    await startAnalysis();
  }, [startAnalysis]);

  const resumeFromRecovery = useCallback(
    (job: AnalysisJob, kind: "in_progress" | "failed", uid: string) => {
      setActiveJob(job);
      if (kind === "in_progress" && uid) startPoll(job.id, uid);
    },
    [startPoll],
  );

  const resetAutoStart = useCallback(() => {
    autoStartedRef.current = false;
  }, []);

  return {
    activeJob,
    error,
    isRetrying,
    startAnalysis,
    retryAnalysis,
    autoStartAfterUpload,
    resumeFromRecovery,
    resetAutoStart,
    stopPolling,
  };
}
