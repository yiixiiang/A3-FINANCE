-- V35: Backup manifests and restore tests
create table if not exists public.a3_backup_manifests(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),backup_type text not null,object_path text,record_count bigint not null default 0,checksum text,status text not null default 'READY',created_at timestamptz default now(),restored_at timestamptz,restore_verified boolean not null default false);
alter table public.a3_backup_manifests enable row level security;
drop policy if exists backup_owner_all on public.a3_backup_manifests; create policy backup_owner_all on public.a3_backup_manifests for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
