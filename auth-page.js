(async()=>{
  "use strict";
  const $=id=>document.getElementById(id),signup=document.body.dataset.authPage==="signup";
  const root="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";
  let pokemon=[],forms={},megas={},avatar=null;
  const msg=(text,error=false)=>{const el=$("authPageMessage");el.textContent=text;el.classList.toggle("error",error);el.hidden=!text;};
  const sprite=a=>{const custom=a.shiny?(a.shinySprite||a.shiny_sprite):a.sprite;return custom?root+custom:`${root}${a.shiny?"shiny/":""}${a.id}.png`;};
  const renderChoice=()=>{$("focusedAvatarChoice").innerHTML=avatar?`<img class="profile-avatar" src="${sprite(avatar)}"><span><b>${avatar.name}</b>${avatar.shiny?" · Shiny":""}</span><button type="button" class="avatar-remove" aria-label="Remove selected Pokémon">&times;</button>`:'<span class="rankball avatar-placeholder" style="--rc:#E0483C"></span><span>No sprite selected</span>';};
  try{
    const account=await DexleStats.account();
    if(!account.anonymous)return location.replace("account.html");
    if(signup){
      [pokemon,forms,megas]=await Promise.all([fetch("pokedex.json").then(r=>r.json()),fetch("forms.json").then(r=>r.json()),fetch("megas.json").then(r=>r.json())]);
      const input=$("focusedAvatarSearch"),toggle=$("focusedAvatarShiny"),results=$("focusedAvatarResults");$("focusedAvatarChoice").onclick=e=>{if(!e.target.closest(".avatar-remove"))return;avatar=null;renderChoice();};
      const catalog=pokemon.flatMap(base=>[{...base,base_id:base.id},...[...(forms[String(base.id)]||[]),...(megas[String(base.id)]||[])].map(f=>({...base,...f,base_id:base.id}))]);
      const draw=()=>{
        const q=input.value.trim().toLowerCase();if(q.length<2)return results.innerHTML="";
        const hits=catalog.filter(p=>p.name.toLowerCase().includes(q)).slice(0,30),shiny=toggle.checked;
        results.innerHTML=hits.map((p,i)=>`<button type="button" class="avatar-result" data-i="${i}"><img src="${sprite({...p,shiny})}"><small>${p.name}</small></button>`).join("");
        results.onclick=e=>{const b=e.target.closest("[data-i]");if(!b)return;avatar={...hits[+b.dataset.i],shiny:toggle.checked};renderChoice();results.innerHTML="";input.value="";};
      };
      input.oninput=draw;
      toggle.onchange=()=>{if(avatar){avatar={...avatar,shiny:toggle.checked};renderChoice();}draw();};
    }
  }catch(e){msg(e.message,true);}
  $("focusedAuthForm").onsubmit=async e=>{e.preventDefault();const button=$("focusedSubmit");button.disabled=true;try{if(signup){await DexleStats.createAccount($("focusedEmail").value,$("focusedPassword").value,$("focusedUsername").value);if(avatar)await DexleStats.updateAvatar(avatar);}else await DexleStats.signIn($("focusedUsername").value,$("focusedPassword").value);location.href="account.html";}catch(err){msg(/invalid login credentials/i.test(err.message)?"Username or password is incorrect.":err.message,true);button.disabled=false;}};
})();
