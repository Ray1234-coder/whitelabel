-- Two features:
--   1) Free-trial agents: a plan tag + a per-day run counter enforced in SQL.
--   2) Support access: a per-workspace toggle that adds/removes the Workify
--      support account as a member, so the business controls whether we can see
--      their workspace at all.

-- ---------- 1) Free trial ----------
alter table public.agents add column if not exists plan text;                 -- 'free' | 'paid' | null (admin-made)
alter table public.agents add column if not exists free_runs_date date;
alter table public.agents add column if not exists free_runs_used int not null default 0;

-- Atomically check-and-consume one free run for a free-tier agent. Returns true
-- if the run is allowed (and records it), false if today's limit is used up.
-- Non-free agents are never limited. Caller must be a member of the workspace.
create or replace function public.consume_free_run(p_agent37_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws   uuid;
  v_plan text;
  v_date date;
  v_used int;
  v_limit int := 2;  -- keep in sync with FREE_RUNS_PER_DAY
begin
  select workspace_id, plan, free_runs_date, free_runs_used
    into v_ws, v_plan, v_date, v_used
    from public.agents where agent37_id = p_agent37_id;

  if v_ws is null then
    raise exception 'agent not found';
  end if;
  if not public.is_workspace_member(v_ws) then
    raise exception 'not a member';
  end if;

  -- Only free agents are rate limited.
  if coalesce(v_plan, '') <> 'free' then
    return true;
  end if;

  -- New day → reset the counter.
  if v_date is distinct from current_date then
    v_used := 0;
    v_date := current_date;
  end if;

  if v_used >= v_limit then
    update public.agents
      set free_runs_date = v_date, free_runs_used = v_used
      where agent37_id = p_agent37_id;
    return false;
  end if;

  update public.agents
    set free_runs_date = v_date, free_runs_used = v_used + 1
    where agent37_id = p_agent37_id;
  return true;
end;
$$;

grant execute on function public.consume_free_run(text) to authenticated;

-- ---------- 2) Support access ----------
alter table public.workspaces add column if not exists support_access boolean not null default false;

-- Turn support access on/off. Only a workspace admin may call it. When enabled,
-- the support account (looked up by email, passed in by the trusted server) is
-- added as an admin member; when disabled, it is removed (never the owner).
create or replace function public.set_support_access(
  p_workspace uuid,
  p_enabled boolean,
  p_support_email text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if not public.is_workspace_admin(p_workspace) then
    raise exception 'admin required';
  end if;

  update public.workspaces set support_access = p_enabled where id = p_workspace;

  select id into v_uid from auth.users where lower(email) = lower(p_support_email) limit 1;
  if v_uid is not null then
    if p_enabled then
      insert into public.memberships (workspace_id, user_id, role)
      values (p_workspace, v_uid, 'admin')
      on conflict (workspace_id, user_id) do update set role = 'admin';
    else
      delete from public.memberships m
      using public.workspaces w
      where m.workspace_id = p_workspace
        and m.user_id = v_uid
        and w.id = p_workspace
        and w.owner_id <> v_uid;  -- never lock the owner out of their own workspace
    end if;
  end if;

  return p_enabled;
end;
$$;

grant execute on function public.set_support_access(uuid, boolean, text) to authenticated;
