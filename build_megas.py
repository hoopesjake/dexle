"""
Dexle - Mega Evolution data
Pulls the canonical Mega and Primal forms from PokeAPI's source CSVs
and writes megas.json keyed by the base species dex number.
Run:  python build_megas.py
"""
import csv, json, urllib.request

BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"
NEED = ["pokemon", "pokemon_stats", "pokemon_types", "types"]

# Every Mega and Primal form PokeAPI carries, including the Legends Z-A wave.

def load(name):
    try:
        return list(csv.DictReader(open(name + ".csv", encoding="utf-8")))
    except FileNotFoundError:
        with urllib.request.urlopen(BASE + name + ".csv") as r:
            text = r.read().decode("utf-8")
        open(name + ".csv", "w", encoding="utf-8").write(text)
        return list(csv.DictReader(text.splitlines()))

rows   = load("pokemon")
types  = {t["id"]: t["identifier"] for t in load("types")}
STAT   = {"1":0, "2":1, "3":2, "4":3, "5":4, "6":5}

ptypes, pstats = {}, {}
for r in load("pokemon_types"):
    ptypes.setdefault(r["pokemon_id"], {})[int(r["slot"])] = types[r["type_id"]]
for r in load("pokemon_stats"):
    if r["stat_id"] in STAT:
        pstats.setdefault(r["pokemon_id"], [0]*6)[STAT[r["stat_id"]]] = int(r["base_stat"])

def pretty(ident):
    """charizard-mega-x -> Mega Charizard X       lucario-mega-z -> Mega Lucario Z
       kyogre-primal    -> Primal Kyogre          tatsugiri-curly-mega -> Mega Tatsugiri Curly"""
    parts  = ident.split("-")
    primal = "primal" in parts
    core   = parts[0].capitalize()
    rest   = [p for p in parts[1:] if p not in ("mega", "primal")]
    suffix = " ".join(w.upper() if len(w) == 1 else w.capitalize() for w in rest)
    return ("Primal " if primal else "Mega ") + core + (" " + suffix if suffix else "")

megas = {}
for r in rows:
    pid = int(r["id"])
    if "-mega" not in r["identifier"] and not r["identifier"].endswith("-primal"):
        continue
    t = ptypes.get(r["id"], {})
    s = pstats.get(r["id"])
    if not t or not s:
        continue
    megas.setdefault(int(r["species_id"]), []).append({
        "id":   pid,                       # sprite id
        "name": pretty(r["identifier"]),
        "t1":   t.get(1),
        "t2":   t.get(2),
        "s":    s,
    })

json.dump(megas, open("megas.json", "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))

forms = sum(len(v) for v in megas.values())
print(f"Wrote megas.json: {len(megas)} Pokemon, {forms} forms")
multi = {k: [f["name"] for f in v] for k, v in megas.items() if len(v) > 1}
print(f"{len(multi)} Pokemon have more than one Mega form:")
for k, v in multi.items():
    print("   ", " / ".join(v))