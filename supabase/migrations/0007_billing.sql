-- Billing: lets a member pay (via Stripe) for agents they add to a workspace.
-- Each paid agent is backed by a Stripe subscription; the webhook creates the
-- agent only after payment succeeds and deletes it when the subscription ends.

-- Maps a (workspace, user) to their Stripe customer id. A member manages only
-- their own row; the webhook (service role) bypasses RLS.
create table if not exists public.billing_customers (
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  created_at         timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.billing_customers enable row level security;

drop policy if exists billing_customers_select on public.billing_customers;
create policy billing_customers_select on public.billing_customers
  for select using (user_id = auth.uid());

drop policy if exists billing_customers_insert on public.billing_customers;
create policy billing_customers_insert on public.billing_customers
  for insert with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

drop policy if exists billing_customers_update on public.billing_customers;
create policy billing_customers_update on public.billing_customers
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.billing_customers to authenticated;

-- Link an agent to the Stripe subscription that pays for it (null for agents an
-- admin created directly against the shared wallet).
alter table public.agents
  add column if not exists stripe_subscription_id text;

create index if not exists agents_stripe_subscription_idx
  on public.agents (stripe_subscription_id);
