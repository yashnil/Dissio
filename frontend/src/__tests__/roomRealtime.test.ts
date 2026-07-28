/**
 * Pass 34 — Phase 10E. Tests for the Broadcast subscription wrapper.
 *
 * Same convention as roomModel.test.ts: no React, no DOM, no React Testing
 * Library. subscribeToRoomBroadcast is a plain function, so it's exercised
 * here with a minimal hand-built mock of the slice of SupabaseClient it
 * actually touches (channel/on/subscribe/removeChannel) -- not a real
 * network connection.
 */

import { subscribeToRoomBroadcast } from "@/lib/roomRealtime";
import type { SupabaseClient } from "@supabase/supabase-js";

interface MockChannel {
  on: jest.Mock;
  subscribe: jest.Mock;
  _broadcastHandler?: (msg: { payload?: { event_type?: string; phase?: string } }) => void;
  _statusHandler?: (status: string) => void;
}

function makeMockChannel(): MockChannel {
  const channel: MockChannel = {
    on: jest.fn((type: string, filter: { event: string }, handler: (msg: unknown) => void) => {
      if (type === "broadcast" && filter.event === "notify") {
        channel._broadcastHandler = handler as MockChannel["_broadcastHandler"];
      }
      return channel;
    }),
    subscribe: jest.fn((handler: (status: string) => void) => {
      channel._statusHandler = handler;
      return channel;
    }),
  };
  return channel;
}

function makeMockClient(channel: MockChannel) {
  return {
    channel: jest.fn(() => channel),
    removeChannel: jest.fn(),
  } as unknown as SupabaseClient;
}

describe("subscribeToRoomBroadcast", () => {
  it("subscribes to a private channel named room:<roomId>", () => {
    const channel = makeMockChannel();
    const client = makeMockClient(channel);
    subscribeToRoomBroadcast(client, "room-1", { onNotify: jest.fn(), onStateChange: jest.fn() });
    expect(client.channel).toHaveBeenCalledWith("room:room-1", { config: { private: true } });
  });

  it("reports connecting immediately, then connected once Supabase confirms SUBSCRIBED", () => {
    const channel = makeMockChannel();
    const client = makeMockClient(channel);
    const onStateChange = jest.fn();
    subscribeToRoomBroadcast(client, "room-1", { onNotify: jest.fn(), onStateChange });
    expect(onStateChange).toHaveBeenNthCalledWith(1, "connecting");
    channel._statusHandler?.("SUBSCRIBED");
    expect(onStateChange).toHaveBeenNthCalledWith(2, "connected");
  });

  it.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])(
    "reports unavailable on %s -- never leaves the caller believing it's still connecting",
    (status) => {
      const channel = makeMockChannel();
      const client = makeMockClient(channel);
      const onStateChange = jest.fn();
      subscribeToRoomBroadcast(client, "room-1", { onNotify: jest.fn(), onStateChange });
      channel._statusHandler?.(status);
      expect(onStateChange).toHaveBeenLastCalledWith("unavailable");
    },
  );

  it("calls onNotify for an allowlisted event_type", () => {
    const channel = makeMockChannel();
    const client = makeMockClient(channel);
    const onNotify = jest.fn();
    subscribeToRoomBroadcast(client, "room-1", { onNotify, onStateChange: jest.fn() });
    channel._broadcastHandler?.({ payload: { event_type: "crossfire_ready_changed" } });
    expect(onNotify).toHaveBeenCalledTimes(1);
  });

  it("ignores an unrecognized event_type without calling onNotify", () => {
    const channel = makeMockChannel();
    const client = makeMockClient(channel);
    const onNotify = jest.fn();
    subscribeToRoomBroadcast(client, "room-1", { onNotify, onStateChange: jest.fn() });
    channel._broadcastHandler?.({ payload: { event_type: "not_a_real_event" } });
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("ignores a missing/malformed payload without throwing", () => {
    const channel = makeMockChannel();
    const client = makeMockClient(channel);
    const onNotify = jest.fn();
    subscribeToRoomBroadcast(client, "room-1", { onNotify, onStateChange: jest.fn() });
    expect(() => channel._broadcastHandler?.({})).not.toThrow();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("never passes the payload contents to onNotify -- notify-then-refetch, not client-trusted state", () => {
    const channel = makeMockChannel();
    const client = makeMockClient(channel);
    const onNotify = jest.fn();
    subscribeToRoomBroadcast(client, "room-1", { onNotify, onStateChange: jest.fn() });
    channel._broadcastHandler?.({ payload: { event_type: "phase_advanced", phase: "first_rebuttal" } });
    expect(onNotify).toHaveBeenCalledWith();
  });

  it("returns an unsubscribe function that calls client.removeChannel", () => {
    const channel = makeMockChannel();
    const client = makeMockClient(channel);
    const unsubscribe = subscribeToRoomBroadcast(client, "room-1", { onNotify: jest.fn(), onStateChange: jest.fn() });
    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("degrades to unavailable instead of throwing when client.channel itself throws", () => {
    const client = {
      channel: jest.fn(() => {
        throw new Error("no realtime support");
      }),
      removeChannel: jest.fn(),
    } as unknown as SupabaseClient;
    const onStateChange = jest.fn();
    expect(() =>
      subscribeToRoomBroadcast(client, "room-1", { onNotify: jest.fn(), onStateChange }),
    ).not.toThrow();
    expect(onStateChange).toHaveBeenLastCalledWith("unavailable");
  });
});
