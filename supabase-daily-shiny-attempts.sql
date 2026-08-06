-- Run once in Supabase SQL Editor.
-- Safe to run again: CREATE OR REPLACE and grants are idempotent.


-- Records shiny team members from attempts that do not create a run/result row.
-- Final form state is authoritative: a Mega/type-changed shiny unlocks only that form.
create or replace function public.record_shiny_team(p_team jsonb)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  member jsonb;
  v_user uuid := auth.uid();
  v_id integer;
  v_base integer;
  v_mega boolean;
  v_key text;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if jsonb_typeof(p_team) <> 'array' then raise exception 'Team must be an array.'; end if;

  for member in select value from jsonb_array_elements(p_team)
  loop
    if coalesce((member->>'shiny')::boolean,false) then
      v_id := (member->>'id')::integer;
      v_base := coalesce((member->>'base_id')::integer,v_id);
      v_mega := coalesce((member->>'mega')::boolean,false);
      v_key := case
        when v_mega then 'mega:'||v_id||':'||regexp_replace(lower(member->>'name'),'[^a-z0-9]+','-','g')
        when coalesce((member->>'type_form')::boolean,false) or v_id<>v_base
          then 'form:'||v_id||':'||regexp_replace(lower(member->>'name'),'[^a-z0-9]+','-','g')
        else 'base:'||v_base
      end;

      insert into public.shiny_dex
        (user_id,form_key,pokemon_id,base_id,pokemon_name,is_mega,
         first_seen_at,last_seen_at,times_seen)
      values
        (v_user,v_key,v_id,v_base,member->>'name',v_mega,now(),now(),1)
      on conflict(user_id,form_key) do update set
        last_seen_at=greatest(public.shiny_dex.last_seen_at,excluded.last_seen_at),
        times_seen=public.shiny_dex.times_seen+1,
        pokemon_name=excluded.pokemon_name;
    end if;
  end loop;
end;
$$;

revoke all on function public.record_shiny_team(jsonb) from public,anon;
grant execute on function public.record_shiny_team(jsonb) to authenticated;

