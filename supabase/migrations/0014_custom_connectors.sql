-- Custom connectors: admin-defined API connections for apps Composio doesn't
-- cover (e.g. snov.io). The API key is NOT stored here — it is written once to
-- the agent's persistent disk (~/.connectors/<slug>.env) alongside a generated
-- Hermes skill (~/.hermes/skills/<slug>/SKILL.md) that teaches the agent how to
-- call the API. This table is only the registry for the admin UI.

create table if not exists public.custom_connectors (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  agent37_id    text not null,
  slug          text not null,
  name          text not null,
  base_url      text not null,
  auth_scheme   text not null check (auth_scheme in ('bearer', 'header', 'query', 'none')),
  auth_name     text,           -- header or query-param name when scheme needs one
  secret_hint   text,           -- last 4 chars only, for the UI
  notes         text,           -- admin-pasted API docs / endpoints / examples
  created_by    uuid,
  created_at    timestamptz not null default now(),
  unique (workspace_id, slug)
);

alter table public.custom_connectors enable row level security;

-- Admin-only: creating one installs credentials onto an agent.
drop policy if exists custom_connectors_all on public.custom_connectors;
create policy custom_connectors_all on public.custom_connectors
  for all using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

grant select, insert, update, delete on public.custom_connectors to authenticated;
