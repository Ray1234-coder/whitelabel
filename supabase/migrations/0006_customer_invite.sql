-- Let any workspace member invite coworkers — but only as customers, never as
-- admins. Admin-only powers (granting admin, the user directory / direct add)
-- are unchanged. The real boundary is here in RLS, not just the API layer: even
-- a tampered request cannot create an admin invite from a non-admin.

-- Admins may create an invite of any role; a non-admin member may create only a
-- customer invite. A row with role='admin' from a non-admin fails the check.
drop policy if exists invitations_insert on public.invitations;
create policy invitations_insert on public.invitations
  for insert with check (
    public.is_workspace_admin(workspace_id)
    or (public.is_workspace_member(workspace_id) and role = 'customer')
  );

-- A member can see the invites they created (to copy or revoke the link);
-- admins still see every invite in the workspace.
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select using (
    public.is_workspace_admin(workspace_id)
    or created_by = auth.uid()
  );

-- A member can revoke their own invite; admins can revoke any.
drop policy if exists invitations_delete on public.invitations;
create policy invitations_delete on public.invitations
  for delete using (
    public.is_workspace_admin(workspace_id)
    or created_by = auth.uid()
  );
