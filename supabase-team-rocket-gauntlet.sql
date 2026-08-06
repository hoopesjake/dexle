-- Dexle: allow every post-launch run mode.
-- This migration is required for Shadow Challenge, Region Ascendant,
-- Infinite Gauntlet, and Base Form Fury runs. Safe to run repeatedly after
-- the main Dexle schema has been installed.

begin;

-- Older installations can have PostgreSQL-generated constraint names rather
-- than runs_mode_check/runs_region_check. Remove every legacy CHECK that
-- governs mode or region before installing the canonical rules.
do $$
declare
  old_check record;
begin
  for old_check in
    select conname
    from pg_constraint
    where conrelid = 'public.runs'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) ilike '%mode%'
        or pg_get_constraintdef(oid) ilike '%region%'
      )
  loop
    execute format('alter table public.runs drop constraint %I', old_check.conname);
  end loop;
end $$;

alter table public.runs add constraint runs_mode_check check (
  mode in ('region','gauntlet','unlimited_region','unlimited_gauntlet','base_max','team_rocket_gauntlet')
);

alter table public.runs add constraint runs_region_check check (
  (mode in ('region','unlimited_region') and region between 1 and 9)
  or
  (mode in ('gauntlet','unlimited_gauntlet','base_max','team_rocket_gauntlet') and region is null)
);

commit;

-- Return the actual live definitions (not a static list) for verification.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.runs'::regclass
  and contype = 'c'
  and (
    pg_get_constraintdef(oid) ilike '%mode%'
    or pg_get_constraintdef(oid) ilike '%region%'
  )
order by conname;
