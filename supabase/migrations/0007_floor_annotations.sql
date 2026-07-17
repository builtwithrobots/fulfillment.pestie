-- Floor Layout Builder -- annotation shapes.
--
-- Three new visual-only kinds on floor_shapes: free-typed text labels, workflow
-- arrows, and human-figure silhouettes. They reuse the existing geometry
-- columns (x/y/w/h/rotation/label/color/locked) and never participate in the
-- headcount roll-up (that only counts kind = 'station').

alter table floor_shapes drop constraint floor_shapes_kind_check;
alter table floor_shapes add constraint floor_shapes_kind_check
  check (kind in ('area', 'station', 'label', 'arrow', 'figure'));
