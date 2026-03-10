-- Diregram RAG + KG storage (Supabase Postgres)
-- This extends the existing Diregram schema (folders/files) with:
-- - pgvector-backed chunk embeddings for RAG
-- - a persisted semantic knowledge graph (entities + edges) exported by `web/lib/kg-vector-export.ts`
--
-- Notes:
-- - Embedding dimension is set to 1536 (matches OpenAI text-embedding-3-small).
-- - If you use a different model dimension, change vector(1536) accordingly.
-- - RLS policies are intentionally conservative: end-user reads are limited via file/folder access;
--   writes are expected to be done by server-side ingestion using the service role key.

create extension if not exists vector;

-- 1) RAG chunks: stable chunk IDs + embeddings.
create table if not exists public.rag_chunks (
  owner_id uuid references public.profiles(id) on delete cascade not null,
  id text not null,
  project_folder_id uuid references public.folders(id) on delete cascade,
  file_id uuid references public.files(id) on delete cascade,
  resource_id uuid references public.project_resources(id) on delete cascade,
  file_kind text,
  anchor text,
  text text not null,
  embedding vector(1536) not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (owner_id, id)
);

-- If the table already existed, add the resource_id column (safe no-op).
alter table public.rag_chunks
  add column if not exists resource_id uuid references public.project_resources(id) on delete cascade;

create index if not exists rag_chunks_owner_project_idx
  on public.rag_chunks (owner_id, project_folder_id);

create index if not exists rag_chunks_file_idx
  on public.rag_chunks (owner_id, file_id);

create index if not exists rag_chunks_resource_idx
  on public.rag_chunks (owner_id, resource_id);

create index if not exists rag_chunks_embedding_hnsw
  on public.rag_chunks using hnsw (embedding vector_cosine_ops);

-- 2) Semantic KG entities (persisted NDJSON records).
create table if not exists public.kg_entities (
  owner_id uuid references public.profiles(id) on delete cascade not null,
  id text not null,
  project_folder_id uuid references public.folders(id) on delete cascade,
  entity_type text not null,
  file_id uuid references public.files(id) on delete set null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (owner_id, id)
);

create index if not exists kg_entities_owner_project_idx
  on public.kg_entities (owner_id, project_folder_id);

create index if not exists kg_entities_type_idx
  on public.kg_entities (owner_id, entity_type);

-- 3) Semantic KG edges (persisted NDJSON records).
create table if not exists public.kg_edges (
  owner_id uuid references public.profiles(id) on delete cascade not null,
  id text not null,
  project_folder_id uuid references public.folders(id) on delete cascade,
  edge_type text not null,
  src text not null,
  dst text not null,
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (owner_id, id)
);

create index if not exists kg_edges_owner_project_idx
  on public.kg_edges (owner_id, project_folder_id);

create index if not exists kg_edges_src_idx
  on public.kg_edges (owner_id, src);

create index if not exists kg_edges_dst_idx
  on public.kg_edges (owner_id, dst);

-- 3b) MCP share tokens (opaque tokens that do NOT reveal project IDs).
-- Intended use: admin generates a token for a project, then users can connect
-- a hosted MCP server using that token, without learning internal UUIDs.
create table if not exists public.rag_mcp_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade not null,
  project_folder_id uuid references public.folders(id) on delete cascade not null,
  label text default '',
  token_hash text not null,
  created_at timestamptz default now(),
  revoked_at timestamptz,
  unique (token_hash)
);

create index if not exists rag_mcp_shares_owner_project_idx
  on public.rag_mcp_shares (owner_id, project_folder_id);

-- 3c) Public project IDs for MCP selection (avoid leaking internal UUIDs).
create table if not exists public.rag_projects (
  owner_id uuid references public.profiles(id) on delete cascade not null,
  project_folder_id uuid references public.folders(id) on delete cascade not null,
  public_id text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (owner_id, project_folder_id),
  unique (public_id)
);

create index if not exists rag_projects_owner_public_idx
  on public.rag_projects (owner_id, public_id);

