(function () {
  "use strict";

  const cfg = window.DEXLE_SUPABASE || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(cfg.url || "") &&
                     !!cfg.publishableKey;
  let client = null;
  let userPromise = null;

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });
  }

  async function user() {
    if (!configured || !window.supabase) {
      throw new Error("Dexle stats is not connected to Supabase yet.");
    }
    if (!client) client = window.supabase.createClient(cfg.url, cfg.publishableKey);
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
      const base = member.base || p;
      return {
        id: p.id,
        base_id: base.id,
        name: p.name,
        base_name: base.name,
        gen: base.gen,
        mega: !!member.mega,
        mega_name: member.mega || null,
        shiny: !!member.shiny,
        starter: !!member.starter,
        candy: !!member.candy,
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
    if (error && error.code !== "23505") throw error;
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

  async function communityTop(mode, region, generation, limit) {
    await user();
    const { data, error } = await client.rpc("community_top_pokemon", {
      p_mode: mode || null,
      p_region: region || null,
      p_generation: generation || null,
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

  async function communityBestTeam() {
    await user();
    const { data, error } = await client.rpc("community_best_team");
    if (error) throw error;
    return data?.[0] || null;
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

  window.DexleStats = {
    configured,
    saveRun,
    personalRuns,
    communityTop,
    communitySummary,
    communityBestTeam,
    saveDexleGame,
    personalDexleSummary,
  };
})();
