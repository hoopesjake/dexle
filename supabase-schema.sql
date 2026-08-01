-- Dexle run history and community statistics
-- Run this entire file once in Supabase: SQL Editor -> New query -> Run.

create extension if not exists pgcrypto;

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  client_run_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('region', 'gauntlet')),
  region smallint check (
    (mode = 'region' and region between 1 and 9)
    or (mode = 'gauntlet' and region is null)
  ),
  wins smallint not null check (wins >= 0),
  losses smallint not null check (losses >= 0),
  total smallint not null check (total > 0 and wins + losses = total),
  tier text not null check (tier in ('poke', 'great', 'ultra', 'master', 'oak')),
  team jsonb not null check (jsonb_typeof(team) = 'array' and jsonb_array_length(team) = 6),
  team_bst integer check (team_bst > 0),
  coverage smallint check (coverage between 0 and 18),
  region_records jsonb,
  created_at timestamptz not null default now()
);

create index if not exists runs_user_created_idx
  on public.runs (user_id, created_at desc);
create index if not exists runs_mode_region_idx
  on public.runs (mode, region, created_at desc);

alter table public.runs add column if not exists team_bst integer check (team_bst > 0);
alter table public.runs add column if not exists coverage smallint check (coverage between 0 and 18);

create table if not exists public.dexle_games (
  id uuid primary key default gen_random_uuid(),
  client_game_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  won boolean not null,
  guesses_used smallint not null check (guesses_used between 0 and 10),
  hints_used smallint not null default 0 check (hints_used between 0 and 10),
  target_id integer not null check (target_id between 1 and 1025),
  generations smallint[] not null,
  created_at timestamptz not null default now(),
  check (not won or guesses_used >= 1)
);

create index if not exists dexle_games_user_created_idx
  on public.dexle_games (user_id, created_at desc);

alter table public.dexle_games enable row level security;

drop policy if exists "Players can read their own Dexle games" on public.dexle_games;
create policy "Players can read their own Dexle games"
  on public.dexle_games for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Players can save their own Dexle games" on public.dexle_games;
create policy "Players can save their own Dexle games"
  on public.dexle_games for insert to authenticated
  with check ((select auth.uid()) = user_id);

alter table public.runs enable row level security;

drop policy if exists "Players can read their own runs" on public.runs;
create policy "Players can read their own runs"
  on public.runs for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Players can save their own runs" on public.runs;
create policy "Players can save their own runs"
  on public.runs for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Community totals only. This function deliberately returns no user IDs,
-- timestamps, records, or complete team combinations.
drop function if exists public.community_top_pokemon(text, smallint, integer);

