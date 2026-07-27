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
-- V30: Private attachment metadata and bucket
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('a3-private-files','a3-private-files',false,10485760,array['application/pdf','image/jpeg','image/png','text/csv'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create table if not exists public.a3_attachments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 record_id uuid references public.a3_finance_records(id) on delete cascade, object_path text not null unique,
 file_name text not null, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 10485760),
 sha256 text, created_at timestamptz not null default now());
alter table public.a3_attachments enable row level security;
drop policy if exists attachments_owner_all on public.a3_attachments;
create policy attachments_owner_all on public.a3_attachments for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists a3_private_files_owner_select on storage.objects;
create policy a3_private_files_owner_select on storage.objects for select to authenticated using(bucket_id='a3-private-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists a3_private_files_owner_insert on storage.objects;
create policy a3_private_files_owner_insert on storage.objects for insert to authenticated with check(bucket_id='a3-private-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists a3_private_files_owner_delete on storage.objects;
create policy a3_private_files_owner_delete on storage.objects for delete to authenticated using(bucket_id='a3-private-files' and (storage.foldername(name))[1]=auth.uid()::text);
-- V31: Roles and permissions
create table if not exists public.a3_profiles(id uuid primary key references auth.users(id) on delete cascade,email text,display_name text,created_at timestamptz default now());
create table if not exists public.a3_memberships(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,company_id text not null,role text not null check(role in ('ADMIN','FINANCE_MANAGER','ACCOUNTANT','APPROVER','READ_ONLY','DRIVER')),active boolean not null default true,unique(user_id,company_id));
alter table public.a3_profiles enable row level security; alter table public.a3_memberships enable row level security;
drop policy if exists profiles_self on public.a3_profiles; create policy profiles_self on public.a3_profiles for select to authenticated using(id=auth.uid());
drop policy if exists memberships_self on public.a3_memberships; create policy memberships_self on public.a3_memberships for select to authenticated using(user_id=auth.uid());
-- V32: Double-entry, periods, immutable posting
create table if not exists public.a3_accounting_periods(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),company_id text not null,start_date date not null,end_date date not null,status text not null default 'OPEN' check(status in ('OPEN','CLOSED')),unique(owner_id,company_id,start_date,end_date));
create table if not exists public.a3_journals(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),company_id text not null,document_no text not null,entry_date date not null,status text not null default 'DRAFT' check(status in ('DRAFT','POSTED','REVERSED')),description text not null default '',reverses_id uuid references public.a3_journals(id),created_at timestamptz default now(),posted_at timestamptz,unique(owner_id,company_id,document_no));
create table if not exists public.a3_journal_lines(id uuid primary key default gen_random_uuid(),journal_id uuid not null references public.a3_journals(id) on delete restrict,account_code text not null,debit numeric(18,2) not null default 0,credit numeric(18,2) not null default 0,description text not null default '',check(debit>=0 and credit>=0 and not(debit>0 and credit>0)));
alter table public.a3_accounting_periods enable row level security; alter table public.a3_journals enable row level security; alter table public.a3_journal_lines enable row level security;
create or replace function public.a3_validate_journal_balance(p_journal uuid) returns boolean language sql stable as $$ select coalesce(sum(debit),0)=coalesce(sum(credit),0) and coalesce(sum(debit),0)>0 from public.a3_journal_lines where journal_id=p_journal $$;
-- V33: Approval workflow
create table if not exists public.a3_approval_requests(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),company_id text not null,entity_type text not null,entity_id text not null,status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','CANCELLED')),requested_by uuid not null references auth.users(id),decided_by uuid references auth.users(id),request_note text default '',decision_note text default '',created_at timestamptz default now(),decided_at timestamptz);
alter table public.a3_approval_requests enable row level security;
drop policy if exists approval_owner_all on public.a3_approval_requests; create policy approval_owner_all on public.a3_approval_requests for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
-- V34: Security events and session policy metadata
create table if not exists public.a3_security_events(id bigint generated always as identity primary key,user_id uuid references auth.users(id),event_type text not null,ip_hash text,user_agent text,details jsonb not null default '{}'::jsonb,created_at timestamptz default now());
alter table public.a3_security_events enable row level security;
revoke insert,update,delete on public.a3_security_events from anon,authenticated;
create table if not exists public.a3_security_settings(id boolean primary key default true check(id),session_minutes integer not null default 60 check(session_minutes between 5 and 1440),require_mfa_for_admin boolean not null default true,max_failed_logins integer not null default 5,updated_at timestamptz default now());
insert into public.a3_security_settings(id) values(true) on conflict do nothing;
-- V35: Backup manifests and restore tests
create table if not exists public.a3_backup_manifests(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),backup_type text not null,object_path text,record_count bigint not null default 0,checksum text,status text not null default 'READY',created_at timestamptz default now(),restored_at timestamptz,restore_verified boolean not null default false);
alter table public.a3_backup_manifests enable row level security;
drop policy if exists backup_owner_all on public.a3_backup_manifests; create policy backup_owner_all on public.a3_backup_manifests for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
-- V36: Health/quality telemetry
create table if not exists public.a3_system_health(id bigint generated always as identity primary key,component text not null,status text not null check(status in ('OK','WARN','ERROR')),details jsonb default '{}'::jsonb,checked_at timestamptz default now());
create index if not exists a3_system_health_component_idx on public.a3_system_health(component,checked_at desc);
alter table public.a3_system_health enable row level security;
revoke all on public.a3_system_health from anon,authenticated;
-- V37: Bank reconciliation
create table if not exists public.a3_bank_transactions(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),company_id text not null,bank_account text not null,transaction_date date not null,reference text,description text,amount numeric(18,2) not null,currency char(3) not null default 'SGD',import_hash text not null,reconciled boolean not null default false,matched_record_id uuid references public.a3_finance_records(id),unique(owner_id,bank_account,import_hash));
alter table public.a3_bank_transactions enable row level security;
drop policy if exists bank_owner_all on public.a3_bank_transactions; create policy bank_owner_all on public.a3_bank_transactions for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
-- V38: Budgets, forecasts and reporting views
create table if not exists public.a3_budgets(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),company_id text not null,fiscal_year integer not null,account_code text not null,period integer not null check(period between 1 and 12),amount numeric(18,2) not null default 0,currency char(3) not null default 'SGD',unique(owner_id,company_id,fiscal_year,account_code,period));
alter table public.a3_budgets enable row level security;
drop policy if exists budgets_owner_all on public.a3_budgets; create policy budgets_owner_all on public.a3_budgets for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create or replace view public.a3_monthly_actuals as
select
  j.owner_id,
  j.company_id,
  date_trunc('month', j.entry_date)::date as month_start,
  l.account_code,
  sum(l.credit - l.debit)::numeric(18,2) as actual_amount
from public.a3_journals j
join public.a3_journal_lines l on l.journal_id = j.id
where j.status = 'POSTED'
group by
  j.owner_id,
  j.company_id,
  date_trunc('month', j.entry_date)::date,
  l.account_code;
