(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const REGIONS={1:"Kanto",2:"Johto",3:"Hoenn",4:"Sinnoh",5:"Unova",6:"Kalos",7:"Alola",8:"Galar",9:"Paldea"};
  const sprite=(id,shiny=true)=>`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shiny?"shiny/":""}${id}.png`;
  const savedSprite=m=>{if(+m.id===10301)return"assets/megas/mega-zygarde.png";const custom=m.shiny?m.shiny_sprite:m.sprite;return custom?`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${custom}`:sprite(m.id,m.shiny);};
  const CANDY_ICON="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/rare-candy.png";
  const TYPE_COLOR={normal:"#9FA19F",fire:"#E62829",water:"#2980EF",electric:"#FAC000",grass:"#3FA129",ice:"#3DCEF3",fighting:"#FF8000",poison:"#9141CB",ground:"#915121",flying:"#81B9EF",psychic:"#EF4179",bug:"#91A119",rock:"#AFA981",ghost:"#704170",dragon:"#5060E1",dark:"#50413F",steel:"#60A1B8",fairy:"#EF70EF"};
  const STAT_NAMES=["HP","Attack","Defense","Sp. Atk","Sp. Def","Speed"];
  let hallMode="region",dex=[],pokemon=[],forms={},megas={},dexVisible=27,selectedAvatar=null,currentAccount=null;
  const avatarSprite=a=>{const custom=a?.shiny?(a.shiny_sprite||a.shinySprite):(a?.sprite);return custom?`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${custom}`:sprite(a?.id||0,!!a?.shiny);};
  function avatarCatalog(){return pokemon.flatMap(base=>[{...base,base_id:base.id},...[...(forms[String(base.id)]||[]),...(megas[String(base.id)]||[])].map(f=>({...base,...f,base_id:base.id}))]);}
  function renderAvatarChoice(id,a){const el=$(id);if(!el)return;el.innerHTML=a?`<img class="profile-avatar" src="${avatarSprite(a)}" onerror="this.onerror=null;this.src='${sprite(a.base_id||a.id,a.shiny)}'"><span><b>${a.name}</b>${a.shiny?" · Shiny":""}</span><button type="button" class="avatar-remove" aria-label="Remove selected Pokémon">&times;</button>`:'<span class="rankball avatar-placeholder" style="--rc:#E0483C"></span><span>No sprite selected</span>';}
  function syncProfileAvatar(a){
    const src=a?avatarSprite(a):"";
    const header=$("profileHeaderAvatar");
    if(header)header.outerHTML=a?`<img id="profileHeaderAvatar" class="profile-header-avatar profile-avatar" src="${src}" alt="${a.name}">`:'<span id="profileHeaderAvatar" class="rankball avatar-placeholder profile-header-avatar" style="--rc:#E0483C" aria-hidden="true"></span>';
    document.querySelectorAll(".trainer-identity").forEach(identity=>{const old=identity.firstElementChild;if(!old)return;old.outerHTML=a?`<img class="trainer-avatar" src="${src}" alt="${a.name}">`:'<span class="rankball trainer-avatar-placeholder" style="--rc:#E0483C"></span>';});
  }
  function wireAvatarSearch(inputId,shinyId,resultsId,choiceId,persist){
    const input=$(inputId),toggle=$(shinyId),results=$(resultsId),choiceEl=$(choiceId);if(!input)return;
    const dirty=()=>{if(persist)$("profileAvatarSave").hidden=false;};
    choiceEl.onclick=async e=>{if(!e.target.closest(".avatar-remove"))return;selectedAvatar=null;renderAvatarChoice(choiceId,null);if(persist){try{currentAccount.profile=await DexleStats.updateAvatar(null);syncProfileAvatar(null);$("profileAvatarSave").hidden=true;setAvatarEditorCollapsed(true);message("Profile sprite removed.");}catch(err){message(err.message,true);}}};
    const draw=()=>{const q=String(input.value||"").trim().toLowerCase();if(q.length<2){results.innerHTML="";return;}const shiny=toggle.checked;const hits=avatarCatalog().filter(p=>p.name.toLowerCase().includes(q)).slice(0,30);results.innerHTML=hits.map((p,i)=>`<button type="button" class="avatar-result" data-avatar="${i}"><img src="${avatarSprite({...p,shiny})}" onerror="this.onerror=null;this.src='${sprite(p.base_id||p.id,shiny)}'"><small>${p.name}</small></button>`).join("");results.onclick=e=>{const b=e.target.closest("[data-avatar]");if(!b)return;selectedAvatar={...hits[+b.dataset.avatar],shiny};renderAvatarChoice(choiceId,selectedAvatar);results.innerHTML="";input.value="";dirty();};};
    input.oninput=draw;toggle.onchange=()=>{if(selectedAvatar){selectedAvatar={...selectedAvatar,shiny:toggle.checked};renderAvatarChoice(choiceId,selectedAvatar);dirty();}draw();};
  }
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
  const teamHtml=team=>`<div class="team">${team.map(m=>`<span class="mon ${m.mega?"mega":""} ${m.type_form?"type-form":""} ${m.shiny?"shiny":""} ${m.shadow?"shadow":""} ${m.candy?"candy":""}"><img src="${savedSprite(m)}" alt="${m.name}" onerror="this.onerror=null;this.src='${sprite(m.base_id||m.id,m.shiny)}'">${m.candy?`<span class="candy-mark"><img src="${CANDY_ICON}" alt="Rare Candy"></span>`:""}${m.mega?'<span class="mega-mark">&#9672;</span>':""}${m.type_form?'<span class="type-form-mark">&#9671;</span>':""}${m.shiny?'<span class="shiny-mark">&#10022;</span>':""}</span>`).join("")}</div>`;
  function setAvatarEditorCollapsed(collapsed){$("profileAvatarEditor").classList.toggle("collapsed",collapsed);$("profileAvatarChange").textContent=currentAccount?.profile?.avatar?"Change Profile Sprite":"Select Profile Sprite";}
  async function refreshAccount(){const a=await DexleStats.account();currentAccount=a;$("signedOut").hidden=!a.anonymous;$("signedIn").hidden=a.anonymous;if(!a.anonymous){$("profileName").textContent=a.profile?.username||a.user.user_metadata?.username||"Trainer";$("profileEmail").textContent=a.user.email||"";selectedAvatar=a.profile?.avatar||null;renderAvatarChoice("profileAvatarChoice",selectedAvatar);syncProfileAvatar(selectedAvatar);setAvatarEditorCollapsed(true);}return a;}
  const hallCard=r=>`<article class="hall-card flawless"><div class="hall-head"><span class="rankball oak-disc"></span><b>${r.mode==="team_rocket_gauntlet"?"Shadow Challenge":r.mode==="gauntlet"?"Gauntlet":REGIONS[r.region]}</b><span class="hall-date">${new Date(r.created_at).toLocaleDateString()}</span><div class="team-metrics"><span>Stats <b>${Number(r.team_bst||0).toLocaleString()}</b></span><span>Coverage <b>${r.coverage??0}/18</b></span></div><span class="record"><span class="wins">${r.wins}</span><i>–</i><span class="losses">${r.losses}</span></span></div>${teamHtml(r.team)}</article>`;
  function masteryTier(count){
    if(count>=25)return{key:"ultimate",name:"Shadow Ultimate",target:25,next:"Maximum tier"};
    if(count>=10)return{key:"ethereal",name:"Ethereal",target:25,next:"Shadow Ultimate at 25"};
    if(count>=5)return{key:"diamond",name:"Diamond",target:10,next:"Ethereal at 10"};
    return{key:"champion",name:count?"Champion":"Unranked",target:5,next:"Diamond at 5"};
  }
  function masteryHtml(count,compact=false){const tier=masteryTier(count),shown=Math.min(count,tier.target),pct=tier.key==="ultimate"?100:shown/tier.target*100;return `<div class="mastery-badge ${tier.key}"><span class="mastery-gem">&#9733;</span><span><b>${tier.name}</b><small>${count} flawless ${count===1?"run":"runs"}${compact?"":` · ${tier.next}`}</small></span></div><div class="mastery-slicer"><i style="width:${pct}%"></i></div><strong>${tier.key==="ultimate"?"25 / 25":`${shown} / ${tier.target}`}</strong>`;}
  function drawHallTeams(rows,title,gauntlet=false,regionId=null){
    $("hallBadgeView").hidden=true;
    $("hallTeamsView").hidden=false;
    $("hallBack").hidden=gauntlet;
    $("hallDetailTitle").textContent=title;
    $("regionMastery").hidden=!regionId;
    if(regionId)$("regionMastery").innerHTML=masteryHtml(rows.length);
    $("hallList").classList.toggle("gauntlet-scroll",gauntlet);
    $("hallList").innerHTML=rows.length?rows.map(hallCard).join(""):'<p class="empty">No flawless teams yet.</p>';
  }
  function drawBadges(rows){
    $("hallTeamsView").hidden=true;
    $("hallBadgeView").hidden=false;
    $("badgeGrid").innerHTML=Object.entries(REGIONS).map(([id,name])=>{
      const count=rows.filter(r=>r.region===+id).length,earned=count>0,tier=masteryTier(count);
      return `<button class="region-badge ${earned?`earned mastery-${tier.key}`:"locked"}" data-region="${id}" ${earned?"":"disabled"}>
        <span class="badge-disc"><i>${earned?"&#9733;":""}</i></span><b>${name}</b>${earned?`<small>${tier.name} · ${count}</small><span class="badge-slicer"><i style="width:${tier.key==="ultimate"?100:Math.min(100,count/tier.target*100)}%"></i></span>`:""}
      </button>`;
    }).join("");
    $("badgeGrid").querySelectorAll(".earned").forEach(b=>b.onclick=()=>{
      const id=+b.dataset.region;
      drawHallTeams(rows.filter(r=>r.region===id),`${REGIONS[id]} flawless teams`,false,id);
    });
  }
  async function refreshHall(){
    const teamMode=hallMode!=="region";
    $("hallBadgeView").hidden=teamMode;
    $("hallTeamsView").hidden=!teamMode;
    if(hallMode==="region")$("badgeGrid").innerHTML='<p class="empty">Loading badges…</p>';
    else $("hallList").innerHTML='<p class="empty">Loading flawless runs…</p>';
    try{
      const rows=await DexleStats.hallOfFame(hallMode,null);
      if(hallMode==="region")drawBadges(rows);
      else drawHallTeams(rows,hallMode==="team_rocket_gauntlet"?"Flawless Shadow teams":"Flawless Gauntlet teams",true);
    }catch(e){message(e.message,true);}
  }
  function drawDex(){
    const collected=new Map(dex.map(x=>[x.form_key,x]));
    let cards=pokemon.map(p=>{
      const hit=collected.get(`base:${p.id}`);
      return{base:p.id,recent:hit?.last_seen_at||"",html:`<${hit?'button type="button" data-form-key="'+hit.form_key+'"':'div'} class="dex-mon ${hit?"":"locked"}" title="${hit?`View shiny ${p.name} Pokédex entry`:p.name}">${hit?`<img loading="lazy" src="${sprite(p.id)}" alt="${p.name}">`:""}<b>${p.name}</b><small>#${String(p.id).padStart(4,"0")}</small>${hit&&Date.now()-new Date(hit.last_seen_at)<21600000?'<span class="dex-new">New</span>':""}</${hit?'button':'div'}>`};
    });
    dex.filter(x=>!String(x.form_key).startsWith("base:")).forEach(x=>cards.push({base:x.base_id,recent:x.last_seen_at,html:`<button type="button" data-form-key="${x.form_key}" class="dex-mon ${x.is_mega?"mega":""}">${x.is_mega?'<span class="dex-gem">&#9672;</span>':""}<img loading="lazy" src="${+x.pokemon_id===10301?'assets/megas/mega-zygarde.png':sprite(x.pokemon_id)}" alt="${x.pokemon_name}" onerror="this.onerror=null;this.src='${sprite(x.base_id)}'"><b>${x.pokemon_name}</b><small>${x.is_mega?"Mega":"Alternate"} form</small></button>`}));
    if($("shinySort").value==="recent")cards.sort((a,b)=>String(b.recent).localeCompare(String(a.recent))||a.base-b.base);else cards.sort((a,b)=>a.base-b.base);
    $("shinyGrid").innerHTML=cards.slice(0,dexVisible).map(x=>x.html).join("");
    $("shinyMore").hidden=dexVisible>=cards.length;
    $("shinyMore").textContent="See more…";
    const bases=new Set(dex.filter(x=>String(x.form_key).startsWith("base:")).map(x=>x.base_id)).size;
    const formCount=new Set(dex.filter(x=>!String(x.form_key).startsWith("base:")).map(x=>x.form_key)).size;
    const total=bases+formCount;
    $("shinyCount").textContent=`${total} / 1,347`;
    $("formCount").textContent=`${bases} / 1,025 base · ${formCount} / 322 bonus`;
    $("shinyBar").style.width=`${total/1347*100}%`;
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
  async function init(){if(!DexleStats.configured)return message("Connect Supabase before using accounts.",true);try{[pokemon,forms,megas]=await Promise.all([fetch("pokedex.json").then(r=>r.json()),fetch("forms.json").then(r=>r.json()),fetch("megas.json").then(r=>r.json())]);wireAvatarSearch("avatarSearch","avatarShiny","avatarResults","avatarChoice",false);wireAvatarSearch("profileAvatarSearch","profileAvatarShiny","profileAvatarResults","profileAvatarChoice",true);await refreshAccount();await Promise.all([refreshHall(),refreshDex(),refreshCharm()]);}catch(e){message(e.message,true);}}
  $("signOut").onclick=async()=>{await DexleStats.signOut();location.reload();};
  $("profileAvatarChange").onclick=()=>{selectedAvatar=currentAccount?.profile?.avatar||null;setAvatarEditorCollapsed(false);renderAvatarChoice("profileAvatarChoice",selectedAvatar);$("profileAvatarShiny").checked=!!selectedAvatar?.shiny;$("profileAvatarSave").hidden=true;$("profileAvatarSearch").focus();};
  $("profileAvatarClose").onclick=()=>{selectedAvatar=currentAccount?.profile?.avatar||null;$("profileAvatarResults").innerHTML="";$("profileAvatarSearch").value="";$("profileAvatarSave").hidden=true;setAvatarEditorCollapsed(true);};
  $("profileAvatarSave").onclick=async()=>{const btn=$("profileAvatarSave");btn.disabled=true;try{currentAccount.profile=await DexleStats.updateAvatar(selectedAvatar);syncProfileAvatar(selectedAvatar);message(selectedAvatar?"Profile sprite saved.":"Profile sprite removed.");$("profileAvatarResults").innerHTML="";$("profileAvatarSearch").value="";$("profileAvatarChoice").innerHTML="";btn.hidden=true;setAvatarEditorCollapsed(true);}catch(err){message(err.message,true);}finally{btn.disabled=false;}};
  $("hallTabs").onclick=e=>{const b=e.target.closest("[data-mode]");if(!b)return;hallMode=b.dataset.mode;[...$("hallTabs").children].forEach(x=>x.classList.toggle("on",x===b));refreshHall();};
  $("hallBack").onclick=refreshHall;$("shinySort").onchange=()=>{dexVisible=27;drawDex();};$("shinyMore").onclick=()=>{dexVisible+=27;drawDex();};init();
  $("shinyGrid").onclick=e=>{const card=e.target.closest("[data-form-key]");if(card)openShinyEntry(dex.find(x=>x.form_key===card.dataset.formKey));};
  $("shinyEntryClose").onclick=closeShinyEntry;
  $("shinyEntryModal").onclick=e=>{if(e.target.id==="shinyEntryModal")closeShinyEntry();};
  $("shinyCharm").onclick=()=>{$("charmModal").hidden=false;};
  $("charmModalClose").onclick=()=>{$("charmModal").hidden=true;};
  $("charmModal").onclick=e=>{if(e.target.id==="charmModal")$("charmModal").hidden=true;};
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){$("charmModal").hidden=true;closeShinyEntry();}});
})();
