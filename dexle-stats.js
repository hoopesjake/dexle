(function () {
  "use strict";
  const $ = id => document.getElementById(id);

  function draw(stats) {
    const s = stats || {
      total_games:0, wins:0, fails:0, win_rate:0, average_guesses:0,
      current_streak:0, best_streak:0, guess_distribution:{},
    };
    const values = [
      s.total_games, s.wins, s.fails, `${Number(s.win_rate || 0)}%`,
      +s.wins ? Number(s.average_guesses).toFixed(2) : "-",
      s.current_streak, s.best_streak,
    ];
    [...$("dexleMetrics").children].forEach((el, i) =>
      el.querySelector("b").textContent = values[i]);

    const dist = s.guess_distribution || {};
    const max = Math.max(1, ...Array.from({length:10}, (_,i) => +(dist[i+1] || 0)));
    $("guessChart").innerHTML = Array.from({length:10}, (_,i) => {
      const guess = i + 1;
      const count = +(dist[guess] || 0);
      const width = count ? Math.max(3, count / max * 100) : 0;
      return `<div class="guess-row">
        <span class="guess-label">${guess} guess${guess === 1 ? "" : "es"}</span>
        <div class="guess-track" title="${count} win${count === 1 ? "" : "s"}">
          <div class="guess-fill" style="width:${width}%"></div>
        </div>
        <span class="guess-count">${count}</span>
      </div>`;
    }).join("");
  }

  async function init() {
    if (!DexleStats.configured) {
      $("setup").hidden = false;
      draw(null);
      return;
    }
    try {
      draw(await DexleStats.personalDexleSummary());
    } catch (err) {
      $("error").hidden = false;
      $("error").textContent = `Dexle progress could not load: ${err.message || err}`;
      draw(null);
    }
  }
  init();
})();
