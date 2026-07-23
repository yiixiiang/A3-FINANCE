-- A3 MANAGEMENT - PHASE 1 STEP 2
-- COMPANY LOGO, COMPANY CHOP / STAMP AND PROTECTED DELETE SUPPORT
-- Run after 000_phase0_foundation.sql, 001_active_company_selector.sql,
-- and 002_phase1_user_management.sql.
-- Safe to run more than once. Existing companies are not deleted or changed.

begin;

alter table public.companies
  add column if not exists logo_path text,
  add column if not exists company_chop_path text;

comment on column public.companies.logo_path is
  'Private Supabase Storage object path for the company logo.';
comment on column public.companies.company_chop_path is
  'Private Supabase Storage object path for the company chop or stamp.';

-- Keep company assets private. Signed URLs are generated only for authenticated
-- users who can access the matching company.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'company-assets',
  'company-assets',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Safely read the numeric company ID from paths such as:
-- 12/logo-uuid.png or 12/chop-uuid.webp
create or replace function public.company_asset_company_id(object_name text)
returns bigint
language plpgsql
immutable
set search_path = public
as $$
declare
  first_folder text;
begin
  first_folder := split_part(coalesce(object_name, ''), '/', 1);

  if first_folder ~ '^[0-9]+$' then
    return first_folder::bigint;
  end if;

  return null;
end;
$$;

grant execute on function public.company_asset_company_id(text) to authenticated;

-- Read: administrator, or a user assigned to the company.
drop policy if exists company_assets_select_accessible on storage.objects;
create policy company_assets_select_accessible
on storage.objects
for select
to authenticated
using (
  bucket_id = 'company-assets'
  and exists (
    select 1
    from public.companies company
    where company.id = public.company_asset_company_id(storage.objects.name)
      and (
        public.is_app_administrator()
        or exists (
          select 1
          from public.user_company_access access
          where access.user_id = auth.uid()
            and access.company_id = company.id
            and access.can_view = true
        )
      )
  )
);

-- Upload: administrator only, and the first path folder must be a real company.
drop policy if exists company_assets_insert_administrator on storage.objects;
create policy company_assets_insert_administrator
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-assets'
  and public.is_app_administrator()
  and exists (
    select 1
    from public.companies company
    where company.id = public.company_asset_company_id(storage.objects.name)
  )
);

-- Replace metadata/object: administrator only.
drop policy if exists company_assets_update_administrator on storage.objects;
create policy company_assets_update_administrator
on storage.objects
for update
to authenticated
using (
  bucket_id = 'company-assets'
  and public.is_app_administrator()
)
with check (
  bucket_id = 'company-assets'
  and public.is_app_administrator()
);

-- Delete: administrator only. This intentionally does not require the company
-- row to still exist, allowing files to be cleaned up after a company deletion.
drop policy if exists company_assets_delete_administrator on storage.objects;
create policy company_assets_delete_administrator
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-assets'
  and public.is_app_administrator()
);

notify pgrst, 'reload schema';
commit;

select
  id,
  name,
  logo_path,
  company_chop_path,
  status
from public.companies
order by name;
