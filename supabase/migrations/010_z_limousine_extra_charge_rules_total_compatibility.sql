-- A3 MANAGEMENT FINANCE
-- MIGRATION 010C: TOTAL LEGACY COMPATIBILITY FIX
-- Target: public.limousine_extra_charge_rules
--
-- This replaces the earlier piecemeal rule_name, charge_type and days_of_week
-- fixes. It upgrades the whole legacy extra-charge table in place, preserves
-- existing data, removes obsolete CHECK constraints, normalises legacy values,
-- recreates the current constraints and installs compatibility triggers.
--
-- Safe to run more than once.

begin;

do $$
begin
  if to_regclass('public.limousine_extra_charge_rules') is null then
    raise exception 'public.limousine_extra_charge_rules does not exist. Run Migration 010 first.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Ensure every column required by the current application exists.
-- Foreign keys are intentionally not recreated here; existing relationships
-- remain untouched and Migration 010 owns the core table relationships.
-- ---------------------------------------------------------------------------
alter table public.limousine_extra_charge_rules
  add column if not exists company_id bigint,
  add column if not exists vehicle_type_id bigint,
  add column if not exists service_type text,
  add column if not exists name text,
  add column if not exists rule_basis text,
  add column if not exists match_text text,
  add column if not exists threshold numeric(10,2),
  add column if not exists charge_type text,
  add column if not exists amount numeric(14,2),
  add column if not exists valid_from date,
  add column if not exists valid_to date,
  add column if not exists days_of_week smallint[],
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists is_stackable boolean,
  add column if not exists priority integer,
  add column if not exists is_active boolean,
  add column if not exists notes text,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Remove every old table CHECK constraint before changing types or values.
-- The canonical constraints are recreated in Section 8.
-- ---------------------------------------------------------------------------
do $$
declare
  constraint_item record;
