-- A3 Finance Supabase verification (read-only)
-- Run in Supabase Dashboard > SQL Editor after schema.sql.

select
  to_regclass('public.a3_app_storage') as storage_table,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'a3_app_storage';

select
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename = 'a3_app_storage'
order by policyname;

select
  trigger_name,
  event_manipulation,
  action_timing
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'a3_app_storage';

select count(*) as authentication_user_count
from auth.users;
