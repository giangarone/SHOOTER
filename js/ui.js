// HUD and overlay DOM. The only module that touches the document outside
// main.js's event wiring.
//
// Every setter is called each frame from main.js, so all of them compare
// against a cached value in `this._c` and touch the DOM only on change.
// Writing unconditionally would cause layout work 60 times a second.
// resetCache() clears those caches on a new game, so the first frame repaints.

import { pixelIconCanvas } from './pixelicons.js';
import { itemCells } from './items.js';
import { controllerGlyph } from './padmenu.js';

// The two player colours, as CSS. The world-space pair lives in main.js beside
// the code that lights the gun; these are the same two hues written the way
// the document needs them, and #handoff.p1 / .p2 in the stylesheet is the
// third copy. Three because they are three different rendering systems.
const PLAYER_INK = ['#4ef3ff', '#ff3b30'];
import { PLAYER_STATUS, PLAYER_STATUS_KEYS } from './status.js';

export class UI {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.hud = $('hud');
    this.waveNum = $('wave-num');
    this.enemies = $('enemies-left');
    this.hpBox = $('hp-box');
    this.hpBar = $('hp-bar');
    this.hpText = $('hp-text');
    this.stamBar = $('stam-bar');
    this.ammoNum = $('ammo-num');
    this.ammoRes = $('ammo-res');
    this.fxDamage = $('fx-damage');
    this.fxFire = $('fx-fire');
    this.fxPoison = $('fx-poison');
    this.strobe = $('strobe');
    this.bossBar = $('boss-bar');
    this.bossName = $('boss-name');
    this.bossHp = $('boss-hp');
    this.bossNote = $('boss-note');
    this.bannerEl = $('banner');
    this.hitmarker = $('hitmarker');
    this.startOv = $('overlay-start');
    this.overOv = $('overlay-over');
    this.pauseOv = $('overlay-pause');
    this.confirmOv = $('overlay-confirm');
    // The two sub-screens. They sit OVER whichever menu opened them rather
    // than replacing it, so the one behind is left exactly as it was and BACK
    // is a single class change.
    this.settingsOv = $('overlay-settings');
    // The pass-the-controller screen. Not a sub-screen: it is layered over a
    // live match rather than over a menu, and nothing takes it down but its
    // own countdown.
    this.handoffOv = $('handoff');
    this.handoffWho = $('handoff-who');
    this.handoffStake = $('handoff-stake');
    this.handoffCount = $('handoff-count');
    this.handoffIcon = $('handoff-icon');
    this.creditLabel = $('credit-label');
    this.overStats = $('over-stats');
    this.overHero = $('over-hero');
    this.overHeroLabel = $('over-hero-label');
    this.buffsEl = $('buffs');
    this.creditNum = $('credit-num');
    this.flawlessEl = $('flawless');
    this.promptEl = $('prompt');
    // The active item slot, bottom right over the gun readout.
    this.itemBox = $('item-box');
    this.itemArt = $('item-art');
    this.itemName = $('item-name');
    this.itemBarBg = $('item-bar-bg');
    this.itemBar = $('item-bar');
    this.invulnFrame = $('invuln-frame');
    this.crosshair = $('crosshair');
    this.statsPanel = $('stats-panel');
    this.statsMuts = $('stats-muts');
    this.statsActive = $('stats-active');
    this.statsItemSec = $('stats-item-sec');
    this._c = {};        // last value written per HUD field
    this._buffEls = {};  // lazily created buff icons, keyed by buff name
    // Which active-item chips were drawn last frame - see setItemBuffs. The
    // buff and status chips are a fixed list and can simply be reported as
    // zero when they are off; the item chips are not, so the ones that have
    // gone have to be remembered to be hidden.
    this._itemChipKeys = [];
    // Stat-row nodes for the held-TAB panel, keyed by label. Built once when
    // the panel first opens and rewritten in place after that - rebuilding the
    // rows every frame the key is held would thrash layout for no reason.
    this._statsOpen = false;
    // What the sheet was last built from, so a build that has not changed is
    // not torn down and redrawn every frame the key is held - pixelIconCanvas
    // walks 576 cells per icon and this panel can be showing a dozen.
    this._statsKey = '';
    // Whose turn it is in versus, 1 or 2, or null in solo. It takes over the
    // credits readout - see setVersus.
    this._versus = null;
  }

  setWave(n) {
    if (this._c.wave !== n) {
      this._c.wave = n;
      // Zero-padded to two digits. A cabinet readout has a fixed number of
      // cells whether they are lit or not, and a wave counter that jumps from
      // one glyph wide to two shunts the whole plate sideways mid-run.
      this.waveNum.textContent = String(n).padStart(2, '0');
    }
  }
  setEnemies(n) {
    if (this._c.enemies !== n) {
      this._c.enemies = n;
      this.enemies.textContent = String(n).padStart(2, '0') + ' LEFT';
      // The pip beside the count goes from red to green the instant the arena
      // is clear - the one state change worth seeing without reading a number.
      this.enemies.classList.toggle('clear', n === 0);
    }
  }
  /**
   * The boss bar. Pass a null name to hide it.
   *
   * @param {number} frac  0..1 of the boss's combined health
   * @param {string} note  a short line under the bar - 'CORE EXPOSED', 'PARTS 4'
   * @param {string} state '' | 'vulnerable' | 'enraged', a class on the bar
   */
  setBoss(name, frac, note, state) {
    if (this._c.bossName !== name) {
      this._c.bossName = name;
      this.bossBar.classList.toggle('hidden', !name);
      if (name) this.bossName.textContent = name;
    }
    if (!name) return;
    // Quantised: the width is a style write and the health
    // changes by a fraction of a percent on most frames, which would be a
    // layout every frame for a change nobody can see.
    const q = Math.round(Math.max(0, Math.min(1, frac)) * 200) / 200;
    if (this._c.bossFrac !== q) {
      this._c.bossFrac = q;
      this.bossHp.style.transform = 'scaleX(' + q + ')';
    }
    if (this._c.bossNote !== note) {
      this._c.bossNote = note;
      this.bossNote.textContent = note;
    }
    if (this._c.bossState !== state) {
      this._c.bossState = state;
      // `plate` is structural - it carries the chamfer and the frame ring -
      // so the state class is appended to it rather than replacing it.
      this.bossBar.className = 'plate' + (state ? ' ' + state : '');
    }
  }

  /**
   * Hands the credits box over to versus, or takes it back.
   *
   * The cells are reused rather than a fifth box added to a crowded frame:
   * whose turn it is is exactly the kind of thing the top-right readout is
   * for, and a balance neither player is spending is not.
   *
   * @param {?number} n 1 or 2, or null for solo.
   */
  setVersus(n) {
    this._versus = n;
    this.creditLabel.textContent = n ? 'VERSUS' : 'CREDITS';
    // The same two colours the gun's flank strip carries, so the readout that
    // NAMES the player and the band that marks their weapon teach each other.
    this.creditNum.style.color = n ? PLAYER_INK[n - 1] : '';
    // Written straight out both ways rather than left to the next frame's
    // setCredits: leaving solo puts the menu up, and the menu does not tick the
    // HUD, so a deferred repaint left 'P1' sitting in the readout.
    this.creditNum.textContent = n ? 'P' + n : '$0';
    this._c.credits = undefined;
  }
  setHealth(h, max) {
    // Keyed off the displayed number, not the clamped bar width, so overheal
    // ticking back down to full still updates the readout.
    const shown = Math.ceil(Math.max(0, h));
    if (this._c.hp === shown) return;
    this._c.hp = shown;
    const p = Math.max(0, Math.min(100, (h / max) * 100));
    // The bar is cut into 20 cells by a mask on its TRACK, so the width here
    // is quantised to a whole cell: a fill that stops halfway through a cell
    // says the interface is drawing sub-pixels, which is the one thing this
    // HUD is built not to do.
    const cells = Math.ceil((p / 100) * 20);
    this.hpBar.style.transform = 'scaleX(' + (cells / 20) + ')';
    // Colour and the beat on the readout are a CLASS now rather than three
    // inline writes: the low state is a state of the whole box, and the
    // stylesheet is where it belongs.
    this.hpBox.classList.toggle('low', p < 30);
    this.hpText.textContent = shown + ' / ' + max;
  }
  /**
   * The stamina bar. `frac` is 0..1, `low` is whether there is too little left
   * to start a run on, and `locked` is the exhaustion state - see
   * _updateSprint in player.js.
   *
   * THE COLOUR IS THE QUANTITY AND NOTHING ELSE. It used to go gold while the
   * bar was being spent, which meant the same amount of stamina was two
   * different colours depending on what the player was doing with it - so the
   * one thing a bar is for, reading a level at a glance, needed a second
   * glance to interpret. Running is legible from the speed of the drain.
   *
   * Quantised to whole cells like the health bar above, and compared against
   * the cell COUNT rather than the fraction: the bar has forty of them, so a
   * value drifting continuously through a regen would otherwise write a
   * transform on every frame to move the fill by nothing.
   */
  setStamina(frac, low, locked) {
    const cells = Math.ceil(Math.max(0, Math.min(1, frac)) * 40);
    if (this._c.stam !== cells) {
      this._c.stam = cells;
      this.stamBar.style.transform = 'scaleX(' + (cells / 40) + ')';
    }
    if (this._c.stamLow !== low) {
      this._c.stamLow = low;
      this.hpBox.classList.toggle('stam-low', low);
    }
    if (this._c.stamLocked !== locked) {
      this._c.stamLocked = locked;
      this.hpBox.classList.toggle('spent', locked);
    }
  }

  /**
   * The round count.
   *
   * @param {number} magSize what a full magazine holds, which is what decides
   *   when the RESERVE is low - see the note on #ammo-res.low.
   */
  setAmmo(mag, reserve, reloading, magSize = 30) {
    if (this._c.mag !== mag) {
      this._c.mag = mag;
      this.ammoNum.textContent = mag;
      this.ammoNum.classList.toggle('low', mag <= 10);
    }
    if (this._c.reserve !== reserve || this._c.magSize !== magSize) {
      this._c.reserve = reserve;
      this._c.magSize = magSize;
      this.ammoRes.textContent = '/ ' + reserve;
      this.ammoRes.classList.toggle('out', reserve === 0);
      // Less than one full reload left in the bag.
      this.ammoRes.classList.toggle('low', reserve > 0 && reserve < magSize);
    }
    if (this._c.reload !== reloading) {
      this._c.reload = reloading;
      // THE RELOAD IS THE CROSSHAIR GOING AWAY, and that is the whole readout -
      // see #crosshair.reloading. Nothing is added to the HUD, so nothing in it
      // can move.
      this.crosshair.classList.toggle('reloading', reloading);
    }
  }

  // BRASS ECHO. One flare on the reserve number when a round comes back - the
  // only thing on the HUD that says the mutation paid. The class is removed
  // and forced to reflow before it goes back on, so two refunds in quick
  // succession play twice instead of the second one being swallowed by the
  // animation the first is still running.
  flashReserve() {
    this.ammoRes.classList.remove('refund');
    void this.ammoRes.offsetWidth;
    this.ammoRes.classList.add('refund');
  }

  // ---- THE ACTIVE ITEM SLOT ------------------------------------------------

  /**
   * Draws the carried item and its charge. Called every frame like every other
   * setter here, so everything below is guarded against the cache.
   *
   * @param {?string} id    item id, or null when nothing is carried
   * @param {?object} def   its ACTIVE_ITEMS entry
   * @param {number} frac   0..1 of the way to charged
   * @param {boolean} held  true at the wave break, when the bar is frozen -
   *   said explicitly rather than inferred, because a bar that has simply
   *   stopped moving looks like a fault and this is a rule worth showing.
   */
  setItem(id, def, frac) {
    if (this._c.itemId !== id) {
      this._c.itemId = id;
      this.itemBox.classList.toggle('hidden', !id);
      if (def) {
        this.itemName.textContent = def.name;
        this.itemBox.style.setProperty(
          '--item', '#' + def.theme.toString(16).padStart(6, '0')
        );
        // ON THE BAR ITSELF, not on the box. `.seg` declares --cells on the
        // element it is applied to, and a declaration on the element beats a
        // value inherited from an ancestor - so setting this on #item-box would
        // be silently overridden by the class's own default of twenty.
        const cells = itemCells(def.cooldown);
        this.itemBarBg.style.setProperty('--cells', String(cells));
        // The gap has to come down with the cell count or it eats the cells: at
        // twelve segments in 108px a 3px gap leaves six pixels lit, and at three
        // a 2px gap is barely a gap at all.
        this.itemBarBg.style.setProperty('--gap', cells > 6 ? '2px' : '3px');
        // The 24x24 plate, at the same call the buff chips use, drawn into the
        // canvas that is already in the document rather than swapped for a new
        // one - a slot that replaced its own node on every pickup would leak a
        // canvas per swap for the life of the run.
        const art = pixelIconCanvas(id, def.theme, 4);
        const c = this.itemArt.getContext('2d');
        c.clearRect(0, 0, this.itemArt.width, this.itemArt.height);
        c.drawImage(art, 0, 0);
      }
    }
    if (!id) return;
    // EVERY SEGMENT IS WHOLE OR EMPTY, NEVER PART LIT. The fill is a scaleX, so
    // it can land anywhere - flooring it onto a cell boundary is what stops it,
    // and flooring rather than rounding is also the honest direction: a cell is
    // a unit of charge and a unit of charge is not banked until it has passed.
    // Rounding would light the last cell before the item could be fired, which
    // is the one lie a charge meter must not tell.
    const n = itemCells(def.cooldown);
    const lit = Math.floor(frac * n) / n;
    if (this._c.itemFrac !== lit) {
      this._c.itemFrac = lit;
      this.itemBar.style.transform = 'scaleX(' + lit + ')';
    }
    const ready = frac >= 1;
    if (this._c.itemReady !== ready) {
      this._c.itemReady = ready;
      this.itemBox.classList.toggle('ready', ready);
    }
    // THE BAR DOES NOT CHANGE COLOUR IN THE SHOP, and this function is no
    // longer told whether it is in one. It used to grey out while the charge
    // was frozen at a wave break, on the reasoning that a bar which has simply
    // stopped moving looks like a fault. In practice nobody is watching the
    // meter during a shopping trip, and a second bar state to learn buys less
    // than it costs: the charge coming back is something the player finds out
    // by the wave starting, which is the moment they care about it.
  }

  // The item just finished charging. One flash, restarted the way
  // flashReserve() restarts its own - a second charge inside the animation has
  // to play again rather than ride the first one out.
  flashItemReady() {
    this.itemBox.classList.remove('charged');
    void this.itemBox.offsetWidth;
    this.itemBox.classList.add('charged');
  }

  // AEGIS's window, in seconds remaining - 0 for not running. Both damage sinks
  // return in silence while it is open, so this frame is the only thing that
  // says the strongest item in the pool is doing anything at all.
  setInvuln(secs) {
    const on = secs > 0;
    // The last second blinks, so the window is felt ending rather than
    // discovered by being hit the moment after it does.
    const ending = on && secs < 1;
    if (this._c.invulnOn !== on) {
      this._c.invulnOn = on;
      this.invulnFrame.classList.toggle('on', on);
    }
    if (this._c.invulnEnding !== ending) {
      this._c.invulnEnding = ending;
      this.invulnFrame.classList.toggle('ending', ending);
    }
  }

  // THE ONLY NUMBER IN THE TOP RIGHT. It took the score's place there when the
  // score was removed: a run is measured by the wave it reached, and the one
  // figure that changes moment to moment and that the player can spend is this
  // one. Right-aligned in the markup, so a wide `$12,345` grows leftward into
  // empty frame and cannot push anything.
  setCredits(n) {
    // Nothing writes over the turn readout during a versus match.
    if (this._versus) return;
    if (this._c.credits !== n) {
      this._c.credits = n;
      this.creditNum.textContent = '$' + n.toLocaleString();
    }
  }
  // The flawless streak's credit multiplier, under the balance.
  //
  // HIDDEN AT x1, which is most of a bad run: the element is not a slot that
  // sometimes reads one, it is a thing that is either true or absent. That is
  // also what makes it readable as an event - it appears when a clean wave is
  // banked and it is gone the frame the player is hit, and there is no state
  // in between for the eye to have to compare against.
  //
  // Written only when the number changes, like every other readout here: the
  // HUD sync calls this every frame.
  setFlawless(mult) {
    if (this._c.flawless === mult) return;
    this._c.flawless = mult;
    const show = mult > 1;
    this.flawlessEl.classList.toggle('hidden', !show);
    // Quarter steps, so a plain toString is exact and never trails a zero:
    // x1.25, x1.5, x3. A toFixed here would say "x3.00".
    if (show) this.flawlessEl.textContent = 'FLAWLESS x' + mult;
  }

  // Each argument is 0..1 of that buff's remaining duration; 0 hides its chip.
  //
  // The chips have the bottom centre to themselves, and they are the ONLY
  // thing that says a buff is up. The shield used to light the whole frame as well, which
  // was the loudest element in the game for the rarest pickup in it and hid
  // the room behind a blue wash for fifteen seconds at a time. The chip does
  // the same job: it carries a points label as well as a timer, because the
  // shield is far more often spent by damage than by its clock.
  //
  // OPENING SALVO rides here rather than in the status strip: a status wears
  // the hostile frame, and free ammunition is not something being done to the
  // player. It draws the MUTATION'S OWN icon - one shape per mutation holds
  // whether the shape is standing on a totem or counting down on the HUD.
  setBuffs(damageBoost, fireRateBoost, shield, shieldPoints = 0, salvo = 0) {
    this._setBuff('damageBoost', 'pickDamage', 0xff3d00, damageBoost, '', false, 0);
    this._setBuff('fireRateBoost', 'pickRate', 0x2979ff, fireRateBoost, '', false, 1);
    this._setBuff(
      'shield', 'pickShield', 0x4ef3ff, shield,
      shield > 0 ? String(Math.ceil(shieldPoints)) : '', false, 2
    );
    this._setBuff('salvo', 'openingSalvo', 0xffd180, salvo, '', false, 3);
  }

  /**
   * ACTIVE ITEMS THAT ARE STILL RUNNING, in the same strip, to the right of
   * the pickup buffs and to the left of the statuses.
   *
   * Every chip here wears the ITEM'S OWN ICON and theme colour - the same rule
   * Opening Salvo's chip follows, and the reason the pixel catalogue is keyed
   * by item id: one shape holds whether it is standing on a pedestal, sitting
   * in the corner slot or counting down here, so a player who has learnt the
   * pedestal has already learnt the chip.
   *
   * ORDER BAND 20+, so the item chips can never interleave with the buff chips
   * (0-3) or the statuses (10+). It is index-based within the band rather than
   * keyed to the pool, which means two items running at once hold whatever
   * order they were pressed in - and that is correct: there is one slot, so
   * the only way to have two is to have started them seconds apart, and the
   * player's own press order is the one they will look for them in.
   *
   * NOTHING IS CLEARED ON THE WAY OUT. _setBuff hides a chip whose fraction is
   * zero, so a chip that stops being reported has to be told to go - which is
   * what `_itemChipKeys` is for: it remembers what was drawn last frame and
   * zeroes anything missing from this one.
   *
   * @param {Array} chips  from RunningItems.chips()
   */
  setItemBuffs(chips) {
    for (let i = 0; i < chips.length; i++) {
      const c = chips[i];
      this._setBuff('it_' + c.key, c.icon, c.color, c.fraction, c.label, false, 20 + i);
    }
    for (const key of this._itemChipKeys) {
      if (chips.some((c) => c.key === key)) continue;
      this._setBuff('it_' + key, null, 0, 0);
    }
    this._itemChipKeys.length = 0;
    for (const c of chips) this._itemChipKeys.push(c.key);
  }

  // STATUS EFFECTS, in the same strip as the buffs and to the right of them.
  //
  // ONE STRIP, NOT TWO. A second row would have the player checking two places
  // to know what is happening to them, and the thing they need to know first
  // is not "how many buffs" or "how many debuffs" - it is what is on them at
  // all. What separates the two is the CHIP, not its position: a status wears
  // a hostile frame (see .buff-icon.bad) so good and bad never have to be told
  // apart by reading the art.
  //
  // Driven straight off the player and the table in status.js rather than off
  // an argument per effect, because unlike the three buffs this list is meant
  // to grow: a seventh status needs no change in this file.
  setStatuses(player) {
    for (const key of PLAYER_STATUS_KEYS) {
      const def = PLAYER_STATUS[key];
      this._setBuff(
        'st_' + key, def.icon, def.color, player.statusFraction(key),
        '', true, 10 + PLAYER_STATUS_KEYS.indexOf(key)
      );
    }
  }

  // Fraction is 0..1 of the buff's remaining duration; 0 hides the icon.
  // `icon` is a pixelicons.js key and `color` the theme it is drawn in - the
  // same pair the pickup on the floor was built from. `bad` marks it as
  // something done TO the player rather than something they picked up, and
  // `order` fixes its place in the strip.
  //
  // THE PLACE IS EXPLICIT because the chips are created lazily, in whatever
  // order the run happens to hand them out. Left to the DOM, the strip would
  // lay itself out differently in every run - and a row of icons that is not
  // in the same order twice cannot be read at a glance, which is the only
  // thing it is for. Buffs take 0-2 and statuses 10 up, so the two groups
  // never interleave however they arrive.
  _setBuff(key, icon, color, fraction, label = '', bad = false, order = 0) {
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
      el.className = bad ? 'buff-icon bad' : 'buff-icon';
      el.innerHTML = '<div class="buff-timer"></div><div class="buff-label"></div>';
      // Drawn once, here, and never again: pixelIconCanvas walks 576 cells.
      const art = pixelIconCanvas(icon, color, 2);
      art.className = 'buff-art';
      el.insertBefore(art, el.firstChild);
      el.style.setProperty('--buff', '#' + color.toString(16).padStart(6, '0'));
      el.style.order = order;
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
  /**
   * The crosshair's gap and its aimed state.
   *
   * `gap` is the distance in pixels from the centre to the inner end of each
   * arm - the radius of the cone the gun is currently firing through, computed
   * in main.js so the reticle and the raycast can never disagree. Quantised to
   * a half pixel before it is written: this is called every frame and the
   * value drifts continuously as the player accelerates, so an unrounded float
   * would dirty the compositor on every one of them.
   */
  setCrosshair(gap, aiming) {
    const q = Math.round(gap * 2) / 2;
    if (this._c.chGap !== q) {
      this._c.chGap = q;
      this.crosshair.style.setProperty('--gap', q + 'px');
    }
    if (this._c.chAim !== aiming) {
      this._c.chAim = aiming;
      this.crosshair.classList.toggle('aim', aiming);
    }
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

  /**
   * FIRE AND POISON ARE STATES, NOT EVENTS, so they are driven every frame off
   * the player's own status timers rather than flashed on a damage tick - the
   * same way the AEGIS frame is driven off invulnEnd.
   *
   * That is the whole difference between this and what it replaced. The old
   * vignette fired once per throttled tick, which told the player "something
   * hurt" half a second after it started and said nothing at all in between; a
   * layer that is simply UP for as long as you are burning is a condition you
   * can see you are in, and see the end of.
   *
   * @param {boolean} fire
   * @param {boolean} poison
   */
  setStatusFx(fire, poison) {
    if (this._c.fxFire !== fire) {
      this._c.fxFire = fire;
      this.fxFire.classList.toggle('on', fire);
    }
    if (this._c.fxPoison !== poison) {
      this._c.fxPoison = poison;
      this.fxPoison.classList.toggle('on', poison);
    }
  }

  // A HIT. One shot, and the only one of the three that is: taking damage is an
  // event with a moment attached, and the frame cracking is the drawing of it.
  damage() {
    this.fxDamage.classList.remove('flash');
    void this.fxDamage.offsetWidth;
    this.fxDamage.classList.add('flash');
    clearTimeout(this._vt);
    this._vt = setTimeout(() => this.fxDamage.classList.remove('flash'), 130);
  }
  // Every one of these closes the sub-screens as well. They are layered over
  // the menus rather than swapped with them, so a state change underneath -
  // a run starting, a player dying - has to take them down explicitly or the
  // settings panel would be left floating over the fight.
  showStart() {
    this.startOv.classList.remove('hidden');
    this.overOv.classList.add('hidden');
    this.pauseOv.classList.add('hidden');
    this.handoffOv.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.hud.classList.remove('swap');
    this.hideSubScreens();
  }
  showHud() {
    this.hud.classList.remove('hidden');
    this.startOv.classList.add('hidden');
    this.pauseOv.classList.add('hidden');
    this.overOv.classList.add('hidden');
    this.handoffOv.classList.add('hidden');
    // A match that ended mid-pass would otherwise bring its half-slid
    // instruments into the next run.
    this.hud.classList.remove('swap');
    this.hideSubScreens();
  }
  showPause() {
    this.pauseOv.classList.remove('hidden');
  }
  hidePause() {
    this.pauseOv.classList.add('hidden');
    this.hideSubScreens();
  }

  // ---- sub-screens ---------------------------------------------------------
  hideSubScreens() {
    this.settingsOv.classList.add('hidden');
    this.confirmOv.classList.add('hidden');
  }
  showSettings() {
    this.settingsOv.classList.remove('hidden');
  }
  // The EXIT confirmation. A sub-screen on exactly the same terms as the other
  // two - layered over the pause menu, taken down by hideSubScreens - so BACK,
  // CIRCLE and Escape already do the right thing with it and nothing had to
  // learn a fourth way to close a screen.
  showConfirmExit() {
    this.confirmOv.classList.remove('hidden');
  }
  // ---- the hot seat --------------------------------------------------------

  /**
   * Puts the pass caption up and starts the HUD sliding out.
   *
   * @param {number} p    the INCOMING player, 1 or 2 - colours the caption
   * @param {string} who  their name
   * @param {string} stake the one line about the wave
   * @param {number} n    the first number on the countdown
   */
  showHandoff(p, who, stake, n) {
    // Built once, on the first handoff of the session - the markup is ours and
    // constant, so there is nothing here to rebuild per pass.
    if (!this.handoffIcon.firstChild) this.handoffIcon.innerHTML = controllerGlyph();
    this.handoffWho.textContent = who;
    this.handoffStake.textContent = stake;
    this.handoffCount.textContent = String(n);
    this._c.handoffCount = n;
    this.handoffOv.classList.remove('hidden', 'p1', 'p2');
    this.handoffOv.classList.add('p' + p);
    // The instruments leave with the player who was reading them. NOT hidden:
    // they slide, and the slide is the half of this that says the readouts
    // belong to a person rather than to the room.
    this.hud.classList.add('swap');
  }
  /** The incoming player's instruments slide back in. */
  swapHudIn() {
    this.hud.classList.remove('swap');
  }
  setHandoffCount(n) {
    if (this._c.handoffCount === n) return;
    this._c.handoffCount = n;
    this.handoffCount.textContent = String(n);
    // Restarted per tick, the same forced-reflow trick the banner uses.
    this.handoffCount.classList.remove('tick');
    void this.handoffCount.offsetWidth;
    this.handoffCount.classList.add('tick');
  }
  hideHandoff() {
    this.handoffOv.classList.add('hidden');
    this.hud.classList.remove('swap');
  }

  /**
   * The end of a versus match. Reuses the death screen's furniture - the
   * marquee, the hero number, RESTART - because it is the same moment in the
   * cabinet's shape.
   */
  showMatchOver(who, wave) {
    this.hideSubScreens();
    this.hideHandoff();
    const h1 = this.overOv.querySelector('h1');
    h1.textContent = who + ' WINS';
    h1.classList.remove('dead');
    this.overHeroLabel.textContent = 'CLEARED WAVE';
    this.overHero.textContent = String(wave);
    this.overStats.textContent = '';
    this.overOv.classList.remove('hidden');
    this.hud.classList.add('hidden');
  }

  /**
   * The death screen.
   *
   * THE WAVE IS THE RUN. With the score gone it is the only measure of how far
   * the player got, so it is not a cell in a strip of four any more - it is
   * the number on the screen, set at four times the size of anything under it.
   * Everything else is context for it, and reads as context.
   */
  showOver(wave, kills, accuracy, credits = 0) {
    // Taken back off in case the last thing on this screen was a versus win.
    const h1 = this.overOv.querySelector('h1');
    h1.textContent = 'YOU DIED';
    h1.classList.add('dead');
    this.hideSubScreens();
    this.overHeroLabel.textContent = 'REACHED WAVE';
    this.overHero.textContent = String(wave);
    // Columns of one reading each, not one sentence. At 8x8 a run-on line of
    // labels and numbers separated by middots is a wall the player has to read
    // left to right; a divided strip is scanned in a glance.
    this.overStats.textContent = '';
    const stats = [
      ['KILLS', String(kills)],
      ['ACCURACY', accuracy],
      ['CREDITS', '$' + credits.toLocaleString()],
    ];
    for (const [label, value] of stats) {
      const cell = document.createElement('div');
      cell.className = 'rs';
      const l = document.createElement('u');
      l.textContent = label;
      const v = document.createElement('b');
      v.textContent = value;
      cell.append(l, v);
      this.overStats.appendChild(cell);
    }
    this.overOv.classList.remove('hidden');
    this.hud.classList.add('hidden');
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

  // ---- held-TAB inventory sheet -------------------------------------------
  //
  // WHAT YOU ARE CARRYING, and nothing else. This used to be a RUN SUMMARY -
  // wave, kills, accuracy, damage taken, a dozen live counters - and every one
  // of those numbers was either already on the HUD or was trivia. What it never
  // showed was the one thing a build sheet is for: what the mutations the
  // player has been walking into all run actually DO. A player six upgrades
  // deep could not find out what any of them was without dying.
  //
  // So it is an inventory now. Icon, name, and the same effect lines the totem
  // printed when the offer was made - the card the player read once, kept.
  //
  // Opened by a HELD key over a live fight, so it is built on the way in and
  // rebuilt only when the build itself changes - see `_statsKey`.
  //
  // `active` is { id, name, effects, theme, ready } or null; `passives` is an
  // array of { id, name, effects, theme, tier }.

  showStats(active, passives) {
    const key = (active ? active.id : '-')
      + '|' + passives.map((m) => m.id + m.tier).join(',');
    if (this._statsOpen && key === this._statsKey) return;
    this._statsKey = key;
    this._statsOpen = true;
    this._buildActive(active);
    this._buildPassives(passives);
    this.statsPanel.classList.remove('hidden');
  }

  hideStats() {
    if (!this._statsOpen) return;
    this._statsOpen = false;
    this.statsPanel.classList.add('hidden');
    // Dropped rather than kept: the next open is a different build, and a
    // stale key would silently suppress the rebuild that would fix it.
    this._statsKey = '';
    this.statsMuts.textContent = '';
    this.statsActive.textContent = '';
  }

  /**
   * One entry: the icon, the name, and the effect lines under it.
   *
   * The icon is drawn in the item's or mutation's own THEME COLOUR, which is
   * the same colour the totem or the box card carried when it was offered -
   * that is the whole reason it is worth the 576 cells, because the shape and
   * the colour together are how the player recognises a thing they took twenty
   * minutes ago. The NAME stays white: several themes - Berserker's near-black
   * red, Ashen's burnt orange - are unreadable as text on a dark panel, which
   * is why the old row put the colour on a dot and never on the words.
   */
  _entry(def) {
    const cell = document.createElement('div');
    cell.className = 'inv';
    const art = pixelIconCanvas(def.id, def.theme, 2);
    art.className = 'inv-art';
    const body = document.createElement('div');
    body.className = 'inv-body';
    const name = document.createElement('div');
    name.className = 'inv-name';
    name.textContent = def.name;
    // A tier is only shown where there is one to show: printing "x1" on every
    // single-tier mutation would make the stacking ones invisible.
    if (def.tier > 1) {
      const tier = document.createElement('em');
      tier.textContent = 'x' + def.tier;
      name.appendChild(tier);
    }
    body.appendChild(name);
    // Array.isArray, not a truthiness check: a mutation's `effects` can be a
    // FUNCTION of the stack count - see effectLines() - and a function is
    // truthy and not iterable, which is how this threw the moment a player
    // opened the sheet owning a tiered upgrade. main.js resolves them before
    // they get here; this is the net under that.
    for (const [text, sign] of Array.isArray(def.effects) ? def.effects : []) {
      const line = document.createElement('div');
      // PLAIN, EXCEPT FOR A COST. See .inv-line in styles.css: the sign colours
      // belong to an offer being weighed, and this is a sheet of things already
      // owned. Only a live drawback is still worth a colour.
      line.className = sign < 0 ? 'inv-line bad' : 'inv-line';
      line.textContent = text;
      body.appendChild(line);
    }
    cell.append(art, body);
    return cell;
  }

  // THE WHOLE SECTION GOES when nothing is carried, heading and all. A labelled
  // box reading EMPTY HANDED is a question about a system the player may not
  // have met yet, and it costs the mutations above it a strip of the card.
  _buildActive(active) {
    this.statsActive.textContent = '';
    this.statsItemSec.classList.toggle('hidden', !active);
    if (!active) return;
    this.statsActive.appendChild(this._entry(active));
  }

  _buildPassives(passives) {
    this.statsMuts.textContent = '';
    if (!passives.length) {
      const empty = document.createElement('div');
      empty.className = 'inv-empty';
      empty.textContent = 'NONE YET';
      this.statsMuts.appendChild(empty);
      return;
    }
    for (const m of passives) this.statsMuts.appendChild(this._entry(m));
  }

  // Called on a new game: forces every setter to repaint on the next frame and
  // hides any buff icon left over from the previous run.
  resetCache() {
    this._c = {};
    this.bossBar.className = 'plate hidden';
    this.hpBox.classList.remove('low', 'stam-low', 'spent');
    this.enemies.classList.remove('clear');
    this.flawlessEl.classList.add('hidden');
    this.crosshair.classList.remove('aim');
    // The marker's `.show` is never taken off in play - the animation under it
    // is what ends, not the class - so a new run is the one place it is worth
    // clearing, and it costs one class write per game.
    this.hitmarker.classList.remove('show');
    // The slot goes with the run. A new game starts carrying nothing, and a
    // plate left up showing the last run's item would be the first wrong thing
    // on screen.
    this.itemBox.className = 'hidden';
    this.invulnFrame.classList.remove('on', 'ending');
    this.promptEl.classList.add('hidden');
    this.hideStats();
    this._itemChipKeys.length = 0;
    for (const entry of Object.values(this._buffEls)) {
      entry.el.style.display = 'none';
      entry.shown = false;
      entry.scale = -1;
      entry.text = null;
    }
  }
}