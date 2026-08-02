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
  if ($id -eq 'calyrex-ice') { return 'Calyrex Ice Rider' }
  if ($id -eq 'calyrex-shadow') { return 'Calyrex Shadow Rider' }
  $name = (Get-Culture).TextInfo.ToTitleCase($id.Replace('-', ' '))
  foreach ($pair in @(@('Galar','Galarian'),@('Alola','Alolan'),@('Hisui','Hisuian'),@('Paldea','Paldean'))) {
    $name = $name.Replace("$($pair[0]) ", "$($pair[1]) ")
    if ($name.EndsWith(" $($pair[0])")) { $name = "$($pair[1]) " + $name.Substring(0, $name.Length - $pair[0].Length - 1) }
  }
  return $name
}
$forms = [ordered]@{}
foreach ($p in $pokemon) {
  $pokeId = [int]$p.id; $species = [int]$p.species_id
  if ($pokeId -le 1025 -or $species -gt 1025 -or $p.identifier -match 'mega|primal|totem') { continue }
  if (-not $byId.ContainsKey($species) -or -not $stats.ContainsKey($pokeId) -or -not $stats.ContainsKey($species)) { continue }
  $statChange = (Compare-Object $stats[$pokeId] $stats[$species]).Count -gt 0
  $alt1 = [string]$types[$pokeId][1]; $alt2 = [string]$types[$pokeId][2]
  $base1 = [string]$types[$species][1]; $base2 = [string]$types[$species][2]
  $altTypes = @($alt1, $alt2)
  $typeChange = $alt1 -ne $base1 -or $alt2 -ne $base2
  if (-not $statChange -and -not $typeChange) { continue }
  $key = [string]$species; if (-not $forms.Contains($key)) { $forms[$key] = @() }
  $regionalTypeForm = $p.identifier.EndsWith('-alola') -or $p.identifier.EndsWith('-hisui')
  $form = [ordered]@{id=$pokeId;name=(FormName $p.identifier);t1=$altTypes[0];t2=$altTypes[1];s=$stats[$pokeId];cost=if($regionalTypeForm -or -not $statChange){'free'}else{'power'};kind=if($regionalTypeForm -or -not $statChange){'Change Type'}else{'Form Change'}}
  if ($regionalTypeForm) { $form.sprite="$pokeId.png"; $form.shinySprite="shiny/$pokeId.png" }
  $forms[$key] += $form
}
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
  [ordered]@{id=649;name="Genesect $label Drive";t1='bug';t2='steel';s=$stats[649];cost='free';kind='Change Drive';drive=$true;driveName="$label Drive";attackType=$attack;sprite="other/home/649-$slug.png";shinySprite="other/home/shiny/649-$slug.png"}
})
$forms | ConvertTo-Json -Depth 8 -Compress | Set-Content -LiteralPath forms.json -Encoding utf8
Write-Output "Wrote forms.json: $($forms.Count) Pokemon"
