/* =========================================================
   Dexle - game logic
   ========================================================= */

/* ---------- config ---------- */
const BUDGET = 10;                       // guesses + hints combined
const STAGE = ["—", "Base", "Stage 1", "Stage 2"];
const STAT_NAMES = ["HP","Attack","Defense","Sp. Atk","Sp. Def","Speed"];

const TYPE_COLOR = {
  normal:"#9FA19F", fire:"#E62829", water:"#2980EF", electric:"#FAC000",
  grass:"#3FA129", ice:"#3DCEF3", fighting:"#FF8000", poison:"#9141CB",
  ground:"#915121", flying:"#81B9EF", psychic:"#EF4179", bug:"#91A119",
  rock:"#AFA981", ghost:"#704170", dragon:"#5060E1", dark:"#50413F",
  steel:"#60A1B8", fairy:"#EF70EF"
};

const REGIONS = {1:"Kanto", 2:"Johto", 3:"Hoenn", 4:"Sinnoh", 5:"Unova",
                 6:"Kalos", 7:"Alola", 8:"Galar", 9:"Paldea"};

/* ---------- helpers ---------- */
const $    = id => document.getElementById(id);
const norm = s  => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const bst  = p  => p.s.reduce((a, b) => a + b, 0);

const SPRITE = id =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${SHINY ? "shiny/" : ""}${id}.png`;
const ART = id =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${SHINY ? "shiny/" : ""}${id}.png`;

/* ---------- state ---------- */
let DEX     = [];
let SHINY   = false;

let target  = null;
let guesses = [];
let pending = null;        // guess currently shown in the big card
let over    = false;

let hintsUsed  = 0;
let hintsTaken = [];
let dexleSaveStarted = false;
let DAILY_MODE = false;

let picked  = null;        // dropdown selection
let matches = [];
let cursor  = 0;

let GENS = new Set([1,2,3,4,5,6,7,8,9]);
const pool = () => DEX.filter(p => GENS.has(p.gen));

let roundPool = [];              // frozen at round start
let roundGens = new Set();       // which gens the live round was built from

const remaining = () => BUDGET - guesses.length - hintsUsed;

/* ---------- load ---------- */
async function loadDex() {
  const res = await fetch("pokedex.json");
  DEX = await res.json();
  console.log("Loaded", DEX.length, "Pokémon");

  try {
    const saved = JSON.parse(localStorage.getItem("dexle-gens"));
    if (Array.isArray(saved) && saved.length) GENS = new Set(saved);
  } catch (e) {}

  drawGens();
  updateDailyCard();
  setInterval(updateDailyCard, 30000);

  const params = new URLSearchParams(location.search);
  const entryId = Number(params.get("pokemon"));
  const linked = DEX.find(p => p.id === entryId);
  if (linked) {
    SHINY = params.get("shiny") === "1";
    document.body.classList.toggle("shiny", SHINY);
    $("shiny").setAttribute("aria-pressed", SHINY);
    target = linked;
    openDex();
  }
}
loadDex();

/* ---------- round control ---------- */
function newRound() {
  DAILY_MODE = false;
  roundPool = pool();                 // freeze - mid-round gen changes can't break this
  roundGens = new Set(GENS);
  target    = roundPool[Math.floor(Math.random() * roundPool.length)];
  guesses = [];
  pending = null;
  over    = false;
  picked  = null;
  matches = [];

  hintsUsed  = 0;
  hintsTaken = [];
  dexleSaveStarted = false;

  $("start").style.display = "none";
  $("game").hidden = false;

  $("q").value = "";
  $("q").disabled = false;
  $("go").disabled = false;
  $("q").placeholder = "Type a Pokémon name…";
  $("searchbar").classList.remove("caught");

  $("inspect").className = "";
  $("grid").innerHTML    = "";
  $("hints").innerHTML   = "";
  $("hintbar").innerHTML = "";
  $("dexmodal").hidden   = true;
  $("end").className     = "";
  $("end").dataset.win   = "";
  $("again").textContent = "Play again";

  drawPips();
  $("q").focus();
}

const dailyDateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const dailyStorageKey = () => `dexle-daily:${dailyDateKey()}`;
function dailyIndex(key, length) {
  const [year,month,day]=key.split("-").map(Number);
  const ordinal=Math.floor(Date.UTC(year,month-1,day)/86400000);
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  let step=Math.min(791,length-1)||1;
  while(gcd(step,length)!==1)step--;
  return ((ordinal*step+389)%length+length)%length;
}
function dailyComplete(){try{return !!localStorage.getItem(dailyStorageKey());}catch(e){return false;}}
function updateDailyCard(){
  const now=new Date(),midnight=new Date(now);midnight.setHours(24,0,0,0);
  const left=Math.max(0,midnight-now),hours=Math.floor(left/3600000),minutes=Math.floor(left%3600000/60000);
  const done=dailyComplete(),card=$("dailyCard");
  if(!card)return;
  card.classList.toggle("complete",done);
  $("dailyPlay").disabled=!DEX.length;
  $("dailyPlay").textContent=done?"Share Your Results":"Play Today's Challenge";
  $("dailyReset").textContent=done?`Completed · resets in ${hours}h ${minutes}m`:`Resets in ${hours}h ${minutes}m`;
}
function startDaily(){
  if(!DEX.length||dailyComplete())return;
  DAILY_MODE=true;
  roundPool=[...DEX];roundGens=new Set([1,2,3,4,5,6,7,8,9]);
  target=DEX[dailyIndex(dailyDateKey(),DEX.length)];
  guesses=[];pending=null;over=false;picked=null;matches=[];hintsUsed=0;hintsTaken=[];dexleSaveStarted=false;
  $("start").style.display="none";$("game").hidden=false;$("q").value="";$("q").disabled=false;$("go").disabled=false;
  $("q").placeholder="Type a Pokémon name…";$("searchbar").classList.remove("caught");$("inspect").className="";
  $("grid").innerHTML="";$("hints").innerHTML="";$("hintbar").innerHTML="";$("dexmodal").hidden=true;$("end").className="";$("end").dataset.win="";
  $("again").textContent="Play again";drawPips();$("q").focus();
}
function dailyGuessBoxes(result={won:true,guesses:guesses.length}){
  const count=result.won?result.guesses:BUDGET;
  return [Array.from({length:count},(_,i)=>result.won&&i===count-1?"🟩":"⬜").join("")];
}
function dailyParticipationStreak(){
  let streak=0,d=new Date();d.setHours(0,0,0,0);
  while(true){
    try{if(!localStorage.getItem(`dexle-daily:${dailyDateKey(d)}`))break;}catch(e){break;}
    streak++;d.setDate(d.getDate()-1);
  }
  return streak;
}
function dailyShareText(){
  const result=JSON.parse(localStorage.getItem(dailyStorageKey())||"{}");
  const rows=dailyGuessBoxes(result);
  const message=result.won
    ? `I caught it in ${result.guesses} ${result.guesses===1?"guess":"guesses"}! Try the Daily Dexle here: dexle.io`
    : "I didn't catch it today! Try the Daily Dexle here: dexle.io";
  return `${rows.join("\n")}\n${message}`;
}
function openDailyResult(){
  const result=JSON.parse(localStorage.getItem(dailyStorageKey())||"{}");
  const resultTarget=DEX.find(p=>p.id===+result.target)||target;
  if(!resultTarget)return;
  $("dailyResultImage").src=SPRITE(resultTarget.id);$("dailyResultImage").alt=resultTarget.name;
  $("dailyResultSummary").textContent=`${resultTarget.name} in ${result.guesses} ${result.guesses===1?"guess":"guesses"}${result.hints?` with ${result.hints} hint${result.hints===1?"":"s"}`:""}.`;
  $("dailyResultGrid").innerHTML=dailyGuessBoxes(result).map(row=>`<div>${row}</div>`).join("");
  $("dailyResultStreak").textContent=`🔥 ${dailyParticipationStreak()} day Daily Challenge streak`;
  $("dailyShareStatus").textContent="";$("dailyResultModal").hidden=false;
}
function closeDailyResult(){$("dailyResultModal").hidden=true;showEnd();}
async function shareDailyResult(){
  const text=dailyShareText();
  try{
    if(navigator.share)await navigator.share({title:"My Dexle Daily result",text});
    else{await navigator.clipboard.writeText(text);$("dailyShareStatus").textContent="Result copied — paste it into a text message!";}
  }catch(e){if(e.name!=="AbortError")$("dailyShareStatus").textContent="Could not share this result.";}
}

