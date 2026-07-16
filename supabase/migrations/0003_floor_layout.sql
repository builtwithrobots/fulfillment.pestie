-- Floor Layout Builder — plans + shapes (areas & stations)
--
-- Shared operational config, like lines/stations in 0001 (NOT per-user like the
-- time studies in 0002). No user_id: reads are open to any signed-in staffer and
-- writes are restricted to directors/supervisors via current_app_role(). Server
-- actions use the service-role client (bypasses RLS) and validate the Clerk
-- session first; the policies below are defense-in-depth.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table floor_plans (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  -- Path into the private `floor-plans` storage bucket (background image).
  image_path   text,
  -- Natural pixel dimensions of the background image; used as the SVG viewBox
  -- so shape coordinates are stored in image space.
  image_width  int,
  image_height int,
  -- The single plan that feeds the station displays. See set_active_floor_plan.
  is_active    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table floor_shapes (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references floor_plans(id) on delete cascade,
  kind              text not null check (kind in ('area', 'station')),
  shape             text not null default 'rect' check (shape in ('rect', 'circle')),
  -- Geometry in image/canvas pixel coordinates.
  x                 numeric not null default 0,
  y                 numeric not null default 0,
  w                 numeric not null default 160,
  h                 numeric not null default 120,
  rotation          numeric not null default 0,
  label             text not null default '',
  color             text not null default '#34d399',
  -- A station-shape links to a real stations row so headcount + (later)
  -- assignments flow through the existing model and out to the displays.
  station_id        uuid references stations(id) on delete set null,
  planned_headcount int not null default 0,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_floor_shapes_plan_id on floor_shapes (plan_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance (generic; reused by both tables)
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger floor_plans_set_updated_at
  before update on floor_plans
  for each row execute function set_updated_at();

create trigger floor_shapes_set_updated_at
  before update on floor_shapes
  for each row execute function set_updated_at();

-- Editing a shape bumps its parent plan's updated_at so the list reflects
-- live activity.
create or replace function touch_parent_floor_plan() returns trigger
  language plpgsql as $$
begin
  update floor_plans set updated_at = now()
  where id = coalesce(new.plan_id, old.plan_id);
  return coalesce(new, old);
end;
$$;

create trigger floor_shapes_touch_plan
  after insert or update or delete on floor_shapes
  for each row execute function touch_parent_floor_plan();

-- ---------------------------------------------------------------------------
-- Exactly one active plan: activating one clears the rest.
-- ---------------------------------------------------------------------------
create or replace function set_active_floor_plan(target uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update floor_plans set is_active = (id = target) where is_active or id = target;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security — staff read, admins manage (mirrors lines/stations)
-- ---------------------------------------------------------------------------
alter table floor_plans  enable row level security;
alter table floor_shapes enable row level security;

create policy "staff read floor plans"  on floor_plans  for select using (auth.jwt()->>'sub' is not null);
create policy "staff read floor shapes" on floor_shapes for select using (auth.jwt()->>'sub' is not null);

create policy "admins manage floor plans" on floor_plans
  for all using (current_app_role() in ('director', 'supervisor'))
  with check (current_app_role() in ('director', 'supervisor'));

create policy "admins manage floor shapes" on floor_shapes
  for all using (current_app_role() in ('director', 'supervisor'))
  with check (current_app_role() in ('director', 'supervisor'));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for background floor-plan images. Only trusted
-- server code (service-role) uploads/reads these, so no storage.objects
-- policies are needed.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('floor-plans', 'floor-plans', false)
on conflict (id) do nothing;
