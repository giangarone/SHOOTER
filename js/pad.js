// DUALSENSE - the controller device layer.
//
// This module knows about a piece of hardware and nothing about the game. It
// polls one gamepad, turns its analogue mess into clean edges and deadzoned
// vectors, and drives the rumble motors. Everything above it - what a button
// MEANS - lives in main.js and padmenu.js.
//
// ONE PAD, AND IT MUST BE A DUALSENSE. The brief was PS5 only, and that is a
// hard gate rather than a preference: every glyph the game draws is a
// PlayStation glyph, and a pad that reports Xbox positions would put the wrong
// shape on screen next to every prompt in the run. An unrecognised controller
// is left alone entirely - the game stays on keyboard and mouse and never
// mentions it.
//
// WHY POLLING. The Gamepad API has no button events; navigator.getGamepads()
// returns a fresh snapshot each call and the entries are NOT live objects, so
// the only correct way to read one is to sample it once per frame and diff
// against the previous sample. That diff is what `pressed`/`released` are.
//
// Chrome also hides gamepads until the pad itself has been touched - the first
// button press is what "connects" it. That is why nothing here ever asks the
// player to press a key to enable the controller: pressing anything on the pad
// IS the enable.

// Standard-mapping button indices. The DualSense reports through the standard
// mapping on every browser that matters, so these are positions, not guesses -
// index 0 is the bottom face button whatever it is called.
export const BTN = {
  CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3,
  L1: 4, R1: 5, L2: 6, R2: 7,
  CREATE: 8, OPTIONS: 9,
  L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
  PS: 16,
};
const BUTTON_COUNT = 18;

// Sony's vendor id, and the two products that are a DualSense: 0ce6 is the
// pad, 0df2 the Edge. Browsers spell the id string differently - Chrome writes
// "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"
// and Firefox "054c-0ce6-DualSense Wireless Controller" - so both the vendor
// pair and the product name are accepted rather than parsing one format.
const VENDOR = '054c';
const PRODUCTS = ['0ce6', '0df2'];

export function isDualSense(id) {
  const s = String(id || '').toLowerCase();
  if (s.includes('dualsense')) return true;
  if (!s.includes(VENDOR)) return false;
  return PRODUCTS.some((p) => s.includes(p));
}

// Deadzones. RADIAL, not per-axis: a square deadzone lets a stick pushed
// diagonally register at a tilt that would be ignored straight up, which reads
// as the pad being more sensitive on the diagonals. The left stick's is the
// larger of the two because a walking input that creeps on a worn stick is far
// more noticeable than a view that does.
const MOVE_DEAD = 0.22;
const LOOK_DEAD = 0.14;
// Above this the stick is treated as fully deflected. Sticks rarely reach 1.0
// at the corners, and a player who cannot ever hit full speed feels it.
const SATURATION = 0.95;
// A trigger is "down" past this. Well above the resting noise of a worn L2 and
// well below the point where the pull feels committed.
const TRIGGER_DOWN = 0.35;

// What counts as the player actually USING the pad, for the purpose of
// switching the game out of keyboard-and-mouse mode. Deliberately high: a pad
// sitting on a desk with a drifting stick must never steal the prompts away
// from someone playing on the keyboard.
const WAKE_AXIS = 0.5;

// Menu repeat, in seconds. The first step is instant, then a long hold before
// the second and a fast train after it - the same shape every menu on a
// console has, and the reason a list of ten scores is not a rhythm game.
const REPEAT_DELAY = 0.42;
const REPEAT_RATE = 0.11;
// A held stick counts as a menu direction past this. Higher than MOVE_DEAD so
// resting the stick between two rows cannot walk the selection on its own.
const NAV_ON = 0.55;
const NAV_OFF = 0.35;

/**
 * Radial deadzone with a linear rescale above it.
 *
 * The rescale is the part that matters: clamping to zero below the deadzone
 * and passing the raw value above it means the stick JUMPS from nothing to
 * 0.22 the instant it crosses, which is exactly the twitch that makes a pad
 * feel cheap. Remapping [dead, sat] onto [0, 1] keeps the first millimetre of
 * travel worth zero and every millimetre after it worth the same amount.
 *
 * @param {number} x raw axis
 * @param {number} y raw axis
 * @param {number} dead deadzone radius
 * @param {{x: number, y: number, mag: number}} out written in place, no alloc
 */
