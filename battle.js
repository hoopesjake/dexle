/* =========================================================
   Dexle Gauntlet - battle engine
   Pure logic, no DOM. gauntlet.js renders the results.

   A battle is an actual turn-by-turn 6v6 fight, run many times
   to turn luck into a win probability.
   ========================================================= */

/* =========================================================
   TUNING DIALS - everything you'd want to change lives here.

   OPP_POWER      Region Champion opponent stat multiplier by role
   G_OPP_POWER    same, for the 121-battle Gauntlet
   SCALE_REF      base-stat total each opposing Pokemon is pulled up to
   SCALE_ROLE     share of SCALE_REF each role gets
   OUTNUMBER_EXP  how much a short roster is compensated. 0 = none,
                  1 = full. Higher = two-Pokemon gyms hit much harder.
   RANKS          Poke / Great / Ultra / Master cut-offs
   CANDY_BOOST    Rare Candy multiplier
   CARRY_DAMAGE   false = every battle starts from full HP
   ========================================================= */

/* ---------- type chart (Gen 6+) ----------
   TYPE_CHART[attacker][defender] = multiplier.
   Anything not listed is 1x. */
const TYPE_CHART = {
  normal:   { rock:.5, ghost:0, steel:.5 },
  fire:     { fire:.5, water:.5, grass:2, ice:2, bug:2, rock:.5, dragon:.5, steel:2 },
  water:    { fire:2, water:.5, grass:.5, ground:2, rock:2, dragon:.5 },
  electric: { water:2, electric:.5, grass:.5, ground:0, flying:2, dragon:.5 },
  grass:    { fire:.5, water:2, grass:.5, poison:.5, ground:2, flying:.5, bug:.5,
              rock:2, dragon:.5, steel:.5 },
  ice:      { fire:.5, water:.5, grass:2, ice:.5, ground:2, flying:2, dragon:2, steel:.5 },
  fighting: { normal:2, ice:2, poison:.5, flying:.5, psychic:.5, bug:.5, rock:2,
              ghost:0, dark:2, steel:2, fairy:.5 },
  poison:   { grass:2, poison:.5, ground:.5, rock:.5, ghost:.5, steel:0, fairy:2 },
  ground:   { fire:2, electric:2, grass:.5, poison:2, flying:0, bug:.5, rock:2, steel:2 },
  flying:   { electric:.5, grass:2, fighting:2, bug:2, rock:.5, steel:.5 },
  psychic:  { fighting:2, poison:2, psychic:.5, dark:0, steel:.5 },
  bug:      { fire:.5, grass:2, fighting:.5, poison:.5, flying:.5, psychic:2,
              ghost:.5, dark:2, steel:.5, fairy:.5 },
  rock:     { fire:2, ice:2, fighting:.5, ground:.5, flying:2, bug:2, steel:.5 },
  ghost:    { normal:0, psychic:2, ghost:2, dark:.5 },
  dragon:   { dragon:2, steel:.5, fairy:0 },
  dark:     { fighting:.5, psychic:2, ghost:2, dark:.5, fairy:.5 },
  steel:    { fire:.5, water:.5, electric:.5, ice:2, rock:2, steel:.5, fairy:2 },
  fairy:    { fire:.5, fighting:2, poison:.5, dragon:2, dark:2, steel:.5 },
};

const POWER      = 70;      // stand-in move power - we have no move data
const MISS       = 0.07;    // whiff chance, keeps close fights from being decided
const RUNS       = 300;     // simulations per battle
// Everything fights at level 100, both sides. Battles come down to base stats
// and type coverage, not level gaps. Set FLAT_LEVEL to 0 to go back to the
// in-game level curve from the roster data.
const FLAT_LEVEL = 100;
const LVL_START  = 1.03;    // only used when FLAT_LEVEL is 0
const LVL_END    = 0.98;

// Trainers run optimised teams with items and real movesets. This scales their
// stats by role so the Elite Four and Champions hit like they matter.
const OPP_POWER = {
  "Gym Leader":1.00, "Trial":1.00, "Kahuna":1.02,
  "Elite Four":1.05, "Champion Cup":1.07, "Champion":1.28,
};

