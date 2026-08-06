(function () {
  "use strict";

  const cfg = window.DEXLE_SUPABASE || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(cfg.url || "") &&
                     !!cfg.publishableKey;
  let client = null;
  let userPromise = null;

  function getClient() {
    if (!configured || !window.supabase) {
      throw new Error("Dexle stats is not connected to Supabase yet.");
    }
    if (!client) {
      client = window.supabase.createClient(cfg.url, cfg.publishableKey);
      client.auth.onAuthStateChange(() => { userPromise = null; });
    }
    return client;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });
  }

  async function user() {
    getClient();
    if (!userPromise) {
      userPromise = (async () => {
        const { data: sessionData } = await client.auth.getSession();
        if (sessionData.session?.user) return sessionData.session.user;
        const { data, error } = await client.auth.signInAnonymously();
        if (error) throw error;
        return data.user;
      })().catch(err => {
        userPromise = null;
        throw err;
      });
    }
    return userPromise;
  }

  function teamSnapshot(team) {
    return team.map(member => {
      const p = member.p;
      const base = member.base || member.typeBase || p;
      return {
        id: p.id,
        base_id: p.baseId || base.id,
        name: p.name,
        base_name: base.name,
        gen: base.gen,
        region: base.region || null,
        t1: p.t1 || null,
        t2: p.t2 || null,
        legend: !!base.legend,
        stage: base.stage || null,
        mega: !!member.mega,
        mega_name: member.mega || null,
        form_name: member.typeForm || member.mega || null,
        type_form: !!member.typeForm,
        sprite: p.sprite || null,
        shiny_sprite: p.shinySprite || null,
        shiny: !!member.shiny,
        shadow: !!member.shadow,
        starter: !!member.starter,
        candy: !!member.candy,
        base_stats: Array.isArray(base.s) ? base.s : (Array.isArray(p.s) ? p.s : null),
        effective_stats: Array.isArray(member.effectiveStats) ? member.effectiveStats : null,
      };
    });
  }

  async function saveRun(input) {
    const current = await user();
    const row = {
      client_run_id: input.clientRunId || uuid(),
      user_id: current.id,
      mode: input.mode,
      region: input.region ?? null,
      wins: input.wins,
      losses: input.losses,
      total: input.total,
      tier: input.tier,
      team: teamSnapshot(input.team),
      team_bst: input.teamBst,
      coverage: input.coverage,
      region_records: input.regionRecords || null,
    };
    const { error } = await client.from("runs").insert(row);
    if (error && error.code !== "23505") {
      // These four modes were added after the original runs table. Surface a
      // useful deployment error instead of the opaque constraint message.
      if (error.code === "23514" && [
        "unlimited_region", "unlimited_gauntlet", "base_max",
        "team_rocket_gauntlet",
      ].includes(row.mode)) {
        throw new Error(
          `The database does not allow ${row.mode} runs yet. Run supabase-team-rocket-gauntlet.sql in the Supabase SQL Editor.`
        );
      }
      throw error;
    }
    return row.client_run_id;
  }

  async function personalRuns() {
    await user();
    const { data, error } = await client
      .from("runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data || [];
  }

  async function communityTop(mode, generation, starters, limit) {
    await user();
    const { data, error } = await client.rpc("community_top_pokemon", {
      p_mode: mode || null,
      p_region: null,
      p_generation: generation || null,
      p_starters: !!starters,
      p_limit: limit || 10,
    });
    if (error) throw error;
    return data || [];
  }

  async function communitySummary() {
    await user();
    const { data, error } = await client.rpc("community_summary");
    if (error) throw error;
    return data?.[0] || { runs: 0, trainers: 0, perfect_runs: 0 };
  }

  async function communityBestTeam(mode, region) {
    await user();
    const { data, error } = await client.rpc("community_best_team", {
      p_mode: mode,
      p_region: region || null,
    });
    if (error) throw error;
    return data?.[0] || null;
  }

  async function account() {
    const current = await user();
    let { data: profile } = await client.from("profiles")
      .select("username,avatar").eq("user_id", current.id).maybeSingle();
    if (!profile && current.email && !current.is_anonymous) {
      const metaName = current.user_metadata?.preferred_username ||
        current.user_metadata?.full_name || current.user_metadata?.name ||
        current.email.split("@")[0];
      let clean = String(metaName || "Trainer").replace(/[^A-Za-z0-9_]/g, "").slice(0, 20);
      if (clean.length < 3) clean = `Trainer${current.id.replace(/-/g, "").slice(0, 8)}`;
      let result = await client.from("profiles")
        .insert({ user_id:current.id, username:clean }).select("username,avatar").single();
      if (result.error?.code === "23505") {
        const suffix = current.id.replace(/-/g, "").slice(0, 5);
        clean = `${clean.slice(0, 14)}_${suffix}`;
        result = await client.from("profiles")
          .insert({ user_id:current.id, username:clean }).select("username,avatar").single();
      }
      if (result.error) throw result.error;
      profile = result.data;
    }
    // An upgraded anonymous user can briefly retain stale anonymous metadata
    // while its new email session settles. An email or profile means account.
    return {
      user: current,
      profile,
      anonymous: !current.email && !profile?.username,
    };
  }

  async function createAccount(email, password, username) {
    const current = await user();
    if (!current.is_anonymous) throw new Error("This device is already signed in.");
    const clean = String(username || "").trim();
    // Keep the /dexle/ project path when GitHub Pages handles confirmation.
    const emailRedirectTo = new URL("account.html", window.location.href).href;
    const { data, error } = await client.auth.updateUser({
      email: String(email || "").trim(), password,
      data: { username: clean },
    }, { emailRedirectTo });
    if (error) throw error;
    const id = data.user?.id || current.id;
    const { error: profileError } = await client.from("profiles")
      .upsert({ user_id:id, username:clean, login_email:String(email||"").trim().toLowerCase() }, { onConflict:"user_id" });
    if (profileError) throw profileError;
    userPromise = Promise.resolve(data.user || current);
    return data.user || current;
  }

  async function signIn(username, password) {
    getClient();
    const lookup=await client.rpc("email_for_username",{p_username:String(username||"").trim()});
    if(lookup.error)throw lookup.error;
    if(!lookup.data)throw new Error("Username or password is incorrect.");
    const { data, error } = await client.auth.signInWithPassword({ email:lookup.data, password });
    if (error) throw error;
    userPromise = Promise.resolve(data.user);
    return data.user;
  }

  async function updateAvatar(avatar) {
    const current = await user();
    const clean = avatar && Number.isInteger(+avatar.id) ? {
      id:+avatar.id, base_id:+(avatar.base_id || avatar.id), name:String(avatar.name || "Pokemon"),
      shiny:!!avatar.shiny, sprite:avatar.sprite || null, shiny_sprite:avatar.shiny_sprite || avatar.shinySprite || null,
    } : null;
    const { data, error } = await client.from("profiles").update({avatar:clean})
      .eq("user_id",current.id).select("username,avatar").single();
    if (error) throw error;
    return data;
  }

  async function signOut() {
    getClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    userPromise = null;
  }

  async function hallOfFame(mode, region) {
    // Read through the runs table's RLS policy instead of a community RPC.
    // Supabase therefore enforces user_id = auth.uid() before data reaches JS.
    await user();
    let query = client.from("runs").select("*")
      .eq("mode", mode).order("created_at", { ascending:false }).limit(500);
    if (region) query = query.eq("region", region);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).filter(run => run.wins === run.total);
  }

  async function shinyCharmUnlocked() {
    const [regions, gauntlets] = await Promise.all([
      hallOfFame("region", null), hallOfFame("gauntlet", null),
    ]);
    return new Set(regions.map(run => +run.region).filter(Boolean)).size === 9 &&
      gauntlets.length > 0;
  }

  async function shinyDex() {
    const current = await user();
    const { data, error } = await client.from("shiny_dex").select("*")
      .eq("user_id", current.id).order("base_id", { ascending:true });
    if (error) throw error;
    return data || [];
  }

  async function searchTrainers(query) {
    const current = await user();
    const clean = String(query || "").trim().replace(/[%_]/g, "");
    if (clean.length < 2) return [];
    const { data, error } = await client.from("profiles").select("user_id,username,avatar")
      .ilike("username", `%${clean}%`).neq("user_id", current.id).limit(10);
    if (error) throw error;
    return data || [];
  }

  async function friendConnections() {
    const current = await user();
    const { data, error } = await client.from("friend_requests").select("*")
      .order("updated_at", { ascending:false });
    if (error) throw error;
    const rows = data || [];
    const ids = [...new Set(rows.flatMap(r => [r.requester_id,r.addressee_id]))]
      .filter(id => id !== current.id);
    let profiles = [];
    if (ids.length) {
      const result = await client.from("profiles").select("user_id,username,avatar").in("user_id",ids);
      if (result.error) throw result.error;
      profiles = result.data || [];
    }
    const names = new Map(profiles.map(p => [p.user_id,p]));
    return rows.map(r => ({ ...r,
      other_id:r.requester_id===current.id?r.addressee_id:r.requester_id,
      username:names.get(r.requester_id===current.id?r.addressee_id:r.requester_id)?.username||"Trainer",
      avatar:names.get(r.requester_id===current.id?r.addressee_id:r.requester_id)?.avatar||null,
      incoming:r.addressee_id===current.id,
    }));
  }

  async function sendFriendRequest(addresseeId) {
    const current = await user();
    const { error } = await client.from("friend_requests").insert({
      requester_id:current.id, addressee_id:addresseeId,
    });
    if (error) throw error.code === "23505" ? new Error("A friend request already exists between you two.") : error;
  }

  async function acceptFriendRequest(id) {
    const { error } = await client.rpc("accept_friend_request", {p_request_id:id});
    if (error) throw error;
  }
  async function removeFriendConnection(id) {
    const { error } = await client.from("friend_requests").delete().eq("id",id);
    if (error) throw error;
  }
  async function friendProfile(userId) {
    await user();
    const { data, error } = await client.rpc("friend_profile", {p_user_id:userId});
    if (error) throw error;
    return data;
  }

  async function saveDexleGame(input) {
    const current = await user();
    const { error } = await client.from("dexle_games").insert({
      client_game_id: input.clientGameId || uuid(),
      user_id: current.id,
      won: !!input.won,
      guesses_used: input.guessesUsed,
      hints_used: input.hintsUsed,
      target_id: input.targetId,
      generations: input.generations,
    });
    if (error && error.code !== "23505") throw error;
  }

  async function personalDexleSummary() {
    await user();
    const { data, error } = await client.rpc("personal_dexle_summary");
    if (error) throw error;
    return data?.[0] || null;
  }
  async function saveDailyChampion(input) {const current=await user();const {error}=await client.from("daily_champion_results").insert({user_id:current.id,challenge_date:input.date,champion:input.champion,attempts:input.attempts,team:teamSnapshot(input.team),team_bst:input.teamBst,pokemon_left:input.left});if(error&&error.code!=="23505")throw error;}
  async function saveShinyTeam(team){await user();const {error}=await client.rpc("record_shiny_team",{p_team:teamSnapshot(team)});if(error)throw error;}
  async function dailyChampionHistory(){await user();const {data,error}=await client.from("daily_champion_results").select("*").order("challenge_date",{ascending:false}).limit(500);if(error)throw error;return data||[];}

  window.DexleStats = {
    configured,
    saveRun,
    personalRuns,
    communityTop,
    communitySummary,
    communityBestTeam,
    account,
    createAccount,
    signIn,
    updateAvatar,
    signOut,
    hallOfFame,
    shinyCharmUnlocked,
    shinyDex,
    searchTrainers,
    friendConnections,
    sendFriendRequest,
    acceptFriendRequest,
    removeFriendConnection,
    friendProfile,
    saveDexleGame,
    personalDexleSummary,
    saveDailyChampion,
    saveShinyTeam,
    dailyChampionHistory,
  };
})();
