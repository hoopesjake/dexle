/* =========================================================
   Pokémon Gauntlet - Phase 1: team builder
   Spin for a starter, then throw five Poké Balls.
   ========================================================= */

/* ---------- config ---------- */
const BOOST      = 1.10;   // starter friendship bonus on every base stat
const BASE_SHINY_ODDS = 20; // 1 in N per spin
const CHARM_SHINY_ODDS = 10;
let SHINY_ODDS = BASE_SHINY_ODDS;
const SPIN_MS    = 1500;   // reel duration
const MAX_LEGEND = 1;      // legendaries allowed on a team

const REGIONS = {1:"Kanto", 2:"Johto", 3:"Hoenn", 4:"Sinnoh", 5:"Unova",
                 6:"Kalos", 7:"Alola", 8:"Galar", 9:"Paldea"};

const TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison",
               "ground","flying","psychic","bug","rock","ghost","dragon","dark",
               "steel","fairy"];

const TYPE_COLOR = {
  normal:"#9FA19F", fire:"#E62829", water:"#2980EF", electric:"#FAC000",
  grass:"#3FA129", ice:"#3DCEF3", fighting:"#FF8000", poison:"#9141CB",
  ground:"#915121", flying:"#81B9EF", psychic:"#EF4179", bug:"#91A119",
  rock:"#AFA981", ghost:"#704170", dragon:"#5060E1", dark:"#50413F",
  steel:"#60A1B8", fairy:"#EF70EF"
};

// national dex numbers of every starter, by generation
const STARTERS = {
  1:[1,4,7],       2:[152,155,158], 3:[252,255,258],
  4:[387,390,393], 5:[495,498,501], 6:[650,653,656],
  7:[722,725,728], 8:[810,813,816], 9:[906,909,912]
};

const STAT_NAMES = ["HP","Atk","Def","SpA","SpD","Spe"];

/* ---------- helpers ---------- */
const $    = id => document.getElementById(id);
const norm = s  => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const bst  = p  => p.s.reduce((a, b) => a + b, 0);
const rnd  = n  => Math.floor(Math.random() * n);
const pickOne = a => a[rnd(a.length)];

// a reroll that hands back what you already had isn't a reroll
const rndGen  = not => { let g; do { g = 1 + rnd(9); }        while (g === not); return g; };
const rndType = not => { let t; do { t = pickOne(TYPES); }    while (t === not); return t; };

const SPRITE = (id, shiny) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shiny ? "shiny/" : ""}${id}.png`;
const SPRITE_ROOT = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";

function spriteUrl(mon, shiny) {
  if (mon.id === 10301) return "assets/megas/mega-zygarde.png";
  const custom = shiny ? mon.shinySprite : mon.sprite;
  return custom ? SPRITE_ROOT + custom : SPRITE(mon.id, shiny);
}

// the real Rare Candy item sprite
const CANDY_ICON =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/rare-candy.png";

const ART = (id, shiny) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${shiny ? "shiny/" : ""}${id}.png`;

// A couple of Mega forms have no pixel sprite (Mega Zygarde). Fall back to the
// official artwork, then to the base Pokemon, instead of showing a broken image.
function spriteImg(mon, shiny, cls, extra) {
  const base = mon.baseId || mon.id;
  return `<img src="${spriteUrl(mon, shiny)}" alt="${mon.name}" class="${cls || ""}"
    data-dex="${mon.id}" ${extra || ""}
    onerror="this.onerror=null;this.src='${ART(mon.id, shiny)}';
             this.onerror=function(){this.onerror=null;this.src='${SPRITE(base, shiny)}';};">`;
}

const chip = t =>
  `<span class="type" style="background:${TYPE_COLOR[t]}">${t}</span>`;

// stats after the starter friendship bonus
const boosted = p => p.s.map(v => Math.round(v * BOOST));

// final battle stats for a team slot: friendship bond, then Rare Candy
function statsFor(m) {
  let s = m.starter ? boosted(m.p) : m.p.s;
  if (m.candy) s = s.map(v => Math.round(v * CANDY_BOOST));
  return s;
}
const teamBst = m => m.starter ? boosted(m.p).reduce((a,b) => a+b, 0) : bst(m.p);

/* ---------- mode, from the URL ---------- */
// index.html links here as ?mode=champion or ?mode=gauntlet
const MODE = new URLSearchParams(location.search).get("mode") === "gauntlet" ? "gauntlet" : "champion";
const DAILY_CHAMPIONS=[
  {name:"Blue",region:"Kanto",type:"normal"},{name:"Lance",region:"Johto",type:"dragon"},
  {name:"Steven",region:"Hoenn",type:"steel"},{name:"Cynthia",region:"Sinnoh",type:"dragon"},
  {name:"Alder",region:"Unova",type:"bug"},{name:"Diantha",region:"Kalos",type:"fairy"},
  {name:"Kukui",region:"Alola",type:"rock"},{name:"Leon",region:"Galar",type:"dragon"},
  {name:"Geeta",region:"Paldea",type:"rock"}
];

/* ---------- starter evolution ---------- */
// Every one of the 27 starters is exactly three stages at consecutive dex
// numbers: id, id+1, id+2. Nothing else on the team evolves.
const starterLine  = id => [id, id + 1, id + 2];
const starterFinal = id => id + 2;

// horizontal chain: base to final evolution, left to right
function lineHtml(id, shiny) {
  return `<div class="evoline">` + starterLine(id).map((i, n) =>
    (n ? '<span class="evo-arw">\u2192</span>' : "") +
    `<img class="${n === 0 ? "evo-base" : ""}" src="${SPRITE(i, shiny)}"
          alt="" title="${byId[i].name}">`
  ).join("") + `</div>`;
}

/* ---------- state ---------- */
let DEX = [];
let byId = {};
let OPP = {};                    // generation -> { region, game, opponents[] }
let MEGAS = {};                  // base dex id -> [ mega forms ]
let FORMS = {};                  // base dex id -> meaningful alternate forms
let ownedShinyIds = new Set();   // shiny forms already saved for this Trainer
let selMode = null;              // null | "mega" | "type" | "candy"
let locked  = false;             // true once a run has been simulated
let lastScreen = null;           // which results screen to return to
let runSaveStarted = false;      // prevents one result from being stored twice
let megaIdx = -1;                // team slot currently Mega Evolved

let challenge = null;          // { mode:"single", gen:n } | { mode:"gauntlet" }
let team      = [];            // { p, shiny, starter }
let spin      = null;          // { gen, type, shiny }
let rerollGen = true;
let rerollType= true;
let starterSpins = 0;            // one initial spin plus one respin
let starterGen   = null;         // so a respin can't hand back the same region
const STARTER_SPINS = 2;
let spinning  = false;
let dailyOpponent=null;
let dailyBattleResult=null;

/* ---------- load ---------- */
(async function init() {
  const [dexRes, oppRes, megaRes, formRes] = await Promise.all([
    fetch("pokedex.json"),
    fetch("opponents.json"),
    fetch("megas.json"),
    fetch("forms.json"),
  ]);
  DEX   = await dexRes.json();
  OPP   = await oppRes.json();
  MEGAS = await megaRes.json();
  FORMS = await formRes.json();
  DEX.forEach(p => byId[p.id] = p);
  await loadShinyAchievement();
  console.log("Loaded", DEX.length, "Pokémon");

  $("boostPct").textContent = Math.round((BOOST - 1) * 100) + "%";
  drawTeamBar();
  applyMode();
})();

async function loadShinyAchievement() {
  if (!window.DexleStats?.configured) return;
  try {
    const [unlocked, collected] = await Promise.all([
      DexleStats.shinyCharmUnlocked(), DexleStats.shinyDex(),
    ]);
    ownedShinyIds = new Set(collected.map(entry => +entry.pokemon_id));
    if (unlocked) {
      SHINY_ODDS = CHARM_SHINY_ODDS;
    }
  } catch (error) {
    console.warn("Could not check the Shiny odds achievement:", error);
  }
}

const ownedShinyMark = (id, shiny) => shiny && ownedShinyIds.has(+id)
  ? '<span class="owned-shiny" title="Already in your Shiny Dex" aria-label="Already in your Shiny Dex"></span>'
  : "";

/* the hub already chose the mode, so skip straight past it for the Gauntlet */
function applyMode() {
  if (MODE === "gauntlet") {
    $("pageTitle").textContent = "The Gauntlet";
    $("pageSub").textContent   = "All nine regions. Draft a team of six.";
    challenge = { mode:"gauntlet" };
    startStarter();
  } else {
    $("pageTitle").textContent = "Region Champion";
    $("pageSub").textContent   = "Take today's Champion challenge or play the full region circuit.";
    drawChallenge();
    show("scChallenge");
  }
}