function drawPips() {
  const used = guesses.length + hintsUsed;
  $("pips").innerHTML = Array.from({ length: BUDGET }, (_, i) =>
    `<div class="pip ${i < used ? "used" : ""}"></div>`).join("");
  $("left").textContent = remaining();
  drawHintBar();
}

/* ---------- autocomplete ---------- */
function drawList() {
  const L = $("list");
  if (!matches.length) { L.className = ""; L.innerHTML = ""; return; }

  L.className = "open";
  L.innerHTML = matches.map((p, i) => `
    <div class="opt ${i === cursor ? "sel" : ""}" data-i="${i}">
      <img src="${SPRITE(p.id)}" alt="" loading="lazy">
      <span>${p.name}</span>
      <span class="no">#${String(p.id).padStart(4, "0")}</span>
    </div>`).join("");

  L.querySelectorAll(".opt").forEach(o => {
    o.onclick = () => choose(matches[+o.dataset.i]);
  });
}

function choose(p) {
  picked = p;
  $("q").value = p.name;
  $("list").className = "";
  submit();
}

/* ---------- comparison ---------- */
function cmp(mine, theirs, tol) {
  if (mine === theirs) return { c:"hit", a:"✓" };
  const diff  = Math.abs(mine - theirs);
  const close = tol != null ? diff <= tol : diff <= Math.max(mine, theirs) * 0.10;
  return { c: close ? "near" : "", a: theirs > mine ? "↑" : "↓" };
}

function typeClass(mine, sameSlot, otherSlot) {
  if (mine === sameSlot) return "hit";                // includes both null
  if (mine && mine === otherSlot) return "near";
  return "";
}

function compare(p) {
  return {
    t1:    typeClass(p.t1, target.t1, target.t2),
    t2:    typeClass(p.t2, target.t2, target.t1),
    gen:   p.gen === target.gen ? "hit"
         : Math.abs(p.gen - target.gen) === 1 ? "near" : "",
    stage: p.stage === target.stage ? "hit" : "",
    h:     cmp(p.h, target.h),
    w:     cmp(p.w, target.w),
    id:    cmp(p.id, target.id, 15),
    bst:   cmp(bst(p), bst(target)),
    s:     p.s.map((v, i) => cmp(v, target.s[i])),
  };
}

const chip = t => t
  ? `<span class="type" style="background:${TYPE_COLOR[t]}">${t}</span>`
  : `<span class="type" style="background:#4A5378">none</span>`;

/* ---------- submitting ---------- */
function submit() {
  if (over) return;

  const p = picked || roundPool.find(x => norm(x.name) === norm($("q").value));
  if (!p) { $("q").focus(); return; }
  if (guesses.some(g => g.id === p.id)) { $("q").value = ""; return; }

  guesses.push(p);

  if (pending) appendRow(pending);   // previous guess drops into history
  pending = p;
  showInspect(p);

  drawPips();
  $("q").value = "";
  picked  = null;
  matches = [];
  $("list").className = "";

  if (p.id === target.id)    finish(true);
  else if (remaining() <= 0) finish(false);
  else $("q").focus();
}

/* ---------- history ---------- */
function drawHeader() {
  const cols = ["Guess","Type 1","Type 2","Region","Stage","Height","Weight","Dex #"];
  const head = document.createElement("div");
  head.className = "entry head";
  head.innerHTML =
    `<div class="row">${cols.map(c => `<div class="cell">${c}</div>`).join("")}</div>`;
  $("grid").appendChild(head);
}

