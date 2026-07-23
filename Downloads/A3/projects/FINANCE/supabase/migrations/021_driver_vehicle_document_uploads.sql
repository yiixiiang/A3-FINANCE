-- A3 Finance Phase 11.1
-- Secure vehicle-document uploads for company-locked driver recruitment.
-- Run after 020_driver_network_and_company_signup.sql.

begin;

-- ------------------------------------------------------------
-- 1. APPLICATION UPLOAD SESSION SUPPORT
-- ------------------------------------------------------------
alter table public.driver_signup_applications
  add column if not exists submission_token uuid not null default gen_random_uuid(),
  add column if not exists upload_completed_at timestamptz;

create unique index if not exists driver_signup_applications_submission_token_uidx
  on public.driver_signup_applications(submission_token);

-- Email is useful but the recruitment requirement is contact number first.
alter table public.driver_signup_applications
  alter column contact_email drop not null;

-- Replace the old status constraint so a private upload session can exist before
-- the completed application is released to the administrator inbox.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'driver_signup_applications'
      and constraint_type = 'CHECK'
      and constraint_name in (
        select conname
        from pg_constraint
        where conrelid = 'public.driver_signup_applications'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%status%'
      )
  loop
    execute format(
      'alter table public.driver_signup_applications drop constraint if exists %I',
      constraint_row.constraint_name
    );
  end loop;
end;
$$;

alter table public.driver_signup_applications
  add constraint driver_signup_applications_status_check
  check (status in ('uploading', 'pending', 'approved', 'rejected', 'withdrawn'));

-- Prevent duplicate active applications when an email is supplied, while still
-- allowing applicants who only provide a contact number.
drop index if exists public.driver_signup_applications_pending_email_uidx;
create unique index driver_signup_applications_pending_email_uidx
  on public.driver_signup_applications(company_id, lower(contact_email))
  where status in ('uploading', 'pending') and contact_email is not null;

update public.driver_signup_applications
set upload_completed_at = coalesce(upload_completed_at, submitted_at)
where status <> 'uploading';

-- ------------------------------------------------------------
-- 2. VEHICLE DOCUMENT REGISTER
-- ------------------------------------------------------------
create table if not exists public.driver_application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id bigint not null
    references public.driver_signup_applications(id) on delete cascade,
  company_id bigint not null references public.companies(id) on delete restrict,
  driver_id bigint references public.drivers(id) on delete set null,
  document_type text not null default 'vehicle_document'
    check (document_type in (
      'vehicle_document',
      'vehicle_log_card',
      'vehicle_insurance',
      'vehicle_inspection',
      'vehicle_photo',
      'other'
    )),
  storage_bucket text not null default 'driver-documents'
    check (storage_bucket = 'driver-documents'),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null
    check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  upload_status text not null default 'pending'
    check (upload_status in ('pending', 'uploaded', 'verified', 'rejected')),
  uploaded_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_application_documents_application_idx
  on public.driver_application_documents(application_id, created_at);
create index if not exists driver_application_documents_driver_idx
  on public.driver_application_documents(driver_id, created_at desc)
  where driver_id is not null;
create index if not exists driver_application_documents_company_idx
  on public.driver_application_documents(company_id, created_at desc);

create or replace function public.prepare_driver_application_document()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  selected_application public.driver_signup_applications%rowtype;
  required_prefix text;
begin
  select * into selected_application
  from public.driver_signup_applications
  where id = new.application_id;

  if selected_application.id is null then
    raise exception 'Driver application was not found.';
  end if;

  new.company_id := selected_application.company_id;
  new.driver_id := coalesce(new.driver_id, selected_application.driver_id);
  new.original_filename := btrim(new.original_filename);
  new.storage_path := btrim(new.storage_path);
  new.updated_at := now();

  required_prefix := format(
    'applications/%s/%s/',
    selected_application.company_id,
    selected_application.id
  );

  if new.original_filename = '' then
    raise exception 'The original vehicle document filename is required.';
  end if;
  if new.storage_path = '' or position(required_prefix in new.storage_path) <> 1 then
    raise exception 'Vehicle document path does not match the locked application company.';
  end if;

  return new;
end;
$$;

drop trigger if exists driver_application_documents_prepare
  on public.driver_application_documents;
create trigger driver_application_documents_prepare
before insert or update on public.driver_application_documents
for each row execute function public.prepare_driver_application_document();

drop trigger if exists driver_application_documents_set_updated_at
  on public.driver_application_documents;
create trigger driver_application_documents_set_updated_at
before update on public.driver_application_documents
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. EXACT PUBLIC APPLICATION REQUIREMENTS
-- ------------------------------------------------------------
create or replace function public.prepare_driver_signup_application()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  selected_link public.driver_signup_links%rowtype;
  requires_submission_validation boolean := false;
