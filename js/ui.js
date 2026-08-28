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
    this.draftOv = $('overlay-draft');
    this.draftTitle = $('draft-title');
    this.draftSub = $('draft-sub');
    this.draftCredits = $('draft-credits');
    this.draftCards = $('draft-cards');
    this.shopItems = $('shop-items');
    this.rerollBtn = $('btn-reroll');
    this.draftBuild = $('draft-build');
    this._c = {};        // last value written per HUD field
    this._buffEls = {};  // lazily created buff icons, keyed by buff name
    this._draft = null;  // callbacks supplied by bindDraft()

    // One delegated listener per container instead of re-binding handlers on
    // every card rebuild - renderDraft() replaces this subtree on each reroll
    // and purchase, so per-node listeners would have to be re-attached (and
    // would leak) each time.
    this.draftCards.addEventListener('click', (e) => {
      if (!this._draft) return;
      // The placeholder card shown when the pool is exhausted is the only way
      // out of that draft, so it doubles as the continue button.
      if (e.target.closest('.up-card[data-skip]')) {
        this._draft.skip();
        return;
      }
      const card = e.target.closest('.up-card[data-id]');
      if (card) this._draft.pick(card.dataset.id);
    });
    this.shopItems.addEventListener('click', (e) => {
      const btn = e.target.closest('.shop-btn[data-key]');
      if (btn && !btn.disabled && this._draft) this._draft.buy(btn.dataset.key);
    });
    this.rerollBtn.addEventListener('click', () => {
      if (!this.rerollBtn.disabled && this._draft) this._draft.reroll();
    });
    // The draft overlay must not fall through to the generic overlay click
    // handlers, which resume the game.
    this.draftOv.addEventListener('click', (e) => e.stopPropagation());
  }

  // Registers the three draft actions once, at startup.
  bindDraft(handlers) {
    this._draft = handlers;
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
    this.draftOv.classList.add('hidden');
    this.hud.classList.add('hidden');
  }
  showHud() {
    this.hud.classList.remove('hidden');
    this.startOv.classList.add('hidden');
    this.pauseOv.classList.add('hidden');
    this.overOv.classList.add('hidden');
    this.draftOv.classList.add('hidden');
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
    this.draftOv.classList.add('hidden');
    this.hud.classList.add('hidden');
  }
  // Builds the whole wave-end screen from a plain model object. Called on
  // open and again after every reroll or purchase - it is a full rebuild, but
  // it runs a handful of times per wave, not per frame, so the simplicity is
  // worth more than the diffing would be.
  renderDraft(m) {
    this.draftTitle.textContent = 'WAVE ' + m.wave + ' CLEARED';
    this.draftSub.innerHTML = m.subtitle;
    this.draftCredits.innerHTML = m.credits.toLocaleString() + ' <span>CREDITS</span>';

    this.draftCards.textContent = '';
    if (!m.cards.length) {
      const el = document.createElement('div');
      el.className = 'up-card empty';
      el.dataset.skip = '1';
      el.innerHTML = '<div class="up-name">ALL UPGRADES MAXED</div>'
        + '<div class="up-desc">Nothing left to draft. Click to continue.</div>';
      this.draftCards.appendChild(el);
    }
    m.cards.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'up-card';
      el.dataset.id = c.id;
      el.style.color = c.color;
      el.style.borderTopColor = c.color;
      el.innerHTML =
        '<span class="up-key">' + (i + 1) + '</span>' +
        '<div class="up-rarity">' + c.rarity + '</div>' +
        '<div class="up-name">' + c.name + '</div>' +
        '<div class="up-desc">' + c.desc + '</div>' +
        '<div class="up-stack">' + (c.owned ? 'OWNED ' + c.owned + ' / ' + c.max : 'NEW') + '</div>';
      this.draftCards.appendChild(el);
    });

    this.shopItems.textContent = '';
    for (const it of m.shop) {
      const b = document.createElement('button');
      b.className = 'shop-btn';
      b.dataset.key = it.key;
      b.disabled = !it.available;
      b.innerHTML =
        '<span>' + it.name + '</span>' +
        '<span class="shop-detail">' + it.detail + '</span>' +
        '<span class="shop-cost">' + it.cost + 'c</span>';
      this.shopItems.appendChild(b);
    }

    this.rerollBtn.disabled = !m.canReroll;
    this.rerollBtn.innerHTML =
      '<span>REROLL</span><span class="shop-cost">' + m.rerollCost + 'c</span>';

    this.draftBuild.textContent = '';
    for (const u of m.build) {
      const chip = document.createElement('div');
      chip.className = 'build-chip';
      chip.innerHTML = '<b>' + u.name + '</b>'
        + (u.n > 1 ? ' <span class="build-n">x' + u.n + '</span>' : '');
      this.draftBuild.appendChild(chip);
    }
  }

  showDraft() {
    this.draftOv.classList.remove('hidden');
    this.hud.classList.add('hidden');
  }
  hideDraft() {
    this.draftOv.classList.add('hidden');
    this.hud.classList.remove('hidden');
  }

  // Called on a new game: forces every setter to repaint on the next frame and
  // hides any buff icon left over from the previous run.
  resetCache() {
    this._c = {};
    this.comboEl.classList.add('hidden');
    for (const entry of Object.values(this._buffEls)) {
      entry.el.style.display = 'none';
      entry.shown = false;
      entry.scale = -1;
    }
  }
}