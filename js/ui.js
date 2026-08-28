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
    this.ammoReload = $('ammo-reload');
    this.vignette = $('vignette');
    this.bannerEl = $('banner');
    this.hitmarker = $('hitmarker');
    this.startOv = $('overlay-start');
    this.overOv = $('overlay-over');
    this.pauseOv = $('overlay-pause');
    this.overStats = $('over-stats');
    this._c = {};
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
    const p = Math.max(0, Math.min(100, (h / max) * 100));
    if (this._c.hp !== Math.round(p)) {
      this._c.hp = Math.round(p);
      this.hpBar.style.width = p + '%';
      this.hpBar.style.background = p < 30 ? 'linear-gradient(90deg,#ff3b30,#ff7a45)' : 'linear-gradient(90deg,#37e08b,#b6f54c)';
      this.hpBar.style.boxShadow = p < 30 ? '0 0 12px rgba(255,59,48,0.6)' : '0 0 12px rgba(55,224,139,0.5)';
      this.hpText.textContent = Math.ceil(h) + ' / ' + max;
    }
  }
  setAmmo(mag, reloading) {
    if (this._c.mag !== mag) {
      this._c.mag = mag;
      this.ammoNum.textContent = mag;
      this.ammoNum.style.color = mag === 0 ? '#ff3b30' : '#fff';
    }
    if (this._c.reload !== reloading) {
      this._c.reload = reloading;
      this.ammoReload.classList.toggle('hidden', !reloading);
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
  }
}