/* =========================================================
   screens
   ========================================================= */
const SCREENS = ["scChallenge", "scStarter", "scBall", "scDone",
                 "scResult", "scGauntlet"];
function show(id) {
  SCREENS.forEach(s => $(s).hidden = (s !== id));
}

/* ---------- 1. challenge ---------- */
function drawChallenge() {
  const done=dailyChampionResult();
  const now=new Date(),midnight=new Date(now);midnight.setHours(24,0,0,0);const ms=midnight-now,reset=`${Math.floor(ms/3600000)}h ${Math.floor(ms%3600000/60000)}m`;
  $("chHd").textContent="Choose your challenge";
  $("chHd").classList.add("mode-eyebrow-heading");
  $("chSub").textContent="Fight today's six-Pokémon Champion team, or take on a complete region challenge.";
  $("chgrid").innerHTML=`<button class="chcard daily-champion-card ${done?"complete":""}" data-daily="1"><small>Once per day</small><b>Daily Champion Battle</b><span>${done?`Share your winning team · resets in ${reset}`:`One rotating Champion · 6 vs 6 · resets in ${reset}`}</span><strong>${done?"Share Your Results":"Play Today's Battle"}</strong></button><button class="chcard regular-champion-card" data-regular="1"><small>Unlimited play</small><b>Region Champion</b><span>Choose one of nine full region circuits</span><strong>Choose a Region</strong></button>`;
  $("toStarter").hidden=true;
  $("chgrid").querySelector("[data-daily]").onclick=()=>done?showSavedDailyChampion(done):startDailyChampion();
  $("chgrid").querySelector("[data-regular]").onclick=drawRegionChallenge;
}
function drawRegionChallenge() {
  $("chHd").textContent="Choose your region";$("chHd").classList.remove("mode-eyebrow-heading");$("chSub").textContent="Which Champion are you going after? You'll still draft Pokémon from every generation.";
  $("chgrid").innerHTML = Object.keys(REGIONS).map(g => {
    const n = OPP[g] ? OPP[g].opponents.length : 13;
    return `
    <button class="chcard" data-gen="${g}">
      <b>${REGIONS[g]}</b>
      <span>Generation ${g} · ${n} battles</span>
    </button>`;
  }).join("");

  $("chgrid").querySelectorAll("[data-gen]").forEach(b => {
    b.onclick = () => selectChallenge({ mode:"single", gen:+b.dataset.gen });
  });
}

function selectChallenge(c) {
  challenge = c;
  $("chgrid").querySelectorAll(".chcard").forEach(b =>
    b.classList.toggle("on", +b.dataset.gen === c.gen));
  $("toStarter").disabled = false;
}

/* ---------- 2. starter ---------- */
function startStarter() {
  drawOpponents();
  drawCoverage();
  show("scStarter");
  $("starterPick").hidden = true;
  $("starterPick").innerHTML = "";
  $("stGen").textContent = "— — —";
  starterSpins = 0;
  starterGen   = null;
  selMode      = null;
  megaIdx      = -1;
  $("selHint").hidden  = true;
  $("megaModal").hidden = true;
  $("spinStarter").disabled = false;
  $("spinStarter").textContent = "Spin for a region";
}

function spinStarter() {
  if (spinning || starterSpins >= STARTER_SPINS) return;
  starterSpins++;
  const gen = starterGen === null ? 1 + rnd(9) : rndGen(starterGen);
  starterGen = gen;

  runReel([{ el:$("stGen"), slot:reelSlot($("stGen")),
             roll:() => REGIONS[1 + rnd(9)], final:REGIONS[gen] }],
    () => {
      const shiny = rnd(SHINY_ODDS) === 0;
      const left  = STARTER_SPINS - starterSpins;
      $("spinStarter").textContent = left
        ? `Respin region (${left} left)`
        : "No respins left";
      $("spinStarter").disabled = !left;
      showStarters(gen, shiny);
    });
}

function showStarters(gen, shiny) {
  const box = $("starterPick");
  box.hidden = false;
  box.innerHTML = STARTERS[gen].map(id => {
    const p = byId[id];
    if (!p) return "";
    const fin = byId[starterFinal(p.id)];
    const b   = boosted(fin);
    return `
      <button class="st" data-id="${p.id}" data-shiny="${shiny ? 1 : 0}">
        <b>${p.name}${shiny ? ' <span class="shiny-tag">\u2726</span>' : ""}${ownedShinyMark(fin.id, shiny)}</b>
        <div>${[p.t1, p.t2].filter(Boolean).map(chip).join(" ")}</div>
        ${lineHtml(p.id, shiny)}
        <div class="st-becomes">joins as <b>${fin.name}</b></div>
        <div class="bst">${bst(fin)} → <i>${b.reduce((x,y)=>x+y,0)}</i> with bond</div>
      </button>`;
  }).join("");

  if (shiny) {
    box.insertAdjacentHTML("beforebegin",
      `<div class="shinyhit" id="shinyNote">✦ Shiny encounter! These sprites are shiny.</div>`);
  } else {
    const old = $("shinyNote");
    if (old) old.remove();
  }

  box.querySelectorAll("[data-id]").forEach(b => {
    b.onclick = () => {
      addToTeam(byId[+b.dataset.id], b.dataset.shiny === "1", true);
      startBallPhase();
    };
  });
}

/* ---------- coverage ----------
   Offence: the best multiplier your team can manage against each type.
   Defence: how many of your six take super-effective damage from it.
   In Champion mode the types you'll actually meet are flagged, because a
   hole you never face doesn't matter. */
function coverageData() {
  const all = Object.keys(TYPE_CHART);
  const off = {}, def = {};

  all.forEach(t => {
    off[t] = team.length
      ? Math.max(...team.map(m => bestMult(m.p, { t1: t, t2: null })))
      : 0;
    def[t] = team.filter(m =>
      typeMult(t, [m.p.t1, m.p.t2].filter(Boolean)) >= 2).length;
  });

  // which types are actually on the opposition in this region
  let facing = null;
  if (challenge?.mode === "daily" && dailyOpponent) {
    facing=new Set();dailyOpponent.team.forEach(m=>[m.t1,m.t2].filter(Boolean).forEach(t=>facing.add(t)));
  } else if (MODE === "champion" && challenge && challenge.mode === "single" && OPP[challenge.gen]) {
    facing = new Set();
    OPP[challenge.gen].opponents.forEach(o =>
      o.team.forEach(m => [m.t1, m.t2].filter(Boolean).forEach(t => facing.add(t))));
  }
  return { all, off, def, facing };
}

function drawCoverage() {
  if (!team.length) { $("covPanel").hidden = true; return; }
  $("covPanel").hidden = false;

  const { all, off, def, facing } = coverageData();
  const strong = all.filter(t => off[t] >= 2);
  const gaps   = all.filter(t => off[t] < 2);
  const weak   = all.filter(t => def[t] > 0).sort((a, b) => def[b] - def[a]);

  const liveGaps = facing ? gaps.filter(t => facing.has(t)) : gaps;

  $("covCount").textContent =
    `${strong.length}/18 covered` +
    (facing ? ` · ${liveGaps.length} gap${liveGaps.length === 1 ? "" : "s"} you'll face` : "");

  const chip2 = (t, extra, dim) =>
    `<span class="cchip ${dim ? "dim" : ""} ${facing && facing.has(t) ? "live" : ""}"
           style="--tc:${TYPE_COLOR[t]}">${t}${extra || ""}</span>`;

  $("covBody").innerHTML = `
    <div class="covrow">
      <b class="covlab good">Super effective against</b>
      <div class="cchips">${strong.length
        ? strong.map(t => chip2(t)).join("")
        : `<span class="covnone">nothing yet</span>`}</div>
    </div>
    <div class="covrow">
      <b class="covlab bad">No super-effective answer</b>
      <div class="cchips">${gaps.length
        ? gaps.map(t => chip2(t, "", true)).join("")
        : `<span class="covnone">every type covered</span>`}</div>
    </div>
    <div class="covrow">
      <b class="covlab warn">Your team is weak to</b>
      <div class="cchips">${weak.length
        ? weak.map(t => chip2(t, `<i>×${def[t]}</i>`)).join("")
        : `<span class="covnone">no shared weaknesses</span>`}</div>
    </div>
    ${facing ? `<p class="covnote">Outlined types appear on trainers in
       ${challenge.mode==="daily"?dailyOpponent.name:OPP[challenge.gen].region}. Gaps you never face don't matter.</p>` : ""}`;
}

