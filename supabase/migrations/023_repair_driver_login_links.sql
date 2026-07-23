-- A3 FINANCE - DRIVER LOGIN LINK REPAIR V2
-- Safe to run more than once.
-- Fixes: ON CONFLICT DO UPDATE command cannot affect row a second time.
-- Only exact, unambiguous email matches are linked. Privileged accounts are
-- never converted into driver accounts.

begin;

-- Ensure each auth user has a profile row. Process one auth user at a time so
-- duplicate legacy emails cannot make one multi-row upsert touch a target twice.
do $$
declare
  auth_record record;
  normalized_email text;
  resolved_name text;
begin
  for auth_record in
    select distinct on (auth_user.id)
      auth_user.id,
      auth_user.email,
      auth_user.raw_user_meta_data
    from auth.users auth_user
    order by auth_user.id
  loop
    normalized_email := nullif(lower(btrim(auth_record.email)), '');
    resolved_name := coalesce(
      nullif(btrim(auth_record.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(auth_record.email, ''), '@', 1), ''),
      'User'
    );

    if exists (select 1 from public.profiles profile where profile.id = auth_record.id) then
      update public.profiles profile
      set email = case
            when normalized_email is not null
             and not exists (
               select 1
               from public.profiles other_profile
               where other_profile.id <> auth_record.id
                 and other_profile.email is not null
                 and lower(btrim(other_profile.email)) = normalized_email
             )
            then normalized_email
            else profile.email
          end,
          full_name = coalesce(nullif(profile.full_name, ''), resolved_name),
          updated_at = now()
      where profile.id = auth_record.id;
    else
      begin
        insert into public.profiles (id, email, full_name)
        values (
          auth_record.id,
          case
            when normalized_email is not null
             and not exists (
               select 1
               from public.profiles other_profile
               where other_profile.email is not null
                 and lower(btrim(other_profile.email)) = normalized_email
             )
            then normalized_email
            else null
          end,
          resolved_name
        );
      exception
        when unique_violation then
          -- A concurrent or legacy duplicate was encountered. Keep the profile
          -- identity and omit the conflicting email instead of aborting setup.
          if not exists (select 1 from public.profiles profile where profile.id = auth_record.id) then
            insert into public.profiles (id, full_name)
            values (auth_record.id, resolved_name);
          end if;
      end;
    end if;
  end loop;
end;
$$;

-- Capture only one-to-one email matches. Ambiguous duplicate emails are left
-- untouched instead of assigning one login to several driver records.
create temporary table _driver_login_repair
on commit drop
as
with auth_candidates as (
  select
    auth_user.id as auth_user_id,
    lower(btrim(auth_user.email)) as email_key,
    count(*) over (
      partition by lower(btrim(auth_user.email))
    ) as email_match_count
  from auth.users auth_user
  where auth_user.email is not null
    and btrim(auth_user.email) <> ''
),
driver_candidates as (
  select
    driver.id as driver_id,
    driver.company_id,
    lower(btrim(driver.login_email)) as email_key,
    count(*) over (
      partition by lower(btrim(driver.login_email))
    ) as email_match_count
  from public.drivers driver
  where driver.auth_user_id is null
    and driver.login_email is not null
    and btrim(driver.login_email) <> ''
)
select
  driver.driver_id,
  driver.company_id,
  auth_user.auth_user_id,
  driver.email_key
from driver_candidates driver
join auth_candidates auth_user
  on auth_user.email_key = driver.email_key
left join public.profiles profile
  on profile.id = auth_user.auth_user_id
where driver.email_match_count = 1
  and auth_user.email_match_count = 1
  and coalesce(profile.role, 'user') in ('user', 'driver')
  and not exists (
    select 1
    from public.drivers linked_driver
    where linked_driver.auth_user_id = auth_user.auth_user_id
  );

-- Link the selected driver rows.
update public.drivers driver
set auth_user_id = repair.auth_user_id,
    login_email = repair.email_key,
    login_enabled = true,
    updated_at = now()
from _driver_login_repair repair
where driver.id = repair.driver_id
  and driver.auth_user_id is null;

-- Synchronize each linked login from exactly one driver row. DISTINCT ON also
-- protects older databases that may contain duplicate auth_user_id values.
with selected_driver as (
  select distinct on (driver.auth_user_id)
    driver.auth_user_id,
    driver.login_email,
    driver.full_name,
    driver.phone,
    driver.status,
    driver.company_id
  from public.drivers driver
  where driver.auth_user_id is not null
    and driver.login_email is not null
  order by driver.auth_user_id, driver.updated_at desc nulls last, driver.id desc
)
update public.profiles profile
set email = lower(btrim(driver.login_email)),
    full_name = driver.full_name,
    phone = driver.phone,
    job_title = 'Driver',
    role = 'driver',
    status = driver.status,
    active_company_id = driver.company_id,
    updated_at = now()
from selected_driver driver
where profile.id = driver.auth_user_id
  and profile.role in ('user', 'driver');

-- Grant company access with separate update and insert statements.
with desired as (
  select distinct
    driver.auth_user_id as user_id,
    driver.company_id
  from public.drivers driver
  join public.profiles profile on profile.id = driver.auth_user_id
  where driver.auth_user_id is not null
    and profile.role = 'driver'
)
update public.user_company_access access
set can_view = true,
    updated_at = now()
from desired
where access.user_id = desired.user_id
  and access.company_id = desired.company_id;

insert into public.user_company_access (
  user_id,
  company_id,
  can_view,
  can_create,
  can_edit,
  can_delete
)
select
  desired.user_id,
  desired.company_id,
  true,
  false,
  false,
  false
from (
  select distinct
    driver.auth_user_id as user_id,
    driver.company_id
  from public.drivers driver
  join public.profiles profile on profile.id = driver.auth_user_id
  where driver.auth_user_id is not null
    and profile.role = 'driver'
) desired
where not exists (
  select 1
  from public.user_company_access access
  where access.user_id = desired.user_id
    and access.company_id = desired.company_id
);

notify pgrst, 'reload schema';
commit;

-- Result summary shown by Supabase SQL Editor.
select
  count(*) filter (where driver.auth_user_id is not null) as linked_driver_logins,
  count(*) filter (
    where driver.login_email is not null
      and driver.auth_user_id is null
  ) as still_unlinked_driver_logins
from public.drivers driver;
