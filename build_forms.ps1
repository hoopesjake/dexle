$pokemon = Import-Csv pokemon.csv
$byId = @{}; foreach ($p in $pokemon) { $byId[[int]$p.id] = $p }
$typeNames = @{}; Import-Csv types.csv | ForEach-Object { $typeNames[$_.id] = $_.identifier }
$stats = @{}; foreach ($r in (Import-Csv pokemon_stats.csv)) {
  $sid = [int]$r.stat_id; $pokeId = [int]$r.pokemon_id
  if ($sid -gt 6) { continue }
  if (-not $stats.ContainsKey($pokeId)) { $stats[$pokeId] = @(0,0,0,0,0,0) }
  $stats[$pokeId][$sid - 1] = [int]$r.base_stat
}
$types = @{}; foreach ($r in (Import-Csv pokemon_types.csv)) {
  $pokeId = [int]$r.pokemon_id
  if (-not $types.ContainsKey($pokeId)) { $types[$pokeId] = @{} }
  $types[$pokeId][[int]$r.slot] = $typeNames[$r.type_id]
}
function FormName([string]$id) {
  $special = @{
    'greninja-ash'="Ash's Greninja"; 'giratina-origin'='Giratina Origin Forme';
    'keldeo-resolute'='Keldeo Resolute Form'; 'dialga-origin'='Dialga Origin Forme';
    'palkia-origin'='Palkia Origin Forme'; 'rillaboom-gmax'='Gigantamax Rillaboom';
    'cinderace-gmax'='Gigantamax Cinderace'; 'inteleon-gmax'='Gigantamax Inteleon';
    'meloetta-pirouette'='Meloetta Pirouette Forme'; 'kyurem-black'='Black Kyurem'; 'kyurem-white'='White Kyurem';
    'tornadus-therian'='Tornadus Therian Forme'; 'thundurus-therian'='Thundurus Therian Forme'; 'landorus-therian'='Landorus Therian Forme'; 'enamorus-therian'='Enamorus Therian Forme';
    'aegislash-blade'='Aegislash Blade Forme'; 'zygarde-10'='Zygarde 10% Forme'; 'zygarde-10-power-construct'='Zygarde 10% Forme'; 'zygarde-50-power-construct'='Zygarde 50% Forme'; 'zygarde-complete'='Zygarde Complete Forme';
    'oricorio-pom-pom'='Oricorio Pom-Pom Style'; 'oricorio-pau'="Oricorio P'au Style"; 'oricorio-sensu'='Oricorio Sensu Style'; 'lycanroc-midnight'='Lycanroc Midnight Form'; 'lycanroc-dusk'='Lycanroc Dusk Form';
    'wishiwashi-school'='Wishiwashi School Form'; 'necrozma-dusk'='Necrozma Dusk Mane'; 'necrozma-dawn'='Necrozma Dawn Wings'; 'necrozma-ultra'='Ultra Necrozma';
    'tauros-paldea-combat-breed'='Paldean Tauros Combat Breed'; 'tauros-paldea-blaze-breed'='Paldean Tauros Blaze Breed'; 'tauros-paldea-aqua-breed'='Paldean Tauros Aqua Breed';
    'palafin-hero'='Palafin Hero Form'; 'maushold-family-of-three'='Maushold Family of Three'; 'squawkabilly-blue-plumage'='Squawkabilly Blue Plumage'; 'squawkabilly-yellow-plumage'='Squawkabilly Yellow Plumage'; 'squawkabilly-white-plumage'='Squawkabilly White Plumage';
    'cramorant-gulping'='Cramorant Gulping Form'; 'cramorant-gorging'='Cramorant Gorging Form'; 'morpeko-hangry'='Morpeko Hangry Mode';
    'toxtricity-amped-gmax'='Gigantamax Toxtricity (Amped)'; 'toxtricity-low-key-gmax'='Gigantamax Toxtricity (Low Key)'
  }
  if ($special.ContainsKey($id)) { return $special[$id] }
  if ($id -eq 'calyrex-ice') { return 'Calyrex Ice Rider' }
  if ($id -eq 'calyrex-shadow') { return 'Calyrex Shadow Rider' }
  if ($id.StartsWith('rotom-')) { return "$((Get-Culture).TextInfo.ToTitleCase($id.Substring(6))) Rotom" }
  if ($id.StartsWith('castform-')) { return "Castform $((Get-Culture).TextInfo.ToTitleCase($id.Substring(9))) Form" }
  if ($id.StartsWith('minior-') -and -not $id.EndsWith('-meteor')) { return "Minior $((Get-Culture).TextInfo.ToTitleCase($id.Split('-')[1])) Core" }
  if ($id.EndsWith('-gmax')) { $label=$id.Substring(0,$id.Length-5).Replace('-amped','').Replace('-low-key','').Replace('-',' '); return "Gigantamax $((Get-Culture).TextInfo.ToTitleCase($label))" }
  $name = (Get-Culture).TextInfo.ToTitleCase($id.Replace('-', ' '))
  foreach ($pair in @(@('Galar','Galarian'),@('Alola','Alolan'),@('Hisui','Hisuian'),@('Paldea','Paldean'))) {
    $name = $name.Replace("$($pair[0]) ", "$($pair[1]) ")
    if ($name.EndsWith(" $($pair[0])")) { $name = "$($pair[1]) " + $name.Substring(0, $name.Length - $pair[0].Length - 1) }
  }
  return $name
}
$forms = [ordered]@{}
$requestedSameStatForms = @('keldeo-resolute','cramorant-gulping','cramorant-gorging','morpeko-hangry','maushold-family-of-three','squawkabilly-blue-plumage','squawkabilly-yellow-plumage','squawkabilly-white-plumage','minior-orange-meteor','minior-yellow-meteor','minior-green-meteor','minior-blue-meteor','minior-indigo-meteor','minior-violet-meteor')
$baseFormNames=@{351='Castform Normal Form';479='Rotom';585='Deerling Spring Form';586='Sawsbuck Spring Form';641='Tornadus Incarnate Forme';642='Thundurus Incarnate Forme';645='Landorus Incarnate Forme';646='Kyurem';648='Meloetta Aria Forme';681='Aegislash Shield Forme';718='Zygarde 50% Forme';741='Oricorio Baile Style';745='Lycanroc Midday Form';746='Wishiwashi Solo Form';774='Minior Meteor Form';800='Necrozma';845='Cramorant';877='Morpeko Full Belly Mode';905='Enamorus Incarnate Forme';925='Maushold Family of Four';931='Squawkabilly Green Plumage';964='Palafin Zero Form'}
foreach ($p in $pokemon) {
  $pokeId = [int]$p.id; $species = [int]$p.species_id
  if ($pokeId -le 1025 -or $species -gt 1025 -or $p.identifier -in @('zygarde-10-power-construct','zygarde-50-power-construct') -or $p.identifier -match 'mega|primal|totem') { continue }
  if (-not $byId.ContainsKey($species) -or -not $stats.ContainsKey($pokeId) -or -not $stats.ContainsKey($species)) { continue }
  # Compare stat slots in order; Compare-Object treats arrays as unordered sets
  # and misses redistributions such as Giratina, Dialga, and Palkia Origin Forme.
  $statChange = ($stats[$pokeId] -join ',') -ne ($stats[$species] -join ',')
  $alt1 = [string]$types[$pokeId][1]; $alt2 = [string]$types[$pokeId][2]
  $base1 = [string]$types[$species][1]; $base2 = [string]$types[$species][2]
  $altTypes = @($alt1, $alt2)
  $typeChange = $alt1 -ne $base1 -or $alt2 -ne $base2
  $isGmax=$p.identifier.EndsWith('-gmax')
  if (-not $statChange -and -not $typeChange -and -not $isGmax -and $p.identifier -notin $requestedSameStatForms) { continue }
  $key = [string]$species; if (-not $forms.Contains($key)) { $forms[$key] = @() }
  $regionalTypeForm = $p.identifier.EndsWith('-alola') -or $p.identifier.EndsWith('-hisui')
  $isEternamax=$p.identifier -eq 'eternatus-eternamax'
  $form = [ordered]@{id=$pokeId;name=(FormName $p.identifier);t1=$altTypes[0];t2=$altTypes[1];s=$stats[$pokeId];cost=if($isGmax -or $isEternamax){'power'}else{'free'};kind=if($isGmax){'Gigantamax'}elseif($isEternamax){'Eternamax'}else{'Change Type'}}
  if ($isGmax) { $form.gmax=$true; $form.hpMultiplier=2 }
  if ($baseFormNames.ContainsKey($species)) { $form.baseName=$baseFormNames[$species] }
  if ($regionalTypeForm -or $isGmax -or $p.identifier -in $requestedSameStatForms) { $form.sprite="$pokeId.png"; $form.shinySprite="shiny/$pokeId.png" }
  $forms[$key] += $form
}
foreach($entry in @(@(585,'Deerling'),@(586,'Sawsbuck'))){$species=[int]$entry[0];$name=$entry[1];$list=@();foreach($season in @('summer','autumn','winter')){$title=(Get-Culture).TextInfo.ToTitleCase($season);$list += [ordered]@{id=$species;name="$name $title Form";t1=[string]$types[$species][1];t2=[string]$types[$species][2];s=$stats[$species];cost='free';kind='Change Type';baseName="$name Spring Form";sprite="$species-$season.png";shinySprite="shiny/$species-$season.png"}};$forms[[string]$species]=$list}
$allTypes = @('normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy')
foreach ($entry in @(@(493,'Arceus'),@(773,'Silvally'))) {
  $species=[int]$entry[0]; $name=$entry[1]; $list=@()
  foreach ($type in $allTypes) { if ($type -ne $types[$species][1]) { $list += [ordered]@{id=$species;name="$name ($((Get-Culture).TextInfo.ToTitleCase($type)))";t1=$type;t2=$null;s=$stats[$species];cost='free';kind='Change Type';sprite="$species-$type.png";shinySprite="shiny/$species-$type.png"} } }
  $forms[[string]$species]=$list
}
# Genesect's Drives do not alter its stats or Bug/Steel defensive typing.
# They only give Techno Blast an additional offensive attack type.
$genesectDrives = @(
  @('douse','Douse','water'), @('shock','Shock','electric'),
  @('burn','Burn','fire'), @('chill','Chill','ice')
)
$forms['649'] = @($genesectDrives | ForEach-Object {
  $slug=$_[0]; $label=$_[1]; $attack=$_[2]
  [ordered]@{id=649;name="Genesect $label Drive";t1='bug';t2='steel';s=$stats[649];cost='free';kind='Change Drive';drive=$true;driveName="$label Drive";attackType=$attack;sprite="649-$slug.png";shinySprite="shiny/649-$slug.png"}
})
$forms | ConvertTo-Json -Depth 8 -Compress | Set-Content -LiteralPath forms.json -Encoding utf8
Write-Output "Wrote forms.json: $($forms.Count) Pokemon"
