(() => {
  const header = document.querySelector("header");
  if (!header) return;

  const shiny = document.getElementById("shiny");
  const generations = document.getElementById("menu");
  const startCard = document.getElementById("start");
  if (generations && startCard) {
    generations.classList.add("dexle-generation-choice");
    generations.append(" Select Generations");
    const play = document.getElementById("play");
    play.parentElement.insertBefore(generations, play);
  }
  document.querySelectorAll(".hdr-btns,.home-links").forEach(el => el.remove());
  document.getElementById("mobileMenuShade")?.remove();
  document.getElementById("mobileMenu")?.remove();

  const button = document.createElement("button");
  button.className = "trainer-menu-button";
  button.type = "button";
  button.setAttribute("aria-label", "Open navigation menu");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = "<span></span><span></span><span></span>";
  if (shiny) header.appendChild(shiny);
  header.appendChild(button);

  const shade = document.createElement("div");
  shade.className = "trainer-menu-shade";
  shade.hidden = true;
  const drawer = document.createElement("aside");
  drawer.className = "trainer-menu-drawer";
  drawer.setAttribute("aria-hidden", "true");
  drawer.innerHTML = `<div class="trainer-menu-title"><b>Dexle Menu</b><button class="trainer-menu-close" type="button" aria-label="Close navigation menu">&times;</button></div>
    <div class="trainer-identity"><span class="trainer-avatar-placeholder"></span><span><small>Logged in as</small><b>Guest Trainer</b></span></div>
    <nav class="trainer-menu-links">
      <a href="index.html">Home</a>
      <a href="stats.html">Trainer Stats</a>
      <a href="unlimited.html">Unlimited</a>
      <a href="achievements.html">Achievements</a>
      <a href="friends.html" class="friends-menu-link">Friends <i class="friend-notification" hidden>0</i></a>
      <a href="account.html">Account</a>
    </nav>`;
  document.body.append(shade, drawer);

  const current = location.pathname.split("/").pop() || "index.html";
  drawer.querySelectorAll("a").forEach(a => {
    const href = a.getAttribute("href");
    const target = href.split("?")[0];
    if (target === current) a.classList.add("active");
  });
  const setOpen = open => {
    drawer.classList.toggle("open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    button.setAttribute("aria-expanded", String(open));
    shade.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
  };
  button.onclick = () => setOpen(true);
  shade.onclick = drawer.querySelector(".trainer-menu-close").onclick = () => setOpen(false);
  document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });
  (async()=>{if(!window.DexleStats?.configured)return;try{const a=await DexleStats.account();if(a.anonymous)return;const identity=drawer.querySelector(".trainer-identity"),name=a.profile?.username||a.user.user_metadata?.username||"Trainer",avatar=a.profile?.avatar;identity.querySelector("b").textContent=name;if(avatar){const custom=avatar.shiny?avatar.shiny_sprite:avatar.sprite;const src=custom?`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${custom}`:`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${avatar.shiny?"shiny/":""}${avatar.id}.png`;identity.firstElementChild.outerHTML=`<img class="trainer-avatar" src="${src}" alt="${avatar.name}">`;}const rows=await DexleStats.friendConnections(),count=rows.filter(x=>x.incoming&&x.status==="pending").length,badge=drawer.querySelector(".friend-notification");badge.textContent=count>99?"99+":count;badge.hidden=count===0;}catch(e){}})();
})();