create or replace function public.community_top_pokemon(
  p_mode text default null,
  p_region smallint default null,
  p_generation smallint default null,
  p_limit integer default 10
)
returns table (
  pokemon_id integer,
  base_id integer,
  pokemon_name text,
  is_mega boolean,
  uses bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (member->>'id')::integer as pokemon_id,
    coalesce((member->>'base_id')::integer, (member->>'id')::integer) as base_id,
    member->>'name' as pokemon_name,
    coalesce((member->>'mega')::boolean, false) as is_mega,
    count(*) as uses
  from public.runs r
  cross join lateral jsonb_array_elements(r.team) member
  where (p_mode is null or r.mode = p_mode)
    and (p_region is null or r.region = p_region)
    and (
      p_generation is null
      or p_generation = coalesce(
        (member->>'gen')::smallint,
        case
          when coalesce((member->>'base_id')::integer, (member->>'id')::integer) <= 151 then 1
          when coalesce((member->>'base_id')::integer, (member->>'id')::integer) <= 251 then 2
          when coalesce((member->>'base_id')::integer, (member->>'id')::integer) <= 386 then 3
          when coalesce((member->>'base_id')::integer, (member->>'id')::integer) <= 493 then 4
          when coalesce((member->>'base_id')::integer, (member->>'id')::integer) <= 649 then 5
          when coalesce((member->>'base_id')::integer, (member->>'id')::integer) <= 721 then 6
          when coalesce((member->>'base_id')::integer, (member->>'id')::integer) <= 809 then 7
          when coalesce((member->>'base_id')::integer, (member->>'id')::integer) <= 905 then 8
          else 9
        end
      )
    )
  group by 1, 2, 3, 4
  order by uses desc, pokemon_name asc
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function public.community_summary()
returns table (runs bigint, trainers bigint, perfect_runs bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::bigint,
    count(distinct user_id)::bigint,
    count(*) filter (where wins = total)::bigint
  from public.runs;
$$;

-- Public trainer names used by community records and account pages.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint username_length check (char_length(username) between 3 and 20),
  constraint username_format check (username ~ '^[A-Za-z0-9_]+$')
);
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

drop function if exists public.community_best_team();
drop function if exists public.community_best_team(text, smallint);

create or replace function public.community_best_team(
  p_mode text,
  p_region smallint default null
)
returns table (
  mode text,
  region smallint,
  wins smallint,
  losses smallint,
  total smallint,
  tier text,
  team jsonb,
  team_bst integer,
  coverage smallint,
  username text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.mode, r.region, r.wins, r.losses, r.total, r.tier,
    r.team, r.team_bst, r.coverage,
    coalesce(p.username, 'Trainer') as username, r.created_at
  from public.runs r
  left join public.profiles p on p.user_id = r.user_id
  where r.team_bst is not null
    and r.mode = p_mode
    and (p_region is null or r.region = p_region)
  order by r.team_bst desc, (r.wins::numeric / r.total) desc, r.created_at asc
  limit 1;
$$;

create or replace function public.personal_dexle_summary()
returns table (
  total_games bigint,
  wins bigint,
  fails bigint,
  win_rate numeric,
  average_guesses numeric,
  current_streak bigint,
  best_streak bigint,
  guess_distribution jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select *
    from public.dexle_games
    where user_id = auth.uid()
  ),
  newest as (
    select won, row_number() over (order by created_at desc, id desc) as rn
    from mine
  ),
  first_loss as (
    select min(rn) as rn from newest where not won
  ),
  grouped as (
    select won,
      sum(case when not won then 1 else 0 end)
        over (order by created_at, id) as loss_group
    from mine
  ),
  streaks as (
    select loss_group, count(*) as length
    from grouped where won group by loss_group
  )
  select
    count(*)::bigint,
    count(*) filter (where m.won)::bigint,
    count(*) filter (where not m.won)::bigint,
    coalesce(round(100.0 * count(*) filter (where m.won) / nullif(count(*), 0), 1), 0),
    coalesce(round(avg(m.guesses_used) filter (where m.won), 2), 0),
    coalesce((select count(*) from newest n
      where n.won and n.rn < coalesce((select rn from first_loss), 9223372036854775807)), 0)::bigint,
    coalesce((select max(length) from streaks), 0)::bigint,
    jsonb_build_object(
      '1', count(*) filter (where m.won and m.guesses_used = 1),
      '2', count(*) filter (where m.won and m.guesses_used = 2),
      '3', count(*) filter (where m.won and m.guesses_used = 3),
      '4', count(*) filter (where m.won and m.guesses_used = 4),
      '5', count(*) filter (where m.won and m.guesses_used = 5),
      '6', count(*) filter (where m.won and m.guesses_used = 6),
      '7', count(*) filter (where m.won and m.guesses_used = 7),
      '8', count(*) filter (where m.won and m.guesses_used = 8),
      '9', count(*) filter (where m.won and m.guesses_used = 9),
      '10', count(*) filter (where m.won and m.guesses_used = 10)
    )
  from mine m;
$$;

revoke all on table public.runs from anon;
grant select, insert on table public.runs to authenticated;
revoke all on table public.dexle_games from anon;
grant select, insert on table public.dexle_games to authenticated;

revoke execute on function public.community_top_pokemon(text, smallint, smallint, integer) from public, anon;
grant execute on function public.community_top_pokemon(text, smallint, smallint, integer) to authenticated;
revoke execute on function public.community_summary() from public, anon;
grant execute on function public.community_summary() to authenticated;
revoke execute on function public.community_best_team(text, smallint) from public, anon;
grant execute on function public.community_best_team(text, smallint) to authenticated;
revoke execute on function public.personal_dexle_summary() from public, anon;
grant execute on function public.personal_dexle_summary() to authenticated;

-- =========================================================
-- Accounts, Hall of Fame, and Shiny Dex
-- Run this whole file again after adding these features.
-- =========================================================

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint username_length check (char_length(username) between 3 and 20),
  constraint username_format check (username ~ '^[A-Za-z0-9_]+$')
);
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

alter table public.profiles enable row level security;
drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable" on public.profiles
  for select to authenticated using (true);
drop policy if exists "Players can create their profile" on public.profiles;
create policy "Players can create their profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Players can update their profile" on public.profiles;
create policy "Players can update their profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.shiny_dex (
  user_id uuid not null references auth.users(id) on delete cascade,
  form_key text not null,
  pokemon_id integer not null,
  base_id integer not null check (base_id between 1 and 1025),
  pokemon_name text not null,
  is_mega boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  times_seen integer not null default 1 check (times_seen > 0),
  primary key (user_id, form_key)
);
create index if not exists shiny_dex_user_recent_idx
  on public.shiny_dex (user_id, last_seen_at desc);

