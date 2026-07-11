-- Event triggers: let a workflow start when a provider event arrives (Stripe
-- today; Slack next). Generic web-form / Calendly / Typeform / Zapier triggers
-- already work via the per-workflow webhook URL (trigger_type 'webhook').

alter table public.automations drop constraint if exists automations_trigger_type_check;
alter table public.automations
  add constraint automations_trigger_type_check
  check (trigger_type in ('schedule', 'webhook', 'event'));

-- 'event' triggers: which provider, and an optional filter (e.g. a Stripe event
-- type like 'payment_intent.succeeded'; blank = any event from that provider).
alter table public.automations add column if not exists event_source text;  -- 'stripe' | 'slack'
alter table public.automations add column if not exists event_filter text;

create index if not exists automations_event_idx
  on public.automations (event_source)
  where trigger_type = 'event' and enabled;
