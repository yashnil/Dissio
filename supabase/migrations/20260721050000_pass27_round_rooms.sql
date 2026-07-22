-- Pass 27 — Phase 9A: Multiplayer Full Round rooms.
--
-- Additive only. A round_simulations row with no round_rooms row is a solo
-- round and behaves exactly as before (see round_room_service.py /
-- round_simulations.py _load_round_access for the Python-side rule that
-- treats "no room" as solo mode).
--
-- One room wraps exactly one round (round_id is unique). Participants share
-- the round's single human-controlled side (config.student_side) — see the
-- Phase 9A plan for why opposing-side human-vs-human is out of scope here.

create table if not exists round_rooms (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null unique references round_simulations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title         text,
  status        text not null default 'waiting'
                check (status in ('waiting','active','completed','closed')),
  invite_code   text not null unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table round_rooms is 'Phase 9A: multiplayer wrapper around exactly one round_simulations row.';
comment on column round_rooms.invite_code is 'Short unique code other participants use to join (mirrors teams.invite_code).';

create table if not exists round_room_participants (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references round_rooms(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text,
  role          text not null default 'observer'
                check (role in ('owner','debater_a','debater_b','coach','observer')),
  side          text check (side in ('pro','con')),
  status        text not null default 'invited'
                check (status in ('invited','joined','left')),
  joined_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (room_id, user_id)
);

comment on column round_room_participants.side is 'pro | con | null. Null = coach/observer/unassigned. Never a literal "observer" value — role already carries that.';

create index idx_round_rooms_invite_code on round_rooms (invite_code);
create index idx_round_room_participants_room_id on round_room_participants (room_id);
create index idx_round_room_participants_user_id on round_room_participants (user_id);

alter table round_rooms enable row level security;
alter table round_room_participants enable row level security;

-- SECURITY DEFINER helper — avoids the self-referencing-policy recursion bug
-- fixed for team_members in 20260628000001_fix_team_members_rls.sql. Derives
-- the caller exclusively from auth.uid(); never accepts a caller-supplied id.
create or replace function public.current_user_is_round_room_participant(rid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.round_room_participants rrp
    where rrp.room_id = rid and rrp.user_id = auth.uid()
  );
$$;

revoke all on function public.current_user_is_round_room_participant(uuid) from public;
grant execute on function public.current_user_is_round_room_participant(uuid) to authenticated;

create policy "round_rooms_select_member"
  on round_rooms for select
  using (owner_user_id = auth.uid() or public.current_user_is_round_room_participant(id));

create policy "round_rooms_service_role"
  on round_rooms for all
  to service_role using (true) with check (true);

create policy "round_room_participants_select_own_or_roommate"
  on round_room_participants for select
  using (user_id = auth.uid() or public.current_user_is_round_room_participant(room_id));

create policy "round_room_participants_service_role"
  on round_room_participants for all
  to service_role using (true) with check (true);
