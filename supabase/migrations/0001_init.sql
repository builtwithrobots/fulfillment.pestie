-- Pestie Fulfillment Ops — initial schema
--
-- Auth is owned by Clerk, registered in Supabase as a third-party auth provider.
-- Clerk's user id arrives in the JWT as `sub`; read it with auth.jwt()->>'sub'.
-- RLS policies below use that instead of Supabase's auth.uid().

-- ---------------------------------------------------------------------------
-- Roles & people
-- ---------------------------------------------------------------------------
create type app_role as enum ('director', 'supervisor', 'floor_lead', 'executive');

create table app_users (
  clerk_user_id text primary key,           -- matches auth.jwt()->>'sub'
  full_name     text not null,
  role          app_role not null default 'floor_lead',
  created_at    timestamptz not null default now()
);

-- Convenience: the calling user's role, for use in policies.
create or replace function current_app_role() returns app_role
  language sql stable security definer set search_path = public as $$
  select role from app_users where clerk_user_id = auth.jwt()->>'sub'
$$;

-- ---------------------------------------------------------------------------
-- Lines & stations
-- ---------------------------------------------------------------------------
create table lines (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,     -- Line 1.5 overflow toggle
  sort_order int not null default 0
);

create table stations (
  id            uuid primary key default gen_random_uuid(),
  line_id       uuid references lines(id) on delete cascade,
  name          text not null,
  -- Bump to revoke every display token previously issued for this station.
  token_version int not null default 1,
  created_at    timestamptz not null default now()
);

-- Live, per-station status that station displays subscribe to via Realtime.
create table line_status (
  station_id uuid primary key references stations(id) on delete cascade,
  headcount  int not null default 0,
  actual     int not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table app_users  enable row level security;
alter table lines      enable row level security;
alter table stations   enable row level security;
alter table line_status enable row level security;

-- Any authenticated Clerk user may read their own user row.
create policy "read own user" on app_users
  for select using (clerk_user_id = auth.jwt()->>'sub');

-- All signed-in staff can read operational tables.
create policy "staff read lines"    on lines       for select using (auth.jwt()->>'sub' is not null);
create policy "staff read stations" on stations    for select using (auth.jwt()->>'sub' is not null);
create policy "staff read status"   on line_status for select using (auth.jwt()->>'sub' is not null);

-- Floor leads and up can update live status; directors/supervisors manage config.
create policy "leads update status" on line_status
  for update using (current_app_role() in ('floor_lead', 'supervisor', 'director'));

create policy "admins manage stations" on stations
  for all using (current_app_role() in ('director', 'supervisor'))
  with check (current_app_role() in ('director', 'supervisor'));

create policy "admins manage lines" on lines
  for all using (current_app_role() in ('director', 'supervisor'))
  with check (current_app_role() in ('director', 'supervisor'));

-- Realtime: broadcast row changes for the live displays.
alter publication supabase_realtime add table line_status;
alter publication supabase_realtime add table stations;
