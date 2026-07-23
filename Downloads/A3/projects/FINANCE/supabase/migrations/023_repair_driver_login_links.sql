-- A3 FINANCE - DRIVER LOGIN LINK REPAIR
-- Links existing Supabase users to unlinked driver profiles when the exact
-- login email matches. Administrator, finance and viewer accounts are never
-- converted into driver accounts.

begin;

-- Ensure every existing auth user has a profile row before repairing links.
insert into public.profiles (id, email, full_name)
select
  auth_user.id,
  lower(auth_user.email),
  coalesce(
    nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    split_part(auth_user.email, '@', 1)
  )
from auth.users auth_user
where auth_user.email is not null
on conflict (id) do update
set email = excluded.email,
    updated_at = now();

-- Repair only exact, unique email matches that are not already assigned to a
-- different driver. Privileged back-office roles are intentionally excluded.
update public.drivers driver
set auth_user_id = auth_user.id,
    login_email = lower(auth_user.email),
    login_enabled = true,
    updated_at = now()
from auth.users auth_user
left join public.profiles profile on profile.id = auth_user.id
where driver.auth_user_id is null
  and driver.login_email is not null
  and auth_user.email is not null
  and lower(btrim(driver.login_email)) = lower(btrim(auth_user.email))
  and coalesce(profile.role, 'user') in ('user', 'driver')
  and not exists (
    select 1
    from public.drivers linked_driver
    where linked_driver.auth_user_id = auth_user.id
  );

-- Synchronize the linked driver identity and company selection.
update public.profiles profile
set email = lower(driver.login_email),
    full_name = driver.full_name,
    phone = driver.phone,
    job_title = 'Driver',
    role = 'driver',
    status = driver.status,
    active_company_id = driver.company_id,
    updated_at = now()
from public.drivers driver
where driver.auth_user_id = profile.id
  and driver.login_email is not null
  and profile.role in ('user', 'driver');

-- Give each repaired driver read access to the assigned company.
insert into public.user_company_access (
  user_id,
  company_id,
  can_view,
  can_create,
  can_edit,
  can_delete
)
select
  driver.auth_user_id,
  driver.company_id,
  true,
  false,
  false,
  false
from public.drivers driver
join public.profiles profile on profile.id = driver.auth_user_id
where driver.auth_user_id is not null
  and profile.role = 'driver'
on conflict (user_id, company_id) do update
set can_view = true,
    updated_at = now();

notify pgrst, 'reload schema';
commit;