function appendRow(p) {
  if (!$("grid").children.length) drawHeader();

  const r = compare(p);
  const cell = (cls, inner, i) =>
    `<div class="cell ${cls}" style="--i:${i}">${inner}</div>`;
  const stat = (label, val, c, i) =>
    cell(c.c, `<small>${label}</small>${val}<span class="arrow">${c.a}</span>`, i);

  const entry = document.createElement("div");
  entry.className = "entry reveal";
  entry.innerHTML = `
    <div class="row">
      <div class="cell name" style="--i:0">
        <img src="${SPRITE(p.id)}" data-dex="${p.id}" alt="">${p.name}
      </div>
      ${cell(r.t1, chip(p.t1), 1)}
      ${cell(r.t2, chip(p.t2), 2)}
      ${cell(r.gen, `${p.region}<small>Gen ${p.gen}</small>`, 3)}
      ${cell(r.stage, STAGE[p.stage], 4)}
      ${cell(r.h.c, `${p.h} m<span class="arrow">${r.h.a}</span>`, 5)}
      ${cell(r.w.c, `${p.w} kg<span class="arrow">${r.w.a}</span>`, 6)}
      ${cell(r.id.c, `#${p.id}<span class="arrow">${r.id.a}</span>`, 7)}
    </div>
    <div class="row stats">
      <div class="cell label">Base stats</div>
      ${stat("Total", bst(p), r.bst, 8)}
      ${p.s.map((v, i) => stat(STAT_NAMES[i], v, r.s[i], 9 + i)).join("")}
    </div>`;
  const head = $("grid").firstElementChild;
  $("grid").insertBefore(entry, head.nextElementSibling);
}

/* ---------- live card ---------- */
function showInspect(p) {
  const r = compare(p);
  const fact = (label, val, cls, arrow) => `
    <div class="fact ${cls}"><b>${label}</b>
      <span>${val}${arrow ? `<i class="arrow">${arrow}</i>` : ""}</span>
    </div>`;

  const types = [p.t1, p.t2].filter(Boolean).map((t, i) =>
    `<span class="type" style="background:${TYPE_COLOR[t]};margin-right:6px;
      outline:${(i ? r.t2 : r.t1) === "hit" ? "2px solid var(--hit)" : "none"};
      outline-offset:2px">${t}</span>`).join("");

  $("inspect").className = "on panel";
  $("inspect").innerHTML = `
    <img src="${ART(p.id)}" data-dex="${p.id}" data-art="1" alt="${p.name}">
    <div style="flex:1; min-width:0">
      <p class="tag">#${String(p.id).padStart(4,"0")}</p>
      <h2>${p.name}</h2>
      <div>${types}<span class="tag">${p.t2 ? "Dual type" : "Single type"}</span></div>

      <div class="facts">
        ${fact("Type 1", p.t1, r.t1, "")}
        ${fact("Type 2", p.t2 || "none", r.t2, "")}
        ${fact("Region", p.region, r.gen, "")}
        ${fact("Gen", p.gen, r.gen, "")}
        ${fact("Evolution", STAGE[p.stage], r.stage, "")}
        ${fact("Height", p.h + " m", r.h.c, r.h.a)}
        ${fact("Weight", p.w + " kg", r.w.c, r.w.a)}
        ${fact("Dex #", "#" + p.id, r.id.c, r.id.a)}
      </div>

      <div class="facts stats">
        ${fact("Total", bst(p), r.bst.c, r.bst.a)}
        ${p.s.map((v, i) => fact(STAT_NAMES[i], v, r.s[i].c, r.s[i].a)).join("")}
      </div>
    </div>`;
}

/* ---------- hints ---------- */
const known = key => guesses.some(g => {
  if (key === "stage")  return g.stage === target.stage;
  if (key === "type1")  return g.t1 === target.t1 || g.t2 === target.t1;
  if (key === "region") return g.gen === target.gen;
  return false;
});

function censor(text, name) {
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out = text.replace(new RegExp("\\b" + esc(name) + "s?\\b", "gi"), "_______");
  name.split(/[^A-Za-z0-9é]+/).filter(w => w.length > 2).forEach(w => {
    out = out.replace(new RegExp("\\b" + esc(w) + "s?\\b", "gi"), "_______");
  });
  return out.replace(/_______/g, '<span class="blank">_______</span>');
}

