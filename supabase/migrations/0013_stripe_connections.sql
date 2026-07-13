-- Per-workspace Stripe connections (Stripe Connect OAuth). The platform is set
-- up ONCE (Connect app + one connected-accounts webhook); each customer then
-- links their own Stripe with a single click. Events are scoped: a workspace's
-- Stripe-event workflows fire only for events from ITS connected account.

create table if not exists public.stripe_connections (
  workspace_id      uuid primary key references public.workspaces(id) on delete cascade,
  stripe_account_id text not null unique,
  connected_by      uuid,
  created_at        timestamptz not null default now()
);

alter table public.stripe_connections enable row level security;

-- Members can see and manage their own workspace's connection (connecting your
-- own Stripe is a member action, not admin-only — it's their account).
drop policy if exists stripe_connections_all on public.stripe_connections;
create policy stripe_connections_all on public.stripe_connections
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.stripe_connections to authenticated;
