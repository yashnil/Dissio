"use client";

import { useState } from "react";
import * as roomApi from "@/lib/roomApi";
import { ApiError } from "@/lib/api";
import {
  canToggleCrossfireReady,
  connectionStateLabel,
  crossfireReadyCountLabel,
  crossfireReadyCounts,
  crossfireReadyDisabledReason,
  crossfireReadyLabel,
  crossfirePartnerReadyLabel,
  isViewerCrossfireReady,
} from "@/lib/roomModel";
import { PHASE_LABELS } from "@/lib/roundModel";
import type {
  RoundPhaseType,
  RoundRoom,
  RoundRoomParticipant,
  RoundRoomStateResponse,
  RoundSide,
} from "@/types/round";

interface Props {
  roomId: string;
  room: RoundRoom;
  participants: RoundRoomParticipant[];
  viewerParticipant: RoundRoomParticipant | undefined;
  studentSide: RoundSide;
  currentPhase: RoundPhaseType;
  pollActive: boolean;
  onReadyChanged: (state: RoundRoomStateResponse) => void;
}

export function CrossfireReadinessPanel({
  roomId,
  room,
  participants,
  viewerParticipant,
  studentSide,
  currentPhase,
  pollActive,
  onReadyChanged,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewerReady = isViewerCrossfireReady(viewerParticipant, currentPhase);
  const { readyCount, eligibleCount } = crossfireReadyCounts(participants, studentSide, currentPhase);
  const canToggle = canToggleCrossfireReady(viewerParticipant, room, studentSide, currentPhase);
  const disabledReason = crossfireReadyDisabledReason(viewerParticipant, room, studentSide, currentPhase);

  async function handleToggle() {
    setSubmitting(true);
    setError(null);
    try {
      const state = await roomApi.setCrossfireReady(roomId, { ready: !viewerReady, phase: currentPhase });
      onReadyChanged(state);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't update your ready state. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold">{PHASE_LABELS[currentPhase] ?? currentPhase} readiness</p>
        <p className="text-xs text-muted-foreground">{connectionStateLabel(pollActive)}</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className={viewerReady ? "text-emerald-700 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
          You: {crossfireReadyLabel(viewerReady)}
        </span>
        <span className="text-muted-foreground">
          {crossfirePartnerReadyLabel(viewerReady, readyCount, eligibleCount)}
        </span>
        <span className="text-muted-foreground">{crossfireReadyCountLabel(readyCount, eligibleCount)}</span>
      </div>

      {canToggle ? (
        <button
          type="button"
          onClick={handleToggle}
          disabled={submitting}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors"
        >
          {submitting ? "Updating…" : viewerReady ? "Mark Not Ready" : "Mark Ready"}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">
          {disabledReason ?? "You can watch crossfire readiness here but can't change it."}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
