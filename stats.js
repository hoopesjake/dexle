(function () {
  "use strict";

  const REGIONS = {1:"Kanto",2:"Johto",3:"Hoenn",4:"Sinnoh",5:"Unova",
    6:"Kalos",7:"Alola",8:"Galar",9:"Paldea"};
  const TIER = {
    poke:"#E0483C", great:"#3E7BD6", ultra:"#F0C020",
    master:"#B061D6", oak:"#5FE3B0",
  };
  const $ = id => document.getElementById(id);
  const sprite = (id, shiny) =>
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shiny ? "shiny/" : ""}${id}.png`;
  const CANDY_ICON =
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/rare-candy.png";
  const localSprite = (id, shiny) =>
    id === 10301 && !shiny ? "assets/megas/mega-zygarde.png" : sprite(id, shiny);
  let runs = [];
  let scope = "personal";
  let historyMode = "region";

  function pokemonGeneration(mon) {
    if (mon.gen) return +mon.gen;
    const id = +(mon.base_id || mon.id);
    return id <= 151 ? 1 : id <= 251 ? 2 : id <= 386 ? 3 :
      id <= 493 ? 4 : id <= 649 ? 5 : id <= 721 ? 6 :
      id <= 809 ? 7 : id <= 905 ? 8 : 9;
  }

  function regionOptions(allLabel) {
    return `<option value="">${allLabel}</option>` +
      Object.entries(REGIONS).map(([id,name]) => `<option value="${id}">${name}</option>`).join("");
  }

  function monImg(mon) {
    return `<img src="${localSprite(mon.id, mon.shiny)}" alt="${mon.name}" loading="lazy"
      onerror="this.onerror=null;this.src='${sprite(mon.base_id || mon.id, mon.shiny)}'">`;
  }

  function teamHtml(team) {
    return `<div class="team">${team.map(m => `
      <span class="mon ${m.mega ? "mega" : ""} ${m.shiny ? "shiny" : ""} ${m.candy ? "candy" : ""}"
        title="${m.name}${m.mega ? " · Mega" : ""}${m.shiny ? " · Shiny" : ""}${m.candy ? " · Rare Candy" : ""}">
        ${monImg(m)}
        ${m.candy ? `<span class="candy-mark"><img src="${CANDY_ICON}" alt="Rare Candy"></span>` : ""}
        ${m.mega ? `<span class="mega-mark" aria-label="Mega Evolved">◈</span>` : ""}
        ${m.shiny ? `<span class="shiny-mark" aria-label="Shiny">✦</span>` : ""}
      </span>`).join("")}</div>`;
  }

  function runCard(run) {
    const title = run.mode === "gauntlet" ? "Nine-region Gauntlet" : REGIONS[run.region];
    const date = new Date(run.created_at).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
    return `<article class="run-card">
      <div class="run-top">
        <span class="rankball" style="--tier:${TIER[run.tier]}"></span>
        <div class="run-title"><b>${title}</b><small>${date} · ${run.tier === "oak" ? "Professor Oak" : run.tier + " ball"} tier</small></div>
        <span class="record"><span class="wins">${run.wins}</span><i>&ndash;</i><span class="losses">${run.losses}</span></span>
      </div>
      ${teamHtml(run.team)}
    </article>`;
  }

  function best(list) {
    return [...list].sort((a,b) =>
      (b.wins / b.total) - (a.wins / a.total) ||
      b.wins - a.wins ||
      new Date(b.created_at) - new Date(a.created_at)
    )[0] || null;
  }

  function personalTop(mode, region, generation) {
    const filtered = runs.filter(r =>
      (!mode || r.mode === mode) && (!region || r.region === +region));
    const counts = new Map();
    filtered.forEach(r => r.team
      .filter(m => !generation || pokemonGeneration(m) === +generation)
      .forEach(m => {
      const key = `${m.id}|${!!m.mega}`;
      const item = counts.get(key) || {
        pokemon_id:m.id, pokemon_name:m.name, is_mega:!!m.mega,
        base_id:m.base_id, uses:0,
      };
      item.uses++;
      counts.set(key,item);
    }));
    return [...counts.values()].sort((a,b) => b.uses-a.uses || a.pokemon_name.localeCompare(b.pokemon_name)).slice(0,10);
  }

  function drawLeaders(list) {
    $("leaderboard").innerHTML = list.length ? list.map((m,i) => `
      <div class="leader">
        <span class="place">${i+1}</span>
        <img src="${localSprite(m.pokemon_id)}" alt="" onerror="this.onerror=null;this.src='${sprite(m.base_id || m.pokemon_id)}'">
        <div><b>${m.pokemon_name}</b>${m.is_mega ? '<span class="mega-tag">MEGA</span>' : ""}
          <small>${scope === "community" ? "Community teams" : "Your teams"}</small></div>
        <span class="uses">${m.uses} use${+m.uses === 1 ? "" : "s"}</span>
      </div>`).join("") : '<p class="empty">No completed runs match these filters yet.</p>';
  }

  async function refreshLeaderboard() {
    const mode = $("usageMode").value;
    const region = $("usageRegion").value;
    const generation = $("usageGeneration").value;
    $("usageRegionWrap").hidden = mode === "gauntlet";
    if (mode === "gauntlet" && region) $("usageRegion").value = "";
    $("leaderboard").innerHTML = '<p class="empty">Loading rankings…</p>';
    if (scope === "personal") {
      return drawLeaders(personalTop(mode, mode === "gauntlet" ? null : region, generation));
    }
    try {
      drawLeaders(await DexleStats.communityTop(
        mode, mode === "gauntlet" ? null : (+region || null), +generation || null, 10
      ));
    } catch (err) { showError(err); }
  }

  function drawHistory() {
    const region = $("historyRegion").value;
    $("historyFilters").hidden = historyMode === "gauntlet";
    const list = runs.filter(r => r.mode === historyMode &&
      (historyMode === "gauntlet" || !region || r.region === +region)).slice(0,5);
    $("history").innerHTML = list.length ? list.map(runCard).join("") :
      '<p class="empty">Your completed teams will appear here.</p>';
  }

  function drawBests() {
    const region = $("bestRegion").value;
    const regionBest = best(runs.filter(r => r.mode === "region" && (!region || r.region === +region)));
    const gauntletBest = best(runs.filter(r => r.mode === "gauntlet"));
    $("bestRegionCard").innerHTML = regionBest ? runCard(regionBest) : '<p class="empty">No Region runs yet.</p>';
    $("bestGauntletCard").innerHTML = gauntletBest ? runCard(gauntletBest) : '<p class="empty">No Gauntlet runs yet.</p>';
  }

  function communityBestCard(run) {
    if (!run) {
      return '<p class="empty">The first qualifying team will claim this spot.</p>';
    }
    const title = run.mode === "gauntlet"
      ? "Nine-region Gauntlet"
      : `${REGIONS[run.region]} Region Challenge`;
    return `
      <article class="community-best-card">
        <div class="community-best-meta">
          <span class="rankball" style="--tier:${TIER[run.tier]}"></span>
          <div class="run-title"><b>${title}</b><small>${run.username ? `@${run.username} · ` : ""}${run.tier === "oak" ? "Professor Oak" : run.tier + " ball"} tier</small></div>
          <div class="best-metric"><span>Effective stats</span><b>${run.team_bst.toLocaleString()}</b></div>
          <div class="best-metric"><span>Type coverage</span><b>${run.coverage}/18</b></div>
          <span class="record"><span class="wins">${run.wins}</span><i>&ndash;</i><span class="losses">${run.losses}</span></span>
        </div>
        ${teamHtml(run.team)}
      </article>`;
  }

  async function refreshCommunityBests() {
    const region = +$("communityBestRegion").value || null;
    try {
      const [regionBest, gauntletBest] = await Promise.all([
        DexleStats.communityBestTeam("region", region),
        DexleStats.communityBestTeam("gauntlet", null),
      ]);
      $("communityBestRegionCard").innerHTML = communityBestCard(regionBest);
      $("communityBestGauntletCard").innerHTML = communityBestCard(gauntletBest);
    } catch (err) { showError(err); }
  }

  function drawSummary(community) {
    const perfect = runs.filter(r => r.wins === r.total).length;
    const regionCounts = {};
    runs.filter(r => r.mode === "region").forEach(r => regionCounts[r.region] = (regionCounts[r.region] || 0) + 1);
    const favorite = Object.keys(regionCounts).sort((a,b) => regionCounts[b]-regionCounts[a])[0];
    const values = [runs.length, perfect, favorite ? REGIONS[favorite] : "—", Number(community.runs || 0).toLocaleString()];
    [...$("summary").children].forEach((el,i) => el.querySelector("b").textContent = values[i]);
  }

  function drawDexleProgress(stats) {
    const s = stats || {
      total_games:0, wins:0, fails:0, win_rate:0, average_guesses:0,
      current_streak:0, best_streak:0, guess_distribution:{},
    };
    const values = [
      s.total_games, s.wins, s.fails, `${Number(s.win_rate || 0)}%`,
      +s.wins ? Number(s.average_guesses).toFixed(2) : "-",
      s.current_streak, s.best_streak,
    ];
    [...$("dexleMetrics").children].forEach((el, i) =>
      el.querySelector("b").textContent = values[i]);

    const dist = s.guess_distribution || {};
    const max = Math.max(1, ...Array.from({length:10}, (_,i) => +(dist[i+1] || 0)));
    $("guessChart").innerHTML = Array.from({length:10}, (_,i) => {
      const guess = i + 1;
      const count = +(dist[guess] || 0);
      const width = count ? Math.max(3, count / max * 100) : 0;
      return `<div class="guess-row">
        <span class="guess-label">${guess} guess${guess === 1 ? "" : "es"}</span>
        <div class="guess-track" title="${count} win${count === 1 ? "" : "s"}">
          <div class="guess-fill" style="width:${width}%"></div>
        </div>
        <span class="guess-count">${count}</span>
      </div>`;
    }).join("");
  }

  function showError(err) {
    $("error").hidden = false;
    $("error").textContent = `Stats could not load: ${err.message || err}`;
  }

  async function init() {
    ["usageRegion","historyRegion","bestRegion","communityBestRegion"]
      .forEach(id => $(id).innerHTML = regionOptions("All regions"));
    $("usageGeneration").innerHTML = '<option value="">All generations</option>' +
      Array.from({length:9},(_,i) => `<option value="${i+1}">Generation ${i+1}</option>`).join("");
    if (!DexleStats.configured) {
      $("setup").hidden = false;
      drawSummary({runs:0});
      drawLeaders([]);
      drawHistory();
      drawBests();
      $("communityBestRegionCard").innerHTML = communityBestCard(null);
      $("communityBestGauntletCard").innerHTML = communityBestCard(null);
      return;
    }
    try {
      const [mine, community] = await Promise.all([
        DexleStats.personalRuns(),
        DexleStats.communitySummary(),
      ]);
      runs = mine;
      drawSummary(community);
      await refreshCommunityBests();
      await refreshLeaderboard();
      drawHistory();
      drawBests();
    } catch (err) { showError(err); }
  }

  $("scopeTabs").onclick = e => {
    const b = e.target.closest("[data-scope]"); if (!b) return;
    scope = b.dataset.scope;
    [...$("scopeTabs").children].forEach(x => x.classList.toggle("on",x===b));
    refreshLeaderboard();
  };
  $("historyTabs").onclick = e => {
    const b = e.target.closest("[data-mode]"); if (!b) return;
    historyMode = b.dataset.mode;
    [...$("historyTabs").children].forEach(x => x.classList.toggle("on",x===b));
    drawHistory();
  };
  $("usageMode").onchange = refreshLeaderboard;
  $("usageRegion").onchange = refreshLeaderboard;
  $("usageGeneration").onchange = refreshLeaderboard;
  $("historyRegion").onchange = drawHistory;
  $("bestRegion").onchange = drawBests;
  $("communityBestRegion").onchange = refreshCommunityBests;
  init();
})();
