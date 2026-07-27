-- V39: integration/concurrency foundation
create table if not exists public.a3_schema_migrations(version integer primary key,name text not null,applied_at timestamptz not null default now());
alter table if exists public.a3_finance_records add column if not exists row_version bigint not null default 1;
alter table if exists public.a3_finance_records add column if not exists updated_at timestamptz not null default now();
insert into public.a3_schema_migrations(version,name) values(39,'database integration completion') on conflict(version) do update set name=excluded.name, applied_at=now();
