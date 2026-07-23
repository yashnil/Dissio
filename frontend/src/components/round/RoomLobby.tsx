"use client";

import { useState } from "react";
import {
  ROOM_ROLE_LABELS,
  ROOM_STATUS_LABELS,
  PARTICIPANT_STATUS_LABELS,
  SPEAKER_SLOT_LABELS,
  canLeaveRoom,
  canManageRoomLifecycle,
  canPerformRoundAction,
  canReadCoachNotes,
  coachNoteCountSummary,
  formatInviteCode,
  generalActionDisabledReason,
  isDebaterRole,
  isRoomClosed,
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
  onCloseRoom: () => void | Promise<void>;
  onRotateInvite: () => void | Promise<void>;
  onLeaveRoom: () => void | Promise<void>;
  loading?: boolean;
  error?: string | null;
  /** Phase 9G: badge/count surfacing -- omitted (undefined) is treated as 0. */
  coachNoteCount?: number;
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
  const canEdit = isOwnerView && participant.role !== "owner" && participant.status !== "left";
  const canAssignSlot = participant.side === studentSide && participant.role !== "coach" && participant.role !== "observer";

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground">
          {ROOM_ROLE_LABELS[participant.role]}
          {isDebaterRole(participant.role) && (
            <> · {sideLabel(participant.side)} · {speakerSlotLabel(participant.speaker_slot)}</>
          )}
          {" "}· {PARTICIPANT_STATUS_LABELS[participant.status]}
        </p>
      </div>

      {canEdit && (
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
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
          {!canAssignSlot && (
            <p className="text-xs text-muted-foreground italic">
              {participant.role === "coach" || participant.role === "observer"
                ? "Coaches/observers don't get a speaker slot."
                : "Assign a side before choosing a speaker slot."}
            </p>
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
  onCloseRoom,
  onRotateInvite,
  onLeaveRoom,
  loading,
  error,
  coachNoteCount = 0,
}: Props) {
  const [copied, setCopied] = useState(false);
  const owner = isRoomOwner(room, viewerUserId);
  const closed = isRoomClosed(room);
  const displayCode = formatInviteCode(room.invite_code);
  const canManageLifecycle = canManageRoomLifecycle(room, viewerUserId);
  const canManage = canPerformRoundAction(viewerParticipant);
  const manageReason = generalActionDisabledReason(viewerParticipant);
  const noteSummary = canReadCoachNotes(viewerParticipant) ? coachNoteCountSummary(coachNoteCount) : null;

  function copyCode() {
    navigator.clipboard.writeText(room.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

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

      {closed && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 px-3 py-2">
          <p className="text-xs text-amber-800 dark:text-amber-400">
            This room has been closed by the owner. Existing participants can still view it, but no
            new participants can join and no further actions can be taken.
          </p>
        </div>
      )}

      {noteSummary && (
        <div className="rounded-md border bg-muted/20 px-3 py-2">
          <p className="text-xs text-muted-foreground">{noteSummary}</p>
        </div>
      )}

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
          {closed
            ? "This code no longer works — the room is closed."
            : "Share this code with your partner so they can join."}
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
              isOwnerView={owner && !closed}
              studentSide={studentSide}
              onAssign={(opts) => onAssignParticipant(p.id, opts)}
            />
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {closed ? (
        <p className="text-center text-xs text-muted-foreground py-2">This room is closed.</p>
      ) : room.status === "waiting" ? (
        canManage ? (
          <button
            onClick={onEnterRound}
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Starting..." : "Start Round"}
          </button>
        ) : (
          <p className="text-center text-xs text-muted-foreground py-2">
            {manageReason ?? "Waiting for the room owner or a debater to start the round..."}
          </p>
        )
      ) : (
        <button
          onClick={onEnterRound}
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Enter Round
        </button>
      )}

      {viewerParticipant.role === "coach" && (
        <p className="text-center text-xs text-muted-foreground">
          You&#39;re joined as a coach — you can review the round and leave notes for the
          debaters, but can&#39;t submit speeches, crossfire, or drill attempts.
        </p>
      )}
      {viewerParticipant.role === "observer" && (
        <p className="text-center text-xs text-muted-foreground">
          You&#39;re joined as an observer — you can watch the round, but can&#39;t act or leave
          notes.
        </p>
      )}

      {(canManageLifecycle || canLeaveRoom(viewerParticipant, room, viewerUserId)) && (
        <div className="border-t pt-4 flex gap-2 flex-wrap">
          {canManageLifecycle && (
            <>
              <button
                onClick={onRotateInvite}
                disabled={loading}
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                Rotate Invite Code
              </button>
              <button
                onClick={onCloseRoom}
                disabled={loading}
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/20 disabled:opacity-50"
              >
                Close Room
              </button>
            </>
          )}
          {canLeaveRoom(viewerParticipant, room, viewerUserId) && (
            <button
              onClick={onLeaveRoom}
              disabled={loading}
              className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
            >
              Leave Room
            </button>
          )}
        </div>
      )}
    </div>
  );
}