/* ---------- who you'll face ---------- */
function drawOpponents() {
  // only meaningful for a single region; the Gauntlet spans all nine
  if (challenge?.mode === "daily" && dailyOpponent) {
    $("oppPanel").hidden=false;$("oppCount").textContent=`6 vs 6 · Champion ${dailyOpponent.name} · Ace: ${dailyOpponent.team[0].name}`;
    $("oppList").innerHTML=`<div class="opp"><div class="opp-head"><b>Champion ${dailyOpponent.name}</b><span class="opp-role">${dailyOpponent.region}</span><span class="type" style="background:${TYPE_COLOR[dailyOpponent.type]}">${dailyOpponent.type} ace</span></div><div class="opp-team">${dailyOpponent.team.map(m=>`<div class="opp-mon ${m.ace?"daily-ace":""}" title="${m.name} · ${m.s.reduce((a,b)=>a+b,0)} total stats"><img src="${spriteUrl(m,false)}" alt="${m.name}"><span class="opp-mn">${m.name}${m.ace?" ★ Ace":""}</span><span class="opp-lv">${m.s.reduce((a,b)=>a+b,0)} total stats</span><span class="opp-mt">${[m.t1,m.t2].filter(Boolean).map(chip).join("")}</span></div>`).join("")}</div></div>`;
    return;
  }
  if (MODE !== "champion" || !challenge || challenge.mode !== "single") {
    $("oppPanel").hidden = true;
    return;
  }
  const g = OPP[challenge.gen];
  if (!g) { $("oppPanel").hidden = true; return; }

  $("oppPanel").hidden = false;
  $("oppCount").textContent = `${g.opponents.length} battles · ${g.region} · ${g.game}`;

  $("oppList").innerHTML = g.opponents.map(o => `
    <div class="opp">
      <div class="opp-head">
        <b>${o.name}</b>
        <span class="opp-role">${o.role}</span>
        ${o.type ? `<span class="type" style="background:${TYPE_COLOR[o.type]}">${o.type}</span>` : ""}
        <span class="opp-place">${o.place}</span>
      </div>
      <div class="opp-team">
        ${o.team.map(m => `
          <div class="opp-mon" title="${m.name}${m.lvl ? " · Lv " + m.lvl : ""}">
            <img src="${SPRITE(m.id, false)}" alt="${m.name}" loading="lazy">
            <span class="opp-mn">${m.name}</span>
            ${m.lvl ? `<span class="opp-lv">Lv ${m.lvl}</span>` : ""}
            <span class="opp-mt">${[m.t1, m.t2].filter(Boolean).map(chip).join("")}</span>
          </div>`).join("")}
      </div>
    </div>`).join("");
}

function toggleOpponents() {
  const open = $("oppList").hidden;
  $("oppList").hidden = !open;
  $("oppToggle").setAttribute("aria-expanded", open);
  $("oppToggle").classList.toggle("open", open);
}

/* ---------- 3. ball spins ---------- */
function startBallPhase(preserveResults) {
  if (team.length >= 6) return finish();
  show("scBall");
  spin = null;
  $("slotNo").textContent = team.length + 1;
  $("bGen").textContent  = "— — —";
  $("bType").textContent = "— — —";
  if (!preserveResults) {
    $("results").hidden = true;
    $("spinNote").hidden = true;
    removeShinyNote();
  }
  $("throwBall").disabled = false;
  $("throwBall").textContent = "Throw a Poké Ball";
  drawRerolls();
  drawOpponents();
  drawCoverage();
}

function throwBall(keep) {
  if (spinning) return;

  // `keep` names the reel that STAYS PUT. null spins both.
  // On a reroll the moving reel must land somewhere new.
  const gen  = keep === "gen"  ? spin.gen
             : keep            ? rndGen(spin.gen)
             :                   1 + rnd(9);
  const type = keep === "type" ? spin.type
             : keep            ? rndType(spin.type)
             :                   pickOne(TYPES);

  const reels = [];
  if (keep !== "gen")  reels.push({ el:$("bGen"),  slot:reelSlot($("bGen")),
    roll:() => REGIONS[1 + rnd(9)], final:REGIONS[gen] });
  if (keep !== "type") reels.push({ el:$("bType"), slot:reelSlot($("bType")),
    roll:() => pickOne(TYPES),      final:type });

  // Preserve the panel height while refreshing so the viewport never jumps.
  if (!$("results").hidden) {
    const panel = $("scBall").querySelector(".panel");
    const held = parseFloat(panel.style.minHeight) || 0;
    panel.style.minHeight = Math.max(panel.offsetHeight, held) + "px";
    $("results").classList.add("refreshing");
  }
  $("spinNote").hidden = true;
  removeShinyNote();

  runReel(reels, () => {
    spin = { gen, type, shiny: rnd(SHINY_ODDS) === 0 };
    // one throw per slot - use a reroll if you don't like it
    $("throwBall").textContent = "Ball thrown";
    $("throwBall").disabled = true;
    resolveSpin();
  });
}

function resolveSpin() {
  const list = eligible(spin.gen, spin.type);

  // Gen 1 + dark is the only genuinely empty combo - roll the region again
  if (!list.length) {
    $("spinNote").hidden = false;
    $("spinNote").textContent =
      `No ${spin.type}-type Pokémon exist in ${REGIONS[spin.gen]} — rolling a new region.`;
    setTimeout(() => throwBall("type"), 1100);
    return;
  }

  if (spin.shiny) {
    $("results").insertAdjacentHTML("beforebegin",
      `<div class="shinyhit" id="shinyNote">✦ Shiny encounter! Every Pokémon in this
       result is shiny — looks only, no stat change.</div>`);
  }

  $("resSearch").value = "";
  $("results").hidden = false;
  $("results").classList.remove("refreshing");
  renderResults(list);
  drawRerolls();
}

// every Pokémon of that generation with that type in either slot
function eligible(gen, type) {
  const taken = new Set(team.map(m => m.p.id));
  return DEX
    .filter(p => p.gen === gen && (p.t1 === type || p.t2 === type) && !taken.has(p.id))
    .sort((a, b) => bst(b) - bst(a));           // strongest first
}

function renderResults(list) {
  const q      = norm($("resSearch").value);
  const shown  = q ? list.filter(p => norm(p.name).includes(q)) : list;
  const legendsOnTeam = team.filter(m => m.p.legend).length;
  const legendLocked  = challenge?.mode !== "daily" && legendsOnTeam >= MAX_LEGEND;

  $("resCount").textContent =
    `${list.length} eligible · ${spin.type} · ${REGIONS[spin.gen]}` +
    (q ? ` · ${shown.length} matching` : "");

  if (!shown.length) {
    $("reslist").innerHTML =
      `<div style="padding:22px;text-align:center;color:var(--ink-dim)">No match.</div>`;
    return;
  }

  $("reslist").innerHTML = shown.map(p => {
    const locked = legendLocked && p.legend;
    return `
    <button class="rr-row ${locked ? "locked" : ""}" data-id="${p.id}"
            ${locked ? "disabled" : ""}>
      <img src="${SPRITE(p.id, spin.shiny)}" alt="" loading="lazy">
      <div class="rr-mid">
        <span class="rr-id">#${String(p.id).padStart(4,"0")}</span>
        <div class="rr-name">${p.name}
          ${ownedShinyMark(p.id, spin.shiny)}
          ${p.legend ? '<span class="legend-tag">legendary</span>' : ""}
          ${locked ? '<span class="lock-tag">1 legend max</span>' : ""}
        </div>
        <div class="rr-types">${[p.t1,p.t2].filter(Boolean).map(chip).join("")}</div>
      </div>
      <div class="rr-stats">
        ${p.s.map((v,i) => `<div class="rr-st"><b>${STAT_NAMES[i]}</b>${v}</div>`).join("")}
      </div>
      <div class="rr-bst"><b>Total</b><span>${bst(p)}</span></div>
    </button>`;
  }).join("");

  $("reslist").querySelectorAll("[data-id]").forEach(b => {
    b.onclick = () => openPickPreview(byId[+b.dataset.id]);
  });
}

function closePickPreview() {
  $("pickModal").hidden = true;
  $("pickBody").innerHTML = "";
}

