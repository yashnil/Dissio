"use client";

import { useEffect, useId, useMemo, useState } from "react";
import * as roundApi from "@/lib/roundApi";
import { ApiError } from "@/lib/api";
import {
  COACH_NOTE_TYPE_LABELS,
  canCreateCoachNote,
  coachNoteCountLabel,
  coachNoteDisabledReason,
  coachNoteReviewTarget,
  coachNoteTypeLabel,
  coachNotesEmptyStateMessage,
  distinctCoachNotePhases,
  filterCoachNotes,
  reviewContextBannerText,
} from "@/lib/roomModel";
import type { CoachNoteTypeFilter, CoachNotePhaseFilter, CoachNoteReviewTarget, ReviewTargetTab } from "@/lib/roomModel";
import { FULL_PHASE_ORDER, PHASE_LABELS } from "@/lib/roundModel";
import type {
  CoachAnnotation,
  CoachNoteType,
  RoundPhaseType,
  RoundRoom,
  RoundRoomParticipant,
} from "@/types/round";

interface Props {
  roundId: string;
  room: RoundRoom;
  participants: RoundRoomParticipant[];
  viewerParticipant: RoundRoomParticipant | undefined;
  currentPhase?: RoundPhaseType;
  /** Phase 9H: called when the viewer clicks a note's "Review in X" action. */
  onReviewTarget?: (target: CoachNoteReviewTarget) => void;
  /** Phase 9H: the last review jump made from this panel, if any -- shown as
   * a small "you were reviewing" line when the viewer returns to Notes. */
  reviewContext?: { tab: ReviewTargetTab; contextLabel: string } | null;
  onClearReviewContext?: () => void;
}

const NOTE_TYPES: CoachNoteType[] = ["general", "flow", "crossfire", "drill", "ballot"];

function authorLabel(coachId: string, participants: RoundRoomParticipant[]): string {
  const author = participants.find((p) => p.user_id === coachId);
  return author?.display_name?.trim() || "Coach";
}

function NoteEntry({
  note,
  participants,
  currentPhase,
  onReviewTarget,
}: {
  note: CoachAnnotation;
  participants: RoundRoomParticipant[];
  currentPhase?: RoundPhaseType;
  onReviewTarget?: (target: CoachNoteReviewTarget) => void;
}) {
  const target = coachNoteReviewTarget(note, currentPhase, PHASE_LABELS);
  return (
    <div className="rounded-md border px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{authorLabel(note.coach_id, participants)}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {coachNoteTypeLabel(note.note_type)}
          </span>
          {note.phase && (
            <span className="text-xs text-muted-foreground">{note.phase.replace(/_/g, " ")}</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {new Date(note.created_at).toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
          })}
        </span>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.content}</p>
      {target && onReviewTarget && (
        <button
          type="button"
          onClick={() => onReviewTarget(target)}
          className="text-xs text-primary underline underline-offset-2 hover:no-underline"
        >
          {target.actionLabel}
        </button>
      )}
    </div>
  );
}

