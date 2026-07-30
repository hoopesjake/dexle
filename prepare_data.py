"""
Dexle - data prep
Turns the Kaggle CSV into pokedex.json for the game.
Run once:  python prepare_data.py
"""
import csv, json

CSV_IN   = "pokemon_gen9.csv"
JSON_OUT = "pokedex.json"

# Generation-i -> 1, and generation -> region
ROMAN = {"i":1, "ii":2, "iii":3, "iv":4, "v":5, "vi":6, "vii":7, "viii":8, "ix":9}
REGION = {1:"Kanto", 2:"Johto", 3:"Hoenn", 4:"Sinnoh", 5:"Unova",
          6:"Kalos", 7:"Alola", 8:"Galar", 9:"Paldea"}

# names the simple capitalizer gets wrong
FIX = {"nidoran-f":"Nidoran\u2640", "nidoran-m":"Nidoran\u2642", "mr-mime":"Mr. Mime",
       "mime-jr":"Mime Jr.", "mr-rime":"Mr. Rime", "type-null":"Type: Null",
       "ho-oh":"Ho-Oh", "porygon-z":"Porygon-Z", "farfetchd":"Farfetch'd",
       "sirfetchd":"Sirfetch'd", "flabebe":"Flab\u00e9b\u00e9", "jangmo-o":"Jangmo-o",
       "hakamo-o":"Hakamo-o", "kommo-o":"Kommo-o"}

# default-form suffixes to drop: giratina-altered -> giratina
FORMS = {"deoxys","wormadam","giratina","shaymin","basculin","darmanitan","tornadus",
         "thundurus","landorus","keldeo","meloetta","meowstic","aegislash","pumpkaboo",
         "gourgeist","zygarde","oricorio","lycanroc","wishiwashi","minior","mimikyu",
         "toxtricity","eiscue","indeedee","morpeko","urshifu","basculegion","enamorus",
         "oinkologne","maushold","squawkabilly","palafin","tatsugiri","dudunsparce"}

def pretty(name):
    base = name.split("-")[0]
    if base in FORMS:
        name = base
    if name in FIX:
        return FIX[name]
    return " ".join(w.capitalize() for w in name.split("-"))

rows = list(csv.DictReader(open(CSV_IN, encoding="utf-8")))
print(f"Read {len(rows)} rows")

# pass 1: index every pokemon by its lowercase name so we can walk evolutions
by_name = {r["name"].lower(): r for r in rows}

def stage(row, depth=1):
    """Walk evolves_from up the chain. Basic = 1, first evo = 2, second = 3."""
    parent = row.get("evolves_from", "None")
    if not parent or parent == "None":
        return depth
    nxt = by_name.get(parent.lower())
    if nxt is None or depth > 5:      # safety: broken link or loop
        return depth
    return stage(nxt, depth + 1)

def clean_text(t):
    """Old game text uses POKeMON and hard line breaks."""
    t = t.replace("POKeMON", "Pokémon").replace("POKéMON", "Pokémon")
    return " ".join(t.split())

TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison","ground",
         "flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"]

dex = []
for r in rows:
    gen = ROMAN[r["generation"].split("-")[1].lower()]
    types = [t.strip().lower() for t in r["types"].split(",") if t.strip()]

    dex.append({
        "id":     int(r["id"]),
        "name":   pretty(r["name"].lower()),
        "t1":     types[0],
        "t2":     types[1] if len(types) > 1 else None,
        "gen":    gen,
        "region": REGION[gen],
        "h":      float(r["height"]),
        "w":      float(r["weight"]),
        "stage":  stage(r),
        "legend": r["is_legendary"] == "True" or r["is_mythical"] == "True",
        "s": [int(r["hp"]), int(r["attack"]), int(r["defense"]),
              int(r["special_attack"]), int(r["special_defense"]), int(r["speed"])],
        "desc":  clean_text(r["description"]),
        "cat":   r["category"].replace("Pokemon", "Pokémon"),
        "abil":  [a.strip() for a in r["abilities"].split(",") if a.strip()],
        # damage multiplier taken FROM each attacking type
        "vs": {t: float(r["against_" + t]) for t in TYPES},
    })

dex.sort(key=lambda p: p["id"])
with open(JSON_OUT, "w", encoding="utf-8") as f:
    json.dump(dex, f, ensure_ascii=False, separators=(",", ":"))

print(f"Wrote {JSON_OUT}  ({len(dex)} pokemon)")
print("Spot check:", json.dumps(dex[24], ensure_ascii=False))