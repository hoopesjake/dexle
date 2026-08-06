(async()=>{
  const $=id=>document.getElementById(id);
  document.querySelector(".unlock-panel")?.insertAdjacentHTML("afterbegin",'<a class="unlimited-back" href="index.html" aria-label="Back to Dexle home" title="Back to home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></a>');
  try{
    const [runs,dex]=await Promise.all([DexleStats.personalRuns(),DexleStats.shinyDex()]);
    const baseShinies=new Set(dex.filter(x=>String(x.form_key).startsWith("base:")).map(x=>x.base_id)).size;
    const regions=new Set(runs.filter(r=>r.mode==="region"&&r.wins===r.total).map(r=>+r.region)).size;
    const gauntlet=runs.some(r=>r.mode==="gauntlet"&&r.wins===r.total);
    const checks=[["Collect 100 unique shinies",baseShinies,100],["Beat all 9 Region Challenges flawlessly",regions,9],["Complete the 121–0 Gauntlet",gauntlet?1:0,1]];
    const open=checks.every(x=>x[1]>=x[2]);
    $("unlockTitle").textContent=open?"Unlimited Mode Unlocked":"Unlimited Mode Locked";
    $("unlockRequirements").innerHTML=checks.map(x=>`<div class="${x[1]>=x[2]?"done":""}"><b>${x[0]}</b><span>${Math.min(x[1],x[2])}/${x[2]}</span></div>`).join("");
    $("unlimitedModes").hidden=!open;$("unlimitedStats").hidden=!open;
  }catch(e){$("unlockTitle").textContent="Sign in to check Unlimited Mode";$("unlockRequirements").innerHTML='<a href="account.html">Open your Trainer Account</a>';}
})();
