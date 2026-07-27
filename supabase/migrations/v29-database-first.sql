-- V29: Database-first records
create extension if not exists pgcrypto;
create table if not exists public.a3_finance_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  company_id text not null default '',
  module text not null,
  record_key text not null,
  document_no text,
  status text not null default 'Draft',
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,module,record_key)
);
alter table public.a3_finance_records enable row level security;
drop policy if exists finance_records_owner_all on public.a3_finance_records;
create policy finance_records_owner_all on public.a3_finance_records for all to authenticated
using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create index if not exists a3_finance_records_owner_module_idx on public.a3_finance_records(owner_id,module,updated_at desc);
