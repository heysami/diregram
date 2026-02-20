-- NexusMap RAG + KG storage (Supabase Postgres)
-- This extends the existing NexusMap schema (folders/files) with:
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
  file_kind text,
  anchor text,
  text text not null,
  embedding vector(1536) not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (owner_id, id)
);

create index if not exists rag_chunks_owner_project_idx
  on public.rag_chunks (owner_id, project_folder_id);

create index if not exists rag_chunks_file_idx
  on public.rag_chunks (owner_id, file_id);

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

drop policy if exists "rag_chunks_select_via_file_access" on public.rag_chunks;
create policy "rag_chunks_select_via_file_access" on public.rag_chunks
  for select
  using (
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

