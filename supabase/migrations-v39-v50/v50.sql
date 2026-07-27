-- V50: release sign-off evidence
create table if not exists public.a3_release_checks(id uuid primary key default gen_random_uuid(),release_version integer not null,check_key text not null,status text not null check(status in ('PENDING','PASS','FAIL','WAIVED')),evidence text,checked_by uuid references auth.users(id),checked_at timestamptz,unique(release_version,check_key));
insert into public.a3_release_checks(release_version,check_key,status) values
(50,'production_build','PENDING'),(50,'database_migrations','PENDING'),(50,'rls_security_review','PENDING'),(50,'accounting_controls','PENDING'),(50,'backup_restore_drill','PENDING'),(50,'performance_test','PENDING'),(50,'user_acceptance','PENDING') on conflict do nothing;
insert into public.a3_schema_migrations(version,name) values(50,'production hardening and release signoff') on conflict(version) do update set name=excluded.name, applied_at=now();
