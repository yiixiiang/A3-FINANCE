-- V48: currencies, rates and consolidation
create table if not exists public.a3_exchange_rates(rate_date date not null,base_currency char(3) not null,quote_currency char(3) not null,rate numeric(24,10) not null,source text not null,primary key(rate_date,base_currency,quote_currency));
create table if not exists public.a3_consolidation_entries(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),group_id text not null,period_end date not null,company_id text not null,account_code text not null,amount numeric(18,2) not null,currency char(3) not null,entry_type text not null check(entry_type in ('TRANSLATION','ELIMINATION','ADJUSTMENT')));
alter table public.a3_consolidation_entries enable row level security;
insert into public.a3_schema_migrations(version,name) values(48,'multi company and multi currency') on conflict(version) do update set name=excluded.name, applied_at=now();
