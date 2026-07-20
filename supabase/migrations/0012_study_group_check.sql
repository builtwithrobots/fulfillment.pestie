-- Group / process check studies.
--
-- A quick line/cycle check with different people on different steps is a
-- process snapshot, not a controlled individual time study, so its timings
-- should NOT roll up into anyone's roster performance. When true, the study
-- still records and shows who ran each step (its own by-employee breakdown),
-- but the roster aggregation excludes it. Default false = normal tracking.
alter table studies add column is_group_check boolean not null default false;
