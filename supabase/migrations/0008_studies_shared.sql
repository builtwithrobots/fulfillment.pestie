-- Time studies become shared operational data.
--
-- Studies were per-user (scoped by user_id = Clerk sub). Leadership decided
-- all studies should be visible to everyone with dashboard access, so the
-- column is demoted to created_by (attribution only, no authorization) and the
-- per-user RLS policies are replaced with signed-in-staff policies, mirroring
-- how floor plans work. Server actions still validate the Clerk session before
-- every read/write; RLS remains defense-in-depth for the anon client.

alter table studies rename column user_id to created_by;
alter index idx_studies_user_id rename to idx_studies_created_by;

drop policy "own studies" on studies;
drop policy "own steps" on steps;
drop policy "own observations" on observations;
drop policy "own master runs" on master_runs;

create policy "staff manage studies" on studies
  for all
  using (auth.jwt()->>'sub' is not null)
  with check (auth.jwt()->>'sub' is not null);

create policy "staff manage steps" on steps
  for all
  using (auth.jwt()->>'sub' is not null)
  with check (auth.jwt()->>'sub' is not null);

create policy "staff manage observations" on observations
  for all
  using (auth.jwt()->>'sub' is not null)
  with check (auth.jwt()->>'sub' is not null);

create policy "staff manage master runs" on master_runs
  for all
  using (auth.jwt()->>'sub' is not null)
  with check (auth.jwt()->>'sub' is not null);
