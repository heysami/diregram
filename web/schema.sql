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

-- Files (NexusMap Documents)
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
