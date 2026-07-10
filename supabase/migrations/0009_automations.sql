-- Automations: the trigger/scheduler layer. An automation is a saved instruction
-- attached to an agent that runs either on a schedule or when an external event
-- hits its webhook URL. This turns the agent from chat-on-demand into something
-- that reacts to events and runs on a cadence.

create table if not exists public.automations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  agent37_id    text not null,
  name          text not null,
  instructions  text not null,
  trigger_type  text not null check (trigger_type in ('schedule', 'webhook')),
  cadence       text check (cadence in ('hourly', 'daily', 'weekly')),  -- schedule only
  webhook_token text unique,                                            -- webhook only
  enabled       boolean not null default true,
  next_run_at   timestamptz,
  last_run_at   timestamptz,
  last_status   text,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

create index if not exists automations_workspace_idx on public.automations (workspace_id);
create index if not exists automations_due_idx on public.automations (next_run_at)
  where trigger_type = 'schedule' and enabled;

create table if not exists public.automation_runs (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  workspace_id  uuid not null,
  status        text not null,   -- ok | error | skipped | limit
  detail        text,
  created_at    timestamptz not null default now()
);

create index if not exists automation_runs_automation_idx
  on public.automation_runs (automation_id, created_at desc);

alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;

-- Any member of the workspace can manage its automations and read its run log.
-- The cron/webhook runners use the service-role client and bypass RLS.
drop policy if exists automations_all on public.automations;
create policy automations_all on public.automations
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs
  for select using (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.automations to authenticated;
grant select on public.automation_runs to authenticated;
