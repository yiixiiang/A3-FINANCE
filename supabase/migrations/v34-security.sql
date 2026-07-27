-- V34: Security events and session policy metadata
create table if not exists public.a3_security_events(id bigint generated always as identity primary key,user_id uuid references auth.users(id),event_type text not null,ip_hash text,user_agent text,details jsonb not null default '{}'::jsonb,created_at timestamptz default now());
alter table public.a3_security_events enable row level security;
revoke insert,update,delete on public.a3_security_events from anon,authenticated;
create table if not exists public.a3_security_settings(id boolean primary key default true check(id),session_minutes integer not null default 60 check(session_minutes between 5 and 1440),require_mfa_for_admin boolean not null default true,max_failed_logins integer not null default 5,updated_at timestamptz default now());
insert into public.a3_security_settings(id) values(true) on conflict do nothing;