/* ---- GAUNTLET DIFFICULTY: "HARD" preset ----
   These five constants are the only dials that matter for the Gauntlet.
   Current values are the HARD preset. To go back to the original:
     G_OPP_POWER      -> 0.98 / 0.98 / 0.98 / 0.98 / 0.98 / 0.96
     G_MIN_MULT       -> 0.85
     SCALE_ROLE       -> 0.62 / 0.62 / 0.70 / 0.80 / 0.84 / 0.92
     G_HEAL_SURVIVOR  -> 0.94
     G_HEAL_FAINTED   -> 0.78
   G_HEAL_FAINTED is by far the strongest lever - lower it to tighten further. */
const G_OPP_POWER = {
  "Gym Leader":1.00, "Trial":1.00, "Kahuna":1.00,
  "Elite Four":1.04, "Champion Cup":1.04, "Champion":1.075,
};
const G_MIN_MULT = 1.00;

// Opponents carry coverage moves, so they always have at least a neutral option.
// You can no longer wall a mono-type leader with a single resist.
const OPP_MIN_MULT = 1;

// Chance that a Pokemon coming in after a faint loses its first action.
// 1 = always (brutal), 0 = free switching (too easy).
const SWITCH_COST = 0.28;

/* ---------- opponent scaling ----------
   Short rosters get pulled up to a FIXED reference, never to your own stats.
   Scaling to your team rubber-bands the whole game: a better draft just gets
   tougher opponents and every team lands on the same record. This way your
   team quality actually decides the result. */
const SCALE_REF = 500;      // reference base-stat total per opposing Pokemon
// Each trainer's Pokemon is pulled toward this share of YOUR average Pokemon.
// Deliberately light: it stops a two-Pokemon gym being free without making
// Brock scarier than Cynthia.
const SCALE_ROLE = {
  "Gym Leader":0.92, "Trial":0.92, "Kahuna":0.94,
  "Elite Four":0.96, "Champion Cup":0.97, "Champion":1.02,
};
const SCALE_SD    = 0.10;   // standard deviation on the target, per battle
const SCALE_ON    = true;   // false = use raw roster stats

/* You bring as many Pokemon as they do. A gym leader with two is a 2v2, not a
   6v2 — which is the only thing that stops a stacked team auto-sweeping the
   early badges. Your best matchups are the ones that get sent out. */
// Tried this: it inverts the curve. Trimming to a 2-Pokemon gym makes early
// badges the HARDEST fights, because a 2v2 is a coin flip while a 6v6 lets the
// better team grind out a win. Left here as a switch, off by default.
const MATCH_ROSTER = false;
const MIN_SQUAD    = 2;     // never shrink below this many

// A short roster holding the same total is far scarier, because the stats are
// concentrated. So aim at YOUR PER-POKEMON average and only partly compensate
// for being outnumbered. 0 = no compensation, 1 = full total-stat parity.
const OUTNUMBER_EXP = 0.54;

// The Gauntlet is 121 battles, so per-battle attrition compounds far harder
// than it does over a single 13-battle region. It gets its own, kinder rates.
const G_HEAL_SURVIVOR = 0.86;
const G_HEAL_FAINTED  = 0.62;

// bigger breather when you cross into a new region
const REGION_HEAL_SURVIVOR = 0.97;
const REGION_HEAL_FAINTED  = 0.90;


/* ---------- rare candy ----------
   One Pokemon may be fed a Rare Candy before a run for a flat stat boost.
   Applied by gauntlet.js when it builds the roster, so the sim just sees
   bigger numbers. Not for the starter, a legendary, or the Mega. */
const CANDY_BOOST = 1.50;

/* ---------- damage carry ----------
   false = every battle starts from full health. Difficulty then comes from
   type coverage and raw stats rather than from being worn down, which is
   fairer: winning a hard gym shouldn't hand you a penalty for the next one.
   The HEAL_* numbers below only apply when this is true. */
const CARRY_DAMAGE = false;

const HEAL_SURVIVOR = 0.86;   // survivors recover to this share of max HP
const HEAL_FAINTED  = 0.56;   // fainted Pokemon come back at this share

/* ---------- between-battle recovery ----------
   `raw` is post-battle HP as a share of max; returns what carries forward. */
function recover(raw, survivor, fainted) {
  if (!CARRY_DAMAGE) return raw.map(() => 1);      // everyone back to full
  return raw.map(f => f > 0 ? Math.min(1, f + survivor * (1 - f)) : fainted);
}

