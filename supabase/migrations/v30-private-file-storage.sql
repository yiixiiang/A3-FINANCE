-- V30: Private attachment metadata and bucket
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('a3-private-files','a3-private-files',false,10485760,array['application/pdf','image/jpeg','image/png','text/csv'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create table if not exists public.a3_attachments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 record_id uuid references public.a3_finance_records(id) on delete cascade, object_path text not null unique,
 file_name text not null, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 10485760),
 sha256 text, created_at timestamptz not null default now());
alter table public.a3_attachments enable row level security;
drop policy if exists attachments_owner_all on public.a3_attachments;
create policy attachments_owner_all on public.a3_attachments for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
drop policy if exists a3_private_files_owner_select on storage.objects;
create policy a3_private_files_owner_select on storage.objects for select to authenticated using(bucket_id='a3-private-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists a3_private_files_owner_insert on storage.objects;
create policy a3_private_files_owner_insert on storage.objects for insert to authenticated with check(bucket_id='a3-private-files' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists a3_private_files_owner_delete on storage.objects;
create policy a3_private_files_owner_delete on storage.objects for delete to authenticated using(bucket_id='a3-private-files' and (storage.foldername(name))[1]=auth.uid()::text);
