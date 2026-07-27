-- V47: governed KPI snapshots
create table if not exists public.a3_kpi_definitions(kpi_key text primary key,name text not null,formula_version text not null,description text not null);
create table if not exists public.a3_kpi_snapshots(id bigint generated always as identity primary key,owner_id uuid not null references auth.users(id),company_id text not null,kpi_key text not null references public.a3_kpi_definitions(kpi_key),period_start date not null,period_end date not null,value numeric(24,6),details jsonb not null default '{}'::jsonb,calculated_at timestamptz not null default now());
alter table public.a3_kpi_snapshots enable row level security;
insert into public.a3_schema_migrations(version,name) values(47,'bi dashboards and kpi snapshots') on conflict(version) do update set name=excluded.name, applied_at=now();