/* ---------- rank tiers ----------
   Scored on the share of battles won, so it works for a 13-battle region
   and the 121-battle Gauntlet alike. */
/* ---------- rank tiers ----------
   Hard-coded cut-offs, no proportional guessing. Each entry is the minimum
   number of wins for that tier. Highest listed first. */
const TIERS = {
  121: [
    { key:"oak",    name:"Professor Oak", min:121, hex:"#5FE3B0" },
    { key:"master", name:"Master Ball",   min:116, hex:"#B061D6" },
    { key:"ultra",  name:"Ultra Ball",    min:91,  hex:"#F0C020" },
    { key:"great",  name:"Great Ball",    min:71,  hex:"#3E7BD6" },
    { key:"poke",   name:"Poké Ball",     min:0,   hex:"#E0483C" },
  ],
  13: [
    { key:"oak",    name:"Professor Oak", min:13, hex:"#5FE3B0" },
    { key:"master", name:"Master Ball",   min:12, hex:"#B061D6" },
    { key:"ultra",  name:"Ultra Ball",    min:10, hex:"#F0C020" },
    { key:"great",  name:"Great Ball",    min:7,  hex:"#3E7BD6" },
    { key:"poke",   name:"Poké Ball",     min:0,  hex:"#E0483C" },
  ],
};

// any other length scales off the 121 table
function tableFor(total) {
  if (TIERS[total]) return TIERS[total];
  const k = total / 121;
  return TIERS[121].map((t, i) => ({
    ...t,
    min: i === 0 ? total : Math.max(0, Math.round(t.min * k)),
  }));
}

const RANKS = TIERS[121];

function rankFor(wins, total) {
  const table = tableFor(total);
  const idx   = table.findIndex(t => wins >= t.min);
  const tier  = table[idx === -1 ? table.length - 1 : idx];
  const next  = idx > 0 ? table[idx - 1] : null;
  return {
    ...tier,
    pct: total ? wins / total : 0,
    perfect: total > 0 && wins === total,
    next, nextAt: next ? next.min : null,
  };
}

/* ---------- effectiveness ---------- */
// one attacking type into a defender's type combo
function typeMult(atk, defTypes) {
  const row = TYPE_CHART[atk] || {};
  return defTypes.reduce((m, d) => m * (d && row[d] !== undefined ? row[d] : 1), 1);
}

// best multiplier this attacker can manage, using its own types as its moves
function bestMult(mon, target) {
  const mine  = [mon.t1, mon.t2].filter(Boolean);
  const theirs = [target.t1, target.t2].filter(Boolean);
  return Math.max(...mine.map(t => typeMult(t, theirs)));
}

/* ---------- stats at a level ---------- */
// s = [hp, atk, def, spa, spd, spe]
const statAt = (base, lvl) => Math.floor((2 * base + 36) * lvl / 100) + 5;
const hpAt   = (base, lvl) => Math.floor((2 * base + 36) * lvl / 100) + lvl + 10;

// turn a roster entry into a fighter at a given level
function fighter(mon, lvl, stats, power, minMult) {
  const k = power || 1;
  const s = (stats || mon.s).map(v => v * k);
  return {
    name: mon.name, id: mon.id, t1: mon.t1, t2: mon.t2, lvl,
    minMult: minMult || 0,
    hp:  hpAt(s[0], lvl), max: hpAt(s[0], lvl),
    atk: statAt(s[1], lvl), def: statAt(s[2], lvl),
    spa: statAt(s[3], lvl), spd: statAt(s[4], lvl),
    spe: statAt(s[5], lvl),
  };
}

/* ---------- one attack ---------- */
function damage(a, d, mult, rng) {
  // whichever attacking side is stronger, hitting the matching defence
  const physical = a.atk >= a.spa;
  const atk = physical ? a.atk : a.spa;
  const def = physical ? d.def : d.spd;

  const base = Math.floor(((2 * a.lvl / 5 + 2) * POWER * atk / def) / 50) + 2;
  const luck = 0.85 + rng() * 0.15;            // the usual damage spread
  const crit = rng() < 0.0625 ? 1.5 : 1;
  return Math.max(1, Math.floor(base * mult * luck * crit));
}