begin
  select * into selected_link
  from public.driver_signup_links
  where id = new.signup_link_id
  for update;

  if selected_link.id is null then
    raise exception 'Driver signup link was not found.';
  end if;

  requires_submission_validation := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    requires_submission_validation :=
      new.status = 'pending' and old.status is distinct from 'pending';
  end if;

  if requires_submission_validation then
    if selected_link.status <> 'active' then
      raise exception 'This driver signup link is inactive.';
    end if;
    if selected_link.expires_at is not null and selected_link.expires_at <= now() then
      raise exception 'This driver signup link has expired.';
    end if;
    if selected_link.max_applications is not null
       and selected_link.application_count >= selected_link.max_applications then
      raise exception 'This driver signup link has reached its application limit.';
    end if;
  end if;

  new.company_id := selected_link.company_id;
  new.full_name := btrim(coalesce(new.full_name, ''));
  new.phone := btrim(coalesce(new.phone, ''));
  new.contact_email := nullif(lower(btrim(coalesce(new.contact_email, ''))), '');
  new.vehicle_model := nullif(btrim(coalesce(new.vehicle_model, '')), '');
  new.vehicle_plate := nullif(upper(btrim(coalesce(new.vehicle_plate, ''))), '');
  new.emergency_contact_name := nullif(btrim(coalesce(new.emergency_contact_name, '')), '');
  new.emergency_contact_phone := nullif(btrim(coalesce(new.emergency_contact_phone, '')), '');
  new.bank_name := nullif(btrim(coalesce(new.bank_name, '')), '');
  new.bank_account_name := nullif(btrim(coalesce(new.bank_account_name, '')), '');
  new.bank_account_no := nullif(btrim(coalesce(new.bank_account_no, '')), '');
  new.paynow_no := nullif(btrim(coalesce(new.paynow_no, '')), '');
  new.updated_at := now();

  -- Enforce the requested recruitment fields when the application is first
  -- created or when an upload session is finalized into the review inbox.
  if requires_submission_validation then
    if new.full_name = '' then
      raise exception 'Name is required.';
    end if;
    if new.phone = '' then
      raise exception 'Contact number is required.';
    end if;
    if new.vehicle_model is null then
      raise exception 'Car model is required.';
    end if;
    if new.vehicle_plate is null then
      raise exception 'Car plate is required.';
    end if;
    if new.emergency_contact_name is null or new.emergency_contact_phone is null then
      raise exception 'Emergency contact name and number are required.';
    end if;
    if new.bank_name is null
       or new.bank_account_name is null
       or new.bank_account_no is null then
      raise exception 'Bank name, account name and account number are required.';
    end if;
    if new.paynow_type is null or new.paynow_no is null then
      raise exception 'PayNow type and number are required.';
    end if;
    if not new.consent_confirmed then
      raise exception 'Consent confirmation is required.';
    end if;
  end if;

  return new;
end;
$$;

-- Count only complete applications. Upload sessions do not consume a link's
-- application limit unless they are successfully finalized.
create or replace function public.count_driver_signup_application()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'pending' then
    update public.driver_signup_links
       set application_count = application_count + 1,
           updated_at = now()
     where id = new.signup_link_id;
  end if;
  return new;
end;
$$;

drop trigger if exists driver_signup_applications_count
  on public.driver_signup_applications;
create trigger driver_signup_applications_count
after insert on public.driver_signup_applications
for each row execute function public.count_driver_signup_application();

create or replace function public.count_finalized_driver_signup_application()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'pending' and new.status = 'pending' then
    update public.driver_signup_links
       set application_count = application_count + 1,
           updated_at = now()
     where id = new.signup_link_id;
  end if;
  return new;
end;
$$;

drop trigger if exists driver_signup_applications_count_finalized
  on public.driver_signup_applications;
create trigger driver_signup_applications_count_finalized
after update of status on public.driver_signup_applications
for each row execute function public.count_finalized_driver_signup_application();

-- ------------------------------------------------------------
-- 4. PRIVATE STORAGE AND ACCESS
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'driver-documents',
  'driver-documents',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.driver_application_documents enable row level security;

drop policy if exists driver_application_documents_admin_all
  on public.driver_application_documents;
create policy driver_application_documents_admin_all
on public.driver_application_documents
for all to authenticated
using (public.is_app_administrator())
with check (public.is_app_administrator());

drop policy if exists driver_application_documents_driver_read
  on public.driver_application_documents;
create policy driver_application_documents_driver_read
on public.driver_application_documents
for select to authenticated
using (
  exists (
    select 1
    from public.drivers driver
    where driver.id = driver_application_documents.driver_id
      and driver.auth_user_id = auth.uid()
  )
);

-- The original driver-document policy covers paths under drivers/<id>/... .
-- Recruitment uploads use applications/<company>/<application>/..., so this
-- additional private policy follows the metadata link established on approval.
drop policy if exists driver_application_vehicle_documents_select_self
  on storage.objects;
create policy driver_application_vehicle_documents_select_self
on storage.objects
for select to authenticated
using (
  bucket_id = 'driver-documents'
  and exists (
    select 1
    from public.driver_application_documents document
    join public.drivers driver on driver.id = document.driver_id
    where document.storage_path = storage.objects.name
      and driver.auth_user_id = auth.uid()
  )
);

grant select, insert, update, delete
  on public.driver_application_documents to authenticated;

notify pgrst, 'reload schema';
commit;

select
  '021 driver vehicle document uploads installed' as result,
  (select count(*) from public.driver_application_documents) as registered_documents;
