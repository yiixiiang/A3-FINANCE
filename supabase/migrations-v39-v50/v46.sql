-- V46: advisory AI/anomaly review queue
create table if not exists public.a3_review_findings(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),company_id text not null,finding_type text not null,severity text not null check(severity in ('LOW','MEDIUM','HIGH')),entity_type text,entity_id text,evidence jsonb not null default '{}'::jsonb,status text not null default 'OPEN',reviewed_by uuid references auth.users(id),reviewed_at timestamptz,created_at timestamptz not null default now());
alter table public.a3_review_findings enable row level security;
insert into public.a3_schema_migrations(version,name) values(46,'advisory ai and anomaly review') on conflict(version) do update set name=excluded.name, applied_at=now();
