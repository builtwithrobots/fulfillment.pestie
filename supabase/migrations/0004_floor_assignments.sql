-- Floor Layout Builder (phase 2) — worker roster + live station assignments
--
-- Shared operational data, like lines/stations. Reads are open to any signed-in
-- staffer; the roster is managed by admins and assignments by floor_lead+ (who
-- reshuffle staffing on the fly). Server actions use the service-role client and
-- validate the Clerk session first; the policies below are defense-in-depth.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table workers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- One station per worker at a time: the unique key on worker_id means assigning
-- a worker somewhere new must first remove their existing assignment (a "move").
create table station_assignments (
  id          uuid primary key default gen_random_uuid(),
  station_id  uuid not null references stations(id) on delete cascade,
  worker_id   uuid not null references workers(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (worker_id)
);

create index idx_station_assignments_station on station_assignments (station_id);

-- ---------------------------------------------------------------------------
-- Keep line_status.actual in sync with the live assignment count per station,
-- so the existing live-status surface (and displays) stay correct with no extra
-- app code. A move fires delete (old station) + insert (new station) — each
-- recomputes its own station.
-- ---------------------------------------------------------------------------
create or replace function sync_line_status_actual() returns trigger
  language plpgsql as $$
declare
  sid uuid := coalesce(new.station_id, old.station_id);
  cnt int;
begin
  select count(*) into cnt from station_assignments where station_id = sid;
  insert into line_status (station_id, actual, updated_at)
    values (sid, cnt, now())
    on conflict (station_id) do update set actual = excluded.actual, updated_at = now();
  return coalesce(new, old);
end;
$$;

create trigger station_assignments_sync_actual
  after insert or delete on station_assignments
  for each row execute function sync_line_status_actual();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table workers            enable row level security;
alter table station_assignments enable row level security;

create policy "staff read workers"     on workers            for select using (auth.jwt()->>'sub' is not null);
create policy "staff read assignments" on station_assignments for select using (auth.jwt()->>'sub' is not null);

create policy "admins manage workers" on workers
  for all using (current_app_role() in ('director', 'supervisor'))
  with check (current_app_role() in ('director', 'supervisor'));

-- Floor leads and up reshuffle staffing on the fly (mirrors line_status).
create policy "leads manage assignments" on station_assignments
  for all using (current_app_role() in ('floor_lead', 'supervisor', 'director'))
  with check (current_app_role() in ('floor_lead', 'supervisor', 'director'));

-- Realtime: broadcast changes so open editors update live.
alter publication supabase_realtime add table station_assignments;
alter publication supabase_realtime add table workers;
