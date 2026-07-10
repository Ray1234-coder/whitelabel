-- Two features:
--   1) Multi-step "mapped" workflows: an automation can now hold an ordered list
--      of steps (a visual node map). Plus test-before-run gating and a daily run
--      cap ("x free uses a day").
--   2) Knowledge base: an editable doc per workspace describing the company, fed
--      to the agent as context so it "knows" the business.

-- ---------- 1) Workflow steps + gating ----------
-- steps: jsonb array of { id, title, instructions }. Null/empty = single-step
-- (legacy) automation using the `instructions` column.
alter table public.automations add column if not exists steps jsonb;
-- Set when a test run succeeds; cleared when the steps change. A real run
-- (trigger or manual) is only allowed after a successful test.
alter table public.automations add column if not exists tested_at timestamptz;
-- Daily run cap for real runs (tests don't count).
alter table public.automations add column if not exists runs_date date;
alter table public.automations add column if not exists runs_used int not null default 0;

-- ---------- 2) Knowledge base ----------
create table if not exists public.knowledge_base (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  content      text not null default '',
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

alter table public.knowledge_base enable row level security;

drop policy if exists knowledge_base_select on public.knowledge_base;
create policy knowledge_base_select on public.knowledge_base
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists knowledge_base_write on public.knowledge_base;
create policy knowledge_base_write on public.knowledge_base
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.knowledge_base to authenticated;
