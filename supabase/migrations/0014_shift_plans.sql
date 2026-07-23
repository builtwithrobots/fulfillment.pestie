-- ---------------------------------------------------------------------------
-- Shift Planning (/shifts) — one record per saved shift staffing plan.
--
-- Auth is owned by Clerk (registered in Supabase as a third-party auth
-- provider). Server actions validate the Clerk session and write through the
-- service-role key (bypasses RLS); the policies below are defense-in-depth
-- for direct API access. Role names follow app_users/current_app_role():
-- this app has no 'admin' role, so the spec's supervisor/admin tier maps to
-- supervisor/director here.
-- ---------------------------------------------------------------------------

create table shift_plans (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text not null,                    -- Clerk user id (auth.jwt()->>'sub')

  -- Shift inputs
  shift_date          date not null,
  shift_start_time    time not null,
  available_headcount integer not null,
  fak_qty             integer not null default 0,
  rak_qty             integer not null default 0,
  uyak_qty            integer not null default 0,

  -- Recommended staffing outputs (from the staffing model)
  rec_fak_rak_workers   integer,
  rec_uyak_stations     integer,
  rec_tape_scan_workers integer,
  rec_assembly_workers  integer,
  rec_assembly_lines    integer,
  rec_material_handling integer default 2,
  rec_replenishment     integer default 2,

  -- Estimated completion times, in minutes from shift start. Negative values
  -- are possible for assembly (its 1-hour pre-start can finish small queues
  -- before the shift begins).
  est_fak_completion_min      integer,
  est_rak_completion_min      integer,
  est_uyak_completion_min     integer,
  est_assembly_completion_min integer,

  -- Ordered flex reassignment recommendations:
  -- [{ "kind": "move" | "pivot", "trigger_min": 165, "trigger_time": "09:45",
  --    "from_area": "Assembly (Line 1)", "workers": 4,
  --    "to_area": "UYAK stations 5-7 + 1 tape/scan",
  --    "new_completion_min": 200 }, ...]
  flex_recommendations jsonb,

  -- Completion status per kit type (null when that kit wasn't in the queue)
  fak_status  text check (fak_status  in ('on_track', 'at_risk', 'will_not_complete')),
  rak_status  text check (rak_status  in ('on_track', 'at_risk', 'will_not_complete')),
  uyak_status text check (uyak_status in ('on_track', 'at_risk', 'will_not_complete')),

  -- Actuals (filled in after the shift — future feature, nullable for now)
  actual_headcount      integer,
  actual_fak_completed  integer,
  actual_rak_completed  integer,
  actual_uyak_completed integer,
  actual_shift_end_time time,
  notes text
);

create index shift_plans_date_idx on shift_plans (shift_date desc);

-- ---------------------------------------------------------------------------
-- Row Level Security — supervisors and directors only
-- ---------------------------------------------------------------------------
alter table shift_plans enable row level security;

create policy "supervisors read shift plans" on shift_plans
  for select using (current_app_role() in ('supervisor', 'director'));

create policy "supervisors insert shift plans" on shift_plans
  for insert with check (current_app_role() in ('supervisor', 'director'));

-- Updates cover post-shift actuals entry.
create policy "supervisors update shift plans" on shift_plans
  for update using (current_app_role() in ('supervisor', 'director'))
  with check (current_app_role() in ('supervisor', 'director'));
