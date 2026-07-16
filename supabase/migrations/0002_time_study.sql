-- Time Study Tool — studies, steps, observations, master runs
--
-- Auth is owned by Clerk (registered in Supabase as a third-party auth
-- provider). The Clerk user id arrives in the JWT as `sub`; read it with
-- auth.jwt()->>'sub' and store it as text in studies.user_id.
--
-- Server actions use the service-role key (bypasses RLS) and validate the
-- Clerk session before every query, scoping by user_id in code. The policies
-- below are defense-in-depth so the anon/browser client can never read or
-- write another user's rows.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table studies (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,                       -- matches auth.jwt()->>'sub'
  title          text not null,
  wage_rate      numeric(10,2) not null default 0,
  use_whole_timer boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table steps (
  id         uuid primary key default gen_random_uuid(),
  study_id   uuid not null references studies(id) on delete cascade,
  name       text not null,
  notes      text,
  timed      boolean not null default true,
  position   integer not null,                        -- ordering within a study
  created_at timestamptz not null default now()
);

create table observations (
  id          uuid primary key default gen_random_uuid(),
  step_id     uuid not null references steps(id) on delete cascade,
  study_id    uuid not null references studies(id) on delete cascade,
  duration_ms integer not null,
  recorded_at timestamptz not null default now()
);

create table master_runs (
  id          uuid primary key default gen_random_uuid(),
  study_id    uuid not null references studies(id) on delete cascade,
  duration_ms integer not null,
  recorded_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index idx_studies_user_id      on studies (user_id);
create index idx_steps_study_id       on steps (study_id);
create index idx_observations_study_id on observations (study_id);
create index idx_observations_step_id  on observations (step_id);
create index idx_master_runs_study_id  on master_runs (study_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
-- Direct edits to a study bump its own updated_at.
create or replace function set_study_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger studies_set_updated_at
  before update on studies
  for each row execute function set_study_updated_at();

-- Any change to a child row (steps, observations, master runs) touches the
-- parent study so the dashboard's "last updated" reflects live activity —
-- including observations recorded during a timing session.
create or replace function touch_parent_study() returns trigger
  language plpgsql as $$
begin
  update studies set updated_at = now()
  where id = coalesce(new.study_id, old.study_id);
  return coalesce(new, old);
end;
$$;

create trigger steps_touch_study
  after insert or update or delete on steps
  for each row execute function touch_parent_study();

create trigger observations_touch_study
  after insert or update or delete on observations
  for each row execute function touch_parent_study();

create trigger master_runs_touch_study
  after insert or update or delete on master_runs
  for each row execute function touch_parent_study();

-- ---------------------------------------------------------------------------
-- Row Level Security — users only ever touch their own data
-- ---------------------------------------------------------------------------
alter table studies      enable row level security;
alter table steps        enable row level security;
alter table observations enable row level security;
alter table master_runs  enable row level security;

-- studies: keyed directly on the Clerk user id.
create policy "own studies" on studies
  for all
  using (user_id = auth.jwt()->>'sub')
  with check (user_id = auth.jwt()->>'sub');

-- Child tables: ownership flows through the parent study.
create policy "own steps" on steps
  for all
  using (exists (
    select 1 from studies s
    where s.id = steps.study_id and s.user_id = auth.jwt()->>'sub'
  ))
  with check (exists (
    select 1 from studies s
    where s.id = steps.study_id and s.user_id = auth.jwt()->>'sub'
  ));

create policy "own observations" on observations
  for all
  using (exists (
    select 1 from studies s
    where s.id = observations.study_id and s.user_id = auth.jwt()->>'sub'
  ))
  with check (exists (
    select 1 from studies s
    where s.id = observations.study_id and s.user_id = auth.jwt()->>'sub'
  ));

create policy "own master runs" on master_runs
  for all
  using (exists (
    select 1 from studies s
    where s.id = master_runs.study_id and s.user_id = auth.jwt()->>'sub'
  ))
  with check (exists (
    select 1 from studies s
    where s.id = master_runs.study_id and s.user_id = auth.jwt()->>'sub'
  ));
