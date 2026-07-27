-- V31: Roles and permissions
create table if not exists public.a3_profiles(id uuid primary key references auth.users(id) on delete cascade,email text,display_name text,created_at timestamptz default now());
create table if not exists public.a3_memberships(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,company_id text not null,role text not null check(role in ('ADMIN','FINANCE_MANAGER','ACCOUNTANT','APPROVER','READ_ONLY','DRIVER')),active boolean not null default true,unique(user_id,company_id));
alter table public.a3_profiles enable row level security; alter table public.a3_memberships enable row level security;
drop policy if exists profiles_self on public.a3_profiles; create policy profiles_self on public.a3_profiles for select to authenticated using(id=auth.uid());
drop policy if exists memberships_self on public.a3_memberships; create policy memberships_self on public.a3_memberships for select to authenticated using(user_id=auth.uid());
