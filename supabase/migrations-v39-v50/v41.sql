-- V41: workflow definitions and steps
create table if not exists public.a3_workflow_definitions(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),company_id text not null,entity_type text not null,name text not null,active boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.a3_workflow_steps(id uuid primary key default gen_random_uuid(),workflow_id uuid not null references public.a3_workflow_definitions(id) on delete cascade,step_no integer not null,required_role text not null,minimum_approvals integer not null default 1,unique(workflow_id,step_no));
alter table public.a3_workflow_definitions enable row level security; alter table public.a3_workflow_steps enable row level security;
insert into public.a3_schema_migrations(version,name) values(41,'workflow and posting controls') on conflict(version) do update set name=excluded.name, applied_at=now();
