-- Floor Layout Builder -- per-shape lock.
--
-- Locked shapes can't be dragged or resized in the editor (they can still be
-- selected and unlocked). New shapes are unlocked by default.

alter table floor_shapes add column locked boolean not null default false;
