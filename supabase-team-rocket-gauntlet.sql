-- Dexle: allow Team Rocket Gauntlet runs.
-- Safe to run repeatedly after the main Dexle schema has been installed.

begin;

alter table public.runs drop constraint if exists runs_mode_check;
alter table public.runs add constraint runs_mode_check check (
  mode in ('region','gauntlet','unlimited_region','unlimited_gauntlet','base_max','team_rocket_gauntlet')
);

alter table public.runs drop constraint if exists runs_region_check;
alter table public.runs add constraint runs_region_check check (
  (mode in ('region','unlimited_region') and region between 1 and 9)
  or
  (mode in ('gauntlet','unlimited_gauntlet','base_max','team_rocket_gauntlet') and region is null)
);

commit;
