alter table public.memberships
  drop constraint if exists memberships_role_check;

alter table public.memberships
  add constraint memberships_role_check check (role in ('admin', 'customer'));

alter table public.invitations
  drop constraint if exists invitations_role_check;

alter table public.invitations
  add constraint invitations_role_check check (role in ('admin', 'customer'));

create or replace function public.is_workspace_admin(ws uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships
    where workspace_id = ws and user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.accept_invitation(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations%rowtype;
begin
  select * into v_inv from public.invitations where token = p_token;
  if not found then
    raise exception 'invitation not found';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation expired';
  end if;
  insert into public.memberships (workspace_id, user_id, role)
  values (v_inv.workspace_id, auth.uid(), v_inv.role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
  delete from public.invitations where token = p_token;
  return v_inv.workspace_id;
end;
$$;
