create extension if not exists pgcrypto;

create table if not exists public.vehicle_rates (
  id uuid primary key default gen_random_uuid(),
  vehicle_name text not null unique,
  category text not null default 'PREMIUM',
  transfer_price numeric(12,2),
  hourly_price numeric(12,2),
  minimum_hours integer,
  currency text not null default 'SGD',
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.vehicle_rates enable row level security;

drop policy if exists "Public can read active vehicle rates"
on public.vehicle_rates;

create policy "Public can read active vehicle rates"
on public.vehicle_rates
for select
to anon, authenticated
using (active = true);

create or replace function public.set_vehicle_rates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vehicle_rates_updated_at
on public.vehicle_rates;

create trigger vehicle_rates_updated_at
before update on public.vehicle_rates
for each row execute function public.set_vehicle_rates_updated_at();

insert into public.vehicle_rates
  (vehicle_name, category, transfer_price, hourly_price, minimum_hours, currency, active, sort_order)
values
  ('5-Seater Sedan', 'EXECUTIVE', 50, 40, 3, 'SGD', true, 1),
  ('7-Seater MPV', 'PREMIUM', 60, 50, 3, 'SGD', true, 2),
  ('Luxury MPV', 'VIP', null, null, null, 'SGD', true, 3)
on conflict (vehicle_name) do update set
  category = excluded.category,
  transfer_price = excluded.transfer_price,
  hourly_price = excluded.hourly_price,
  minimum_hours = excluded.minimum_hours,
  currency = excluded.currency,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();
