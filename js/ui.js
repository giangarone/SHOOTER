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
    this.revealEl = $('upgrade-reveal');
    this.revealCard = $('reveal-card');

    this.revealRarity = $('reveal-rarity');
    this.revealName = $('reveal-name');
    this.revealEffects = $('reveal-effects');
    this.revealStack = $('reveal-stack');
    this.promptEl = $('prompt');
    this._c = {};        // last value written per HUD field
    this._buffEls = {};  // lazily created buff icons, keyed by buff name
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
      this.creditNum.textContent = n.toLocaleString() + 'c';
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
  setBuffs(damageBoost, fireRateBoost, shield) {
    this._setBuff('damageBoost', 'damage', damageBoost);
    this._setBuff('fireRateBoost', 'firerate', fireRateBoost);
    this._setBuff('shield', 'shield', shield);
  }

  // Fraction is 0..1 of the buff's remaining duration; 0 hides the icon.
  _setBuff(key, cssName, fraction) {
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
      el.innerHTML = '<div class="buff-timer"></div>';
      this.buffsEl.appendChild(el);
      // The timer node is cached: querySelector on every frame for every buff
      // is pure waste.
      entry = { el, timer: el.querySelector('.buff-timer'), shown: false, scale: -1 };
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
  // Wave-end upgrade reveal. Deliberately not an overlay: it takes no input,
  // never pauses the game and animates itself out, so the player keeps
  // fighting while it plays.
  //
  // Same remove-reflow-re-add trick as banner(): without the forced reflow the
  // browser coalesces both class changes and the animation never replays, so
  // two upgrades in a row would show only the first.
  showUpgrade(m) {
    this.revealCard.style.color = m.color;
    this.revealRarity.textContent = m.rarity;
    this.revealName.textContent = m.name;
    // Same signed effect lines the totem showed, in the same colours, so the
    // confirmation reads as the thing the player just walked into.
    this.revealEffects.textContent = '';
    for (const [text, sign] of m.effects) {
      const el = document.createElement('div');
      el.className = 'fx ' + (sign > 0 ? 'good' : sign < 0 ? 'bad' : 'note');
      el.textContent = text;
      this.revealEffects.appendChild(el);
    }
    this.revealStack.textContent = m.owned > 1 ? 'STACK ' + m.owned + ' / ' + m.max : 'NEW';
    this.revealEl.classList.remove('show');
    void this.revealEl.offsetWidth;
    this.revealEl.classList.add('show');
  }
  hideUpgrade() {
    this.revealEl.classList.remove('show');
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

  // Called on a new game: forces every setter to repaint on the next frame and
  // hides any buff icon left over from the previous run.
  resetCache() {
    this._c = {};
    this.comboEl.classList.add('hidden');
    this.promptEl.classList.add('hidden');
    this.revealEl.classList.remove('show');
    for (const entry of Object.values(this._buffEls)) {
      entry.el.style.display = 'none';
      entry.shown = false;
      entry.scale = -1;
    }
  }
}