function openPickPreview(p) {
  const shiny = !!spin.shiny;
  const canMega = !!megaFormsFor(p);
  const canType = typeFormsFor(p).length > 0;
  $("pickBody").innerHTML = `
    <div class="pick-identity">
      ${spriteImg(p, shiny, "pick-sprite")}
      <span class="rr-id">#${String(p.id).padStart(4,"0")}</span>
      <h2 id="pickName">${p.name}${shiny ? '<span class="pick-shiny">&#10022; Shiny</span>' : ""}${ownedShinyMark(p.id, shiny)}${canMega ? '<span class="pick-mega-gem" title="Mega Evolvable" aria-label="Mega Evolvable">&#9672;</span>' : ""}${canType ? '<span class="pick-type-gem" title="Can change type or form" aria-label="Can change type or form">&#9671;</span>' : ""}</h2>
      <div class="pick-types">${[p.t1,p.t2].filter(Boolean).map(chip).join("")}</div>
    </div>
    <div class="pick-stats">
      ${p.s.map((v,i) => `<div class="pick-stat"><span>${STAT_NAMES[i]}</span><b>${v}</b></div>`).join("")}
    </div>
    <div class="pick-total"><span>Total stats</span><b>${bst(p)}</b></div>
    <button id="confirmPick" class="confirm-pick">Add to Team</button>`;

  $("pickModal").hidden = false;
  $("confirmPick").onclick = () => {
    // Hold the card's height so closing the results cannot jerk the viewport.
    const panel = $("scBall").querySelector(".panel");
    panel.style.minHeight = Math.max(panel.offsetHeight,
      parseFloat(panel.style.minHeight) || 0) + "px";
    addToTeam(p, shiny, false);
    closePickPreview();
    $("results").hidden = true;
    $("reslist").innerHTML = "";
    removeShinyNote();
    if (team.length >= 6) return finish();
    startBallPhase(false);
    // The coverage panel can be tall; bring the newly reset reels back to the
    // visual centre so the next spin is immediately in view.
    requestAnimationFrame(() => $("reelBall").scrollIntoView({
      behavior:"smooth", block:"center", inline:"nearest",
    }));
  };
}

/* ---------- rerolls ---------- */
function drawRerolls() {
  const armed = !!spin && !spinning;
  $("rerolls").innerHTML = `
    <button class="rr ${rerollGen ? "" : "spent"}" id="rrGen"
            ${rerollGen && armed ? "" : "disabled"}>
      ↻ Region ${rerollGen ? "" : "· used"}
    </button>
    <button class="rr ${rerollType ? "" : "spent"}" id="rrType"
            ${rerollType && armed ? "" : "disabled"}>
      ↻ Type ${rerollType ? "" : "· used"}
    </button>`;

  if (rerollGen && armed) $("rrGen").onclick = () => {
    rerollGen = false; throwBall("type");      // type stays, new region
  };
  if (rerollType && armed) $("rrType").onclick = () => {
    rerollType = false; throwBall("gen");      // region stays, new type
  };
}

/* ---------- team ---------- */
function addToTeam(picked, shiny, starter) {
  // starters arrive fully evolved; everyone else joins exactly as drafted
  const p = starter ? byId[starterFinal(picked.id)] : picked;
  team.push({ p, from: starter ? picked.id : null,
              shiny:!!shiny, starter:!!starter });
  drawTeamBar();
  drawCoverage();
}

/* grid reads 0 1 2 / 3 4 5 - the starter always sits in the top-LEFT cell */
function layout() {
  const starter = team.find(m => m.starter) || null;
  const rest    = team.filter(m => !m.starter);
  return [starter, rest[0], rest[1], rest[2], rest[3], rest[4]];
}

function drawTeamBar() {
  const cells = layout();
  $("tbSlots").innerHTML = Array.from({ length:6 }, (_, i) => {
    const m = cells[i];
    if (!m) return `<div class="tb-slot"></div>`;
    const cls = ["tb-slot", "filled",
                 m.starter ? "starter" : "",
                 m.mega    ? "megaon"  : "",
                 m.typeForm ? "typeon" : "",
                 m.candy   ? "candyon" : ""].filter(Boolean).join(" ");
    return `<div class="${cls}" title="${m.p.name}${m.mega ? " · Mega Evolved" : ""}${m.candy ? " · Rare Candy" : ""}">
      ${spriteImg(m.p, m.shiny)}
      ${m.starter ? '<span class="tb-flag">💛</span>' : ""}
      ${m.mega    ? '<span class="tb-flag tb-mega">◈</span>' : ""}
      ${m.typeForm ? '<span class="tb-flag tb-type">◇</span>' : ""}
      ${m.candy   ? `<span class="tb-flag tb-candy"><img src="${CANDY_ICON}" alt="Rare Candy"></span>` : ""}
      ${m.shiny   ? '<span class="tb-flag tb-shiny">✦</span>' : ""}
    </div>`;
  }).join("");
  $("tbCount").textContent = `${team.length} / 6`;
}

function formCatalog(p, cost) {
  if (!p) return [];
  return (FORMS[String(p.id)] || FORMS[p.id] || []).map(f =>
    +p.id === 890 && /Eternamax/i.test(f.name) ? {...f,cost:"power",kind:"Eternamax"} : f
  ).filter(f => f.cost === cost);
}
function megaFormsFor(p) {
  if (!p) return null;
  const megas = (MEGAS[String(p.id)] || MEGAS[p.id] || []).map(f => ({
    ...f, cost:"power", kind:/primal/i.test(f.name) ? "Primal Reversion" : "Mega Evolution",
  }));
  const forms = [...megas, ...formCatalog(p, "power")];
  return forms.length ? forms : null;
}
function originalPokemon(m) { return m.base || m.typeBase || m.p; }
function powerFormsForMember(m) {
  const root = m.typeBase || (m.base?.baseId && byId[m.base.baseId]) || m.base || m.p;
  let forms = megaFormsFor(root);
  if (!forms) return null;
  // Urshifu may only Gigantamax into the style currently selected through
  // Change Type: Dark = Single Strike, Water = Rapid Strike.
  if (+root.id === 892) {
    const rapid = m.p.t2 === "water";
    forms = forms.filter(f => !/Gigantamax Urshifu/i.test(f.name) ||
      (rapid ? /Rapid Strike/i.test(f.name) : /Single Strike/i.test(f.name)));
  }
  return forms.length ? forms : null;
}
const megaEligible = () => team.filter(m => (challenge?.mode !== "daily" || !m.mega) && powerFormsForMember(m));
const typeFormsFor = p => formCatalog(p, "free");
const typeEligible = () => team.filter(m => !m.mega && typeFormsFor(originalPokemon(m)).length);

function setSelMode(mode) {
  if (locked) return;            // team is final once you've run it
  selMode = mode;
  $("selHint").hidden = !mode;
  $("selHint").className = "selhint" + (mode ? " " + mode : "");
  $("selHint").textContent =
    mode === "mega"  ? (challenge?.mode==="daily"?"Select any eligible Pokémon to Mega Evolve, Gigantamax, or power-change. You may power up multiple teammates.":"Select one Pokémon to Mega Evolve or power-change its form.")
  : mode === "type"  ? "Select a Pokémon to change its type or equipped Drive. This does not use your power transformation."
  : mode === "candy" ? `${challenge?.mode==="daily"?"Select any teammate to feed a Rare Candy — ":"Select one Pokémon to feed the Rare Candy — "}` +
                       `+${Math.round((CANDY_BOOST - 1) * 100)}% to every stat. ` +
                       (challenge?.mode==="daily"?"Every teammate is eligible.":`Not your starter, a legendary, or the Mega.`)
  : "";
  $("megaBtn").classList.toggle("armed", mode === "mega");
  $("typeBtn").classList.toggle("armed", mode === "type");
  $("candyBtn").classList.toggle("armed", mode === "candy");
  renderDone();                               // repaint without scrolling
}

// who may eat the candy: not the starter, not a legendary, not the Mega
const candyOk = m => challenge?.mode === "daily" ? !m.candy : !m.starter && !m.p.legend && !m.mega;
const candyEligible = () => team.filter(candyOk);

function applyMega(slot, form) {
  const m = team[slot];
  if(challenge?.mode !== "daily")delete m.candy; // Daily Champion permits stacked power-ups
  m.base = m.p;                               // remember the selected style/form
  m.preMegaTypeBase = m.typeBase;
  m.preMegaTypeForm = m.typeForm;
  delete m.typeBase; delete m.typeForm;
  m.p    = { ...form, legend: m.base.legend, gen: m.base.gen,
             region: m.base.region, baseId: m.base.baseId || m.base.id };
  m.mega = form.name;
  megaIdx = slot;
  setSelMode(null);
}

function applyTypeForm(slot, form) {
  const m = team[slot];
  if (m.mega) return;
  m.typeBase = m.typeBase || m.p;
  m.p = { ...form, legend:m.typeBase.legend, gen:m.typeBase.gen,
          region:m.typeBase.region, baseId:m.typeBase.id };
  m.typeForm = form.name;
  setSelMode(null);
}

function revertTypeForm(slot) {
  const m = team[slot];
  if (m.typeBase) m.p = m.typeBase;
  delete m.typeBase; delete m.typeForm;
  setSelMode(null);
}

