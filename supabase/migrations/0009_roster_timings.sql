-- Employee attribution for time-study timings.
--
-- Who performed the work, recorded per timing event (the atomic fact), so the
-- roster can aggregate an employee's measured performance across studies.
-- Nullable: untagged timing keeps working, and deleting a worker keeps the
-- observation history (set null). Workers themselves live in the shared
-- roster table introduced in 0004.

alter table observations add column worker_id uuid references workers(id) on delete set null;
alter table master_runs  add column worker_id uuid references workers(id) on delete set null;

create index idx_observations_worker_id on observations (worker_id);
create index idx_master_runs_worker_id  on master_runs (worker_id);