const HINTS = {
  stage:  { label:"Evolution stage", get:() => STAGE[target.stage] },
  type1:  { label:"Primary type",    get:() => `<span class="type" style="background:${TYPE_COLOR[target.t1]}">${target.t1}</span>` },
  region: { label:"Region",          get:() => `${target.region} · Gen ${target.gen}` },
  cat:    { label:"Category",        get:() => `The ${target.cat}` },
  abil:   { label:"Abilities",       get:() => target.abil.join(", ") },
  desc:   { label:"Pokédex entry",   get:() => censor(target.desc, target.name), wide:true },
};

function availableHints() {
  if (over || guesses.length < 5 || remaining() <= 1) return [];

  let pool = ["stage", "type1", "region"].filter(k => !known(k));
  if (!pool.length) pool = ["cat", "abil"];       // all three already found
  if (guesses.length >= 8) pool.push("desc");     // late-game entry hint

  return pool.filter(k => !hintsTaken.includes(k));
}

function drawHintBar() {
  const pool = availableHints();
  $("hintbar").innerHTML = pool.length
    ? `<span class="lead">Hint — costs 1 guess</span>` + pool.map(k =>
        `<button class="hintbtn" data-h="${k}">${HINTS[k].label}</button>`).join("")
    : "";
  $("hintbar").querySelectorAll("[data-h]").forEach(b => {
    b.onclick = () => takeHint(b.dataset.h);
  });
}

function takeHint(key) {
  if (over || hintsTaken.includes(key)) return;
  const h = HINTS[key];
  hintsTaken.push(key);
  hintsUsed++;

  $("hints").insertAdjacentHTML("beforeend",
    `<div class="hint ${h.wide ? "wide" : ""}"><b>${h.label}</b>${h.get()}</div>`);

  drawPips();
  if (remaining() <= 0) finish(false);
  else $("q").focus();
}

/* ---------- win / lose ---------- */
function finish(won) {
  over = true;
  $("q").disabled  = true;
  $("go").disabled = true;
  $("hintbar").innerHTML = "";

  if (pending) { appendRow(pending); pending = null; }
  if (DAILY_MODE) {
    try { localStorage.setItem(dailyStorageKey(), JSON.stringify({date:dailyDateKey(),won,guesses:guesses.length,hints:hintsUsed,target:target.id,emoji:dailyGuessBoxes({won,guesses:guesses.length}),completedAt:new Date().toISOString()})); } catch (e) {}
    $("again").textContent = "Choose a Mode";
    updateDailyCard();
  }

  if (!DAILY_MODE && !dexleSaveStarted && window.DexleStats?.configured) {
    dexleSaveStarted = true;
    window.DexleStats.saveDexleGame({
      won,
      guessesUsed: guesses.length,
      hintsUsed,
      targetId: target.id,
      generations: [...roundGens].sort((a, b) => a - b),
    }).catch(err => {
      dexleSaveStarted = false;
      console.error("Could not save this Dexle game:", err);
    });
  }

  $("end").dataset.win = won ? "1" : "";
  $("endmsg").textContent = won ? "You Caught It!" : `It was ${target.name}`;
  $("endsub").textContent = won
    ? `${target.name} in ${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}` +
      `${hintsUsed ? ` and ${hintsUsed} hint${hintsUsed > 1 ? "s" : ""}` : ""}.`
    : `#${target.id} · ${target.region} · ${[target.t1, target.t2].filter(Boolean).join(" / ")}`;

  if (won) {
    $("searchbar").classList.add("caught");
    $("q").value = "You Caught It!";
    fireConfetti();
    setTimeout(DAILY_MODE?openDailyResult:openDex, DAILY_MODE?900:2000);
  } else {
    showEnd();
    openDex();
  }
}

function showEnd() {
  $("end").className = "on" + ($("end").dataset.win ? " win" : "");
  $("end").scrollIntoView({ behavior:"smooth", block:"nearest" });
}

