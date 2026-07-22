/**
 * Pass 27 — Phase 9A. Typed API client for multiplayer round rooms.
 *
 * All functions use apiFetch(), which:
 * - Attaches the Supabase Bearer token automatically
 * - Handles 401 token refresh transparently
 * - Throws ApiError for HTTP or network failures
 * - Never exposes backend URLs in component code
 *
 * Identity is carried by the Supabase token (attached in apiFetch) — no
 * user_id params, matching roundApi.ts's convention.
 */

import { apiFetch } from "@/lib/api";
import type {
  RoomRole,
  RoundRoomParticipant,
  RoundRoomStateResponse,
  RoundSide,
  RoundSimulationConfig,
  SpeakerSlot,
} from "@/types/round";

const BASE = "/round-simulations/rooms";

export function createRoom(opts: {
  roundId?: string;
  config?: RoundSimulationConfig;
  teamId?: string;
  title?: string;
}): Promise<RoundRoomStateResponse> {
  return apiFetch<RoundRoomStateResponse>(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      round_id: opts.roundId ?? null,
      config: opts.config ?? null,
      team_id: opts.teamId ?? null,
      title: opts.title ?? null,
    }),
  });
}

export function getRoom(roomId: string): Promise<RoundRoomStateResponse> {
  return apiFetch<RoundRoomStateResponse>(`${BASE}/${roomId}`);
}

export function joinRoom(inviteCode: string, displayName?: string): Promise<RoundRoomStateResponse> {
  return apiFetch<RoundRoomStateResponse>(`${BASE}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      invite_code: inviteCode.trim().toUpperCase(),
      display_name: displayName ?? null,
    }),
  });
}

export function listRoomParticipants(roomId: string): Promise<RoundRoomParticipant[]> {
  return apiFetch<RoundRoomParticipant[]>(`${BASE}/${roomId}/participants`);
}

export function updateRoomParticipant(
  roomId: string,
  participantId: string,
  opts: { role?: RoomRole; side?: RoundSide; speaker_slot?: SpeakerSlot },
): Promise<RoundRoomParticipant> {
  return apiFetch<RoundRoomParticipant>(`${BASE}/${roomId}/participants/${participantId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: opts.role ?? null,
      side: opts.side ?? null,
      speaker_slot: opts.speaker_slot ?? null,
    }),
  });
}

export function leaveRoom(roomId: string): Promise<RoundRoomParticipant> {
  return apiFetch<RoundRoomParticipant>(`${BASE}/${roomId}/leave`, { method: "POST" });
}
