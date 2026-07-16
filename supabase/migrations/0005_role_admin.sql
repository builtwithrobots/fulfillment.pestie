-- Role administration -- let admins read and change everyone's role.
--
-- 0001 gave app_users only a "read own user" select policy. Directors and
-- supervisors need to see the whole team and change roles from the Settings
-- Team screen. Rows are still provisioned by trusted server code (service-role,
-- which bypasses RLS), so no insert policy is required here.

create policy "admins read all users" on app_users
  for select using (current_app_role() in ('director', 'supervisor'));

create policy "admins update users" on app_users
  for update using (current_app_role() in ('director', 'supervisor'))
  with check (current_app_role() in ('director', 'supervisor'));
