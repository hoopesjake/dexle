"""Build mechanically meaningful alternate forms from the local PokeAPI CSVs."""
import csv, json

def load(name):
    with open(name + ".csv", encoding="utf-8") as f:
        return list(csv.DictReader(f))

pokemon = load("pokemon")
types = {r["id"]: r["identifier"] for r in load("types")}
by_id = {int(r["id"]): r for r in pokemon}
stats, ptypes = {}, {}
for r in load("pokemon_stats"):
    sid = int(r["stat_id"])
    if sid <= 6:
        stats.setdefault(int(r["pokemon_id"]), [0] * 6)[sid - 1] = int(r["base_stat"])
for r in load("pokemon_types"):
    ptypes.setdefault(int(r["pokemon_id"]), {})[int(r["slot"])] = types[r["type_id"]]

def form_name(identifier):
    if identifier == "calyrex-ice":
        return "Calyrex Ice Rider"
    if identifier == "calyrex-shadow":
        return "Calyrex Shadow Rider"
    words = identifier.replace("-", " ").title()
    for region, adjective in (("Galar", "Galarian"), ("Alola", "Alolan"),
                              ("Hisui", "Hisuian"), ("Paldea", "Paldean")):
        words = words.replace(region + " ", adjective + " ")
        if words.endswith(" " + region):
            words = adjective + " " + words[:-(len(region) + 1)]
    return words

forms = {}
for row in pokemon:
    pid, species = int(row["id"]), int(row["species_id"])
    if (pid <= 1025 or species > 1025 or "mega" in row["identifier"] or
            "primal" in row["identifier"] or "totem" in row["identifier"]):
        continue
    base = by_id.get(species)
    if not base or pid not in stats or species not in stats:
        continue
    alt_types = [ptypes.get(pid, {}).get(1), ptypes.get(pid, {}).get(2)]
    base_types = [ptypes.get(species, {}).get(1), ptypes.get(species, {}).get(2)]
    stat_change = stats[pid] != stats[species]
    type_change = alt_types != base_types
    if not stat_change and not type_change:
        continue
    regional_type_form = row["identifier"].endswith(("-alola", "-hisui"))
    form = {
        "id": pid, "name": form_name(row["identifier"]),
        "t1": alt_types[0], "t2": alt_types[1], "s": stats[pid],
        "cost": "free" if regional_type_form or not stat_change else "power",
        "kind": "Change Type" if regional_type_form or not stat_change else "Form Change",
    }
    if regional_type_form:
        form.update({"sprite": f"{pid}.png", "shinySprite": f"shiny/{pid}.png"})
    forms.setdefault(str(species), []).append(form)

# PokeAPI models these type plates/memories as forms rather than separate
# numeric Pokemon. They use the base sprite and never change stats.
all_types = ["normal","fire","water","electric","grass","ice","fighting","poison","ground",
             "flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"]
for species, name in ((493, "Arceus"), (773, "Silvally")):
    base_stats = stats[species]
    forms[str(species)] = [
        {"id": species, "name": f"{name} ({t.title()})", "t1": t, "t2": None,
         "s": base_stats, "cost": "free", "kind": "Change Type",
         "sprite": f"{species}-{t}.png", "shinySprite": f"shiny/{species}-{t}.png"}
        for t in all_types if t != ptypes[species].get(1)
    ]

forms["649"] = [
    {"id": 649, "name": f"Genesect {label} Drive", "t1": "bug", "t2": "steel",
     "s": stats[649], "cost": "free", "kind": "Change Drive", "drive": True,
     "driveName": f"{label} Drive", "attackType": attack,
     "sprite": f"other/home/649-{slug}.png",
     "shinySprite": f"other/home/shiny/649-{slug}.png"}
    for slug, label, attack in (("douse","Douse","water"), ("shock","Shock","electric"),
                                ("burn","Burn","fire"), ("chill","Chill","ice"))
]

with open("forms.json", "w", encoding="utf-8") as f:
    json.dump(forms, f, ensure_ascii=False, separators=(",", ":"))
print(f"Wrote forms.json: {len(forms)} Pokemon, {sum(map(len, forms.values()))} meaningful forms")
