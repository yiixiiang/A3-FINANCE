-- A3 FINANCE 1.3
-- Company-scoped administrator visibility, short driver signup links,
-- and safer company selection.
-- Run once after migration 023.

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------
-- 1. SHORT DRIVER SIGNUP CODES
-- ------------------------------------------------------------------
alter table public.driver_signup_links
  add column if not exists short_code text;

create or replace function public.assign_driver_signup_short_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  candidate text;
begin
  if new.short_code is null or btrim(new.short_code) = '' then
    loop
      candidate := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
      exit when not exists (
        select 1
        from public.driver_signup_links link
        where upper(link.short_code) = candidate
          and link.id is distinct from new.id
      );
    end loop;
    new.short_code := candidate;
  else
    new.short_code := upper(regexp_replace(btrim(new.short_code), '[^A-Za-z0-9]', '', 'g'));
  end if;

  if length(new.short_code) < 6 then
    raise exception 'Driver signup short code must contain at least 6 letters or numbers.';
  end if;

  return new;
end;
$$;

update public.driver_signup_links
set short_code = upper(substr(replace(public_token::text, '-', ''), 1, 10))
where short_code is null or btrim(short_code) = '';

create unique index if not exists driver_signup_links_short_code_uidx
  on public.driver_signup_links(upper(short_code));

alter table public.driver_signup_links
  alter column short_code set not null;

drop trigger if exists driver_signup_links_assign_short_code on public.driver_signup_links;
create trigger driver_signup_links_assign_short_code
before insert or update of short_code on public.driver_signup_links
for each row execute function public.assign_driver_signup_short_code();

-- ------------------------------------------------------------------
-- 2. ENSURE EVERY ADMINISTRATOR HAS AN EXPLICIT COMPANY SCOPE
-- Existing administrators receive explicit access to their current active company.
-- ------------------------------------------------------------------
with desired as (
  select distinct
    profile.id as user_id,
    profile.active_company_id as company_id
  from public.profiles profile
  where profile.role = 'administrator'
    and profile.status = 'active'
    and profile.active_company_id is not null
)
update public.user_company_access access
set can_view = true,
    can_create = true,
    can_edit = true,
    can_delete = true,
    updated_at = now()
from desired
where access.user_id = desired.user_id
  and access.company_id = desired.company_id;

insert into public.user_company_access(
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
  true,
  true,
  true
from (
  select distinct
    profile.id as user_id,
    profile.active_company_id as company_id
  from public.profiles profile
  where profile.role = 'administrator'
    and profile.status = 'active'
    and profile.active_company_id is not null
) desired
where not exists (
  select 1
  from public.user_company_access access
  where access.user_id = desired.user_id
    and access.company_id = desired.company_id
);

-- ------------------------------------------------------------------
-- 3. COMPANY-SCOPED ADMINISTRATOR HELPERS
-- Security-definer functions prevent policy recursion.
-- ------------------------------------------------------------------
create or replace function public.current_user_is_active_administrator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.role = 'administrator'
      and profile.status = 'active'
  );
$$;

create or replace function public.current_user_company_permission(
  p_company_id bigint,
  p_permission text default 'view'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.status = 'active'
    )
    and exists (
      select 1
      from public.user_company_access access
      where access.user_id = auth.uid()
        and access.company_id = p_company_id
        and case p_permission
          when 'delete' then access.can_delete
          when 'edit' then access.can_edit
          when 'create' then access.can_create
          else access.can_view
        end = true
    );
$$;

create or replace function public.current_user_shares_company(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id = auth.uid()
    or (
      public.current_user_is_active_administrator()
      and exists (
        select 1
        from public.user_company_access actor_access
        join public.user_company_access target_access
          on target_access.company_id = actor_access.company_id
        where actor_access.user_id = auth.uid()
          and actor_access.can_view = true
          and target_access.user_id = p_user_id
      )
      and not exists (
        select 1
        from public.user_company_access target_access
        where target_access.user_id = p_user_id
          and not exists (
            select 1
            from public.user_company_access actor_access
            where actor_access.user_id = auth.uid()
              and actor_access.company_id = target_access.company_id
              and actor_access.can_view = true
          )
      )
    );
$$;

grant execute on function public.current_user_is_active_administrator() to authenticated;
grant execute on function public.current_user_company_permission(bigint, text) to authenticated;
grant execute on function public.current_user_shares_company(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 4. COMPANY-SCOPED COMPANY SELECTOR AND USER MANAGEMENT POLICIES
-- ------------------------------------------------------------------
drop policy if exists companies_select_accessible on public.companies;
create policy companies_select_accessible on public.companies
for select to authenticated
using (public.current_user_company_permission(id, 'view'));

drop policy if exists companies_insert_admin on public.companies;
create policy companies_insert_admin on public.companies
for insert to authenticated
with check (public.current_user_is_active_administrator());

drop policy if exists companies_update_admin on public.companies;
create policy companies_update_admin on public.companies
for update to authenticated
using (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(id, 'edit')
)
with check (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(id, 'edit')
);

drop policy if exists companies_delete_admin on public.companies;
create policy companies_delete_admin on public.companies
for delete to authenticated
using (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(id, 'delete')
);

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
for select to authenticated
using (public.current_user_shares_company(id));

drop policy if exists access_select_own_or_admin on public.user_company_access;
create policy access_select_own_or_admin on public.user_company_access
for select to authenticated
using (
  user_id = auth.uid()
  or (
    public.current_user_is_active_administrator()
    and public.current_user_company_permission(company_id, 'view')
  )
);

drop policy if exists access_insert_admin on public.user_company_access;
create policy access_insert_admin on public.user_company_access
for insert to authenticated
with check (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'edit')
);

drop policy if exists access_update_admin on public.user_company_access;
create policy access_update_admin on public.user_company_access
for update to authenticated
using (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'edit')
)
with check (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'edit')
);

