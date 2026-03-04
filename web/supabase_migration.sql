-- Diregram sharing + collab metadata migration (idempotent-ish)
-- Paste into Supabase SQL editor for an existing project.

-- 0) Extensions (UUID helpers)
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- 1) Base tables (create if missing)
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  avatar_url text,
  -- Default canvas layout for newly created/opened files when no per-file override exists.
  -- 'horizontal' = grow to the right; 'vertical' = grow downward.
  default_layout_direction text default 'horizontal',
  created_at timestamptz default now()
);

create table if not exists public.folders (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  owner_id uuid references public.profiles(id) not null,
  parent_id uuid references public.folders(id) on delete cascade,
  access jsonb,
  created_at timestamptz default now()
);

create table if not exists public.files (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  folder_id uuid references public.folders(id) on delete cascade,
  owner_id uuid references public.profiles(id) not null,
  -- Document kind: diagram (existing), note, grid, vision
  kind text default 'diagram',
  content text default '',
  room_name text,
  last_opened_at timestamptz,
  access jsonb,
  -- Per-file override for canvas layout direction. When null, fall back to profiles.default_layout_direction.
  layout_direction text,
  thumbnail_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ensure columns exist on existing projects
alter table public.profiles add column if not exists default_layout_direction text default 'horizontal';
alter table public.files add column if not exists layout_direction text;
alter table public.files add column if not exists kind text default 'diagram';
alter table public.files add column if not exists content text default '';
alter table public.files add column if not exists thumbnail_url text;
alter table public.files add column if not exists created_at timestamptz default now();
alter table public.files add column if not exists updated_at timestamptz default now();
alter table public.files add column if not exists folder_id uuid references public.folders(id);
alter table public.folders add column if not exists parent_id uuid references public.folders(id);
alter table public.folders add column if not exists created_at timestamptz default now();

-- Ensure folder-tree + file-in-folder foreign keys cascade on delete.
-- Without this, deleting a project folder fails if it has child folders (parent_id references).
alter table public.folders drop constraint if exists folders_parent_id_fkey;
alter table public.folders
  add constraint folders_parent_id_fkey
  foreign key (parent_id) references public.folders(id) on delete cascade;

alter table public.files drop constraint if exists files_folder_id_fkey;
alter table public.files
  add constraint files_folder_id_fkey
  foreign key (folder_id) references public.folders(id) on delete cascade;

-- 2) Profiles: allow inserting your own profile row
alter table public.profiles enable row level security;
drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);

-- 3) Helpers: access checks by JWT email
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

-- 4) Folders (Projects): ensure access column + RLS policies
alter table public.folders add column if not exists access jsonb;

alter table public.folders enable row level security;
drop policy if exists "Users can view their own folders" on public.folders;
drop policy if exists "Users can insert their own folders" on public.folders;
drop policy if exists "Users can view owned or shared folders" on public.folders;
drop policy if exists "Users can update owned or shared(edit) folders" on public.folders;

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

-- 5) Files (Maps): ensure metadata + access column + RLS policies
alter table public.files add column if not exists room_name text;
alter table public.files add column if not exists last_opened_at timestamptz;
alter table public.files add column if not exists access jsonb;

alter table public.files enable row level security;
drop policy if exists "Users can view their own files" on public.files;
drop policy if exists "Users can insert their own files" on public.files;
drop policy if exists "Users can update their own files" on public.files;
drop policy if exists "Users can view owned, file-shared, or folder-shared files" on public.files;
drop policy if exists "Users can update owned or shared(edit) files" on public.files;
drop policy if exists "Users can delete owned or shared(edit) files" on public.files;

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

-- 6) Storage: Vision image assets bucket + RLS
-- Bucket is private; clients fetch via signed URLs.
insert into storage.buckets (id, name, public)
values ('vision-assets', 'vision-assets', false)
on conflict (id) do nothing;

-- Allow authenticated users to read/write only within:
--   vision/<auth.uid()>/<fileId>/<cellKey>/<uuid>.<ext>
drop policy if exists "Vision assets read own" on storage.objects;
drop policy if exists "Vision assets insert own" on storage.objects;
drop policy if exists "Vision assets update own" on storage.objects;
drop policy if exists "Vision assets delete own" on storage.objects;

create policy "Vision assets read own" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'vision-assets'
    and split_part(name, '/', 1) = 'vision'
    and split_part(name, '/', 2) = auth.uid()::text
  );

create policy "Vision assets insert own" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'vision-assets'
    and split_part(name, '/', 1) = 'vision'
    and split_part(name, '/', 2) = auth.uid()::text
  );

create policy "Vision assets update own" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'vision-assets'
    and split_part(name, '/', 1) = 'vision'
    and split_part(name, '/', 2) = auth.uid()::text
  )
  with check (
    bucket_id = 'vision-assets'
    and split_part(name, '/', 1) = 'vision'
    and split_part(name, '/', 2) = auth.uid()::text
  );

create policy "Vision assets delete own" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'vision-assets'
    and split_part(name, '/', 1) = 'vision'
    and split_part(name, '/', 2) = auth.uid()::text
  );

-- 7) Storage: Docling upload + outputs bucket + RLS
-- Bucket is private; clients fetch via signed URLs.
-- Object paths are restricted to:
--   docling/<auth.uid()>/...
insert into storage.buckets (id, name, public)
values ('docling-files', 'docling-files', false)
on conflict (id) do nothing;

drop policy if exists "Docling files read own" on storage.objects;
drop policy if exists "Docling files insert own" on storage.objects;
drop policy if exists "Docling files update own" on storage.objects;
drop policy if exists "Docling files delete own" on storage.objects;

create policy "Docling files read own" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'docling-files'
    and split_part(name, '/', 1) = 'docling'
    and split_part(name, '/', 2) = auth.uid()::text
  );

create policy "Docling files insert own" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'docling-files'
    and split_part(name, '/', 1) = 'docling'
    and split_part(name, '/', 2) = auth.uid()::text
  );

create policy "Docling files update own" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'docling-files'
    and split_part(name, '/', 1) = 'docling'
    and split_part(name, '/', 2) = auth.uid()::text
  )
  with check (
    bucket_id = 'docling-files'
    and split_part(name, '/', 1) = 'docling'
    and split_part(name, '/', 2) = auth.uid()::text
  );

create policy "Docling files delete own" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'docling-files'
    and split_part(name, '/', 1) = 'docling'
    and split_part(name, '/', 2) = auth.uid()::text
  );

-- 8) Project resources: markdown-only references attached to a project folder
create table if not exists public.project_resources (
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

create index if not exists project_resources_project_created_idx
  on public.project_resources (project_folder_id, created_at);

alter table public.project_resources enable row level security;
drop policy if exists "project_resources_select_via_project_access" on public.project_resources;
drop policy if exists "project_resources_insert_via_project_edit" on public.project_resources;
drop policy if exists "project_resources_update_via_project_edit" on public.project_resources;
drop policy if exists "project_resources_delete_via_project_edit" on public.project_resources;

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

-- 9) Durable async jobs for long-running RAG/docling processing.
create table if not exists public.async_jobs (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in ('rag_ingest', 'rag_ingest_jwt', 'docling_convert', 'ai_file_generation', 'ai_grid_rule', 'ai_diagram_assist')),
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
  check (kind in ('rag_ingest', 'rag_ingest_jwt', 'docling_convert', 'ai_file_generation', 'ai_grid_rule', 'ai_diagram_assist'));

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
