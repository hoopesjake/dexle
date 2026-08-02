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
    special = {
        "greninja-ash": "Ash's Greninja",
        "giratina-origin": "Giratina Origin Forme",
        "keldeo-resolute": "Keldeo Resolute Form",
        "dialga-origin": "Dialga Origin Forme",
        "palkia-origin": "Palkia Origin Forme",
        "rillaboom-gmax": "Gigantamax Rillaboom",
        "cinderace-gmax": "Gigantamax Cinderace",
        "inteleon-gmax": "Gigantamax Inteleon",
        "meloetta-pirouette": "Meloetta Pirouette Forme",
        "kyurem-black": "Black Kyurem", "kyurem-white": "White Kyurem",
        "tornadus-therian": "Tornadus Therian Forme", "thundurus-therian": "Thundurus Therian Forme",
        "landorus-therian": "Landorus Therian Forme", "enamorus-therian": "Enamorus Therian Forme",
        "aegislash-blade": "Aegislash Blade Forme", "zygarde-10": "Zygarde 10% Forme",
        "zygarde-10-power-construct": "Zygarde 10% Forme", "zygarde-50-power-construct": "Zygarde 50% Forme",
        "zygarde-complete": "Zygarde Complete Forme", "oricorio-pom-pom": "Oricorio Pom-Pom Style",
        "oricorio-pau": "Oricorio P'au Style", "oricorio-sensu": "Oricorio Sensu Style",
        "lycanroc-midnight": "Lycanroc Midnight Form", "lycanroc-dusk": "Lycanroc Dusk Form",
        "wishiwashi-school": "Wishiwashi School Form", "necrozma-dusk": "Necrozma Dusk Mane",
        "necrozma-dawn": "Necrozma Dawn Wings", "necrozma-ultra": "Ultra Necrozma",
        "tauros-paldea-combat-breed": "Paldean Tauros Combat Breed",
        "tauros-paldea-blaze-breed": "Paldean Tauros Blaze Breed",
        "tauros-paldea-aqua-breed": "Paldean Tauros Aqua Breed",
        "palafin-hero": "Palafin Hero Form", "maushold-family-of-three": "Maushold Family of Three",
        "squawkabilly-blue-plumage": "Squawkabilly Blue Plumage",
        "squawkabilly-yellow-plumage": "Squawkabilly Yellow Plumage",
        "squawkabilly-white-plumage": "Squawkabilly White Plumage",
        "cramorant-gulping": "Cramorant Gulping Form", "cramorant-gorging": "Cramorant Gorging Form",
        "morpeko-hangry": "Morpeko Hangry Mode",
        "toxtricity-amped-gmax": "Gigantamax Toxtricity (Amped)",
        "toxtricity-low-key-gmax": "Gigantamax Toxtricity (Low Key)",
    }
    if identifier in special:
        return special[identifier]
    if identifier == "calyrex-ice":
        return "Calyrex Ice Rider"
    if identifier == "calyrex-shadow":
        return "Calyrex Shadow Rider"
    if identifier.startswith("rotom-"):
        return f"{identifier.split('-', 1)[1].title()} Rotom"
    if identifier.startswith("castform-"):
        return f"Castform {identifier.split('-', 1)[1].title()} Form"
    if identifier.startswith("minior-") and not identifier.endswith("-meteor"):
        return f"Minior {identifier.split('-')[1].title()} Core"
    if identifier.endswith("-gmax"):
        label = identifier[:-5].replace("-amped", "").replace("-low-key", "")
        return f"Gigantamax {label.replace('-', ' ').title()}"
    words = identifier.replace("-", " ").title()
    for region, adjective in (("Galar", "Galarian"), ("Alola", "Alolan"),
                              ("Hisui", "Hisuian"), ("Paldea", "Paldean")):
        words = words.replace(region + " ", adjective + " ")
        if words.endswith(" " + region):
            words = adjective + " " + words[:-(len(region) + 1)]
    return words

