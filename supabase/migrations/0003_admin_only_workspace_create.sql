-- Only admins may create workspaces. Customers join by invitation only.
-- A brand-new deployment has no workspaces yet, so the first user to sign in
-- still bootstraps the first workspace (and becomes its admin).
create or replace function public.can_create_workspace()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and role = 'admin'
  ) or not exists (select 1 from public.workspaces);
$$;

drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
  for insert with check (owner_id = auth.uid() and public.can_create_workspace());

grant execute on function public.can_create_workspace() to authenticated;