/* ---------- pokedex modal ---------- */
function openDex() {
  const p = target;
  const chips = [p.t1, p.t2].filter(Boolean).map(t =>
    `<span class="type" style="background:${TYPE_COLOR[t]};margin-right:6px">${t}</span>`).join("");

  $("dexbody").innerHTML = `
    <div class="dexhero">
      <img src="${ART(p.id)}" data-dex="${p.id}" data-art="1" alt="${p.name}">
      <div style="flex:1;min-width:200px">
        <p class="tag">#${String(p.id).padStart(4,"0")}</p>
        <h2>${p.name}</h2>
        <p class="dexcat">The ${p.cat}</p>
        <div style="margin-top:10px">${chips}</div>
      </div>
    </div>
    <div class="dexentry">${p.desc}</div>
    <div class="dexrows">
      <div class="fact"><b>Height</b><span>${p.h} m</span></div>
      <div class="fact"><b>Weight</b><span>${p.w} kg</span></div>
      <div class="fact"><b>Region</b><span>${p.region}</span></div>
      <div class="fact"><b>Gen</b><span>${p.gen}</span></div>
      <div class="fact"><b>Stage</b><span>${STAGE[p.stage]}</span></div>
      <div class="fact"><b>Total</b><span>${bst(p)}</span></div>
    </div>
    <div class="hint wide" style="margin-top:14px"><b>Abilities</b>${p.abil.join(", ")}</div>`;

  $("dexmodal").hidden = false;
}

function closeDex() {
  $("dexmodal").hidden = true;
  showEnd();
}

/* ---------- confetti ---------- */
function fireConfetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const cv = $("confetti"), ctx = cv.getContext("2d");
  const W = cv.width = innerWidth, H = cv.height = innerHeight;
  cv.classList.add("on");

  const COLORS = ["#E0483C","#FAC000","#2980EF","#3E9D5B","#EF70EF","#FFF3C4","#60A1B8"];
  const bits = Array.from({ length: 160 }, () => ({
    x: Math.random() * W,
    y: -20 - Math.random() * H * 0.6,
    w: 7 + Math.random() * 6,
    h: 10 + Math.random() * 8,
    c: COLORS[Math.floor(Math.random() * COLORS.length)],
    vy: 2.2 + Math.random() * 2.6,
    sway: 0.6 + Math.random() * 1.4,
    phase: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.22,
    rot: Math.random() * Math.PI,
  }));

  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);

    bits.forEach(b => {
      b.y   += b.vy;
      b.x   += Math.sin(b.y / 28 + b.phase) * b.sway;
      b.rot += b.spin;

      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = t > 3600 ? Math.max(0, 1 - (t - 3600) / 900) : 1;
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.rot)));
      ctx.restore();
    });

    if (t < 4500) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, W, H); cv.classList.remove("on"); }
  })(start);
}

/* ---------- generation drawer ---------- */
function drawGens() {
  const counts = {};
  DEX.forEach(p => counts[p.gen] = (counts[p.gen] || 0) + 1);

  $("genlist").innerHTML = Object.keys(REGIONS).map(g => {
    const on = GENS.has(+g);
    return `<label class="genrow ${on ? "on" : ""}">
      <input type="checkbox" data-g="${g}" ${on ? "checked" : ""}>
      <span>Gen ${g} \u00b7 ${REGIONS[g]}</span>
      <span class="rg">${counts[g] || 0}</span>
    </label>`;
  }).join("");

  $("genlist").querySelectorAll("input").forEach(cb => {
    cb.onchange = () => {
      cb.checked ? GENS.add(+cb.dataset.g) : GENS.delete(+cb.dataset.g);
      if (!GENS.size) { GENS.add(+cb.dataset.g); cb.checked = true; }   // never empty
      drawGens();
    };
  });

  const n = pool().length;
  $("pooln").textContent    = n;
  $("tagcount").textContent = n.toLocaleString();
  $("play").disabled = !n;

  // is a round in progress that was built from a different selection?
  const live    = !over && !!target;
  const changed = live && (roundGens.size !== GENS.size
                           || [...GENS].some(g => !roundGens.has(g)));
  $("pending").hidden    = !changed;
  $("grass").textContent = "Confirm Regions";

  try { localStorage.setItem("dexle-gens", JSON.stringify([...GENS])); } catch (e) {}
}

