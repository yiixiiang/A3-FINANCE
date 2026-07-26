-- FINANCE1 V22 cloud backup upgrade only.
-- Use this when the original a3_app_storage table already exists.

create extension if not exists pgcrypto;

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
create policy "A3 users read own backups" on public.a3_app_backups
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "A3 users create own backups" on public.a3_app_backups;
create policy "A3 users create own backups" on public.a3_app_backups
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "A3 users delete own backups" on public.a3_app_backups;
create policy "A3 users delete own backups" on public.a3_app_backups
for delete to authenticated using ((select auth.uid()) = user_id);

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='a3_app_backups';
