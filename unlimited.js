(async()=>{
  const $=id=>document.getElementById(id);
  document.querySelector(".unlock-panel")?.insertAdjacentHTML("afterbegin",'<a class="unlimited-back" href="index.html" aria-label="Back to Dexle home" title="Back to home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></a>');
  $("unlimitedStats").innerHTML='<p class="unlimited-eyebrow">Personal records</p><h2>Unlimited Trainer Stats</h2><p>Review your strongest teams, most-used Pokémon, community records, flawless runs, and recent Unlimited teams.</p><a class="unlimited-stats-link" href="stats.html?view=unlimited">Open Unlimited Trainer Stats</a>';
  try{
    const [runs,dex]=await Promise.all([DexleStats.personalRuns(),DexleStats.shinyDex()]);
    const uniqueShinies=new Set(dex.map(x=>x.form_key)).size;
    const regions=new Set(runs.filter(r=>r.mode==="region"&&r.wins===r.total).map(r=>+r.region)).size;
    const gauntlet=runs.some(r=>r.mode==="gauntlet"&&r.wins===r.total);
    const checks=[["Collect 100 unique shinies",uniqueShinies,100],["Beat all 9 Region Challenges flawlessly",regions,9],["Complete the 121–0 Gauntlet",gauntlet?1:0,1]];
    const open=checks.every(x=>x[1]>=x[2]);
    $("unlockTitle").textContent=open?"Unlimited Mode":"Unlimited Mode Locked";
    document.querySelector(".unlock-copy").textContent=open?"Take your Pokémon to the next level!":"Complete all three requirements to open Dexle's most demanding challenges.";
    $("unlockRequirements").innerHTML=checks.map(x=>`<div class="${x[1]>=x[2]?"done":""}"><b>${x[0]}</b><span>${Math.min(x[1],x[2])}/${x[2]}</span></div>`).join("");
    document.querySelector(".unlock-panel").classList.toggle("unlocked",open);
    $("unlimitedModes").hidden=!open;$("unlimitedStats").hidden=!open;
    if(!open&&new URLSearchParams(location.search).has("locked"))$("unlockTitle").textContent="Unlimited Mode Is Still Locked";
  }catch(e){$("unlockTitle").textContent="Sign in to check Unlimited Mode";$("unlockRequirements").innerHTML='<a href="account.html">Open your Trainer Account</a>';}
})();