-- 3d) MCP tokens (account-scoped or project-scoped).
create table if not exists public.rag_mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade not null,
  scope text not null, -- 'account' | 'project'
  project_folder_id uuid references public.folders(id) on delete cascade,
  label text default '',
  token_hash text not null,
  created_at timestamptz default now(),
  revoked_at timestamptz,
  unique (token_hash)
);

create index if not exists rag_mcp_tokens_owner_idx
  on public.rag_mcp_tokens (owner_id, scope);

-- 3e) SSH public keys for MCP stdio onboarding.
-- Users self-register keys from a setup script; host sync pulls these into authorized_keys.
create table if not exists public.rag_mcp_ssh_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade not null,
  token_id uuid references public.rag_mcp_tokens(id) on delete cascade not null,
  key_name text default '',
  public_key text not null,
  public_key_fingerprint text not null,
  created_at timestamptz default now(),
  revoked_at timestamptz,
  unique (token_id, public_key_fingerprint)
);

create index if not exists rag_mcp_ssh_keys_owner_idx
  on public.rag_mcp_ssh_keys (owner_id);

create index if not exists rag_mcp_ssh_keys_token_idx
  on public.rag_mcp_ssh_keys (token_id);

-- 4) Vector search helper (invoker security; RLS still applies on rag_chunks).
create or replace function public.match_rag_chunks(
  query_embedding vector(1536),
  match_count int default 12,
  owner uuid default null,
  project uuid default null
)
returns table (
  owner_id uuid,
  id text,
  file_id uuid,
  file_kind text,
  anchor text,
  text text,
  similarity float
)
language sql
stable
as $$
  select
    c.owner_id,
    c.id,
    c.file_id,
    c.file_kind,
    c.anchor,
    c.text,
    (1 - (c.embedding <=> query_embedding))::float as similarity
  from public.rag_chunks c
  where (owner is null or c.owner_id = owner)
    and (project is null or c.project_folder_id = project)
  order by c.embedding <=> query_embedding
  limit greatest(1, match_count);
$$;

-- 5) RLS: allow reads if user can view the underlying file via existing sharing rules.
alter table public.rag_chunks enable row level security;
alter table public.kg_entities enable row level security;
alter table public.kg_edges enable row level security;
alter table public.rag_mcp_shares enable row level security;
alter table public.rag_projects enable row level security;
alter table public.rag_mcp_tokens enable row level security;
alter table public.rag_mcp_ssh_keys enable row level security;

drop policy if exists "rag_chunks_select_via_file_access" on public.rag_chunks;
drop policy if exists "rag_chunks_select_via_file_or_resource_access" on public.rag_chunks;
create policy "rag_chunks_select_via_file_or_resource_access" on public.rag_chunks
  for select
  using (
    (
      file_id is not null
      and exists (
        select 1
        from public.files f
        left join public.folders fo on fo.id = f.folder_id
        where f.id = rag_chunks.file_id
          and (
            auth.uid() = f.owner_id
            or public.access_can_view(f.access)
            or public.access_can_edit(f.access)
            or (fo.id is not null and (
              auth.uid() = fo.owner_id
              or public.access_can_view(fo.access)
              or public.access_can_edit(fo.access)
            ))
          )
      )
    )
    or
    (
      resource_id is not null
      and exists (
        select 1
        from public.project_resources pr
        left join public.folders f on f.id = pr.project_folder_id
        where pr.id = rag_chunks.resource_id
          and (
            auth.uid() = pr.owner_id
            or (f.id is not null and (
              auth.uid() = f.owner_id
              or public.access_can_view(f.access)
              or public.access_can_edit(f.access)
            ))
          )
      )
    )
  );

-- KG tables are currently intended for server-side use (service role) and UI export/import tooling.
-- Allow selects only to owners (conservative). You can expand this later similarly to rag_chunks.
drop policy if exists "kg_entities_select_owner" on public.kg_entities;
create policy "kg_entities_select_owner" on public.kg_entities
  for select
  using (auth.uid() = owner_id);

