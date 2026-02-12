-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (Users)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- RLS for Profiles
alter table public.profiles enable row level security;
create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

-- Folders
create table public.folders (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  owner_id uuid references public.profiles(id) not null,
  parent_id uuid references public.folders(id),
  created_at timestamptz default now()
);

-- RLS for Folders
alter table public.folders enable row level security;
create policy "Users can view their own folders" on public.folders for select using (auth.uid() = owner_id);
create policy "Users can insert their own folders" on public.folders for insert with check (auth.uid() = owner_id);

-- Files (NexusMap Documents)
create table public.files (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  folder_id uuid references public.folders(id),
  owner_id uuid references public.profiles(id) not null,
  content text default '', -- Snapshot of the NexusMarkdown
  thumbnail_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS for Files
alter table public.files enable row level security;
create policy "Users can view their own files" on public.files for select using (auth.uid() = owner_id);
create policy "Users can insert their own files" on public.files for insert with check (auth.uid() = owner_id);
create policy "Users can update their own files" on public.files for update using (auth.uid() = owner_id);

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
