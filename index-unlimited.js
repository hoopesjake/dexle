(async()=>{
  const card=document.querySelector(".unlimited-home-card"),copy=card?.querySelector("span");
  if(!copy)return;
  const locked="Locked until 100 shinies, all nine Region wins, and a flawless Gauntlet →";
  try{
    if(!window.DexleStats?.configured){copy.textContent=locked;return;}
    const account=await DexleStats.account();
    if(account.anonymous){copy.textContent=locked;return;}
    const [runs,dex]=await Promise.all([DexleStats.personalRuns(),DexleStats.shinyDex()]);
    const shinies=new Set(dex.map(x=>x.form_key)).size;
    const regions=new Set(runs.filter(r=>r.mode==="region"&&r.wins===r.total).map(r=>+r.region)).size;
    const gauntlet=runs.some(r=>r.mode==="gauntlet"&&r.wins===r.total);
    copy.textContent=shinies>=100&&regions>=9&&gauntlet
      ? "Take your Pokémon to the next level! →"
      : locked;
  }catch(error){copy.textContent=locked;}
  finally{copy.hidden=false;}
})();
