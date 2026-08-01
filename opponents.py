"""
Dexle Gauntlet - opponent roster
Turns PokemonGymLeaders.csv into opponents.json.
One game version per generation, real rosters, no invention.
Run:  python build_opponents.py
"""
import csv, json, re, unicodedata

CSV_IN   = "PokemonGymLeaders.csv"
DEX_IN   = "pokedex.json"
JSON_OUT = "opponents.json"

# one version per generation. Third/enhanced release where one exists.
GAME = {1:"Red", 2:"Crystal", 3:"Emerald", 4:"Platinum",
        5:"Black", 6:"Y", 7:"Sun", 8:"Shield", 9:"Violet"}

REGION = {1:"Kanto", 2:"Johto", 3:"Hoenn", 4:"Sinnoh", 5:"Unova",
          6:"Kalos", 7:"Alola", 8:"Galar", 9:"Paldea"}

# rows to drop entirely
DROP_LEADER = {
    # starter-dependent branches - keep one canonical version of each rival
    "champion blue bulbasaur", "champion blue charmander",
    "ilima rowlet", "ilima litten", "ilima popplio",
    "kukui litten", "kukui popplio",
    "hop sobble", "hop grookey",
    "champion leon scorbunny", "champion leon sobble",
    # Striaton's three brothers: you only ever fight one
    "chili", "cress",
    # Emerald's Champion is Wallace; Steven is a post-game superboss
    "champion steven",
    # data glitch: unnamed trainer
    "none",
}

# Crystal lets you re-clear all eight Kanto gyms post-game - out of scope
DROP_GEN2_GYMS = {"Vermilion City","Saffron City","Celadon City","Fuchsia City",
                  "Cerulean City","Pewter City","Seafoam Islands","Viridian City"}

RENAME = {
    "champion blue squirtle":"Blue", "champion lance":"Lance",
    "champion cynthia":"Cynthia", "champion alder":"Alder",
    "champion diantha":"Diantha", "champion geeta":"Geeta",
    "kukui rowlet":"Kukui", "hop scorbunny":"Hop",
    "champion leon grookey":"Leon", "ilima":"Ilima",
    "misty":"Misty", "roark":"Roark", "wallace":"Wallace",
}

def title(s):
    return " ".join(w if w.isupper() else w.capitalize() for w in s.split())

def leader_name(raw):
    k = raw.strip().lower()
    if k in RENAME: return RENAME[k]
    return title(raw.strip())

# champions whose CSV row doesn't say "champion" - keyed by generation so
# Lance reads as Elite Four in Kanto and Champion in Johto
CHAMPION = {3:"Wallace", 7:"Kukui"}

def role_of(gym, raw, gen):
    low = raw.lower()
    if "champion" in low or leader_name(raw) == CHAMPION.get(gen):
        return "Champion"
    if gym == "Elite Four": return "Elite Four"
    if gym == "Champion Cup": return "Champion Cup"
    if gym in ("Iki Town","Ruins of Life","Vast Poni Canyon"): return "Kahuna"
    if gym == "Pokémon League" or gym in ("Brooklet Hill","Royal Avenue",
                                          "Malie City","Poni Gauntlet"):
        return "Trial"
    return "Gym Leader"

# ---- pokedex lookup so we can attach types, stats and sprites ----
dex   = json.load(open(DEX_IN, encoding="utf-8"))
def key(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii","ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())
by_key = {key(p["name"]): p for p in dex}

# typos in the source CSV
ALIAS = {"camelrupt":"camerupt", "farfetchd":"farfetchd", "mrmime":"mrmime"}
def lookup(name):
    k = key(name)
    return by_key.get(ALIAS.get(k, k))

rows = list(csv.DictReader(open(CSV_IN, encoding="utf-8-sig"), delimiter=";"))
print(f"Read {len(rows)} roster rows")

out, unmatched = {}, set()

for gen, game in GAME.items():
    rs = [r for r in rows if int(r["Generation"]) == gen and r["Game"] == game]
    order, seen = [], set()

    for r in rs:
        raw, gym = r["Gym leader"], r["Gym"]
        if raw.strip().lower() in DROP_LEADER: continue
        if gen == 2 and gym in DROP_GEN2_GYMS: continue
        k = (gym, raw)
        if k not in seen:
            seen.add(k); order.append(k)

    opponents = []
    for gym, raw in order:
        mons = []
        for r in rs:
            if r["Gym"] != gym or r["Gym leader"] != raw: continue
            p = lookup(r["Pokemon"])
            if p is None:
                unmatched.add(r["Pokemon"]); continue
            mons.append({
                "id": p["id"], "name": p["name"],
                "t1": p["t1"], "t2": p["t2"],
                "lvl": int(r["Level"]) if r["Level"].isdigit() else None,
                "s": p["s"],
            })
        if not mons: continue

        # a leader's speciality = the type most of their team shares
        tally = {}
        for m in mons:
            for t in (m["t1"], m["t2"]):
                if t: tally[t] = tally.get(t, 0) + 1
        spec = max(tally, key=tally.get) if tally else None

        opponents.append({
            "name": leader_name(raw),
            "role": role_of(gym, raw, gen),
            "place": gym,
            "type": spec,
            "team": mons,
        })

    out[gen] = {"region": REGION[gen], "game": game, "opponents": opponents}

json.dump(out, open(JSON_OUT, "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))

total = 0
for g in sorted(out):
    n = len(out[g]["opponents"])
    total += n
    print(f"  gen {g} {out[g]['game']:<9} {n:>2} battles, "
          f"{sum(len(o['team']) for o in out[g]['opponents']):>3} pokemon")
print(f"TOTAL: {total} battles")
if unmatched:
    print("UNMATCHED pokemon names:", sorted(unmatched))
else:
    print("every roster Pokemon matched the pokedex")