forms = {}
requested_same_stat_forms = {
    "keldeo-resolute", "cramorant-gulping", "cramorant-gorging", "morpeko-hangry",
    "maushold-family-of-three", "squawkabilly-blue-plumage", "squawkabilly-yellow-plumage",
    "squawkabilly-white-plumage", "minior-orange-meteor", "minior-yellow-meteor",
    "minior-green-meteor", "minior-blue-meteor", "minior-indigo-meteor", "minior-violet-meteor",
}
base_form_names = {351:"Castform Normal Form",479:"Rotom",585:"Deerling Spring Form",586:"Sawsbuck Spring Form",641:"Tornadus Incarnate Forme",642:"Thundurus Incarnate Forme",645:"Landorus Incarnate Forme",646:"Kyurem",648:"Meloetta Aria Forme",681:"Aegislash Shield Forme",718:"Zygarde 50% Forme",741:"Oricorio Baile Style",745:"Lycanroc Midday Form",746:"Wishiwashi Solo Form",774:"Minior Meteor Form",800:"Necrozma",845:"Cramorant",877:"Morpeko Full Belly Mode",905:"Enamorus Incarnate Forme",925:"Maushold Family of Four",931:"Squawkabilly Green Plumage",964:"Palafin Zero Form"}
for row in pokemon:
    pid, species = int(row["id"]), int(row["species_id"])
    if (pid <= 1025 or species > 1025 or row["identifier"] in {"zygarde-10-power-construct", "zygarde-50-power-construct"} or "mega" in row["identifier"] or
            "primal" in row["identifier"] or "totem" in row["identifier"]):
        continue
    base = by_id.get(species)
    if not base or pid not in stats or species not in stats:
        continue
    alt_types = [ptypes.get(pid, {}).get(1), ptypes.get(pid, {}).get(2)]
    base_types = [ptypes.get(species, {}).get(1), ptypes.get(species, {}).get(2)]
    stat_change = stats[pid] != stats[species]
    type_change = alt_types != base_types
    is_gmax = row["identifier"].endswith("-gmax")
    if not stat_change and not type_change and not is_gmax and row["identifier"] not in requested_same_stat_forms:
        continue
    regional_type_form = row["identifier"].endswith(("-alola", "-hisui"))
    form = {
        "id": pid, "name": form_name(row["identifier"]),
        "t1": alt_types[0], "t2": alt_types[1], "s": stats[pid],
        "cost": "power" if is_gmax or ident == "eternatus-eternamax" else "free",
        "kind": "Gigantamax" if is_gmax else "Eternamax" if ident == "eternatus-eternamax" else "Change Type",
    }
    if is_gmax:
        form.update({"gmax": True, "hpMultiplier": 2})
    if species in base_form_names:
        form["baseName"] = base_form_names[species]
    if regional_type_form or is_gmax or row["identifier"] in requested_same_stat_forms:
        form.update({"sprite": f"{pid}.png", "shinySprite": f"shiny/{pid}.png"})
    forms.setdefault(str(species), []).append(form)

for species, name in ((585, "Deerling"), (586, "Sawsbuck")):
    forms[str(species)] = [{"id":species,"name":f"{name} {season.title()} Form","t1":ptypes[species].get(1),"t2":ptypes[species].get(2),"s":stats[species],"cost":"free","kind":"Change Type","baseName":f"{name} Spring Form","sprite":f"{species}-{season}.png","shinySprite":f"shiny/{species}-{season}.png"} for season in ("summer","autumn","winter")]

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
     "sprite": f"649-{slug}.png",
     "shinySprite": f"shiny/649-{slug}.png"}
    for slug, label, attack in (("douse","Douse","water"), ("shock","Shock","electric"),
                                ("burn","Burn","fire"), ("chill","Chill","ice"))
]

with open("forms.json", "w", encoding="utf-8") as f:
    json.dump(forms, f, ensure_ascii=False, separators=(",", ":"))
print(f"Wrote forms.json: {len(forms)} Pokemon, {sum(map(len, forms.values()))} meaningful forms")
