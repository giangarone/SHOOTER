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
    this.vignette = $('vignette');
    this.bannerEl = $('banner');
    this.hitmarker = $('hitmarker');
    this.startOv = $('overlay-start');
    this.overOv = $('overlay-over');
    this.pauseOv = $('overlay-pause');
    this.overStats = $('over-stats');
    this.buffsEl = $('buffs');
    this._c = {};
    this._buffEls = {};
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
    }
  }
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
  showOver(score, wave, kills) {
    this.overStats.innerHTML =
      'WAVE REACHED <b>' + wave + '</b> &nbsp;·&nbsp; SCORE <b>' + score.toLocaleString() + '</b> &nbsp;·&nbsp; KILLS <b>' + kills + '</b>';
    this.overOv.classList.remove('hidden');
    this.hud.classList.add('hidden');
  }
  resetCache() {
    this._c = {};
    for (const entry of Object.values(this._buffEls)) {
      entry.el.style.display = 'none';
      entry.shown = false;
      entry.scale = -1;
    }
  }
}