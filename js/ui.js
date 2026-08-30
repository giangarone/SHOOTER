// HUD and overlay DOM. The only module that touches the document outside
// main.js's event wiring.
//
// Every setter is called each frame from main.js, so all of them compare
// against a cached value in `this._c` and touch the DOM only on change.
// Writing unconditionally would cause layout work 60 times a second.
// resetCache() clears those caches on a new game, so the first frame repaints.

export class UI {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.hud = $('hud');
    this.waveNum = $('wave-num');
    this.enemies = $('enemies-left');
    this.scoreNum = $('score-num');
    this.hpBar = $('hp-bar');
    this.hpText = $('hp-text');
    this.ammoNum = $('ammo-num');
    this.ammoRes = $('ammo-res');
    this.ammoReload = $('ammo-reload');
    this.reloadRing = $('reload-ring');
    this.weaponName = $('weapon-name');
    this.vignette = $('vignette');
    this.strobe = $('strobe');
    this.lbOver = $('lb-over');
    this.lbStart = $('lb-start');
    this.lbEntry = $('lb-entry');
    this.lbName = $('lb-name');
    this.bossBar = $('boss-bar');
    this.bossName = $('boss-name');
    this.bossHp = $('boss-hp');
    this.bossNote = $('boss-note');
    this.bannerEl = $('banner');
    this.hitmarker = $('hitmarker');
    this.startOv = $('overlay-start');
    this.overOv = $('overlay-over');
    this.pauseOv = $('overlay-pause');
    this.overStats = $('over-stats');
    this.buffsEl = $('buffs');
    this.creditNum = $('credit-num');
    this.comboEl = $('combo');
    this.comboMult = $('combo-mult');
    this.comboCount = $('combo-count');
    this.comboBar = $('combo-bar').firstElementChild;
    this.promptEl = $('prompt');
    this.shieldFx = $('shield-fx');
    this.statsPanel = $('stats-panel');
    this.statsMuts = $('stats-muts');
    this.statsRun = $('stats-run');
    this._c = {};        // last value written per HUD field
    this._buffEls = {};  // lazily created buff icons, keyed by buff name
    // Stat-row nodes for the held-TAB panel, keyed by label. Built once when
    // the panel first opens and rewritten in place after that - rebuilding the
    // rows every frame the key is held would thrash layout for no reason.
    this._statRows = {};
    this._statsOpen = false;
  }

  setWave(n) {
    if (this._c.wave !== n) {
      this._c.wave = n;
      this.waveNum.textContent = n;
    }
  }
  setEnemies(n) {
    if (this._c.enemies !== n) {
      this._c.enemies = n;
      this.enemies.textContent = 'ENEMIES ' + n;
    }
  }
  /**
   * The boss bar. Pass a null name to hide it.
   *
   * @param {number} frac  0..1 of the boss's combined health
   * @param {string} note  a short line under the bar - 'STAGGERED', 'PARTS 4'
   * @param {string} state '' | 'vulnerable' | 'enraged', a class on the bar
   */
  setBoss(name, frac, note, state) {
    if (this._c.bossName !== name) {
      this._c.bossName = name;
      this.bossBar.classList.toggle('hidden', !name);
      if (name) this.bossName.textContent = name;
    }
    if (!name) return;
    // Quantised like the combo bar: the width is a style write and the health
    // changes by a fraction of a percent on most frames, which would be a
    // layout every frame for a change nobody can see.
    const q = Math.round(Math.max(0, Math.min(1, frac)) * 200) / 200;
    if (this._c.bossFrac !== q) {
      this._c.bossFrac = q;
      this.bossHp.style.width = (q * 100) + '%';
    }
    if (this._c.bossNote !== note) {
      this._c.bossNote = note;
      this.bossNote.textContent = note;
    }
    if (this._c.bossState !== state) {
      this._c.bossState = state;
      this.bossBar.className = state || '';
    }
  }

  setScore(n) {
    if (this._c.score !== n) {
      this._c.score = n;
      this.scoreNum.textContent = n.toLocaleString();
    }
  }
  setHealth(h, max) {
    // Keyed off the displayed number, not the clamped bar width, so overheal
    // ticking back down to full still updates the readout.
    const shown = Math.ceil(Math.max(0, h));
    if (this._c.hp === shown) return;
    this._c.hp = shown;
    const p = Math.max(0, Math.min(100, (h / max) * 100));
    const low = p < 30;
    this.hpBar.style.width = p + '%';
    this.hpBar.style.background = low
      ? 'linear-gradient(90deg,#ff3b30,#ff7a45)'
      : 'linear-gradient(90deg,#37e08b,#b6f54c)';
    this.hpBar.style.boxShadow = low
      ? '0 0 12px rgba(255,59,48,0.6)'
      : '0 0 12px rgba(55,224,139,0.5)';
    this.hpText.textContent = shown + ' / ' + max;
  }
  setAmmo(mag, reserve, reloading) {
    if (this._c.mag !== mag) {
      this._c.mag = mag;
      this.ammoNum.textContent = mag;
      this.ammoNum.style.color = mag === 0 ? '#ff3b30' : '#fff';
    }
    if (this._c.reserve !== reserve) {
      this._c.reserve = reserve;
      this.ammoRes.textContent = ' / ' + reserve;
      if (reserve === 0) {
        this.ammoRes.style.color = '#ff3b30';
        this.ammoRes.style.animation = 'pulse 0.5s infinite alternate';
      } else if (reserve < 30) {
        this.ammoRes.style.color = '#ffcc00';
        this.ammoRes.style.animation = 'none';
      } else {
        this.ammoRes.style.color = '#5b6785';
        this.ammoRes.style.animation = 'none';
      }
    }
    if (this._c.reload !== reloading) {
      this._c.reload = reloading;
      this.ammoReload.classList.toggle('hidden', !reloading);
      this.reloadRing.classList.toggle('hidden', !reloading);
    }
  }

  // Sweep of the ring around the crosshair, 0..1. Quantised to a hundredth
  // before it is written: this is called every frame, and a custom-property
  // write the browser has to restyle for is not worth spending on a change
  // nobody can see.
  setReloadProgress(p) {
    const q = Math.round(p * 100);
    if (this._c.reloadP === q) return;
    this._c.reloadP = q;
    this.reloadRing.style.setProperty('--p', q / 100);
  }
  setCredits(n) {
    if (this._c.credits !== n) {
      this._c.credits = n;
      this.creditNum.textContent = '$' + n.toLocaleString();
    }
  }
  // `kills` is the current chain length and `fraction` is 0..1 of the time
  // left before it drops. A chain of 1 shows nothing - a multiplier of x1.0
  // on screen after every single kill is just noise.
  setCombo(kills, mult, fraction) {
    const show = kills >= 2;
    if (this._c.comboShown !== show) {
      this._c.comboShown = show;
      this.comboEl.classList.toggle('hidden', !show);
    }
    if (!show) return;
    if (this._c.comboKills !== kills) {
      this._c.comboKills = kills;
      this.comboMult.textContent = 'x' + mult.toFixed(1);
      this.comboCount.textContent = kills + ' KILLS';
    }
    const f = Math.round(Math.max(0, Math.min(1, fraction)) * 50) / 50;
    if (this._c.comboFrac !== f) {
      this._c.comboFrac = f;
      this.comboBar.style.transform = 'scaleX(' + f + ')';
    }
  }

  setWeapon(name) {
    if (this._c.weapon !== name) {
      this._c.weapon = name;
      this.weaponName.textContent = name;
    }
  }

  // Each argument is 0..1 of that buff's remaining duration; 0 hides its icon.
  // The shield also carries a label, because it is the one buff that is far
  // more often spent by damage than by its clock - the timer bar alone never
  // said how much of it was left.
  setBuffs(damageBoost, fireRateBoost, shield, shieldPoints = 0) {
    this._setBuff('damageBoost', 'damage', damageBoost);
    this._setBuff('fireRateBoost', 'firerate', fireRateBoost);
    this._setBuff('shield', 'shield', shield, shield > 0 ? String(Math.ceil(shieldPoints)) : '');
  }

  // The full-frame shield rim. `fraction` is the shield's remaining points over
  // its full value; 0 clears it. Quantised before writing for the same reason
  // setStrobe is - this runs every frame and an unrounded float would dirty the
  // compositor on all of them.
  setShield(fraction) {
    const v = Math.round(Math.max(0, Math.min(1, fraction)) * 32) / 32;
    if (this._c.shieldFx === v) return;
    this._c.shieldFx = v;
    // Floored well above zero while it is up: a shield at its last few points
    // still has to read as a shield, and fading it to nothing would say it had
    // already broken.
    this.shieldFx.style.opacity = v > 0 ? String(0.42 + v * 0.58) : '0';
  }

  // Fraction is 0..1 of the buff's remaining duration; 0 hides the icon.
  _setBuff(key, cssName, fraction, label = '') {
    let entry = this._buffEls[key];
    if (fraction <= 0) {
      if (entry && entry.shown) {
        entry.el.style.display = 'none';
        entry.shown = false;
      }
      return;
    }
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'buff-icon ' + cssName;
      el.innerHTML = '<div class="buff-timer"></div><div class="buff-label"></div>';
      this.buffsEl.appendChild(el);
      // The timer and label nodes are cached: querySelector on every frame for
      // every buff is pure waste.
      entry = {
        el, timer: el.querySelector('.buff-timer'),
        label: el.querySelector('.buff-label'),
        shown: false, scale: -1, text: null,
      };
      this._buffEls[key] = entry;
    }
    if (!entry.shown) {
      entry.el.style.display = 'flex';
      entry.shown = true;
    }
    const s = Math.round(Math.min(1, fraction) * 100) / 100;
    if (entry.scale !== s) {
      entry.scale = s;
      entry.timer.style.transform = 'scaleX(' + s + ')';
    }
    if (entry.text !== label) {
      entry.text = label;
      entry.label.textContent = label;
    }
  }

  // Restarts the CSS animation. Removing the class, forcing a reflow by
  // reading offsetWidth, then re-adding it is what makes it replay - without
  // the reflow the browser coalesces both changes and nothing happens.
  banner(text) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }
  hitMarker() {
    const h = this.hitmarker;
    h.classList.remove('show');
    void h.offsetWidth;
    h.classList.add('show');
  }
  // The rig's flash level, 0..1. Quantised to 1/64 before writing: this is
  // called every frame and an unrounded float would dirty the compositor on
  // every one of them, including while the value is drifting invisibly.
  setStrobe(v) {
    const q = Math.round(Math.min(1, Math.max(0, v)) * 64) / 64;
    if (q === this._c.strobe) return;
    this._c.strobe = q;
    this.strobe.style.opacity = q;
  }

  damage() {
    this.vignette.classList.remove('flash');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('flash');
    clearTimeout(this._vt);
    this._vt = setTimeout(() => this.vignette.classList.remove('flash'), 130);
  }
  showStart() {
    this.startOv.classList.remove('hidden');
    this.overOv.classList.add('hidden');
    this.pauseOv.classList.add('hidden');
    this.hud.classList.add('hidden');
  }
  showHud() {
    this.hud.classList.remove('hidden');
    this.startOv.classList.add('hidden');
    this.pauseOv.classList.add('hidden');
    this.overOv.classList.add('hidden');
  }
  showPause() {
    this.pauseOv.classList.remove('hidden');
  }
  hidePause() {
    this.pauseOv.classList.add('hidden');
  }
  showOver(score, wave, kills, bestCombo = 0) {
    this.overStats.innerHTML =
      'WAVE REACHED <b>' + wave + '</b> &nbsp;·&nbsp; SCORE <b>' + score.toLocaleString() + '</b> &nbsp;·&nbsp; KILLS <b>' + kills + '</b>'
      + ' &nbsp;·&nbsp; BEST CHAIN <b>' + bestCombo + '</b>';
    this.overOv.classList.remove('hidden');
    this.hud.classList.add('hidden');
  }
  // Draws a score table into `el`. `highlight` is the index of the run just
  // played, or -1.
  //
  // Built with createElement and textContent rather than innerHTML, unlike the
  // rest of this file: every other string here is ours, but a leaderboard name
  // is typed by the player, and dropping that into innerHTML would let a name
  // like `<img src=x onerror=...>` execute. Even on a board only its author
  // can see, that is the wrong way round.
  renderBoard(el, entries, highlight = -1) {
    el.textContent = '';
    if (!entries.length) return;
    const title = document.createElement('div');
    title.className = 'lb-title';
    title.textContent = 'BEST RUNS';
    el.appendChild(title);
    entries.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = i === highlight ? 'lb-row you' : 'lb-row';
      const cell = (cls, text) => {
        const d = document.createElement('span');
        d.className = cls;
        d.textContent = text;
        row.appendChild(d);
      };
      cell('lb-rank', String(i + 1));
      cell('lb-name', e.name || '---');
      cell('lb-wave', 'WAVE ' + e.wave);
      cell('lb-score', e.score.toLocaleString());
      el.appendChild(row);
    });
  }

  // Opens the name field for a qualifying run and puts the caret in it, so the
  // player can type without hunting for the box.
  showNameEntry(defaultName) {
    this.lbEntry.classList.remove('hidden');
    this.lbName.value = defaultName || '';
    this.lbName.focus();
    this.lbName.select();
  }

  hideNameEntry() {
    this.lbEntry.classList.add('hidden');
  }

  // Station prompt. `text` is null when the player is not near a station.
  // Compared against the last string written, so standing next to a terminal
  // does not rewrite the DOM sixty times a second.
  setPrompt(text, blocked) {
    if (this._c.prompt === text && this._c.promptBlocked === blocked) return;
    this._c.prompt = text;
    this._c.promptBlocked = blocked;
    if (!text) {
      this.promptEl.classList.add('hidden');
      return;
    }
    this.promptEl.innerHTML = text;
    this.promptEl.classList.toggle('blocked', !!blocked);
    this.promptEl.classList.remove('hidden');
  }

  // ---- held-TAB build sheet -----------------------------------------------
  //
  // Opened by a HELD key over a live fight, so it is built once on the way in
  // and only its numbers are rewritten after that. The mutation list cannot
  // change while the key is down - totems are claimed by walking into them, and
  // the player is not walking anywhere with Tab held - so it is written on open
  // and never touched again.
  //
  // `muts` is an array of { name, color, tier }, `rows` an array of
  // [label, value, highlight] built by main.js, which owns what a run counts.

  showStats(muts, rows) {
    if (!this._statsOpen) {
      this._statsOpen = true;
      this._buildMuts(muts);
      this._buildStatRows(rows);
      this.statsPanel.classList.remove('hidden');
      return;
    }
    this.updateStats(rows);
  }

  // Live numbers only. The game keeps running underneath the panel, so score,
  // kills and ammo tick while it is open.
  updateStats(rows) {
    if (!this._statsOpen) return;
    for (const [label, value] of rows) {
      const row = this._statRows[label];
      if (row && row.last !== value) {
        row.last = value;
        row.val.textContent = value;
      }
    }
  }

  hideStats() {
    if (!this._statsOpen) return;
    this._statsOpen = false;
    this.statsPanel.classList.add('hidden');
    // Dropped rather than kept: the next open is a different build, and a
    // stale row cache would silently suppress the write that would fix it.
    this._statRows = {};
    this.statsMuts.textContent = '';
    this.statsRun.textContent = '';
  }

  _buildMuts(muts) {
    this.statsMuts.textContent = '';
    if (!muts.length) {
      const empty = document.createElement('div');
      empty.className = 'mut-empty';
      empty.textContent = 'NONE YET';
      this.statsMuts.appendChild(empty);
      return;
    }
    for (const m of muts) {
      const row = document.createElement('div');
      row.className = 'mut-row';
      const dot = document.createElement('i');
      // The colour goes on the DOT, never on the row. Theme colours are picked
      // to be read as a light on a pillar across an arena, and several of them
      // - Berserker's near-black red, Ashen's burnt orange - are unreadable as
      // body text on a dark panel. The dot carries the identity; the name stays
      // legible.
      dot.style.color = m.color;
      const name = document.createElement('span');
      name.textContent = m.name;
      row.append(dot, name);
      // A tier is only shown where there is one to show: printing "x1" on
      // every single-tier mutation would make the stacking ones invisible.
      if (m.tier > 1) {
        const tier = document.createElement('em');
        tier.textContent = 'x' + m.tier;
        row.appendChild(tier);
      }
      this.statsMuts.appendChild(row);
    }
  }

  _buildStatRows(rows) {
    this.statsRun.textContent = '';
    this._statRows = {};
    for (const [label, value, highlight] of rows) {
      const row = document.createElement('div');
      row.className = highlight ? 'stat-row good' : 'stat-row';
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('b');
      v.textContent = value;
      row.append(l, v);
      this.statsRun.appendChild(row);
      this._statRows[label] = { val: v, last: value };
    }
  }

  // Called on a new game: forces every setter to repaint on the next frame and
  // hides any buff icon left over from the previous run.
  resetCache() {
    this._c = {};
    this.bossBar.classList.add('hidden');
    this.bossBar.className = 'hidden';
    this.comboEl.classList.add('hidden');
    this.promptEl.classList.add('hidden');
    this.shieldFx.style.opacity = '0';
    this.hideStats();
    for (const entry of Object.values(this._buffEls)) {
      entry.el.style.display = 'none';
      entry.shown = false;
      entry.scale = -1;
      entry.text = null;
    }
  }
}