/* ---------- pick who comes in ---------- */
// favour a good matchup: what we do to them minus what they do to us
function chooseLead(bench, target) {
  let best = null, score = -Infinity;
  for (const f of bench) {
    if (f.hp <= 0) continue;
    const out = Math.max(bestMult(f, target), f.minMult || 0);
    const inc = Math.max(bestMult(target, f), target.minMult || 0);
    const sc  = out * 2 - inc + (f.spe > target.spe ? 0.35 : 0);
    if (sc > score) { score = sc; best = f; }
  }
  return best;
}

/* ---------- trim your team to the size of theirs ----------
   Keeps the best matchups: what we do to their squad minus what they do to us. */
function squadFor(mine, theirs) {
  if (!MATCH_ROSTER || mine.length <= theirs.length) return mine;
  const cap = Math.max(MIN_SQUAD, theirs.length);
  if (mine.length <= cap) return mine;

  const scored = mine.map(f => {
    let out = 0, inc = 0;
    theirs.forEach(t => {
      out += Math.max(bestMult(f, t), f.minMult || 0);
      inc += Math.max(bestMult(t, f), t.minMult || 0);
    });
    const n = theirs.length;
    return { f, sc: (out - inc) / n + (f.max / 400) };
  }).sort((a, b) => b.sc - a.sc);

  return scored.slice(0, cap).map(x => x.f);
}

/* ---------- a single 6v6 battle ---------- */
function simBattle(mine, theirs, rng) {
  const A = squadFor(mine, theirs).map(f => ({ ...f }));
  const B = theirs.map(f => ({ ...f }));

  let b = B[0];
  let a = chooseLead(A, b);
  let turns = 0;

  while (a && b && turns < 400) {
    turns++;
    // faster one goes first; ties break randomly
    const first = a.spe > b.spe ? "a" : b.spe > a.spe ? "b" : (rng() < .5 ? "a" : "b");
    const order = first === "a" ? [[a, b], [b, a]] : [[b, a], [a, b]];

    for (const [att, def] of order) {
      if (att.hp <= 0 || def.hp <= 0) continue;
      if (att.skip) { att.skip = false; continue; }      // just switched in
      if (rng() < MISS) continue;                       // whiffed
      const mult = Math.max(bestMult(att, def), att.minMult || 0);
      def.hp -= damage(att, def, mult, rng);

      if (def.hp <= 0) {
        // both sides bring in their best remaining answer, but the
        // replacement loses its next action getting into position
        const cost = rng() < SWITCH_COST;
        if (def === a) { a = chooseLead(A, b); if (a && cost) a.skip = true; }
        else           { b = chooseLead(B, a); if (b && cost) b.skip = true; }
        break;
      }
    }
  }

  const left  = A.filter(x => x.hp > 0).length;
  const oleft = B.filter(x => x.hp > 0).length;
  return {
    win: left > 0 && oleft === 0, left, oleft, turns,
    hp: A.map(x => Math.max(0, x.hp)),        // carried into the next battle
  };
}

/* ---------- your level for battle i of n ---------- */
function myLevelFor(i, n, oppTeam) {
  if (FLAT_LEVEL) return FLAT_LEVEL;
  const avg  = oppTeam.reduce((s, m) => s + (m.lvl || 50), 0) / oppTeam.length;
  const t    = n <= 1 ? 0 : i / (n - 1);
  const ramp = LVL_START + (LVL_END - LVL_START) * t;
  return Math.max(5, Math.round(avg * ramp));
}

// opponents sit at the same level when the flat rule is on
const oppLevelFor = (mon, myLvl) => FLAT_LEVEL || mon.lvl || myLvl;

/* ---------- labels and matchup notes for one opponent ---------- */
function battleInfo(team, opp, i, n) {
  const lvl = myLevelFor(i, n, opp.team);

  // who on your team handles their squad best, and their scariest hitter
  const scored = team.map(m => ({
    name: m.p.name,
    score: opp.team.reduce((s, t) => s + bestMult(m.p, t), 0) / opp.team.length,
  })).sort((x, y) => y.score - x.score);

  const threat = opp.team.map(t => ({
    name: t.name,
    score: Math.max(...team.map(m => bestMult(t, m.p))),
  })).sort((x, y) => y.score - x.score)[0];

  const sum = a => a.reduce((x, y) => x + y, 0);
  return {
    name: opp.name, role: opp.role, type: opp.type,
    myLevel: lvl,
    oppLevel: Math.round(opp.team.reduce((s,m) => s + oppLevelFor(m, lvl), 0) / opp.team.length),
    flat: !!FLAT_LEVEL,
    mySum:  sum(team.map(m => sum(m.stats || m.p.s))),
    oppSum: sum(opp.team.map(m => sum(m.s))),
    oppCount: opp.team.length,
    best: scored[0], worst: scored[scored.length - 1], threat,
  };
}

