-- Pass 28 — Phase 9C: speaker-slot turn granularity for multiplayer rooms.
--
-- Additive only. Nullable: existing round_room_participants rows get NULL,
-- which is treated as "flex" (matches any required slot) by the Python
-- permission layer — see round_simulations.py _participant_turn_state.
-- Never locks out a participant created before this migration.

alter table round_room_participants
  add column if not exists speaker_slot text check (speaker_slot in ('first', 'second'));

comment on column round_room_participants.speaker_slot is
  'first | second | null. Null = flex (matches either slot). Constructive/Summary = first speaker, Rebuttal/Final Focus = second speaker; crossfire has no slot requirement.';
