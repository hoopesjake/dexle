(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  let regularStats = null;
  let championRows=[];
  const monSprite=m=>{const custom=m.shiny?m.shiny_sprite:m.sprite;return custom?`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${custom}`:`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${m.shiny?"shiny/":""}${m.id}.png`;};
  function streaks(rows){const dates=[...new Set(rows.map(r=>r.challenge_date||r.date))].sort(),set=new Set(dates);let best=0,run=0,prev=null;dates.forEach(s=>{const d=new Date(s+"T12:00:00");run=prev&&Math.round((d-prev)/86400000)===1?run+1:1;best=Math.max(best,run);prev=d;});let current=0,d=new Date();d.setHours(12,0,0,0);while(set.has(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)){current++;d.setDate(d.getDate()-1);}return{current,best};}
  function drawChampion(){const rows=championRows,s=streaks(rows),bestAttempts=rows.length?Math.min(...rows.map(r=>+r.attempts)):null,bestTeam=[...rows].sort((a,b)=>(+b.team_bst||0)-(+a.team_bst||0))[0],vals=[rows.length,rows.length?(rows.reduce((n,r)=>n+(+r.attempts||0),0)/rows.length).toFixed(2):"—",s.current,s.best,bestAttempts||"—",bestTeam?Number(bestTeam.team_bst).toLocaleString():"—"];[...$("championMetrics").children].forEach((el,i)=>el.querySelector("b").textContent=vals[i]);$("championBestTeam").innerHTML=bestTeam?`<b>Highest-stat daily team · ${Number(bestTeam.team_bst).toLocaleString()}</b><div class="champion-team">${(bestTeam.team||[]).map(m=>`<img src="${monSprite(m)}" title="${m.name}${m.shiny?" · Shiny":""}">`).join("")}</div>`:"";$("championHistory").innerHTML=rows.slice(0,10).map(r=>`<article><span><b>${r.champion}</b><small> · ${r.challenge_date||r.date}</small></span><span>${r.attempts} attempt${+r.attempts===1?"":"s"} · ${Number(r.team_bst||0).toLocaleString()} stats</span></article>`).join("")||'<p class="empty">Your Daily Champion victories will appear here.</p>';}

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
    $("dailyChampionStats").hidden=!daily;
    draw(daily?dailySummary():regularStats);
  }
  async function init() {
    selectMode("daily");
    if(window.DexleStats?.configured){try{regularStats=await DexleStats.personalDexleSummary();}catch(err){regularStats=empty();}try{championRows=await DexleStats.dailyChampionHistory();}catch(err){championRows=[];}}else regularStats=empty();drawChampion();
    document.querySelectorAll("[data-stat-mode]").forEach(b=>b.onclick=()=>selectMode(b.dataset.statMode));
  }
  init();
})();
