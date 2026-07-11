-- RAG: store the knowledge base as embedded chunks and retrieve only the most
-- relevant ones per question (instead of injecting the whole doc every message).

create extension if not exists vector;

create table if not exists public.kb_chunks (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content      text not null,
  embedding    vector(1536) not null,   -- OpenAI text-embedding-3-small
  created_at   timestamptz not null default now()
);

create index if not exists kb_chunks_workspace_idx on public.kb_chunks (workspace_id);

alter table public.kb_chunks enable row level security;

drop policy if exists kb_chunks_all on public.kb_chunks;
create policy kb_chunks_all on public.kb_chunks
  for all using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.kb_chunks to authenticated;

-- Cosine-similarity search over a workspace's chunks. Member-guarded, and takes
-- the query embedding as a text vector literal (portable through the JS client).
create or replace function public.match_kb_chunks(p_workspace uuid, p_embedding text, p_k int)
returns table(content text, similarity float)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_member(p_workspace) then
    return;
  end if;
  return query
    select c.content, 1 - (c.embedding <=> p_embedding::vector) as similarity
    from public.kb_chunks c
    where c.workspace_id = p_workspace
    order by c.embedding <=> p_embedding::vector
    limit greatest(1, p_k);
end;
$$;

grant execute on function public.match_kb_chunks(uuid, text, int) to authenticated;
