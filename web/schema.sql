-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (Users)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  avatar_url text,
  -- Default canvas layout for newly created/opened files when no per-file override exists.
  -- 'horizontal' = grow to the right; 'vertical' = grow downward.
  default_layout_direction text default 'horizontal',
  created_at timestamptz default now()
);

-- RLS for Profiles
alter table public.profiles enable row level security;
create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);

-- Helpers: access checks by JWT email.
-- Note: auth.jwt() returns the JWT claims as jsonb.
create or replace function public.jwt_email()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '');
$$;

create or replace function public.access_can_view(access jsonb)
returns boolean
language sql
stable
as $$
  select
    case
      when access is null then false
      when jsonb_typeof(access->'people') <> 'array' then false
      else exists (
        select 1
        from jsonb_array_elements(access->'people') p
        where lower(coalesce(p->>'email','')) = lower(public.jwt_email())
      )
    end;
$$;

create or replace function public.access_can_edit(access jsonb)
returns boolean
language sql
stable
as $$
  select
    case
      when access is null then false
      when jsonb_typeof(access->'people') <> 'array' then false
      else exists (
        select 1
        from jsonb_array_elements(access->'people') p
        where lower(coalesce(p->>'email','')) = lower(public.jwt_email())
          and coalesce(p->>'role','view') = 'edit'
      )
    end;
$$;

-- Folders
create table public.folders (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  owner_id uuid references public.profiles(id) not null,
  parent_id uuid references public.folders(id) on delete cascade,
  -- Sharing ACL: { "people": [ { "email": "...", "role": "view" | "edit" } ] }
  access jsonb,
  created_at timestamptz default now()
);

-- RLS for Folders
alter table public.folders enable row level security;
drop policy if exists "Users can view their own folders" on public.folders;
drop policy if exists "Users can insert their own folders" on public.folders;

create policy "Users can view owned or shared folders" on public.folders
  for select
  using (
    auth.uid() = owner_id
    or public.access_can_view(access)
    or public.access_can_edit(access)
  );

create policy "Users can insert their own folders" on public.folders
  for insert
  with check (auth.uid() = owner_id);

create policy "Users can update owned or shared(edit) folders" on public.folders
  for update
  using (auth.uid() = owner_id or public.access_can_edit(access))
  with check (auth.uid() = owner_id or public.access_can_edit(access));

drop policy if exists "Users can delete owned or shared(edit) folders" on public.folders;
create policy "Users can delete owned or shared(edit) folders" on public.folders
  for delete
  using (auth.uid() = owner_id or public.access_can_edit(access));

-- Files (Diregram Documents)
create table public.files (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  folder_id uuid references public.folders(id) on delete cascade,
  owner_id uuid references public.profiles(id) not null,
  -- Document kind: diagram (existing), note, grid, vision
  kind text default 'diagram',
  content text default '', -- Snapshot of the NexusMarkdown
  room_name text, -- Hocuspocus/Yjs doc name
  last_opened_at timestamptz,
  -- Per-file override for canvas layout direction. When null, fall back to profiles.default_layout_direction.
  layout_direction text,
  -- Sharing ACL: { "people": [ { "email": "...", "role": "view" | "edit" } ] }
  access jsonb,
  thumbnail_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for Files
alter table public.files enable row level security;
drop policy if exists "Users can view their own files" on public.files;
drop policy if exists "Users can insert their own files" on public.files;
drop policy if exists "Users can update their own files" on public.files;

create policy "Users can view owned, file-shared, or folder-shared files" on public.files
  for select
  using (
    auth.uid() = owner_id
    or public.access_can_view(access)
    or public.access_can_edit(access)
    or exists (
      select 1 from public.folders f
      where f.id = files.folder_id
        and (auth.uid() = f.owner_id or public.access_can_view(f.access) or public.access_can_edit(f.access))
    )
  );

create policy "Users can insert their own files" on public.files
  for insert
  with check (auth.uid() = owner_id);

create policy "Users can update owned or shared(edit) files" on public.files
  for update
  using (
    auth.uid() = owner_id
    or public.access_can_edit(access)
    or exists (
      select 1 from public.folders f
      where f.id = files.folder_id
        and (auth.uid() = f.owner_id or public.access_can_edit(f.access))
    )
  )
  with check (
    auth.uid() = owner_id
    or public.access_can_edit(access)
    or exists (
      select 1 from public.folders f
      where f.id = files.folder_id
        and (auth.uid() = f.owner_id or public.access_can_edit(f.access))
    )
  );

create policy "Users can delete owned or shared(edit) files" on public.files
  for delete
  using (
    auth.uid() = owner_id
    or public.access_can_edit(access)
    or exists (
      select 1 from public.folders f
      where f.id = files.folder_id
        and (auth.uid() = f.owner_id or public.access_can_edit(f.access))
    )
  );

-- Permissions (ACL)
create type public.permission_level as enum ('viewer', 'editor', 'owner');

create table public.file_permissions (
  file_id uuid references public.files(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  level public.permission_level default 'viewer',
  created_at timestamptz default now(),
  primary key (file_id, user_id)
);

-- RLS for Permissions
alter table public.file_permissions enable row level security;
-- (Add complex policies for sharing later)

-- Project resources (Additional markdown-only reference material attached to a project/folder)
create table public.project_resources (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  project_folder_id uuid references public.folders(id) on delete cascade not null,
  name text not null,
  kind text default 'markdown',
  markdown text not null,
  source jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index project_resources_project_created_idx
  on public.project_resources (project_folder_id, created_at);

alter table public.project_resources enable row level security;

create policy "project_resources_select_via_project_access" on public.project_resources
  for select
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.folders f
      where f.id = project_resources.project_folder_id
        and (auth.uid() = f.owner_id or public.access_can_view(f.access) or public.access_can_edit(f.access))
    )
  );

create policy "project_resources_insert_via_project_edit" on public.project_resources
  for insert
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.folders f
      where f.id = project_resources.project_folder_id
        and (auth.uid() = f.owner_id or public.access_can_edit(f.access))
    )
  );

create policy "project_resources_update_via_project_edit" on public.project_resources
  for update
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.folders f
      where f.id = project_resources.project_folder_id
        and (auth.uid() = f.owner_id or public.access_can_edit(f.access))
    )
  )
  with check (
    auth.uid() = owner_id
    or exists (
      select 1 from public.folders f
      where f.id = project_resources.project_folder_id
        and (auth.uid() = f.owner_id or public.access_can_edit(f.access))
    )
  );

create policy "project_resources_delete_via_project_edit" on public.project_resources
  for delete
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.folders f
      where f.id = project_resources.project_folder_id
        and (auth.uid() = f.owner_id or public.access_can_edit(f.access))
    )
  );

-- Durable async jobs for long-running RAG/docling processing.
create table if not exists public.async_jobs (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in ('rag_ingest', 'rag_ingest_jwt', 'docling_convert', 'ai_file_generation', 'ai_grid_rule')),
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
