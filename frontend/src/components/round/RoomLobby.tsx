"use client";

import { useState } from "react";
import {
  ROOM_ROLE_LABELS,
  ROOM_STATUS_LABELS,
  PARTICIPANT_STATUS_LABELS,
  SPEAKER_SLOT_LABELS,
  formatInviteCode,
  isRoomOwner,
  sideLabel,
  speakerSlotLabel,
} from "@/lib/roomModel";
import type { RoomRole, RoundRoom, RoundRoomParticipant, RoundSide, SpeakerSlot } from "@/types/round";

interface Props {
  room: RoundRoom;
  participants: RoundRoomParticipant[];
  viewerParticipant: RoundRoomParticipant;
  viewerUserId: string;
  studentSide: RoundSide;
  onAssignParticipant: (
    participantId: string,
    opts: { role?: RoomRole; side?: RoundSide; speaker_slot?: SpeakerSlot },
  ) => void | Promise<void>;
  onEnterRound: () => void;
  onRefresh: () => void;
  loading?: boolean;
  error?: string | null;
}

const ASSIGNABLE_ROLES: RoomRole[] = ["debater_a", "debater_b", "coach", "observer"];
const ASSIGNABLE_SLOTS: SpeakerSlot[] = ["first", "second"];

function ParticipantRow({
  participant,
  isOwnerView,
  studentSide,
  onAssign,
}: {
  participant: RoundRoomParticipant;
  isOwnerView: boolean;
  studentSide: RoundSide;
  onAssign: (opts: { role?: RoomRole; side?: RoundSide; speaker_slot?: SpeakerSlot }) => void;
}) {
  const label = participant.display_name?.trim() || ROOM_ROLE_LABELS[participant.role];
  const canEdit = isOwnerView && participant.role !== "owner";
  const canAssignSlot = participant.side === studentSide && participant.role !== "coach" && participant.role !== "observer";

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground">
          {ROOM_ROLE_LABELS[participant.role]} · {sideLabel(participant.side)} ·{" "}
          {speakerSlotLabel(participant.speaker_slot)} · {PARTICIPANT_STATUS_LABELS[participant.status]}
        </p>
      </div>

      {canEdit && (
        <div className="flex items-center gap-2 shrink-0">
          <select
            className="rounded-md border bg-background px-2 py-1 text-xs"
            value={participant.role}
            onChange={(e) => onAssign({ role: e.target.value as RoomRole })}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROOM_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={participant.side === studentSide}
              onChange={(e) => onAssign({ side: e.target.checked ? studentSide : undefined })}
            />
            {sideLabel(studentSide)}
          </label>
          {canAssignSlot && (
            <select
              className="rounded-md border bg-background px-2 py-1 text-xs"
              value={participant.speaker_slot ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "first" || value === "second") onAssign({ speaker_slot: value });
              }}
            >
              <option value="" disabled>
                Assign slot…
              </option>
              {ASSIGNABLE_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {SPEAKER_SLOT_LABELS[slot]}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

export function RoomLobby({
  room,
  participants,
  viewerParticipant,
  viewerUserId,
  studentSide,
  onAssignParticipant,
  onEnterRound,
  onRefresh,
  loading,
  error,
}: Props) {
  const [copied, setCopied] = useState(false);
  const owner = isRoomOwner(room, viewerUserId);
  const displayCode = formatInviteCode(room.invite_code);

  function copyCode() {
    navigator.clipboard.writeText(room.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const canEnter = owner || room.status === "active" || room.status === "completed";

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {room.title?.trim() || "Room Lobby"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{ROOM_STATUS_LABELS[room.status]}</p>
        </div>
        <button
          onClick={onRefresh}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Invite code
        </p>
        <div className="flex items-center gap-3">
          <span className="text-lg font-mono tracking-widest">{displayCode}</span>
          <button
            onClick={copyCode}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Share this code with your partner so they can join.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Participants
        </p>
        <div className="space-y-2">
          {participants.map((p) => (
            <ParticipantRow
              key={p.id}
              participant={p}
              isOwnerView={owner}
              studentSide={studentSide}
              onAssign={(opts) => onAssignParticipant(p.id, opts)}
            />
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {owner ? (
        <button
          onClick={onEnterRound}
          disabled={loading || room.status === "completed"}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Starting..." : room.status === "waiting" ? "Start Round" : "Enter Round"}
        </button>
      ) : canEnter ? (
        <button
          onClick={onEnterRound}
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Enter Round
        </button>
      ) : (
        <p className="text-center text-xs text-muted-foreground py-2">
          Waiting for the room owner to start the round...
        </p>
      )}

      {(viewerParticipant.role === "observer" || viewerParticipant.role === "coach") && (
        <p className="text-center text-xs text-muted-foreground">
          You&#39;re joined as {ROOM_ROLE_LABELS[viewerParticipant.role].toLowerCase()} — you can
          watch the round but can&#39;t submit speeches or crossfire answers.
        </p>
      )}
    </div>
  );
}
