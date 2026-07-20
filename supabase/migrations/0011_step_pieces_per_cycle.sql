-- Pieces produced per timed cycle, per step.
--
-- Lets a step that handles a batch (e.g. "seal a tray of 12") report true
-- per-piece time, throughput (pieces/hour), and cost per finished piece instead
-- of per-cycle figures. Default 1 keeps every existing step as a 1-piece cycle,
-- so nothing changes until a batch size is entered.
alter table steps
  add column pieces_per_cycle integer not null default 1
  check (pieces_per_cycle >= 1);
