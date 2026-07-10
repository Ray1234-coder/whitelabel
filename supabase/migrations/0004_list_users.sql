-- Directory of every signed-up account, for admins to assign workspaces to.
-- SECURITY DEFINER because auth.users is not otherwise readable; gated to
-- callers who are an admin of at least one workspace.
create or replace function public.list_all_users()
returns table (user_id uuid, email text, created_at timestamptz, workspace_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.role = 'admin'
  ) then
    raise exception 'admin required';
  end if;
  return query
    select u.id, u.email::text, u.created_at, count(m.workspace_id)
    from auth.users u
    left join public.memberships m on m.user_id = u.id
    group by u.id, u.email, u.created_at
    order by count(m.workspace_id) asc, u.created_at desc;
end;
$$;

grant execute on function public.list_all_users() to authenticated;