export function CoachNotesPanel({
  roundId,
  room,
  participants,
  viewerParticipant,
  currentPhase,
  onReviewTarget,
  reviewContext,
  onClearReviewContext,
}: Props) {
  const textareaId = useId();
  const canCreate = canCreateCoachNote(viewerParticipant, room);
  const disabledReason = coachNoteDisabledReason(viewerParticipant, room);

  const [notes, setNotes] = useState<CoachAnnotation[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("loading");

  const [noteType, setNoteType] = useState<CoachNoteType>("general");
  const [phase, setPhase] = useState<RoundPhaseType | "">(currentPhase ?? "");
  const [content, setContent] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<CoachNoteTypeFilter>("all");
  const [phaseFilter, setPhaseFilter] = useState<CoachNotePhaseFilter>("all");
  const filtersActive = typeFilter !== "all" || phaseFilter !== "all";
  const presentPhases = useMemo(() => distinctCoachNotePhases(notes, FULL_PHASE_ORDER), [notes]);
  const filteredNotes = useMemo(
    () => filterCoachNotes(notes, typeFilter, phaseFilter),
    [notes, typeFilter, phaseFilter],
  );
  const emptyMessage = coachNotesEmptyStateMessage(notes.length, filteredNotes.length);

  function handleResetFilters() {
    setTypeFilter("all");
    setPhaseFilter("all");
  }

  async function loadNotes() {
    setLoadState("loading");
    try {
      const result = await roundApi.listCoachNotes(roundId);
      setNotes(result);
      setLoadState("idle");
    } catch {
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  async function handleSubmit() {
    if (!content.trim()) {
      setSubmitError("Write a note before saving.");
      return;
    }
    setSubmitState("submitting");
    setSubmitError(null);
    try {
      const note = await roundApi.createCoachNote(roundId, {
        content: content.trim(),
        noteType,
        phase: phase || undefined,
      });
      setNotes((prev) => [...prev, note]);
      setContent("");
      setSubmitState("idle");
    } catch (e) {
      setSubmitState("error");
      setSubmitError(
        e instanceof ApiError ? e.message : "Couldn't save this note. Your draft is still here — try again.",
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Coach Notes</h2>
        <button
          type="button"
          onClick={loadNotes}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          Refresh
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Coaches can review and leave notes, but cannot take debate turns.
      </p>

      {reviewContext && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
          <p className="text-xs text-muted-foreground">{reviewContextBannerText(reviewContext.contextLabel)}</p>
          {onClearReviewContext && (
            <button
              type="button"
              onClick={onClearReviewContext}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground shrink-0"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {canCreate ? (
        <div className="space-y-2.5 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <select
              className="rounded-md border bg-background px-2 py-1 text-xs"
              value={noteType}
              onChange={(e) => setNoteType(e.target.value as CoachNoteType)}
            >
              {NOTE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {COACH_NOTE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border bg-background px-2 py-1 text-xs"
              value={phase}
              onChange={(e) => setPhase(e.target.value as RoundPhaseType | "")}
            >
              <option value="">No specific phase</option>
              {currentPhase && <option value={currentPhase}>Current phase</option>}
            </select>
          </div>
          <label htmlFor={textareaId} className="sr-only">
            Coach note
          </label>
          <textarea
            id={textareaId}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Leave a note for the debaters..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={submitState === "submitting"}
          />
          {submitError && (
            <p role="alert" className="text-xs text-red-600">
              {submitError}
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitState === "submitting" || !content.trim()}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitState === "submitting" ? "Saving..." : "Save Note"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground rounded-md border bg-muted/20 px-3 py-2">
          {disabledReason ?? "You can read coach notes here but can't add them."}
        </p>
      )}

      {loadState === "idle" && notes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border bg-background px-2 py-1 text-xs"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as CoachNoteTypeFilter)}
          >
            <option value="all">All types</option>
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {COACH_NOTE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border bg-background px-2 py-1 text-xs"
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value as CoachNotePhaseFilter)}
          >
            <option value="all">All phases</option>
            {presentPhases.map((p) => (
              <option key={p} value={p}>
                {PHASE_LABELS[p]}
              </option>
            ))}
          </select>
          {filtersActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Reset filters
            </button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {coachNoteCountLabel(filteredNotes.length, notes.length)}
          </span>
        </div>
      )}

      <div className="space-y-2">
        {loadState === "loading" && (
          <p className="text-xs text-muted-foreground">Loading notes…</p>
        )}
        {loadState === "error" && (
          <p className="text-xs text-red-600">Couldn&#39;t load coach notes.</p>
        )}
        {loadState === "idle" && emptyMessage && (
          <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        )}
        {loadState === "idle" && !emptyMessage && (
          <div className="space-y-2">
            {filteredNotes.map((n) => (
              <NoteEntry
                key={n.id}
                note={n}
                participants={participants}
                currentPhase={currentPhase}
                onReviewTarget={onReviewTarget}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
