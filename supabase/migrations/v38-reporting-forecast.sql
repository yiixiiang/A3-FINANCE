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
