-- Admin-chosen model per agent. Null = use the agent's built-in default.
-- Applied as a per-turn override on every chat request (see the chat BFF route).
alter table public.agents add column if not exists model text;
alter table public.agents add column if not exists provider text;