function revertMega() {
  if (megaIdx < 0) return;
  const m = team[megaIdx];
  if (m.base) m.p = m.base;
  if (m.preMegaTypeBase) m.typeBase = m.preMegaTypeBase;
  if (m.preMegaTypeForm) m.typeForm = m.preMegaTypeForm;
  delete m.preMegaTypeBase; delete m.preMegaTypeForm;
  delete m.mega; delete m.base;
  megaIdx = -1;
}

function pickForSelection(slot) {
  if (selMode === "candy") {
    if (!candyOk(team[slot])) return;
    if(challenge?.mode === "daily")team[slot].candy=true;
    else team.forEach((m, i) => m.candy = (i === slot));
    setSelMode(null);
    return;
  }
  if (selMode === "type") {
    const m = team[slot];
    const forms = !m.mega && typeFormsFor(originalPokemon(m));
    if (!forms || !forms.length) return;
    openMegaChooser(slot, forms, "type");
    return;
  }
  if (selMode !== "mega") return;

  const m     = team[slot];
  const forms = powerFormsForMember(m);
  if (!forms) {
    console.warn("No Mega form for", (m.base || m.p).name, (m.base || m.p).id);
    return;
  }

  if (challenge?.mode !== "daily" && megaIdx >= 0 && megaIdx !== slot) revertMega();
  if (forms.length === 1) return applyMega(slot, forms[0]);
  openMegaChooser(slot, forms, "power");
}

function openMegaChooser(slot, forms, mode) {
  const before = originalPokemon(team[slot]);
  const isType = mode === "type";
  const isDrive = isType && forms.every(f => f.drive);
  const baseFormName = forms.find(f => f.baseName)?.baseName || before.name;
  $("formModalTitle").textContent = isDrive ? "Choose a Drive" : isType ? "Choose a Type Form" : "Choose a Power Form";
  $("megaBody").innerHTML = `
    <p class="mega-lead">${before.name} has ${forms.length} ${isDrive ? "Drive choices. These are free and only change Techno Blast's offensive type." : isType ? "form choices. These are free and may change appearance, typing, or stats." : "powered forms. One powered form may be active per team."}</p>
    <div class="megaopts">
      ${isType && team[slot].typeForm ? `<button class="megaopt" data-original="1">
        ${spriteImg(before, team[slot].shiny)}<b>${baseFormName}</b>
        <div>${[before.t1,before.t2].filter(Boolean).map(chip).join(" ")}</div>
        <div class="mo-bst">Restore original typing</div></button>` : ""}
      ${forms.map((f, i) => `
        <button class="megaopt" data-i="${i}">
          ${spriteImg(f, team[slot].shiny)}
          <b>${f.name}</b>
          <small class="form-kind">${f.kind}</small>
          <div>${[f.t1, f.t2].filter(Boolean).map(chip).join(" ")}</div>
          ${f.attackType ? `<div class="drive-attack">Techno Blast: ${chip(f.attackType)}</div>` : ""}
          <div class="mo-bst">${f.gmax ? `${sumStats(f.s)} → <i>${sumStats(f.s) + f.s[0]}</i> (2× HP)` : isType ? `${sumStats(f.s)} total stats` : `${sumStats(before.s)} → <i>${sumStats(f.s)}</i>`}</div>
          ${isType ? "" : `<div class="mo-diff">${statDiff(before.s, f.s)}</div>`}
        </button>`).join("")}
    </div>`;
  $("megaModal").hidden = false;
  $("megaBody").querySelectorAll("[data-i]").forEach(b => {
    b.onclick = () => { $("megaModal").hidden = true;
      (isType ? applyTypeForm : applyMega)(slot, forms[+b.dataset.i]); };
  });
  const original = $("megaBody").querySelector("[data-original]");
  if (original) original.onclick = () => { $("megaModal").hidden = true; revertTypeForm(slot); };
}

const sumStats = a => a.reduce((x, y) => x + y, 0);
function statDiff(from, to) {
  return STAT_NAMES.map((n, i) => {
    const d = to[i] - from[i];
    if (!d) return "";
    return `<span class="${d > 0 ? "up" : "down"}">${n} ${d > 0 ? "+" : ""}${d}</span>`;
  }).filter(Boolean).join(" ");
}

/* ---------- 4. done ---------- */
function finish() {
  show("scDone");
  renderDone();
}

/* Repaint the team page in place. Selection modes call this instead of
   finish(), so picking a Mega or a Candy doesn't jump you back to the top. */
function renderDone() {
  removeShinyNote();
  drawTeamBar();          // Mega / Candy changes have to reach the footer too
  drawCoverage();         // Mega typing must immediately update offence/defence

  // Match the simulator exactly: friendship, Mega stats, and Rare Candy.
  const total   = team.reduce((a, m) =>
    a + statsFor(m).reduce((sum, stat) => sum + stat, 0), 0);
  const shinies = team.filter(m => m.shiny).length;
  const where   = challenge.mode === "gauntlet"
    ? "the full nine-region Gauntlet"
    : challenge.mode === "daily" ? `today's battle with Champion ${dailyOpponent.name}`
    : `${REGIONS[challenge.gen]} (Generation ${challenge.gen})`;

  $("doneSub").innerHTML =
    `Headed for ${where}. Combined base stats <b>${total}</b>` +
    (shinies ? ` · ${shinies} shiny` : "") + ".";

  $("simBtn").hidden = false;
  $("simBtn").textContent = locked
    ? "See results"
    : MODE === "gauntlet" ? "Run the Gauntlet"
                          : "Run the challenge";

  const canUse = !locked && (MODE === "gauntlet" || challenge.mode === "single" || challenge.mode === "daily");
  const elig   = megaEligible();
  const typeElig = typeEligible();
  const hasDrive = typeElig.some(m => typeFormsFor(originalPokemon(m)).some(f => f.drive));
  const hasTypeForm = typeElig.some(m => typeFormsFor(originalPokemon(m)).some(f => !f.drive));
  $("megaBtn").hidden  = !canUse;
  $("typeBtn").hidden  = !canUse || !typeElig.length;
  $("candyBtn").hidden = !canUse;
  $("megaBtn").disabled = !elig.length;
  $("megaBtn").title    = elig.length
    ? `${elig.length} of your team can Mega Evolve or power-change form`
    : "None of your Pokémon has a powered form";
  $("megaBtn").innerHTML = `<span class="mb-gem" aria-hidden="true">\u25c8</span><span class="tool-label">${megaIdx >= 0 ? team[megaIdx].mega : "Mega / Form"}</span>`;
  $("megaBtn").setAttribute("aria-label",megaIdx >= 0 ? team[megaIdx].mega : "Mega Evolve or power-change a form");
  $("typeBtn").title = `${typeElig.length} of your team can change type for free`;
  const typeLabel=hasDrive && !hasTypeForm ? "Change Drive" : hasDrive ? "Type / Drive" : "Change Type";
  $("typeBtn").innerHTML = `<span aria-hidden="true">◇</span><span class="tool-label">${typeLabel}</span>`;
  $("typeBtn").setAttribute("aria-label",typeLabel);
  const fed  = team.find(m => m.candy),fedCount=team.filter(m=>m.candy).length;
  const cOk  = candyEligible();
  $("candyBtn").disabled = !cOk.length;
  $("candyBtn").title = cOk.length
    ? `${cOk.length} of your team can take ${challenge?.mode==="daily"?"a":"the"} candy`
    : "Nobody eligible - the candy can't go to your starter, a legendary, or the Mega";
  const cIcon = `<span class="cb-candy"><img src="${CANDY_ICON}" alt=""></span>`;
  $("candyBtn").innerHTML = `${cIcon}<span class="tool-label">${challenge?.mode==="daily"&&fedCount?`Rare Candy ×${fedCount}`:fed?`Candy: ${fed.p.name}`:"Rare Candy"}</span>`;
  $("candyBtn").setAttribute("aria-label",challenge?.mode==="daily"?`${fedCount} teammates have Rare Candy`:fed?`Rare Candy given to ${fed.p.name}`:"Use Rare Candy");
  $("megaBtn").classList.toggle("done", team.some(m=>m.mega));
  $("typeBtn").classList.toggle("done", team.some(m => m.typeForm));
  $("candyBtn").classList.toggle("done", !!fed);

  $("finalgrid").innerHTML = layout().map(m => {
    if (!m) return `<div class="fin empty"></div>`;
    const p    = m.p;
    const s    = statsFor(m);
    const t    = s.reduce((a,b) => a+b, 0);
    const slot = team.indexOf(m);

    // selection mode: which cards can be clicked
    let pick = "";
    if (selMode === "mega")  pick = powerFormsForMember(m) ? "pickable mega" : "dimmed";
    if (selMode === "type")  pick = !m.mega && typeFormsFor(originalPokemon(m)).length ? "pickable typeform" : "dimmed";
    if (selMode === "candy") pick = candyOk(m) ? "pickable candy" : "dimmed";

    return `
      <div class="fin ${m.starter ? "starter" : ""} ${m.mega ? "megaon" : ""}
                  ${m.candy ? "candyon" : ""} ${m.typeForm ? "typeon" : ""} ${pick}"
           ${pick.startsWith("pickable") ? `data-slot="${slot}" role="button" tabindex="0"` : ""}>
        ${m.starter ? '<span class="fin-flag" title="Friendship bond">💛</span>' : ""}
        ${m.shiny   ? '<span class="fin-flag" style="left:8px;right:auto">✦</span>' : ""}
        ${spriteImg(p, m.shiny)}
        <b>${p.name}</b>
        <div>${[p.t1,p.t2].filter(Boolean).map(chip).join(" ")}</div>
        ${m.from ? `<div class="fin-from">from ${byId[m.from].name}</div>` : ""}
        <div class="fin-bst">${p.gmax ? `${t} → ${t + s[0]} (2× HP)` : `${t}${m.starter ? " (bonded)" : m.candy ? " (candied)" : ""}`}</div>
        <div class="fin-badges">
          ${m.mega   ? `<span class="badge mega">${p.gmax ? "Gigantamax" : "Mega Evolved"}</span>` : ""}
          ${m.typeForm ? `<span class="badge typeform">${m.p.driveName || "Change Type"}</span>` : ""}
          ${m.candy  ? `<span class="badge candy"><img src="${CANDY_ICON}" alt="">Rare Candy +${Math.round((CANDY_BOOST-1)*100)}%</span>` : ""}
        </div>
      </div>`;
  }).join("");

  $("finalgrid").querySelectorAll("[data-slot]").forEach(el => {
    el.onclick = () => pickForSelection(+el.dataset.slot);
    el.onkeydown = e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault(); pickForSelection(+el.dataset.slot);
      }
    };
  });
}