begin
  for constraint_item in
    select constraint_record.conname
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.limousine_extra_charge_rules'::regclass
      and constraint_record.contype = 'c'
  loop
    execute format(
      'alter table public.limousine_extra_charge_rules drop constraint %I',
      constraint_item.conname
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Helper functions for schema conversion and ongoing normalisation.
-- ---------------------------------------------------------------------------
create or replace function public.a3_safe_numeric_text(
  p_value text,
  p_fallback numeric default 0
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  parsed_value numeric;
begin
  if p_value is null or btrim(p_value) = '' then
    return p_fallback;
  end if;

  begin
    parsed_value := regexp_replace(btrim(p_value), '[^0-9+\-.]', '', 'g')::numeric;
    return coalesce(parsed_value, p_fallback);
  exception when others then
    return p_fallback;
  end;
end
$$;

create or replace function public.a3_safe_boolean_text(
  p_value text,
  p_fallback boolean default false
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  normalised text := lower(btrim(coalesce(p_value, '')));
begin
  if normalised in ('true', 't', 'yes', 'y', '1', 'on', 'active', 'enabled') then
    return true;
  end if;
  if normalised in ('false', 'f', 'no', 'n', '0', 'off', 'inactive', 'disabled') then
    return false;
  end if;
  return p_fallback;
end
$$;

create or replace function public.a3_safe_date_text(
  p_value text,
  p_fallback date default null
)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  normalised text := btrim(coalesce(p_value, ''));
begin
  if normalised = '' then
    return p_fallback;
  end if;

  begin
    if normalised ~ '^\d{4}-\d{2}-\d{2}' then
      return substring(normalised from 1 for 10)::date;
    end if;
    if normalised ~ '^\d{2}/\d{2}/\d{4}$' then
      return to_date(normalised, 'DD/MM/YYYY');
    end if;
    return normalised::date;
  exception when others then
    return p_fallback;
  end;
end
$$;

create or replace function public.a3_safe_time_text(
  p_value text,
  p_fallback time default null
)
returns time
language plpgsql
immutable
set search_path = public
as $$
declare
  normalised text := btrim(coalesce(p_value, ''));
begin
  if normalised = '' then
    return p_fallback;
  end if;

  begin
    return normalised::time;
  exception when others then
    return p_fallback;
  end;
end
$$;

create or replace function public.a3_normalize_limousine_rule_basis(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(regexp_replace(btrim(coalesce(p_value, 'always')), '[^a-z0-9]+', '_', 'g'))
    when 'always' then 'always'
    when 'all' then 'always'
    when 'any' then 'always'
    when 'default' then 'always'
    when 'time' then 'time_window'
    when 'time_window' then 'time_window'
    when 'timewindow' then 'time_window'
    when 'midnight' then 'time_window'
    when 'schedule' then 'time_window'
    when 'pickup' then 'pickup_contains'
    when 'pickup_contains' then 'pickup_contains'
    when 'pickup_text' then 'pickup_contains'
    when 'pickup_location' then 'pickup_contains'
    when 'origin_contains' then 'pickup_contains'
    when 'dropoff' then 'dropoff_contains'
    when 'drop_off' then 'dropoff_contains'
    when 'dropoff_contains' then 'dropoff_contains'
    when 'drop_off_contains' then 'dropoff_contains'
    when 'destination_contains' then 'dropoff_contains'
    when 'extra_stop' then 'extra_stop'
    when 'extra_stops' then 'extra_stop'
    when 'additional_stop' then 'extra_stop'
    when 'additional_stops' then 'extra_stop'
    when 'stop' then 'extra_stop'
    when 'additional_hour' then 'additional_hour'
    when 'additional_hours' then 'additional_hour'
    when 'extra_hour' then 'additional_hour'
    when 'extra_hours' then 'additional_hour'
    when 'overtime' then 'additional_hour'
    when 'passenger' then 'passenger_count'
    when 'passengers' then 'passenger_count'
    when 'passenger_count' then 'passenger_count'
    when 'luggage' then 'luggage_count'
    when 'baggage' then 'luggage_count'
    when 'luggage_count' then 'luggage_count'
    when 'baggage_count' then 'luggage_count'
    else 'always'
  end
$$;

create or replace function public.a3_normalize_limousine_charge_type(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(regexp_replace(btrim(coalesce(p_value, 'fixed')), '[^a-z0-9%]+', '_', 'g'))
    when 'fixed' then 'fixed'
    when 'flat' then 'fixed'
    when 'amount' then 'fixed'
    when 'fixed_amount' then 'fixed'
    when 'flat_amount' then 'fixed'
    when 'flat_rate' then 'fixed'
    when 'percentage' then 'percentage'
    when 'percent' then 'percentage'
    when 'pct' then 'percentage'
    when '%' then 'percentage'
    when 'per_unit' then 'per_unit'
    when 'perunit' then 'per_unit'
    when 'unit' then 'per_unit'
    when 'each' then 'per_unit'
    else 'fixed'
  end
$$;

create or replace function public.a3_normalize_limousine_days_text(p_value text)
returns smallint[]
language plpgsql
immutable
set search_path = public
as $$
declare
  normalised text := lower(btrim(coalesce(p_value, '')));
  token text;
  day_number integer;
  result_days smallint[] := '{}'::smallint[];
begin
  if normalised in ('', '{}', '[]', 'null', 'all', 'daily', 'everyday', 'every_day', 'any') then
    return result_days;
  end if;

  if normalised in ('weekday', 'weekdays', 'mon_fri', 'monday_friday', 'monday_to_friday') then
    return array[1,2,3,4,5]::smallint[];
  end if;

  if normalised in ('weekend', 'weekends', 'sat_sun', 'saturday_sunday', 'saturday_to_sunday') then
    return array[6,7]::smallint[];
  end if;

  normalised := regexp_replace(normalised, '[\{\}\[\]"]', '', 'g');
  normalised := replace(normalised, 'monday', 'mon');
  normalised := replace(normalised, 'tuesday', 'tue');
  normalised := replace(normalised, 'wednesday', 'wed');
  normalised := replace(normalised, 'thursday', 'thu');
  normalised := replace(normalised, 'friday', 'fri');
  normalised := replace(normalised, 'saturday', 'sat');
  normalised := replace(normalised, 'sunday', 'sun');

  for token in
    select value_item
    from regexp_split_to_table(normalised, E'[,;|/[:space:]]+') as value_item
    where btrim(value_item) <> ''
  loop
    day_number := case
      when token ~ '^-?\d+$' then token::integer
      when token in ('mon', 'mo') then 1
      when token in ('tue', 'tu', 'tues') then 2
      when token in ('wed', 'we') then 3
      when token in ('thu', 'th', 'thur', 'thurs') then 4
      when token in ('fri', 'fr') then 5
      when token in ('sat', 'sa') then 6
      when token in ('sun', 'su') then 7
      else null
    end;

    -- Legacy JavaScript-style arrays may use Sunday = 0.
    if day_number = 0 then
      day_number := 7;
    end if;

    if day_number between 1 and 7
       and not (day_number::smallint = any(result_days)) then
      result_days := array_append(result_days, day_number::smallint);
    end if;
  end loop;

  select coalesce(array_agg(day_item order by day_item), '{}'::smallint[])
  into result_days
  from unnest(result_days) as day_item;

  return result_days;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Remove defaults before converting legacy column types.
-- ---------------------------------------------------------------------------
alter table public.limousine_extra_charge_rules
  alter column rule_basis drop default,
  alter column threshold drop default,
  alter column charge_type drop default,
  alter column amount drop default,
  alter column valid_from drop default,
  alter column days_of_week drop default,
  alter column is_stackable drop default,
  alter column priority drop default,
  alter column is_active drop default,
  alter column created_at drop default,
  alter column updated_at drop default;

-- Convert common legacy types to the current canonical types.
do $$
declare
  column_item record;
begin
  for column_item in
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'limousine_extra_charge_rules'
      and column_name in ('service_type', 'name', 'rule_basis', 'match_text', 'charge_type', 'notes')
      and data_type <> 'text'
  loop
    execute format(
      'alter table public.limousine_extra_charge_rules alter column %I type text using %I::text',
      column_item.column_name,
      column_item.column_name
    );
  end loop;
end
$$;

-- rule_name is a known legacy field. Keep it as text when it exists.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'limousine_extra_charge_rules'
      and column_name = 'rule_name'
      and data_type <> 'text'
  ) then
    alter table public.limousine_extra_charge_rules
      alter column rule_name type text using rule_name::text;
  end if;
end
$$;

alter table public.limousine_extra_charge_rules
  alter column threshold type numeric(10,2)
    using round(public.a3_safe_numeric_text(threshold::text, 0), 2),
  alter column amount type numeric(14,2)
    using round(public.a3_safe_numeric_text(amount::text, 0), 2),
  alter column valid_from type date
    using public.a3_safe_date_text(valid_from::text, current_date),
  alter column valid_to type date
    using public.a3_safe_date_text(valid_to::text, null),
  alter column start_time type time
    using public.a3_safe_time_text(start_time::text, null),
  alter column end_time type time
    using public.a3_safe_time_text(end_time::text, null),
  alter column is_stackable type boolean
    using public.a3_safe_boolean_text(is_stackable::text, true),
  alter column priority type integer
    using round(public.a3_safe_numeric_text(priority::text, 100))::integer,
  alter column is_active type boolean
    using public.a3_safe_boolean_text(is_active::text, true),
  alter column days_of_week type smallint[]
    using public.a3_normalize_limousine_days_text(days_of_week::text);

-- ---------------------------------------------------------------------------
-- 5. Obsolete legacy fields must not block inserts from the current app.
-- Drop NOT NULL only from non-canonical, non-key legacy columns. The columns
-- are preserved for backward compatibility and no data is deleted.
-- ---------------------------------------------------------------------------
do $$
declare
  column_item record;
begin
  for column_item in
    select column_record.column_name
    from information_schema.columns column_record
    where column_record.table_schema = 'public'
      and column_record.table_name = 'limousine_extra_charge_rules'
      and column_record.is_nullable = 'NO'
      and column_record.is_identity = 'NO'
      and column_record.is_generated = 'NEVER'
      and column_record.column_name not in (
        'id', 'company_id', 'name', 'rule_basis', 'threshold', 'charge_type',
        'amount', 'valid_from', 'days_of_week', 'is_stackable', 'priority',
        'is_active', 'created_at', 'updated_at'
      )
      and not exists (
        select 1
        from pg_constraint primary_key
        join unnest(primary_key.conkey) with ordinality key_column(attnum, ordinal_position)
          on true
        join pg_attribute attribute_record
          on attribute_record.attrelid = primary_key.conrelid
         and attribute_record.attnum = key_column.attnum
        where primary_key.conrelid = 'public.limousine_extra_charge_rules'::regclass
          and primary_key.contype = 'p'
          and attribute_record.attname = column_record.column_name
      )
  loop
    execute format(
      'alter table public.limousine_extra_charge_rules alter column %I drop not null',
      column_item.column_name
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Normalise every existing row before reinstalling constraints.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'limousine_extra_charge_rules'
      and column_name = 'rule_name'
  ) then
    execute $update_names$
      update public.limousine_extra_charge_rules
      set
        name = coalesce(
          nullif(btrim(name), ''),
          nullif(btrim(rule_name), ''),
          'Extra Charge ' || id::text
        ),
        rule_name = coalesce(
          nullif(btrim(rule_name), ''),
          nullif(btrim(name), ''),
          'Extra Charge ' || id::text
        )
    $update_names$;
  else
    update public.limousine_extra_charge_rules
    set name = coalesce(nullif(btrim(name), ''), 'Extra Charge ' || id::text);
  end if;
end
$$;

update public.limousine_extra_charge_rules
set
  service_type = nullif(btrim(service_type), ''),
  name = coalesce(nullif(btrim(name), ''), 'Extra Charge ' || id::text),
  rule_basis = public.a3_normalize_limousine_rule_basis(rule_basis),
  match_text = nullif(btrim(match_text), ''),
  threshold = greatest(coalesce(threshold, 0), 0),
  charge_type = public.a3_normalize_limousine_charge_type(charge_type),
  amount = greatest(coalesce(amount, 0), 0),
  valid_from = coalesce(valid_from, current_date),
  valid_to = case
    when valid_to is not null and valid_to < coalesce(valid_from, current_date)
      then coalesce(valid_from, current_date)
    else valid_to
  end,
  days_of_week = public.a3_normalize_limousine_days_text(days_of_week::text),
  is_stackable = coalesce(is_stackable, true),
  priority = coalesce(priority, 100),
  is_active = coalesce(is_active, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now());

-- ---------------------------------------------------------------------------
-- 7. Install BEFORE triggers. These accept legacy aliases from older app
-- versions, convert them to current values and keep name/rule_name in sync.
-- ---------------------------------------------------------------------------
create or replace function public.a3_normalize_limousine_extra_charge_rule_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.service_type := nullif(btrim(new.service_type), '');
  new.name := nullif(btrim(new.name), '');
  new.rule_basis := public.a3_normalize_limousine_rule_basis(new.rule_basis);
  new.match_text := nullif(btrim(new.match_text), '');
  new.threshold := greatest(coalesce(new.threshold, 0), 0);
  new.charge_type := public.a3_normalize_limousine_charge_type(new.charge_type);
  new.amount := greatest(coalesce(new.amount, 0), 0);
  new.valid_from := coalesce(new.valid_from, current_date);
  new.days_of_week := public.a3_normalize_limousine_days_text(new.days_of_week::text);
  new.is_stackable := coalesce(new.is_stackable, true);
  new.priority := coalesce(new.priority, 100);
  new.is_active := coalesce(new.is_active, true);
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := now();

  if new.name is null then
    raise exception 'Extra-charge rule name is required.';
  end if;

  if new.valid_to is not null and new.valid_to < new.valid_from then
    raise exception 'Extra-charge rule end date cannot be earlier than its start date.';
  end if;

  return new;
end
$$;

drop trigger if exists a3_10_normalize_limousine_extra_charge_rule
  on public.limousine_extra_charge_rules;
create trigger a3_10_normalize_limousine_extra_charge_rule
before insert or update
on public.limousine_extra_charge_rules
for each row
execute function public.a3_normalize_limousine_extra_charge_rule_row();

-- Optional legacy rule_name synchronisation. The a3_00 name guarantees it
-- runs before the canonical a3_10 normalisation trigger.
do $compatibility$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'limousine_extra_charge_rules'
      and column_name = 'rule_name'
  ) then
    execute $function$
      create or replace function public.a3_sync_limousine_extra_charge_rule_names()
      returns trigger
      language plpgsql
      set search_path = public
      as $body$
      begin
        new.name := coalesce(
          nullif(btrim(new.name), ''),
          nullif(btrim(new.rule_name), '')
        );
        new.rule_name := coalesce(
          nullif(btrim(new.rule_name), ''),
          new.name
        );
        return new;
      end;
      $body$
    $function$;

    execute 'drop trigger if exists limousine_extra_charge_rules_sync_names on public.limousine_extra_charge_rules';
    execute 'drop trigger if exists a3_00_sync_limousine_extra_charge_rule_names on public.limousine_extra_charge_rules';
    execute $trigger$
      create trigger a3_00_sync_limousine_extra_charge_rule_names
      before insert or update
      on public.limousine_extra_charge_rules
      for each row
      execute function public.a3_sync_limousine_extra_charge_rule_names()
    $trigger$;
  else
    execute 'drop trigger if exists a3_00_sync_limousine_extra_charge_rule_names on public.limousine_extra_charge_rules';
  end if;
end
$compatibility$;

-- ---------------------------------------------------------------------------
-- 8. Current defaults, required fields and canonical constraints.
-- ---------------------------------------------------------------------------
alter table public.limousine_extra_charge_rules
  alter column name set not null,
  alter column rule_basis set default 'always',
  alter column rule_basis set not null,
  alter column threshold set default 0,
  alter column threshold set not null,
  alter column charge_type set default 'fixed',
  alter column charge_type set not null,
  alter column amount set default 0,
  alter column amount set not null,
  alter column valid_from set default current_date,
  alter column valid_from set not null,
  alter column days_of_week set default '{}'::smallint[],
  alter column days_of_week set not null,
  alter column is_stackable set default true,
  alter column is_stackable set not null,
  alter column priority set default 100,
  alter column priority set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.limousine_extra_charge_rules
  add constraint limousine_extra_charge_rules_rule_basis_check
    check (rule_basis in (
      'always', 'time_window', 'pickup_contains', 'dropoff_contains',
      'extra_stop', 'additional_hour', 'passenger_count', 'luggage_count'
    )),
  add constraint limousine_extra_charge_rules_charge_type_check
    check (charge_type in ('fixed', 'percentage', 'per_unit')),
  add constraint limousine_extra_charge_rules_threshold_check
    check (threshold >= 0),
  add constraint limousine_extra_charge_rules_amount_check
    check (amount >= 0),
  add constraint limousine_extra_charge_rules_valid_dates_check
    check (valid_to is null or valid_to >= valid_from),
  add constraint limousine_extra_charge_rules_days_of_week_check
    check (days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]);

-- Keep the matching index available after any legacy schema changes.
create index if not exists limousine_extra_charge_rules_match_idx
  on public.limousine_extra_charge_rules(
    company_id, vehicle_type_id, service_type, is_active,
    valid_from, valid_to, priority desc
  );

-- Existing authenticated access remains unchanged; repeat the grant safely.
grant select, insert, update, delete
  on public.limousine_extra_charge_rules
  to authenticated;

-- Ask PostgREST/Supabase to refresh columns, constraints and relationships.
notify pgrst, 'reload schema';

commit;

-- Verification result: all six current CHECK constraints should be listed.
select
  constraint_record.conname as constraint_name,
  pg_get_constraintdef(constraint_record.oid) as definition
from pg_constraint constraint_record
where constraint_record.conrelid = 'public.limousine_extra_charge_rules'::regclass
  and constraint_record.contype = 'c'
order by constraint_record.conname;
