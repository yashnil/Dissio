/**
 * Phase 10E — thin wrapper around a Supabase Realtime Broadcast channel for
 * one multiplayer round room. Backend-mediated notify-then-refetch only:
 * every event just means "something changed, call refreshRoom()" -- the
 * payload itself is never read as state, and this module never fetches
 * round data. No round content (speech text, crossfire answers, evidence,
 * coach notes) is ever expected in, or extracted from, a broadcast payload;
 * see roomModel.ts's isSafeBroadcastEventType / SAFE_BROADCAST_EVENT_TYPES,
 * mirroring app/services/round_broadcast.py's allowlist.
 *
 * Deliberately a plain function, not a React hook -- called from a
 * useEffect in page.tsx, so it stays testable without React Testing
 * Library (this repo's jest config runs no DOM/React tests at all; see
 * jest.config.js's testEnvironment: "node").
 *
 * Uses a private channel (config.private: true) authorized by the Pass 34
 * migration's realtime.messages RLS policy -- join succeeds only for the
 * room's owner or a joined-or-invited participant. Never the primary
 * authorization boundary (the payload carries no private content, and
 * every notify still triggers a real authenticated HTTP refetch), but
 * genuine defense-in-depth over relying on room-UUID obscurity alone.
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { isSafeBroadcastEventType, roomBroadcastChannelTopic } from "@/lib/roomModel";
import type { RoomBroadcastConnectionState } from "@/lib/roomModel";

interface RoomBroadcastPayload {
  event_type?: string;
  ts?: string;
  phase?: string;
}

export interface SubscribeToRoomBroadcastOptions {
  /** Called once per notify event whose event_type is on the allowlist.
   * Never receives the payload -- callers always refetch via the existing
   * authenticated HTTP API instead of trusting anything carried here. */
  onNotify: () => void;
  onStateChange: (state: RoomBroadcastConnectionState) => void;
}

/** Subscribes to a room's private Broadcast channel. Returns an
 * unsubscribe function -- always call it on unmount/room change, mirroring
 * every other subscription cleanup in this codebase (page.tsx's
 * sb.auth.onAuthStateChange). A client-side Realtime failure degrades to
 * onStateChange("unavailable") rather than throwing -- polling, entirely
 * unaffected by this module, remains the transport of record either way. */
export function subscribeToRoomBroadcast(
  client: SupabaseClient,
  roomId: string,
  { onNotify, onStateChange }: SubscribeToRoomBroadcastOptions,
): () => void {
  onStateChange("connecting");

  let channel: RealtimeChannel;
  try {
    channel = client.channel(roomBroadcastChannelTopic(roomId), {
      config: { private: true },
    });
  } catch {
    onStateChange("unavailable");
    return () => {};
  }

  channel.on("broadcast", { event: "notify" }, ({ payload }: { payload?: RoomBroadcastPayload }) => {
    if (isSafeBroadcastEventType(payload?.event_type)) onNotify();
  });

  channel.subscribe((status: string) => {
    if (status === "SUBSCRIBED") {
      onStateChange("connected");
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      onStateChange("unavailable");
    }
  });

  return () => {
    client.removeChannel(channel);
  };
}
