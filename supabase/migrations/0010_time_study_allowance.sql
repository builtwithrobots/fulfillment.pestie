-- PF&D allowance for engineered standard time.
--
-- Classic stopwatch time study normalizes observed time into a STANDARD time by
-- adding an allowance for personal needs, fatigue, and unavoidable delay (PF&D):
--   standard = observed × (1 + allowance)
-- The allowance is objective (table-based), unlike subjective performance
-- rating, which this tool deliberately omits. Default 0 keeps every existing
-- study as raw observed time until an allowance is set.
alter table studies
  add column allowance_pct numeric(5, 2) not null default 0
  check (allowance_pct >= 0 and allowance_pct <= 100);
