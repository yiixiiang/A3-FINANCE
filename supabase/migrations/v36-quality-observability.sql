-- V36: Health/quality telemetry
create table if not exists public.a3_system_health(id bigint generated always as identity primary key,component text not null,status text not null check(status in ('OK','WARN','ERROR')),details jsonb default '{}'::jsonb,checked_at timestamptz default now());
create index if not exists a3_system_health_component_idx on public.a3_system_health(component,checked_at desc);
alter table public.a3_system_health enable row level security;
revoke all on public.a3_system_health from anon,authenticated;