drop policy if exists access_delete_admin on public.user_company_access;
create policy access_delete_admin on public.user_company_access
for delete to authenticated
using (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'edit')
);

-- Newly created companies are automatically assigned to their administrator creator.
create or replace function public.grant_company_creator_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and public.current_user_is_active_administrator() then
    update public.user_company_access
    set can_view = true,
        can_create = true,
        can_edit = true,
        can_delete = true,
        updated_at = now()
    where user_id = auth.uid()
      and company_id = new.id;

    if not found then
      begin
        insert into public.user_company_access(
          user_id, company_id, can_view, can_create, can_edit, can_delete
        )
        values (auth.uid(), new.id, true, true, true, true);
      exception
        when unique_violation then
          update public.user_company_access
          set can_view = true,
              can_create = true,
              can_edit = true,
              can_delete = true,
              updated_at = now()
          where user_id = auth.uid()
            and company_id = new.id;
      end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_grant_creator_access on public.companies;
create trigger companies_grant_creator_access
after insert on public.companies
for each row execute function public.grant_company_creator_access();

-- Administrators may only activate a company explicitly assigned to them.
create or replace function public.set_active_company(p_company_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.companies company
    where company.id = p_company_id
      and company.status = 'active'
  ) then
    raise exception 'The selected company is unavailable or inactive.';
  end if;

  if not exists (
    select 1
    from public.user_company_access access
    where access.user_id = auth.uid()
      and access.company_id = p_company_id
      and access.can_view = true
  ) then
    raise exception 'You do not have access to this company.';
  end if;

  update public.profiles
  set active_company_id = p_company_id,
      updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'User profile was not found.';
  end if;

  return p_company_id;
end;
$$;

grant execute on function public.set_active_company(bigint) to authenticated;

-- ------------------------------------------------------------------
-- 5. COMPANY-SCOPED DRIVER NETWORK POLICIES
-- ------------------------------------------------------------------
create or replace function public.current_user_can_access_driver(p_driver_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.drivers driver
    where driver.id = p_driver_id
      and (
        driver.auth_user_id = auth.uid()
        or public.current_user_company_permission(driver.company_id, 'view')
        or exists (
          select 1
          from public.driver_company_links link
          where link.driver_id = driver.id
            and link.membership_status = 'active'
            and public.current_user_company_permission(link.company_id, 'view')
        )
      )
  );
$$;

grant execute on function public.current_user_can_access_driver(bigint) to authenticated;

drop policy if exists drivers_select_admin_or_self on public.drivers;
create policy drivers_select_admin_or_self on public.drivers
for select to authenticated
using (public.current_user_can_access_driver(id));

drop policy if exists drivers_insert_administrator on public.drivers;
create policy drivers_insert_administrator on public.drivers
for insert to authenticated
with check (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'create')
);

drop policy if exists drivers_update_administrator on public.drivers;
create policy drivers_update_administrator on public.drivers
for update to authenticated
using (
  public.current_user_is_active_administrator()
  and public.current_user_can_access_driver(id)
)
with check (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'edit')
);

drop policy if exists drivers_delete_administrator on public.drivers;
create policy drivers_delete_administrator on public.drivers
for delete to authenticated
using (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'delete')
);

drop policy if exists driver_company_links_select_admin_or_self on public.driver_company_links;
create policy driver_company_links_select_admin_or_self on public.driver_company_links
for select to authenticated
using (
  public.current_user_company_permission(company_id, 'view')
  or exists (
    select 1 from public.drivers driver
    where driver.id = driver_company_links.driver_id
      and driver.auth_user_id = auth.uid()
  )
);

drop policy if exists driver_company_links_manage_admin on public.driver_company_links;
create policy driver_company_links_manage_admin on public.driver_company_links
for all to authenticated
using (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'edit')
)
with check (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'edit')
);

drop policy if exists driver_customer_links_select_admin_or_self on public.driver_customer_links;
create policy driver_customer_links_select_admin_or_self on public.driver_customer_links
for select to authenticated
using (
  public.current_user_company_permission(company_id, 'view')
  or exists (
    select 1 from public.drivers driver
    where driver.id = driver_customer_links.driver_id
      and driver.auth_user_id = auth.uid()
  )
);

drop policy if exists driver_customer_links_manage_admin on public.driver_customer_links;
create policy driver_customer_links_manage_admin on public.driver_customer_links
for all to authenticated
using (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'edit')
)
with check (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'edit')
);

drop policy if exists driver_signup_links_admin on public.driver_signup_links;
create policy driver_signup_links_admin on public.driver_signup_links
for all to authenticated
using (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'view')
)
with check (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'edit')
);

drop policy if exists driver_signup_applications_admin on public.driver_signup_applications;
create policy driver_signup_applications_admin on public.driver_signup_applications
for all to authenticated
using (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'view')
)
with check (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'edit')
);

drop policy if exists driver_application_documents_admin_all on public.driver_application_documents;
create policy driver_application_documents_admin_all on public.driver_application_documents
for all to authenticated
using (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'view')
)
with check (
  public.current_user_is_active_administrator()
  and public.current_user_company_permission(company_id, 'edit')
);

notify pgrst, 'reload schema';
commit;