/* ---------- the whole circuit, run end to end ----------
   One run walks all 13 battles carrying HP forward, so attrition is real.
   Doing that many times gives both per-battle odds and a record spread. */
function simRun(team, opponents, runs) {
  runs = runs || RUNS;
  const n    = opponents.length;
  const rng  = mulberry(20260730);
  const wins = new Array(n).fill(0);
  const records = {};
  let perfect = 0, totalWins = 0;

  const sum   = a => a.reduce((x, y) => x + y, 0);
  const mySum = sum(team.map(m => sum(m.stats || m.p.s)));

  for (let r = 0; r < runs; r++) {
    // fresh team at the start of every attempt
    let carried = null;
    let won = 0;

    for (let i = 0; i < n; i++) {
      const opp   = opponents[i];
      const lvl   = myLevelFor(i, n, opp.team);
      const power = OPP_POWER[opp.role] || 1;
      const oSum  = sum(opp.team.map(m => sum(m.s)));
      const scale = scaleFactor(oSum, mySum, opp.role, opp.team.length, rng);

      const mine = team.map((m, k) => {
        const f = fighter(m.p, lvl, m.stats);
        if (carried) f.hp = Math.max(1, Math.round(f.max * carried[k]));
        return f;
      });
      const oppF = opp.team.map(m =>
        fighter(m, oppLevelFor(m, lvl), m.s.map(v => v * scale),
                power, OPP_MIN_MULT));

      const res = simBattle(mine, oppF, rng);
      if (res.win) { wins[i]++; won++; }
      // a loss costs you the battle but the circuit carries on

      // carry HP forward with the between-battle breather applied
      const raw = res.hp.map((h, k) => h / mine[k].max);
      carried = recover(raw, HEAL_SURVIVOR, HEAL_FAINTED);
    }

    totalWins += won;
    records[won] = (records[won] || 0) + 1;
    if (won === n) perfect++;
  }

  // every run reaches every battle now, so the rate is straightforward
  const battles = opponents.map((o, i) => ({
    ...battleInfo(team, o, i, n),
    rate: wins[i] / runs,
  }));

  const modal = Object.keys(records).map(Number)
                  .sort((a, b) => records[b] - records[a])[0];

  const headline = Math.round(battles.reduce((a, b) => a + b.rate, 0));

  return {
    battles,
    record: [headline, n - headline],
    modal,
    expected: Math.round(totalWins / runs * 10) / 10,
    perfectOdds: perfect / runs,
    spread: records,
    hardest: [...battles].sort((a, b) => a.rate - b.rate).slice(0, 3),
  };
}

/* =========================================================
   the nine-region Gauntlet: all 121 battles in one continuous run
   ========================================================= */
