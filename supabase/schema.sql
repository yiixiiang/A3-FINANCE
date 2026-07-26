-- A3 FINANCE cloud storage schema (safe to run more than once)
-- Run this entire file in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.a3_app_storage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_key text not null,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, storage_key)
);

create index if not exists a3_app_storage_user_id_idx
  on public.a3_app_storage (user_id);

alter table public.a3_app_storage enable row level security;

revoke all on table public.a3_app_storage from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.a3_app_storage to authenticated;

drop policy if exists "A3 users read own storage" on public.a3_app_storage;
create policy "A3 users read own storage"
  on public.a3_app_storage
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "A3 users insert own storage" on public.a3_app_storage;
create policy "A3 users insert own storage"
  on public.a3_app_storage
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "A3 users update own storage" on public.a3_app_storage;
create policy "A3 users update own storage"
  on public.a3_app_storage
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "A3 users delete own storage" on public.a3_app_storage;
create policy "A3 users delete own storage"
  on public.a3_app_storage
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.a3_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists a3_app_storage_touch_updated_at on public.a3_app_storage;
create trigger a3_app_storage_touch_updated_at
before update on public.a3_app_storage
for each row execute function public.a3_touch_updated_at();

-- Verification result should show RLS enabled.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'a3_app_storage';

-- V22: encrypted-session cloud backup history (safe to run more than once)
create table if not exists public.a3_app_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  reason text not null default 'manual',
  key_count integer not null default 0,
  device_id text not null default '',
  app_version integer not null default 22,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists a3_app_backups_user_created_idx
  on public.a3_app_backups (user_id, created_at desc);

alter table public.a3_app_backups enable row level security;

revoke all on table public.a3_app_backups from anon;
grant select, insert, delete on table public.a3_app_backups to authenticated;

drop policy if exists "A3 users read own backups" on public.a3_app_backups;
create policy "A3 users read own backups"
  on public.a3_app_backups
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "A3 users create own backups" on public.a3_app_backups;
create policy "A3 users create own backups"
  on public.a3_app_backups
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "A3 users delete own backups" on public.a3_app_backups;
create policy "A3 users delete own backups"
  on public.a3_app_backups
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('a3_app_storage', 'a3_app_backups')
order by c.relname;