function openDrawer()  { $("drawer").hidden = false; $("scrim").hidden = false; }
function closeDrawer() { $("drawer").hidden = true;  $("scrim").hidden = true;  }

/* abandon the round and go back to the "Ready when you are" screen */
function backToStart() {
  target  = null;
  guesses = [];
  pending = null;
  over    = false;
  picked  = null;
  matches = [];

  hintsUsed  = 0;
  hintsTaken = [];
  roundPool  = [];
  roundGens  = new Set();

  $("game").hidden = true;
  $("start").style.display = "";

  $("q").value = "";
  $("q").disabled  = false;
  $("go").disabled = false;
  $("searchbar").classList.remove("caught");
  $("list").className = "";

  $("grid").innerHTML    = "";
  $("hints").innerHTML   = "";
  $("hintbar").innerHTML = "";
  $("inspect").className = "";
  $("end").className     = "";
  $("end").dataset.win   = "";
  $("dexmodal").hidden   = true;

  closeDrawer();
  drawGens();
  updateDailyCard();
}

/* =========================================================
   event bindings - keep them all here
   ========================================================= */
$("play").onclick   = newRound;
$("dailyPlay").onclick = () => dailyComplete() ? openDailyResult() : startDaily();
$("again").onclick  = () => DAILY_MODE ? backToStart() : newRound();
$("go").onclick     = submit;
$("reopen").onclick = openDex;
$("dexclose").onclick = closeDex;
$("dailyResultClose").onclick = closeDailyResult;
$("dailyShare").onclick = shareDailyResult;
$("dailyResultModal").onclick = e => {if(e.target.id==="dailyResultModal")closeDailyResult();};

$("menu").onclick        = openDrawer;
$("drawerclose").onclick = closeDrawer;
$("scrim").onclick       = closeDrawer;
$("genall").onclick  = () => { GENS = new Set([1,2,3,4,5,6,7,8,9]); drawGens(); };
$("gennone").onclick = () => { GENS = new Set([1]); drawGens(); };
$("grass").onclick   = closeDrawer;

$("shiny").onclick = () => {
  SHINY = !SHINY;
  document.body.classList.toggle("shiny", SHINY);
  $("shiny").setAttribute("aria-pressed", SHINY);

  if (matches.length) drawList();
  document.querySelectorAll("[data-dex]").forEach(img => {
    img.src = img.dataset.art ? ART(img.dataset.dex) : SPRITE(img.dataset.dex);
  });
};

$("q").addEventListener("input", e => {
  const v = norm(e.target.value);
  picked = null;

  const P = roundPool;
  matches = v
    ? P.filter(p => norm(p.name).includes(v))
       .sort((a, b) => norm(a.name).indexOf(v) - norm(b.name).indexOf(v))
       .slice(0, 60)
    : P.slice(0, 60);

  cursor = 0;
  drawList();
});

$("q").addEventListener("focus", () => {
  if ($("q").value.trim() && matches.length) drawList();
});

$("q").addEventListener("keydown", e => {
  if (!matches.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    cursor = Math.min(cursor + 1, matches.length - 1);
    drawList();
    $("list").children[cursor].scrollIntoView({ block:"nearest" });
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    cursor = Math.max(cursor - 1, 0);
    drawList();
    $("list").children[cursor].scrollIntoView({ block:"nearest" });
  } else if (e.key === "Enter") {
    e.preventDefault();
    choose(matches[cursor]);
  } else if (e.key === "Escape") {
    $("list").className = "";
  }
});

$("dexmodal").onclick = e => { if (e.target.id === "dexmodal") closeDex(); };

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("dexmodal").hidden) closeDex();
  if (e.key === "Escape" && !$("dailyResultModal").hidden) closeDailyResult();
});

document.addEventListener("click", e => {
  if (!e.target.closest(".searchbar")) $("list").className = "";
});