function simGauntlet(team, OPP, runs) {
  runs = runs || 120;
  const gens = Object.keys(OPP).map(Number).sort((a, b) => a - b);
  const sum  = a => a.reduce((x, y) => x + y, 0);
  const mySum = sum(team.map(m => sum(m.stats || m.p.s)));
  const rng  = mulberry(20260730);

  // flat list of every battle, tagged with its region
  const all = [];
  gens.forEach(g => OPP[g].opponents.forEach((o, i) =>
    all.push({ gen: g, region: OPP[g].region, game: OPP[g].game,
               opp: o, idx: i, of: OPP[g].opponents.length })));
  const total = all.length;

  const wins   = new Array(total).fill(0);
  const recs   = {};
  let perfect = 0, totalWins = 0;

  for (let r = 0; r < runs; r++) {
    let carried = null, won = 0, lastGen = null;

    for (let b = 0; b < total; b++) {
      const { gen, opp, idx, of } = all[b];

      // crossing into a new region buys a proper rest
      if (carried && gen !== lastGen) {
        carried = carried.map(f =>
          f > 0 ? Math.min(1, f + REGION_HEAL_SURVIVOR * (1 - f))
                : REGION_HEAL_FAINTED);
      }
      lastGen = gen;

      const lvl   = myLevelFor(idx, of, opp.team);
      const power = G_OPP_POWER[opp.role] || 1;
      const oSum  = sum(opp.team.map(m => sum(m.s)));
      const scale = scaleFactor(oSum, mySum, opp.role, opp.team.length, rng);

      const mine = team.map((m, k) => {
        const f = fighter(m.p, lvl, m.stats);
        if (carried) f.hp = Math.max(1, Math.round(f.max * carried[k]));
        return f;
      });
      const oppF = opp.team.map(m =>
        fighter(m, oppLevelFor(m, lvl), m.s.map(v => v * scale),
                power, G_MIN_MULT));

      const res = simBattle(mine, oppF, rng);
      if (res.win) { wins[b]++; won++; }

      const raw = res.hp.map((h, k) => h / mine[k].max);
      carried = recover(raw, G_HEAL_SURVIVOR, G_HEAL_FAINTED);
    }

    totalWins += won;
    recs[won] = (recs[won] || 0) + 1;
    if (won === total) perfect++;
  }

  // regroup into regions for the UI
  const regions = gens.map(g => {
    const rows = [];
    all.forEach((a, b) => {
      if (a.gen !== g) return;
      rows.push({
        ...battleInfo(team, a.opp, a.idx, a.of),
        rate: wins[b] / runs,
        scaled: Math.round(scaleFactor(
          sum(a.opp.team.map(m => sum(m.s))), mySum, a.opp.role,
          a.opp.team.length, mulberry(1)) * 100) / 100,
      });
    });
    return { gen: g, region: OPP[g].region, game: OPP[g].game,
             expected: rows.reduce((a, b2) => a + b2.rate, 0),
             battles: rows };
  });

  // One number drives the whole screen: expected wins. The headline is that
  // total and each region gets a share that adds back up to it exactly.
  const expTotal = regions.reduce((a, r) => a + r.expected, 0);
  const headline = Math.round(expTotal);
  const per      = allocate(regions.map(r => r.expected), headline);
  regions.forEach((r, i) => { r.record = [per[i], r.battles.length - per[i]]; });

  // headline is the most common outcome of a single attempt, not a count of
  // battles you happen to be favoured in
  const modal = Object.keys(recs).map(Number)
                  .sort((a, b) => recs[b] - recs[a])[0];
  return {
    regions, total,
    record: [headline, total - headline],
    modal,
    favoured: regions.reduce((a, r) =>
                a + r.battles.filter(x => x.rate >= 0.5).length, 0),
    expected: Math.round(totalWins / runs * 10) / 10,
    perfectOdds: perfect / runs,
    spread: recs,
    hardest: regions.flatMap(r => r.battles)
                    .sort((a, b) => a.rate - b.rate).slice(0, 5),
  };
}

/* ---------- largest-remainder allocation ----------
   Rounds each part so the parts add up to the rounded whole. Without this the
   region records don't sum to the headline and the screen contradicts itself. */
function allocate(parts, total) {
  const floors = parts.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = parts.map((v, i) => ({ i, frac: v - Math.floor(v) }))
                     .sort((a, b) => b.frac - a.frac);
  const out = floors.slice();
  for (let k = 0; k < order.length && left > 0; k++, left--) out[order[k].i]++;
  return out;
}

/* ---------- normal-ish noise, Box-Muller ---------- */
function gauss(rng) {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------- scale a trainer up toward your team ----------
   Returns a multiplier to apply to every stat on their roster. */
function scaleFactor(oppSum, mySum, role, count, rng) {
  if (!SCALE_ON || !oppSum || !count) return 1;
  const outnum = Math.pow(6 / count, OUTNUMBER_EXP);
  const aim    = SCALE_REF * count * (SCALE_ROLE[role] || 0.85) * outnum;
  const target = aim * (1 + gauss(rng) * SCALE_SD);
  return target > oppSum ? target / oppSum : 1;     // only ever scale up
}

/* ---------- small seeded RNG so results are stable per team ---------- */
function mulberry(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* node export for testing; harmless in the browser */
if (typeof module !== "undefined") {
  module.exports = { TYPE_CHART, typeMult, bestMult, fighter, simBattle,
                     battleInfo, simRun, simGauntlet, myLevelFor, statAt, hpAt,
                     RANKS, rankFor };
}