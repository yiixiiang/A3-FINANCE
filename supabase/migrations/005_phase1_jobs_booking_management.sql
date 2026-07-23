-- A3 MANAGEMENT - PHASE 1 STEP 4
-- JOBS & BOOKING MANAGEMENT
-- Run after 004_phase1_driver_management.sql.

begin;

alter table public.driver_jobs
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists pickup_time time,
  add column if not exists vehicle_requirement text,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_method text,
  add column if not exists supplier_amount numeric(14,2) not null default 0,
  add column if not exists extra_charges numeric(14,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.driver_jobs'::regclass
      and conname = 'driver_jobs_payment_status_check'
  ) then
    alter table public.driver_jobs
      add constraint driver_jobs_payment_status_check
      check (payment_status in ('unpaid','partial','paid','waived'));
  end if;
end $$;

create unique index if not exists driver_jobs_reference_company_uidx
  on public.driver_jobs(company_id, lower(job_reference))
  where job_reference is not null;

create index if not exists driver_jobs_status_date_idx
  on public.driver_jobs(status, job_date desc);

create or replace function public.assign_job_reference()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.job_reference is null or btrim(new.job_reference) = '' then
    new.job_reference := 'JOB-' || to_char(coalesce(new.job_date, current_date), 'YYYYMMDD') || '-' || lpad(new.id::text, 5, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists driver_jobs_assign_reference on public.driver_jobs;
create trigger driver_jobs_assign_reference
before insert on public.driver_jobs
for each row execute function public.assign_job_reference();

grant select, insert, update, delete on public.driver_jobs to authenticated;
grant usage, select on sequence public.driver_jobs_id_seq to authenticated;

commit;
