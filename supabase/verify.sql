-- FINANCE1 V22 Supabase verification
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('a3_app_storage', 'a3_app_backups')
order by c.relname;

select
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('a3_app_storage', 'a3_app_backups')
order by tablename, policyname;

select
  exists(select 1 from pg_trigger where tgname = 'a3_app_storage_touch_updated_at') as storage_update_trigger_ready;