function stick(x, y, dead, out) {
  const mag = Math.hypot(x, y);
  if (mag <= dead) {
    out.x = 0; out.y = 0; out.mag = 0;
    return out;
  }
  const scaled = Math.min(1, (mag - dead) / (SATURATION - dead));
  out.x = (x / mag) * scaled;
  out.y = (y / mag) * scaled;
  out.mag = scaled;
  return out;
}

export class Pad {
  constructor() {
    this.connected = false;
    this.id = '';
    this._index = -1;
    // One frame of button state and the frame before it. Typed arrays because
    // this is read sixty times a second and never resized.
    this._down = new Uint8Array(BUTTON_COUNT);
    this._prev = new Uint8Array(BUTTON_COUNT);
    // Buttons whose current press has been SPENT. A menu that starts the game
    // with CROSS consumes it, so the same physical press that was still held
    // on the next frame cannot also be read as a jump. Cleared on release.
    this._used = new Uint8Array(BUTTON_COUNT);
    this._val = new Float32Array(BUTTON_COUNT);

    // Deadzoned sticks. Y is flipped on read so both of these are in the same
    // hand-rule as the rest of the game: +y is forward, +y is up.
    this.move = { x: 0, y: 0, mag: 0 };
    this.look = { x: 0, y: 0, mag: 0 };

    // True on any frame the player touched the pad. Drives the switch out of
    // keyboard mode; see _setInputMode in main.js.
    this.active = false;
    // Edge flags for the frame, so main.js does not have to track the last
    // connection state itself.
    this.justConnected = false;
    this.justDisconnected = false;

    // Menu repeat state. -1/0/1 per axis, refreshed by poll().
    this.navX = 0;
    this.navY = 0;
    this._navDirX = 0;
    this._navDirY = 0;
    this._navT = 0;

    // Rumble. Off until the settings say otherwise so a first boot cannot
    // buzz a pad the player wanted quiet.
    this.rumbleOn = true;
    this.rumbleScale = 1;
    // The effect currently playing, as [priority, ends-at]. A shot tick must
    // not be able to cut a boss slam short - playEffect REPLACES whatever is
    // running, so the priority test here is the only thing stopping the
    // loudest event in the game from being trampled by the most frequent one.
    this._fxPriority = 0;
    this._fxEnd = 0;
  }

  /**
   * Samples the pad. Call once per frame, before anything reads it.
   * @param {number} dt real seconds since the last poll (menu repeat clock)
   */
  poll(dt) {
    this.justConnected = false;
    this.justDisconnected = false;
    const list = (navigator.getGamepads && navigator.getGamepads()) || [];
    let g = null;
    for (const c of list) {
      if (c && c.connected && isDualSense(c.id)) { g = c; break; }
    }
    this._prev.set(this._down);

    if (!g) {
      if (this.connected) {
        this.justDisconnected = true;
        this.connected = false;
        this.id = '';
        this._index = -1;
      }
      // Everything is released on a pad that is not there. Without this a
      // controller yanked mid-sprint would leave the player running.
      this._down.fill(0);
      this._used.fill(0);
      this._val.fill(0);
      this.move.x = this.move.y = this.move.mag = 0;
      this.look.x = this.look.y = this.look.mag = 0;
      this.active = false;
      this.navX = this.navY = 0;
      this._navDirX = this._navDirY = 0;
      return;
    }

    if (!this.connected) {
      this.connected = true;
      this.justConnected = true;
      this.id = g.id;
      this._index = g.index;
    }

    let touched = false;
    for (let i = 0; i < BUTTON_COUNT; i++) {
      const b = g.buttons[i];
      // Analogue triggers report `pressed` on their own, but only past the
      // browser's threshold - the value is what the game actually wants, so
      // both are honoured and the lower of the two wins the press.
      const v = b ? b.value : 0;
      const on = b ? (b.pressed || v >= TRIGGER_DOWN) : false;
      this._val[i] = v;
      this._down[i] = on ? 1 : 0;
      if (!on) this._used[i] = 0;
      if (on && !this._prev[i]) touched = true;
    }

    const ax = g.axes;
    stick(ax[0] || 0, -(ax[1] || 0), MOVE_DEAD, this.move);
    stick(ax[2] || 0, -(ax[3] || 0), LOOK_DEAD, this.look);
    if (Math.hypot(ax[0] || 0, ax[1] || 0) > WAKE_AXIS) touched = true;
    if (Math.hypot(ax[2] || 0, ax[3] || 0) > WAKE_AXIS) touched = true;
    this.active = touched;

    this._navPoll(dt);
  }