alter table public.shiny_dex enable row level security;
drop policy if exists "Players can read their Shiny Dex" on public.shiny_dex;
create policy "Players can read their Shiny Dex" on public.shiny_dex
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.collect_run_shinies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare member jsonb;
declare v_id integer;
declare v_base integer;
declare v_mega boolean;
declare v_key text;
begin
  for member in select value from jsonb_array_elements(new.team)
  loop
    if coalesce((member->>'shiny')::boolean, false) then
      v_id := (member->>'id')::integer;
      v_base := coalesce((member->>'base_id')::integer, v_id);
      v_mega := coalesce((member->>'mega')::boolean, false);
      v_key := case
        when v_mega then 'mega:' || v_id
        when v_id <> v_base then 'form:' || v_id
        else 'base:' || v_base
      end;
      insert into public.shiny_dex
        (user_id, form_key, pokemon_id, base_id, pokemon_name, is_mega,
         first_seen_at, last_seen_at, times_seen)
      values
        (new.user_id, v_key, v_id, v_base, member->>'name', v_mega,
         new.created_at, new.created_at, 1)
      on conflict (user_id, form_key) do update set
        last_seen_at = greatest(public.shiny_dex.last_seen_at, excluded.last_seen_at),
        times_seen = public.shiny_dex.times_seen + 1,
        pokemon_name = excluded.pokemon_name;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists runs_collect_shinies on public.runs;
create trigger runs_collect_shinies
after insert on public.runs
for each row execute function public.collect_run_shinies();

-- Backfill shinies already saved in existing completed runs.
insert into public.shiny_dex
  (user_id, form_key, pokemon_id, base_id, pokemon_name, is_mega,
   first_seen_at, last_seen_at, times_seen)
select r.user_id,
  case
    when coalesce((m->>'mega')::boolean, false) then 'mega:' || (m->>'id')
    when (m->>'id')::integer <> coalesce((m->>'base_id')::integer, (m->>'id')::integer)
      then 'form:' || (m->>'id')
    else 'base:' || coalesce(m->>'base_id', m->>'id')
  end,
  (m->>'id')::integer,
  coalesce((m->>'base_id')::integer, (m->>'id')::integer),
  m->>'name', coalesce((m->>'mega')::boolean, false),
  min(r.created_at), max(r.created_at), count(*)::integer
from public.runs r cross join lateral jsonb_array_elements(r.team) m
where coalesce((m->>'shiny')::boolean, false)
group by 1,2,3,4,5,6
on conflict (user_id, form_key) do nothing;

create or replace function public.community_hall_of_fame(
  p_mode text,
  p_region smallint default null,
  p_limit integer default 100
)
returns table (
  id uuid, mode text, region smallint, wins smallint, losses smallint,
  total smallint, team jsonb, team_bst integer, coverage smallint,
  username text, created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.mode, r.region, r.wins, r.losses, r.total, r.team,
    r.team_bst, r.coverage, coalesce(p.username, 'Trainer'), r.created_at
  from public.runs r
  left join public.profiles p on p.user_id = r.user_id
  where r.wins = r.total and r.mode = p_mode
    and (p_region is null or r.region = p_region)
  order by r.created_at desc
  limit least(greatest(p_limit, 1), 250);
$$;

revoke all on table public.profiles from anon;
grant select, insert, update on table public.profiles to authenticated;
revoke all on table public.shiny_dex from anon;
grant select on table public.shiny_dex to authenticated;
revoke execute on function public.community_hall_of_fame(text, smallint, integer) from public, anon;
grant execute on function public.community_hall_of_fame(text, smallint, integer) to authenticated;