drop policy if exists "kg_edges_select_owner" on public.kg_edges;
create policy "kg_edges_select_owner" on public.kg_edges
  for select
  using (auth.uid() = owner_id);

-- MCP shares: only owners can view/manage tokens from the app UI.
drop policy if exists "rag_mcp_shares_owner_only" on public.rag_mcp_shares;
create policy "rag_mcp_shares_owner_only" on public.rag_mcp_shares
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "rag_projects_owner_only" on public.rag_projects;
create policy "rag_projects_owner_only" on public.rag_projects
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "rag_mcp_tokens_owner_only" on public.rag_mcp_tokens;
create policy "rag_mcp_tokens_owner_only" on public.rag_mcp_tokens
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "rag_mcp_ssh_keys_owner_only" on public.rag_mcp_ssh_keys;
create policy "rag_mcp_ssh_keys_owner_only" on public.rag_mcp_ssh_keys
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 6) Durable async jobs for long-running RAG/docling processing.
create table if not exists public.async_jobs (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in ('rag_ingest', 'rag_ingest_jwt', 'docling_convert', 'ai_file_generation', 'ai_grid_rule', 'ai_diagram_assist', 'project_pipeline')),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  owner_id uuid references public.profiles(id) on delete cascade not null,
  requester_user_id uuid references public.profiles(id) on delete set null,
  project_folder_id uuid references public.folders(id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  progress_pct int not null default 0,
  step text not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 3,
  run_after timestamptz not null default now(),
  lease_until timestamptz,
  worker_id text,
  dedupe_key text,
  error text,
  secret_payload text,
  cancel_requested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz
);

-- Ensure existing databases refresh the kind check (table may have been created before new kinds existed).
alter table public.async_jobs drop constraint if exists async_jobs_kind_check;
alter table public.async_jobs
  add constraint async_jobs_kind_check
  check (kind in ('rag_ingest', 'rag_ingest_jwt', 'docling_convert', 'ai_file_generation', 'ai_grid_rule', 'ai_diagram_assist', 'project_pipeline'));

create index if not exists async_jobs_status_run_idx
  on public.async_jobs (status, run_after, created_at);

create index if not exists async_jobs_owner_created_idx
  on public.async_jobs (owner_id, created_at desc);

create index if not exists async_jobs_project_created_idx
  on public.async_jobs (project_folder_id, created_at desc);

create unique index if not exists async_jobs_dedupe_active_idx
  on public.async_jobs (dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running');

alter table public.async_jobs enable row level security;
drop policy if exists "async_jobs_select_owner_or_requester" on public.async_jobs;
drop policy if exists "async_jobs_insert_owner_only" on public.async_jobs;
drop policy if exists "async_jobs_update_owner_or_requester" on public.async_jobs;

create policy "async_jobs_select_owner_or_requester" on public.async_jobs
  for select
  using (auth.uid() = owner_id or auth.uid() = requester_user_id);

create or replace function public.claim_async_jobs(
  p_worker_id text,
  p_limit int default 1,
  p_lease_seconds int default 120
)
returns setof public.async_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_limit int := greatest(1, coalesce(p_limit, 1));
  v_lease int := greatest(30, coalesce(p_lease_seconds, 120));
begin
  return query
  with candidates as (
    select j.id
    from public.async_jobs j
    where
      (
        (j.status = 'queued' and j.run_after <= v_now)
        or (j.status = 'running' and (j.lease_until is null or j.lease_until < v_now))
      )
    order by j.created_at
    for update skip locked
    limit v_limit
  ),
  claimed as (
    update public.async_jobs j
    set
      status = 'running',
      worker_id = p_worker_id,
      lease_until = v_now + make_interval(secs => v_lease),
      heartbeat_at = v_now,
      started_at = coalesce(j.started_at, v_now),
      attempts = j.attempts + 1,
      updated_at = v_now,
      step = case when j.step = 'queued' then 'running' else j.step end
    from candidates c
    where j.id = c.id
    returning j.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_async_jobs(text, int, int) from public;
grant execute on function public.claim_async_jobs(text, int, int) to service_role;