  // Menu direction with hysteresis and repeat. The D-pad and the left stick
  // both feed it: a player reaching for the stick to move a menu selection is
  // not making a mistake, and the pad has no way to say which one is "right".
  _navPoll(dt) {
    let x = 0;
    let y = 0;
    if (this._down[BTN.LEFT]) x = -1;
    else if (this._down[BTN.RIGHT]) x = 1;
    if (this._down[BTN.UP]) y = 1;
    else if (this._down[BTN.DOWN]) y = -1;
    // The stick only counts past NAV_ON and only STOPS counting below NAV_OFF.
    // That gap is what keeps a stick held on the boundary from stuttering the
    // selection back and forth between two rows.
    const on = (v, dir) => (dir ? Math.abs(v) > NAV_OFF : Math.abs(v) > NAV_ON);
    if (!x && on(this.move.x, this._navDirX) && Math.abs(this.move.x) > Math.abs(this.move.y)) {
      x = Math.sign(this.move.x);
    }
    if (!y && on(this.move.y, this._navDirY) && Math.abs(this.move.y) >= Math.abs(this.move.x)) {
      y = Math.sign(this.move.y);
    }

    // A change of direction always fires immediately and restarts the clock;
    // holding the same one waits out the delay and then repeats.
    if (x !== this._navDirX || y !== this._navDirY) {
      this._navDirX = x;
      this._navDirY = y;
      this._navT = REPEAT_DELAY;
      this.navX = x;
      this.navY = y;
      return;
    }
    this.navX = 0;
    this.navY = 0;
    if (!x && !y) return;
    this._navT -= dt;
    if (this._navT <= 0) {
      this._navT = REPEAT_RATE;
      this.navX = x;
      this.navY = y;
    }
  }

  /** True while the button is held and its press has not been consumed. */
  down(i) { return !!this._down[i] && !this._used[i]; }
  /** True only on the frame the button went down. */
  pressed(i) { return !!this._down[i] && !this._prev[i] && !this._used[i]; }
  /** True only on the frame the button came up. */
  released(i) { return !this._down[i] && !!this._prev[i]; }
  /** Analogue value, 0..1. Triggers are the only buttons that give a range. */
  value(i) { return this._val[i]; }

  /**
   * Spends the current press of a button. It reads as released until the
   * player physically lets go - see the note on `_used`.
   */
  consume(i) { if (this._down[i]) this._used[i] = 1; }

  /** Spends everything currently held. Used at every state change. */
  consumeAll() {
    for (let i = 0; i < BUTTON_COUNT; i++) if (this._down[i]) this._used[i] = 1;
  }

  /**
   * Plays a rumble effect.
   *
   * @param {number} strong 0..1, the low-frequency (left) motor - impacts
   * @param {number} weak 0..1, the high-frequency (right) motor - texture
   * @param {number} ms duration
   * @param {number} priority a louder event refuses to be replaced by a
   *   quieter one while it is still running. Shots are 1, hits 2, deaths 3.
   */
  rumble(strong, weak, ms, priority = 1) {
    if (!this.rumbleOn || !this.connected) return;
    const now = performance.now();
    if (now < this._fxEnd && priority < this._fxPriority) return;
    const list = (navigator.getGamepads && navigator.getGamepads()) || [];
    const g = list[this._index];
    const act = g && g.vibrationActuator;
    if (!act || !act.playEffect) return;
    this._fxPriority = priority;
    this._fxEnd = now + ms;
    const s = this.rumbleScale;
    try {
      // The promise rejects if another effect replaces this one, which is a
      // normal thing to happen and not an error worth surfacing.
      const p = act.playEffect('dual-rumble', {
        startDelay: 0,
        duration: ms,
        strongMagnitude: Math.max(0, Math.min(1, strong * s)),
        weakMagnitude: Math.max(0, Math.min(1, weak * s)),
      });
      if (p && p.catch) p.catch(() => {});
    } catch {}
  }

  /** Stops any effect immediately - pausing, dying, or losing focus. */
  stopRumble() {
    this._fxPriority = 0;
    this._fxEnd = 0;
    const list = (navigator.getGamepads && navigator.getGamepads()) || [];
    const g = list[this._index];
    const act = g && g.vibrationActuator;
    if (!act || !act.reset) return;
    try {
      const p = act.reset();
      if (p && p.catch) p.catch(() => {});
    } catch {}
  }
}