/* ---------- rank badge ---------- */
function rankBadge(rk, wins, total) {
  const need = rk.nextAt;
  return `
    <div class="rankwrap ${rk.key}${rk.perfect ? " perfect" : ""}">
      <span class="rankball" style="--rc:${rk.hex}"></span>
      <div class="rankmeta">
        <b>${rk.key === "oak" ? rk.name : rk.name + " Tier"}</b>
        <span>${wins} of ${total} · ${Math.round(rk.pct * 100)}%${
          need ? ` · ${need - wins} more for ${rk.next.name}` : " · perfect run"}</span>
      </div>
    </div>`;
}

function saveCompletedRun(res, rk, mode) {
  if (runSaveStarted) return;
  runSaveStarted = true;
  if (!window.DexleStats?.configured) {
    console.info("Run finished, but Dexle stats is not connected yet.");
    return;
  }

  const regionRecords = mode === "gauntlet"
    ? res.regions.map(r => ({
        gen: r.gen,
        region: r.region,
        wins: r.record[0],
        losses: r.record[1],
      }))
    : null;

  window.DexleStats.saveRun({
    mode,
    region: mode === "region" ? challenge.gen : null,
    wins: res.record[0],
    losses: res.record[1],
    total: res.total || (res.record[0] + res.record[1]),
    tier: rk.key,
    team,
    teamBst: team.reduce((sum, member) =>
      sum + statsFor(member).reduce((a, stat) => a + stat, 0), 0),
    coverage: coverage(),
    regionRecords,
  }).then(() => {
    team.filter(member => member.shiny).forEach(member => ownedShinyIds.add(+member.p.id));
  }).catch(err => {
    runSaveStarted = false;
    console.error("Could not save this Dexle run:", err);
  });
}

