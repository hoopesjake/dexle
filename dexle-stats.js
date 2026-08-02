(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let regularStats = null;

  const empty = () => ({total_games:0,wins:0,fails:0,win_rate:0,average_guesses:0,current_streak:0,best_streak:0,guess_distribution:{}});
  function dailyRecords() {
    const rows=[];
    try {
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(!/^dexle-daily:\d{4}-\d{2}-\d{2}$/.test(key))continue;
        const value=JSON.parse(localStorage.getItem(key)||"{}");
        rows.push({...value,date:value.date||key.slice(13)});
      }
    } catch(e) {}
    return rows.sort((a,b)=>a.date.localeCompare(b.date));
  }
  function dailySummary() {
    const rows=dailyRecords(),wins=rows.filter(r=>r.won),dates=new Set(rows.map(r=>r.date));
    let best=0,run=0,previous=null;
    rows.forEach(r=>{
      const current=new Date(`${r.date}T12:00:00`);
      run=previous&&Math.round((current-previous)/86400000)===1?run+1:1;
      best=Math.max(best,run);previous=current;
    });
    let current=0,d=new Date();d.setHours(12,0,0,0);
    while(dates.has(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)){current++;d.setDate(d.getDate()-1);}
    const dist={};wins.forEach(r=>dist[r.guesses]=(dist[r.guesses]||0)+1);
    return {total_games:rows.length,wins:wins.length,fails:rows.length-wins.length,win_rate:rows.length?Math.round(wins.length/rows.length*1000)/10:0,average_guesses:wins.length?wins.reduce((n,r)=>n+(+r.guesses||0),0)/wins.length:0,current_streak:current,best_streak:best,guess_distribution:dist};
  }
  function draw(stats) {
    const s=stats||empty();
    const values=[s.total_games,s.wins,s.fails,`${Number(s.win_rate||0)}%`,+s.wins?Number(s.average_guesses).toFixed(2):"-",s.current_streak,s.best_streak];
    [...$("dexleMetrics").children].forEach((el,i)=>el.querySelector("b").textContent=values[i]);
    const dist=s.guess_distribution||{},max=Math.max(1,...Array.from({length:10},(_,i)=>+(dist[i+1]||0)));
    $("guessChart").innerHTML=Array.from({length:10},(_,i)=>{
      const guess=i+1,count=+(dist[guess]||0),width=count?Math.max(3,count/max*100):0;
      return `<div class="guess-row"><span class="guess-label">${guess} guess${guess===1?"":"es"}</span><div class="guess-track" title="${count} win${count===1?"":"s"}"><div class="guess-fill" style="width:${width}%"></div></div><span class="guess-count">${count}</span></div>`;
    }).join("");
  }
  function selectMode(mode) {
    document.querySelectorAll("[data-stat-mode]").forEach(b=>{const on=b.dataset.statMode===mode;b.classList.toggle("on",on);b.setAttribute("aria-selected",on);});
    const daily=mode==="daily";
    $("statsEyebrow").textContent=daily?"Once-a-day record":"Guessing-game record";
    $("statsTitle").textContent=daily?"Your Daily Challenge progress":"Your Dexle progress";
    $("statsCopy").textContent=daily?"Your daily catches, failures, participation streak, and guess distribution.":"Your unlimited-game catches, failures, win streaks, and guess distribution.";
    $("currentStreakLabel").textContent=daily?"Daily streak":"Current streak";
    draw(daily?dailySummary():regularStats);
  }
  async function init() {
    selectMode("daily");
    if(window.DexleStats?.configured){try{regularStats=await DexleStats.personalDexleSummary();}catch(err){regularStats=empty();}}else regularStats=empty();
    document.querySelectorAll("[data-stat-mode]").forEach(b=>b.onclick=()=>selectMode(b.dataset.statMode));
  }
  init();
})();
