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

create or replace function public.community_best_team()
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
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.mode, r.region, r.wins, r.losses, r.total, r.tier,
    r.team, r.team_bst, r.coverage, r.created_at
  from public.runs r
  where r.team_bst is not null
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
revoke execute on function public.community_best_team() from public, anon;
grant execute on function public.community_best_team() to authenticated;
revoke execute on function public.personal_dexle_summary() from public, anon;
grant execute on function public.personal_dexle_summary() to authenticated;