/* ---------- 6. the nine-region Gauntlet ---------- */
function runGauntlet() {
  const roster = team.map(m => ({ p: m.p, stats: statsFor(m) }));

  locked = true;
  lastScreen = "scGauntlet";
  $("gSub").textContent = "Simulating 121 battles…";
  show("scGauntlet");

  // let the screen paint before the heavy loop
  setTimeout(() => {
    const res = simGauntlet(roster, OPP);
    const [w, l] = res.record;

    const rk = rankFor(w, res.total);
    saveCompletedRun(res, rk, "gauntlet");
    $("gW").textContent = w;
    $("gL").textContent = l;
    $("scGauntlet").dataset.tone =
      l === 0 ? "perfect" : w >= res.total - 4 ? "good" : "rough";
    $("gRank").innerHTML = rankBadge(rk, w, res.total);

    $("gTitle").textContent = l === 0
      ? "Undisputed Champion of All Nine Regions"
      : `${w} of ${res.total} across nine regions`;
    $("gSub").innerHTML = l === 0
      ? "Every gym, every Elite Four, every Champion. Nobody took a battle off you."
      : `Most likely outcome for this team. Your worst matchup is ` +
        `<b>${res.hardest[0].name}</b> (${Math.round(res.hardest[0].rate * 100)}%).`;

    $("gStats").innerHTML = `
      <div class="rstat"><b>Team base stats</b><span>${roster.reduce((a, m) => a + m.stats.reduce((x, y) => x + y, 0), 0)}</span></div>
      <div class="rstat"><b>Types covered</b><span>${coverage()}/18</span></div>`;

    $("gRegions").innerHTML = res.regions.map(r => {
      const clean = r.record[1] === 0;
      // the region record decides how many L badges appear, so the rows and the
      // header can never disagree: the weakest matchups are the losses
      const lossIds = new Set([...r.battles]
        .sort((a, b) => a.rate - b.rate)
        .slice(0, r.record[1])
        .map(b => b.name + "|" + b.role));
      return `
      <div class="reg ${clean ? "clean" : ""}">
        <button class="reg-head" aria-expanded="false">
          <span class="reg-gen">Gen ${r.gen}</span>
          <b>${r.region}</b>
          <span class="reg-game">${r.game}</span>
          <span class="reg-rec ${clean ? "ok" : ""}">${r.record[0]}-${r.record[1]}</span>
          <span class="reg-strip">${r.battles.map(b =>
            `<i class="${b.rate >= 0.9 ? "s4" : b.rate >= 0.65 ? "s3"
                       : b.rate >= 0.4 ? "s2" : "s1"}"
                title="${b.name} ${Math.round(b.rate * 100)}%"></i>`).join("")}</span>
          <span class="opp-chev" aria-hidden="true">▾</span>
        </button>
        <div class="reg-body" hidden>
          ${r.battles.map(b => {
            const pct = Math.round(b.rate * 100);
            const st  = lossIds.has(b.name + "|" + b.role) ? "l" : "w";
            return `
            <div class="gbtl ${st}">
              <span class="gbtl-res">${st === "w" ? "W" : "L"}</span>
              <div class="gbtl-body">
                <div class="gbtl-line">
                  <b>${b.name}</b>
                  <span class="gbtl-role">${b.role}</span>
                  ${b.type ? `<span class="type" style="background:${TYPE_COLOR[b.type]}">${b.type}</span>` : ""}
                  <span class="gbtl-pct">${pct}%</span>
                </div>
                <div class="gbtl-bar"><i style="width:${pct}%"></i></div>
                <div class="gbtl-meta">
                  ${b.oppCount} Pokémon · ${b.oppSum} base stats${
                    b.scaled > 1 ? ` · scaled ×${b.scaled}` : ""}
                  <span class="gbtl-sep">·</span>
                  best answer <span class="btl-good">${b.best.name}</span>
                  <span class="gbtl-sep">·</span>
                  watch <span class="btl-bad">${b.threat.name}</span>
                </div>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>`;
    }).join("");

    $("gRegions").querySelectorAll(".reg-head").forEach(btn => {
      btn.onclick = () => {
        const body = btn.nextElementSibling;
        const open = body.hidden;
        body.hidden = !open;
        btn.setAttribute("aria-expanded", open);
        btn.classList.toggle("open", open);
      };
    });
    requestAnimationFrame(() => $("scGauntlet").scrollIntoView({ block:"start" }));
  }, 60);
}

/* ---------- 5. run the challenge ---------- */
function runChallenge() {
  if(challenge.mode==="daily")return runDailyChampion();
  const g = OPP[challenge.gen];
  if (!g) return;

  // starters carry their friendship bonus into the fight
  const roster = team.map(m => ({ p: m.p, stats: statsFor(m) }));

  locked = true;
  lastScreen = "scResult";

  const res = simRun(roster, g.opponents);
  const [w, l] = res.record;

  const rk = rankFor(w, g.opponents.length);
  saveCompletedRun({ ...res, total: g.opponents.length }, rk, "region");
  $("recW").textContent = w;
  $("recL").textContent = l;
  $("recRank").innerHTML = rankBadge(rk, w, g.opponents.length);
  $("scResult").dataset.tone = l === 0 ? "perfect" : w >= g.opponents.length - 2 ? "good" : "rough";

  const lost = res.battles.filter(b => b.rate < 0.5).map(b => b.name);
  $("recTitle").textContent = l === 0
    ? `${g.region} Champion`
    : `${w}-${l} in ${g.region}`;
  $("recSub").textContent = l === 0
    ? `A clean sweep of ${g.game}. Nobody took a battle off you.`
    : `Beaten by ${lost.slice(0, 3).join(", ")}` +
      `${lost.length > 3 ? ` and ${lost.length - 3} more` : ""}.` +
      ` Damage carries between battles, so early scrapes cost you later.`;

  $("recStats").innerHTML = `
    <div class="rstat"><b>Team base stats</b><span>${roster.reduce((a, m) => a + m.stats.reduce((x, y) => x + y, 0), 0)}</span></div>
    <div class="rstat"><b>Types covered</b><span>${coverage()}/18</span></div>`;


    const lossSet = new Set([...res.battles]
    .sort((a, b) => a.rate - b.rate).slice(0, l).map(b => b.name));
  const battleRows = res.battles.map((b, i) => {
    const state = lossSet.has(b.name) ? "l" : "w";
    const pct = Math.round(b.rate * 100);
    return `
      <div class="btl ${state}">
        <span class="btl-n">${i + 1}</span>
        <span class="btl-res">${state === "w" ? "W" : "L"}</span>
        <div class="btl-mid">
          <div class="btl-top">
            <b>${b.name}</b>
            <span class="btl-role">${b.role}</span>
            ${b.type ? `<span class="type" style="background:${TYPE_COLOR[b.type]}">${b.type}</span>` : ""}
          </div>
          <div class="btl-lv">${b.flat
            ? `${b.oppCount} Pokémon · ${b.oppSum} base stats vs your ${b.mySum}`
            : `your Lv ${b.myLevel} vs Lv ${b.oppLevel}`}</div>
        </div>
        <div class="btl-bar"><i style="width:${pct}%"></i></div>
        <span class="btl-pct">${pct}%</span>
        <div class="btl-why">
          <span class="btl-good">${b.best.name}</span> answers them best ·
          watch <span class="btl-bad">${b.threat.name}</span>
        </div>
      </div>`;
  }).join("");
  $("toStarter").hidden=false;

  $("battles").innerHTML = `
    <div class="reg ${l === 0 ? "clean" : ""}">
      <button class="reg-head" aria-expanded="false">
        <span class="reg-gen">Gen ${challenge.gen}</span>
        <b>${g.region}</b>
        <span class="reg-game">${g.game}</span>
        <span class="reg-rec ${l === 0 ? "ok" : ""}">${w}-${l}</span>
        <span class="opp-chev" aria-hidden="true">&#9662;</span>
      </button>
      <div class="reg-body region-battles" hidden>${battleRows}</div>
    </div>`;

  const regionHead = $("battles").querySelector(".reg-head");
  regionHead.onclick = () => {
    const body = regionHead.nextElementSibling;
    const open = body.hidden;
    body.hidden = !open;
    regionHead.setAttribute("aria-expanded", open);
    regionHead.classList.toggle("open", open);
  };

  show("scResult");
  requestAnimationFrame(() => $("scResult").scrollIntoView({ block:"start" }));
}
function dailyAttemptsKey(){return `${dailyChampionKey()}:attempts`;}
function runDailyChampion(){
  const attempts=+(localStorage.getItem(dailyAttemptsKey())||0)+1;localStorage.setItem(dailyAttemptsKey(),attempts);
  const mine=team.map(m=>fighter(m.p,100,statsFor(m),1,0));
  const theirs=dailyOpponent.team.map(m=>fighter(m,100,m.s,1,0));
  const seed=team.reduce((n,m)=>n+(+m.p.id||0),attempts*9973);
  const sims=Array.from({length:101},(_,i)=>simBattle(mine,theirs,mulberry(seed+i*104729)));
  const winRate=sims.filter(r=>r.win).length/101,winner=winRate>=.5;
  const candidates=sims.filter(r=>r.win===winner).sort((a,b)=>(a.left-a.oleft)-(b.left-b.oleft));
  const result=candidates[Math.floor(candidates.length/2)];dailyBattleResult=result;locked=true;lastScreen="scResult";
  const faintedMine=team.map(m=>m.p.name).filter(n=>!result.mineAlive.includes(n));
  const faintedTheirs=dailyOpponent.team.map(m=>m.name).filter(n=>!result.oppAlive.includes(n));
  $("recW").textContent=result.left;$("recL").textContent=result.oleft;$("recRank").innerHTML="";
  $("recTitle").textContent=result.win?`You defeated Champion ${dailyOpponent.name}!`:`Champion ${dailyOpponent.name} wins`;
  $("recSub").textContent=result.win?`${result.left} of your Pokémon remained after attempt ${attempts}.`:`Your team fainted with ${result.oleft} opposing Pokémon left. A full new draft awaits.`;
  $("recStats").innerHTML=`<div class="rstat"><b>Your Pokémon left</b><span>${result.left}/6</span></div><div class="rstat"><b>Champion fainted</b><span>${6-result.oleft}/6</span></div><div class="rstat"><b>Win simulation</b><span>${Math.round(winRate*100)}%</span></div><div class="rstat"><b>Attempts</b><span>${attempts}</span></div>`;
  $("battles").innerHTML=`<div class="daily-battle-summary"><h3>Your team</h3><div class="daily-result-team">${team.map(m=>`<span class="${faintedMine.includes(m.p.name)?"fainted":""}">${spriteImg(m.p,m.shiny)}<b>${m.p.name}</b></span>`).join("")}</div><h3>Champion ${dailyOpponent.name}</h3><div class="daily-result-team">${dailyOpponent.team.map(m=>`<span class="${faintedTheirs.includes(m.name)?"fainted":""}">${spriteImg(m,false)}<b>${m.name}${m.ace?" ★":""}</b></span>`).join("")}</div></div>`;
  $("againBtn2").textContent=result.win?"Share Results":"Draft a New Team";
  if(result.win){const saved={date:dailyChampionDate(),champion:dailyOpponent.name,attempts,team:team.map(m=>m.p.name),members:team.map(m=>m.p),left:result.left,opponent:dailyOpponent};localStorage.setItem(dailyChampionKey(),JSON.stringify(saved));}
  show("scResult");requestAnimationFrame(()=>$("scResult").scrollIntoView({block:"start"}));
}
function dailyChampionShareText(saved=dailyChampionResult()){return `I beat Champion ${saved.champion} in ${saved.attempts} ${saved.attempts===1?"attempt":"attempts"}! My team: ${saved.team.join(", ")}. Try the Daily Champion Battle here: dexle.io`;}
async function shareDailyChampion(){const saved=dailyChampionResult();if(!saved)return;const text=dailyChampionShareText(saved);try{if(navigator.share)await navigator.share({title:"My Daily Champion result",text});else{await navigator.clipboard.writeText(text);alert("Result copied — paste it into a text message!");}}catch(e){}}
function showSavedDailyChampion(saved){dailyOpponent=saved.opponent;challenge={mode:"daily",gen:1};team=(saved.members||saved.team.map(name=>DEX.find(p=>p.name===name))).filter(Boolean).map(p=>({p,shiny:false}));$("recW").textContent=saved.left;$("recL").textContent=0;$("recRank").innerHTML="";$("recTitle").textContent=`You defeated Champion ${saved.champion}!`;$("recSub").textContent=`Won in ${saved.attempts} ${saved.attempts===1?"attempt":"attempts"} with ${saved.left} Pokémon left.`;$("recStats").innerHTML=`<div class="rstat"><b>Attempts</b><span>${saved.attempts}</span></div><div class="rstat"><b>Winning team</b><span>${saved.team.length}/6</span></div>`;$("battles").innerHTML=`<div class="daily-battle-summary"><h3>Your winning team</h3><div class="daily-result-team">${team.map(m=>`<span>${spriteImg(m.p,false)}<b>${m.p.name}</b></span>`).join("")}</div></div>`;$("againBtn2").textContent="Share Results";locked=true;lastScreen="scResult";show("scResult");}

const dailyChampionDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const dailyChampionKey=()=>`dexle-daily-champion:${dailyChampionDate()}`;
function dailyChampionResult(){try{return JSON.parse(localStorage.getItem(dailyChampionKey())||"null");}catch(e){return null;}}
function seededDaily(seed){let t=seed>>>0;return()=>{t+=0x6D2B79F5;let r=Math.imul(t^t>>>15,1|t);r^=r+Math.imul(r^r>>>7,61|r);return((r^r>>>14)>>>0)/4294967296;};}
function makeDailyOpponent(){
  const date=dailyChampionDate(),seed=+[...date].filter(c=>/\d/.test(c)).join(""),rng=seededDaily(seed);
  const [yy,mm,dd]=date.split("-").map(Number),ordinal=Math.floor(Date.UTC(yy,mm-1,dd)/86400000);
  const champ=DAILY_CHAMPIONS[ordinal%DAILY_CHAMPIONS.length];
  const catalog=[...DEX,...Object.values(MEGAS).flat(),...Object.values(FORMS).flat()].filter(p=>p?.s?.length===6);
  const strong=catalog.filter(p=>bst(p)>=540),acePool=strong.filter(p=>p.t1===champ.type||p.t2===champ.type);
  const used=new Set(),take=pool=>{let p;do{p=pool[Math.floor(rng()*pool.length)];}while(used.has(`${p.id}:${p.name}`));used.add(`${p.id}:${p.name}`);return p;};
  const ace=take(acePool.length?acePool:strong),rest=Array.from({length:5},()=>take(strong));
  const boost=(p,aceMon)=>({...p,s:p.s.map((v,i)=>Math.max(v,aceMon?(i===0?130:125):(i===0?110:105))),lvl:100,ace:aceMon});
  return {...champ,role:"Daily Champion",place:champ.region,team:[boost(ace,true),...rest.map(p=>boost(p,false))]};
}
function startDailyChampion(){const saved=dailyChampionResult();if(saved)return showSavedDailyChampion(saved);dailyOpponent=makeDailyOpponent();challenge={mode:"daily",gen:DAILY_CHAMPIONS.findIndex(c=>c.name===dailyOpponent.name)+1};startStarter();}

// how many of the 18 types your team can hit for super-effective damage
function coverage() {
  const hit = new Set();
  const TYPES18 = Object.keys(TYPE_CHART);
  team.forEach(m => {
    [m.p.t1, m.p.t2, m.p.attackType].filter(Boolean).forEach(t => {
      TYPES18.forEach(d => { if ((TYPE_CHART[t] || {})[d] === 2) hit.add(d); });
    });
  });
  return hit.size;
}

/* ---------- reel animation ---------- */
// reels: [{ el, slot, roll(), final }]
function runReel(reels, done) {
  spinning = true;
  $("spinStarter").disabled = true;
  $("throwBall").disabled   = true;
  drawRerolls();

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    reels.forEach(r => { r.el.textContent = r.final; r.slot.classList.add("landed"); });
    spinning = false;
    $("spinStarter").disabled = starterSpins >= STARTER_SPINS;
    $("throwBall").disabled   = !!spin;
    return done();
  }

  reels.forEach(r => {
    r.slot.classList.add("spinning");
    r.slot.classList.remove("landed");
  });

  const t0 = performance.now();
  let last = 0;

  (function frame(now) {
    const prog = Math.min((now - t0) / SPIN_MS, 1);
    const gap  = 45 + prog * prog * 210;        // ticks slow down as it settles

    if (now - last > gap) {
      last = now;
      reels.forEach(r => r.el.textContent = r.roll());
    }

    if (prog < 1) return requestAnimationFrame(frame);

    reels.forEach(r => {
      r.el.textContent = r.final;
      r.slot.classList.remove("spinning");
      r.slot.classList.add("landed");
    });
    spinning = false;
    $("spinStarter").disabled = starterSpins >= STARTER_SPINS;
    $("throwBall").disabled   = !!spin;      // stays locked once a ball has landed
    done();
  })(t0);
}

const reelSlot = el => el.closest(".slot");
const removeShinyNote = () => { const n = $("shinyNote"); if (n) n.remove(); };

/* ---------- start over ---------- */
function startOver() {
  const wasDaily=challenge?.mode==="daily";
  $("scBall").querySelector(".panel").style.minHeight = "";
  team = [];
  spin = null;
  rerollGen    = true;
  rerollType   = true;
  spinning     = false;
  starterSpins = 0;
  starterGen   = null;
  selMode      = null;
  locked       = false;
  lastScreen   = null;
  runSaveStarted = false;
  megaIdx      = -1;
  $("selHint").hidden  = true;
  $("megaModal").hidden = true;
  closePickPreview();
  removeShinyNote();
  drawTeamBar();

  $("starterPick").hidden    = true;
  $("starterPick").innerHTML = "";
  $("stGen").textContent     = "\u2014 \u2014 \u2014";
  $("bGen").textContent      = "\u2014 \u2014 \u2014";
  $("bType").textContent     = "\u2014 \u2014 \u2014";
  $("results").hidden        = true;
  $("reslist").innerHTML     = "";
  document.querySelectorAll(".slot").forEach(el => el.classList.remove("landed","spinning"));

  $("oppPanel").hidden = true;
  $("oppList").hidden  = true;
  $("oppToggle").classList.remove("open");
  $("covPanel").hidden = true;
  $("covBody").hidden = true;
  $("covToggle").setAttribute("aria-expanded", "false");
  $("covToggle").classList.remove("open");

  if(wasDaily){startDailyChampion();
  } else if (MODE === "gauntlet") {
    challenge = { mode:"gauntlet" };
    startStarter();                     // no region to choose
  } else {
    challenge = null;
    $("toStarter").disabled = true;
    drawChallenge();
    show("scChallenge");
  }
}

// /* =========================================================
//    DEBUG - skip the draft. Delete this block and the #debugTeam
//    button in gauntlet.html before shipping.
//    ========================================================= */
// function debugTeam() {
//   const NAMES = ["Sceptile", "Charizard", "Mewtwo", "Lucario", "Tyranitar", "Gengar"];

//   team = NAMES.map((n, i) => {
//     const p = DEX.find(x => x.name === n);
//     if (!p) { console.warn("debug: no Pokémon named", n); return null; }
//     // Sceptile leads as the bonded starter, so the +10% path gets tested too
//     return { p, starter: i === 0, from: i === 0 ? p.id - 2 : null, shiny: false };
//   }).filter(Boolean);

//   // a mode needs a challenge set before the team page will render
//   if (!challenge) {
//     challenge = MODE === "gauntlet" ? { mode:"gauntlet" }
//                                     : { mode:"single", gen:1 };
//   }

//   locked     = false;
//   lastScreen = null;
//   selMode    = null;
//   megaIdx    = -1;
//   spinning   = false;

//   drawCoverage();
//   drawOpponents();
//   finish();
// }

/* =========================================================
   bindings
   ========================================================= */
$("toStarter").onclick   = startStarter;
$("spinStarter").onclick = spinStarter;
$("throwBall").onclick   = () => throwBall(null);
$("oppToggle").onclick   = toggleOpponents;
$("covToggle").onclick   = () => {
  const open = $("covBody").hidden;
  $("covBody").hidden = !open;
  $("covToggle").setAttribute("aria-expanded", open);
  $("covToggle").classList.toggle("open", open);
};
$("simBtn").onclick      = () => {
  if (locked && lastScreen) return show(lastScreen);   // don't re-roll a run
  return MODE === "gauntlet" ? runGauntlet() : runChallenge();
};
$("gAgain").onclick      = startOver;
$("gBack").onclick       = () => show("scDone");
$("megaBtn").onclick     = () => {
  if (selMode === "mega") return setSelMode(null);
  if (challenge?.mode !== "daily" && megaIdx >= 0) { revertMega(); return setSelMode("mega"); }
  setSelMode("mega");
};
$("typeBtn").onclick     = () => setSelMode(selMode === "type" ? null : "type");
$("candyBtn").onclick    = () => setSelMode(selMode === "candy" ? null : "candy");
$("pickClose").onclick   = closePickPreview;
$("pickModal").onclick   = e => { if (e.target.id === "pickModal") closePickPreview(); };
$("megaClose").onclick   = () => { $("megaModal").hidden = true; setSelMode(null); };
$("megaModal").onclick   = e => {
  if (e.target.id === "megaModal") { $("megaModal").hidden = true; setSelMode(null); }
};
$("againBtn2").onclick   = () => challenge?.mode==="daily"&&dailyChampionResult() ? shareDailyChampion() : startOver();
$("backTeam").onclick    = () => show("scDone");
$("restart").onclick     = startOver;
// $("debugTeam").onclick = debugTeam;

$("resSearch").addEventListener("input", () => {
  if (spin) renderResults(eligible(spin.gen, spin.type));
});
