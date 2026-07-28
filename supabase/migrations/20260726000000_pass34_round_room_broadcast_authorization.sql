-- Pass 34 / Phase 10E — Realtime Authorization for round-room Broadcast
-- channels. Backend-mediated notify-then-refetch (see
-- app/services/round_broadcast.py) already sends payloads containing no
-- private content (event_type + timestamp + optional non-sensitive phase
-- only), so this policy is defense-in-depth, not the primary safety
-- boundary -- the real authorization gate is the existing authenticated
-- HTTP refetch every event triggers. But per
-- docs/REALTIME_AUTHORIZATION_PHASE10C.md §6/§7, a genuinely *private*
-- channel (join authorization checked once, via RLS on realtime.messages)
-- is strictly better than relying on room-UUID obscurity alone, and is
-- additive/low-risk to add.
--
-- realtime.messages has RLS enabled with zero policies today (verified:
-- any SELECT currently returns 0 rows for every role except table owners),
-- so private-channel joins are effectively all-deny until this policy
-- exists. This grants SELECT only -- clients never need to INSERT into
-- this table themselves (the backend is the only writer, via Realtime's
-- REST broadcast endpoint, which writes through the realtime server's own
-- internal role and is unaffected by this policy either way).
--
-- Scope: only topics of the form 'room:<uuid>' are considered at all.
-- Reuses current_user_is_round_room_participant (Pass 27) and the same
-- owner-or-participant shape as round_rooms_select_member, so this stays
-- exactly as permissive as "can this caller already read this room" --
-- never broader.

create policy "round_room_broadcast_read"
  on realtime.messages for select
  to authenticated
  using (
    topic like 'room:%'
    and exists (
      select 1 from public.round_rooms rr
      where rr.id::text = substring(topic from 6)
        and (
          rr.owner_user_id = auth.uid()
          or public.current_user_is_round_room_participant(rr.id)
        )
    )
  );

comment on policy "round_room_broadcast_read" on realtime.messages is
  'Phase 10E: gates private-channel joins to room:<uuid> topics to the '
  'room owner or a joined-or-invited participant (same tier as '
  'round_rooms_select_member). Payload itself carries no private content '
  '-- this is defense-in-depth, not the primary authorization boundary.';
