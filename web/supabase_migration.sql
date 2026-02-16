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
  parent_id uuid references public.folders(id),
  access jsonb,
  created_at timestamptz default now()
);

create table if not exists public.files (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  folder_id uuid references public.folders(id),
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

