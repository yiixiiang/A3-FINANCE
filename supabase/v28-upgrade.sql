-- A3 Finance V28 upgrade (safe to run more than once)
create table if not exists public.a3_schema_migrations (
  version integer primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

alter table public.a3_schema_migrations enable row level security;

insert into public.a3_schema_migrations (version, name)
values (28, 'production readiness and setup diagnostics')
on conflict (version) do update set name = excluded.name;

select version, name, applied_at
from public.a3_schema_migrations
order by version desc;
