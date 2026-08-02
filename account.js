(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const REGIONS={1:"Kanto",2:"Johto",3:"Hoenn",4:"Sinnoh",5:"Unova",6:"Kalos",7:"Alola",8:"Galar",9:"Paldea"};
  const sprite=(id,shiny=true)=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shiny?"shiny/":""}${id}.png`;
  const savedSprite=m=>{if(+m.id===10301)return"assets/megas/mega-zygarde.png";const custom=m.shiny?m.shiny_sprite:m.sprite;return custom?`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${custom}`:sprite(m.id,m.shiny);};
  const CANDY_ICON="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/rare-candy.png";
  const TYPE_COLOR={normal:"#9FA19F",fire:"#E62829",water:"#2980EF",electric:"#FAC000",grass:"#3FA129",ice:"#3DCEF3",fighting:"#FF8000",poison:"#9141CB",ground:"#915121",flying:"#81B9EF",psychic:"#EF4179",bug:"#91A119",rock:"#AFA981",ghost:"#704170",dragon:"#5060E1",dark:"#50413F",steel:"#60A1B8",fairy:"#EF70EF"};
  const STAT_NAMES=["HP","Attack","Defense","Sp. Atk","Sp. Def","Speed"];
  let authMode="create",hallMode="region",dex=[],pokemon=[],forms={},megas={},dexVisible=27;
  const message=(text,error=false)=>{
    if(error&&/email.*rate limit|rate limit.*email/i.test(text))text="Supabase has temporarily reached its email limit. Please wait before trying email signup again.";
    const id=error?"accountError":"accountMessage";
    let el=$(id);
    // Protect against GitHub Pages briefly mixing cached HTML with new JS.
    if(!el){
      el=document.createElement("div");
      el.id=id;
      el.className=`account-message${error?" error":""}`;
      document.querySelector(".wrap")?.prepend(el);
    }
    el.textContent=text;
    el.hidden=!text;
    const other=$(error?"accountMessage":"accountError");
    if(text&&other)other.hidden=true;
  };
  const teamHtml=team=>`<div class="team">${team.map(m=>`<span class="mon ${m.mega?"mega":""} ${m.type_form?"type-form":""} ${m.shiny?"shiny":""} ${m.candy?"candy":""}"><img src="${savedSprite(m)}" alt="${m.name}" onerror="this.onerror=null;this.src='${sprite(m.base_id||m.id,m.shiny)}'">${m.candy?`<span class="candy-mark"><img src="${CANDY_ICON}" alt="Rare Candy"></span>`:""}${m.mega?'<span class="mega-mark">&#9672;</span>':""}${m.type_form?'<span class="type-form-mark">&#9671;</span>':""}${m.shiny?'<span class="shiny-mark">&#10022;</span>':""}</span>`).join("")}</div>`;
  function setAuthMode(mode){authMode=mode;[...$("authTabs").children].forEach(b=>b.classList.toggle("on",b.dataset.auth===mode));$("usernameWrap").hidden=mode!=="create";$("authUsername").required=mode==="create";$("authPassword").autocomplete=mode==="create"?"new-password":"current-password";$("authTitle").textContent=mode==="create"?"Create your account":"Welcome back";$("authCopy").textContent=mode==="create"?"Your runs already saved on this device will stay with you.":"Sign in to bring your account and collection onto this device.";$("authSubmit").textContent=mode==="create"?"Create Account":"Sign In";}
  async function refreshAccount(){const a=await DexleStats.account();$("signedOut").hidden=!a.anonymous;$("signedIn").hidden=a.anonymous;if(!a.anonymous){$("profileName").textContent=a.profile?.username||a.user.user_metadata?.username||"Trainer";$("profileEmail").textContent=a.user.email||"";}return a;}
  const hallCard=r=>`<article class="hall-card flawless"><div class="hall-head"><span class="rankball oak-disc"></span><b>${r.mode==="gauntlet"?"Gauntlet":REGIONS[r.region]}</b><span class="hall-date">${new Date(r.created_at).toLocaleDateString()}</span><div class="team-metrics"><span>Stats <b>${Number(r.team_bst||0).toLocaleString()}</b></span><span>Coverage <b>${r.coverage??0}/18</b></span></div><span class="record"><span class="wins">${r.wins}</span><i>–</i><span class="losses">${r.losses}</span></span></div>${teamHtml(r.team)}</article>`;
  function drawHallTeams(rows,title,gauntlet=false){
    $("hallBadgeView").hidden=true;
    $("hallTeamsView").hidden=false;
    $("hallBack").hidden=gauntlet;
    $("hallDetailTitle").textContent=title;
    $("hallList").classList.toggle("gauntlet-scroll",gauntlet);
    $("hallList").innerHTML=rows.length?rows.map(hallCard).join(""):'<p class="empty">No flawless teams yet.</p>';
  }
  function drawBadges(rows){
    $("hallTeamsView").hidden=true;
    $("hallBadgeView").hidden=false;
    $("badgeGrid").innerHTML=Object.entries(REGIONS).map(([id,name])=>{
      const earned=rows.some(r=>r.region===+id);
      return `<button class="region-badge ${earned?"earned":"locked"}" data-region="${id}" ${earned?"":"disabled"}>
        <span class="badge-disc"><i>${earned?"&#9733;":""}</i></span><b>${name}</b>${earned?"<small>Champion</small>":""}
      </button>`;
    }).join("");
    $("badgeGrid").querySelectorAll(".earned").forEach(b=>b.onclick=()=>{
      const id=+b.dataset.region;
      drawHallTeams(rows.filter(r=>r.region===id),`${REGIONS[id]} flawless teams`);
    });
  }
  async function refreshHall(){
    $("hallBadgeView").hidden=hallMode==="gauntlet";
    $("hallTeamsView").hidden=hallMode!=="gauntlet";
    if(hallMode==="region")$("badgeGrid").innerHTML='<p class="empty">Loading badges…</p>';
    else $("hallList").innerHTML='<p class="empty">Loading flawless runs…</p>';
    try{
      const rows=await DexleStats.hallOfFame(hallMode,null);
      if(hallMode==="region")drawBadges(rows);
      else drawHallTeams(rows,"Flawless Gauntlet teams",true);
    }catch(e){message(e.message,true);}
  }
  function drawDex(){
    const collected=new Map(dex.map(x=>[x.form_key,x]));
    let cards=pokemon.map(p=>{
      const hit=collected.get(`base:${p.id}`);
      return{base:p.id,recent:hit?.last_seen_at||"",html:`<${hit?'button type="button" data-form-key="'+hit.form_key+'"':'div'} class="dex-mon ${hit?"":"locked"}" title="${hit?`View shiny ${p.name} Pokédex entry`:p.name}">${hit?`<img loading="lazy" src="${sprite(p.id)}" alt="${p.name}">`:""}<b>${p.name}</b><small>#${String(p.id).padStart(4,"0")}</small>${hit&&Date.now()-new Date(hit.last_seen_at)<21600000?'<span class="dex-new">New</span>':""}</${hit?'button':'div'}>`};
    });
    dex.filter(x=>x.is_mega||x.pokemon_id!==x.base_id).forEach(x=>cards.push({base:x.base_id,recent:x.last_seen_at,html:`<button type="button" data-form-key="${x.form_key}" class="dex-mon ${x.is_mega?"mega":""}">${x.is_mega?'<span class="dex-gem">&#9672;</span>':""}<img loading="lazy" src="${+x.pokemon_id===10301?'assets/megas/mega-zygarde.png':sprite(x.pokemon_id)}" alt="${x.pokemon_name}" onerror="this.onerror=null;this.src='${sprite(x.base_id)}'"><b>${x.pokemon_name}</b><small>${x.is_mega?"Mega":"Alternate"} form</small></button>`}));
    if($("shinySort").value==="recent")cards.sort((a,b)=>String(b.recent).localeCompare(String(a.recent))||a.base-b.base);else cards.sort((a,b)=>a.base-b.base);
    $("shinyGrid").innerHTML=cards.slice(0,dexVisible).map(x=>x.html).join("");
    $("shinyMore").hidden=dexVisible>=cards.length;
    $("shinyMore").textContent="See more…";
    const bases=new Set(dex.filter(x=>!x.is_mega&&x.pokemon_id===x.base_id).map(x=>x.base_id)).size;
    const forms=dex.filter(x=>x.is_mega||x.pokemon_id!==x.base_id).length;
    $("shinyCount").textContent=`${bases} / 1025`;
    $("formCount").textContent=`${forms} bonus form${forms===1?"":"s"}`;
    $("shinyBar").style.width=`${bases/1025*100}%`;
  }
  const allForms=baseId=>[...(forms[String(baseId)]||[]),...(megas[String(baseId)]||[])];
  function openShinyEntry(record){
    const base=pokemon.find(p=>+p.id===+record.base_id);
    if(!base)return;
    const catalog=allForms(record.base_id);
    const form=catalog.find(f=>+f.id===+record.pokemon_id&&f.name===record.pokemon_name)||catalog.find(f=>+f.id===+record.pokemon_id);
    const p=form?{...base,...form}:base;
    const stats=p.s||base.s;
    const custom=form?.shinySprite;
    const image=+record.pokemon_id===10301?"assets/megas/mega-zygarde.png":custom?`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${custom}`:sprite(record.pokemon_id);
    const caught=new Date(record.first_seen_at||record.last_seen_at).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});
    const chips=[p.t1,p.t2].filter(Boolean).map(t=>`<span style="background:${TYPE_COLOR[t]||'#687086'}">${t}</span>`).join("");
    $("shinyEntryBody").innerHTML=`<div class="shiny-entry-hero"><img src="${image}" alt="Shiny ${record.pokemon_name}" onerror="this.onerror=null;this.src='${sprite(record.base_id)}'"><div><p class="eyebrow">Caught ${caught}</p><h2 id="shinyEntryName">${record.pokemon_name}</h2><div class="shiny-entry-types">${chips}</div></div></div><p class="shiny-entry-description">${base.desc}</p><div class="shiny-entry-stats">${stats.map((v,i)=>`<div><small>${STAT_NAMES[i]}</small><b>${v}</b></div>`).join("")}<div class="total"><small>Total</small><b>${stats.reduce((a,b)=>a+b,0)}</b></div></div>`;
    $("shinyEntryModal").hidden=false;
  }
  function closeShinyEntry(){$("shinyEntryModal").hidden=true;}
  async function refreshDex(){try{dex=await DexleStats.shinyDex();drawDex();}catch(e){message(e.message,true);}}
  function drawCharm(unlocked){const charm=$("shinyCharm");charm.classList.toggle("locked",!unlocked);$("shinyCharmStatus").textContent=unlocked?"5% to 10%":"Locked";charm.setAttribute("aria-label",unlocked?"Shiny Charm unlocked. Shiny odds increased from 5% to 10%.":"Shiny Charm locked. View requirements.");}
  async function refreshCharm(){try{drawCharm(await DexleStats.shinyCharmUnlocked());}catch(e){drawCharm(false);}}
  async function init(){if(!DexleStats.configured)return message("Connect Supabase before using accounts.",true);try{[pokemon,forms,megas]=await Promise.all([fetch("pokedex.json").then(r=>r.json()),fetch("forms.json").then(r=>r.json()),fetch("megas.json").then(r=>r.json())]);await refreshAccount();await Promise.all([refreshHall(),refreshDex(),refreshCharm()]);}catch(e){message(e.message,true);}}
  $("authTabs").onclick=e=>{const b=e.target.closest("[data-auth]");if(b)setAuthMode(b.dataset.auth);};
  $("authForm").onsubmit=async e=>{e.preventDefault();$("authSubmit").disabled=true;try{if(authMode==="create"){await DexleStats.createAccount($("authEmail").value,$("authPassword").value,$("authUsername").value);message("Account created. Check your email if confirmation is enabled.");}else{await DexleStats.signIn($("authEmail").value,$("authPassword").value);message("Signed in successfully.");}await refreshAccount();await Promise.all([refreshHall(),refreshDex(),refreshCharm()]);}catch(err){message(err.message,true);}finally{$("authSubmit").disabled=false;}};
  $("signOut").onclick=async()=>{await DexleStats.signOut();location.reload();};
  $("hallTabs").onclick=e=>{const b=e.target.closest("[data-mode]");if(!b)return;hallMode=b.dataset.mode;[...$("hallTabs").children].forEach(x=>x.classList.toggle("on",x===b));refreshHall();};
  $("hallBack").onclick=refreshHall;$("shinySort").onchange=()=>{dexVisible=27;drawDex();};$("shinyMore").onclick=()=>{dexVisible+=27;drawDex();};setAuthMode("create");init();
  $("shinyGrid").onclick=e=>{const card=e.target.closest("[data-form-key]");if(card)openShinyEntry(dex.find(x=>x.form_key===card.dataset.formKey));};
  $("shinyEntryClose").onclick=closeShinyEntry;
  $("shinyEntryModal").onclick=e=>{if(e.target.id==="shinyEntryModal")closeShinyEntry();};
  $("shinyCharm").onclick=()=>{$("charmModal").hidden=false;};
  $("charmModalClose").onclick=()=>{$("charmModal").hidden=true;};
  $("charmModal").onclick=e=>{if(e.target.id==="charmModal")$("charmModal").hidden=true;};
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){$("charmModal").hidden=true;closeShinyEntry();}});
})();
