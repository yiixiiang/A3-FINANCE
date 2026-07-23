-- A3 MANAGEMENT COMPANY - PHASE 0 ACTIVE COMPANY SELECTOR
-- Run after 000_phase0_foundation.sql.
-- Safe to run more than once. Existing companies are not deleted or changed.

begin;

alter table public.profiles
  add column if not exists active_company_id bigint
  references public.companies(id) on delete set null;

create index if not exists profiles_active_company_id_idx
  on public.profiles(active_company_id);

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

  if not (
    public.is_app_administrator()
    or exists (
      select 1
      from public.user_company_access access
      where access.user_id = auth.uid()
        and access.company_id = p_company_id
        and access.can_view = true
    )
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

-- Give existing users a safe default company. The selector can change it later.
update public.profiles
set active_company_id = (
      select company.id
      from public.companies company
      where company.status = 'active'
      order by company.name
      limit 1
    ),
    updated_at = now()
where active_company_id is null;

notify pgrst, 'reload schema';
commit;

select
  profile.full_name,
  profile.role,
  company.name as active_company
from public.profiles profile
left join public.companies company on company.id = profile.active_company_id
order by profile.created_at;
