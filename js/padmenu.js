// CONTROLLER-FACING INTERFACE. Three things live here, and they are together
// because all three are the same job: making a keyboard-shaped interface
// legible and reachable from a pad.
//
//   1. GLYPHS. The face buttons drawn as SVG rather than typed as characters.
//      Press Start 2P has no U+25CB in it, so a literal circle would have come
//      out as a tofu box in every prompt in the game. They are also the only
//      coloured thing in a cyan interface, which is deliberate: a player who
//      has held a PlayStation pad reads the shape and the colour before they
//      read the word next to it.
//   2. THE FOCUS DRIVER. The menus are ordinary DOM buttons laid out for a
//      mouse, so the driver navigates them GEOMETRICALLY - it reads where the
//      buttons actually are on screen and moves to the nearest one in the
//      direction pushed. Nothing has to declare a grid, and the layout can be
//      rearranged in the HTML without a nav table falling out of step with it.
//
// Nothing in here touches the game. main.js owns what a press does.

// ---- glyphs ---------------------------------------------------------------

// Drawn on a 12x12 grid at crisp edges, in the same hard-pixel language as the
// rest of the cabinet - no anti-aliasing, no gradient, 2px strokes.
const SVG = (body, cls) =>
  '<svg class="gl ' + cls + '" viewBox="0 0 12 12" aria-hidden="true">' + body + '</svg>';

const FACE = {
  cross: SVG('<path d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5"/>', 'g-cross'),
  circle: SVG('<circle cx="6" cy="6" r="3.8"/>', 'g-circle'),
  triangle: SVG('<path d="M6 1.8 L10.6 9.8 L1.4 9.8 Z"/>', 'g-triangle'),
  square: SVG('<rect x="2.4" y="2.4" width="7.2" height="7.2"/>', 'g-square'),
};

/**
 * The inside of a keycap for one control.
 * Face buttons come back as art; everything else is already a word the pad has
 * printed on it, and a word is what the player is looking for.
 */
export function glyph(name) {
  if (FACE[name]) return FACE[name];
  // A COMBINATION, like the slide's "hold the run, press the button". Each
  // token is looked up on its own so a face button inside one is still drawn
  // rather than spelled - "L3 circle" is a word and a shape, not two words.
  if (name.includes(' ')) {
    return name.split(' ').map((t) => FACE[t] || t.toUpperCase()).join(' ');
  }
  return name.toUpperCase();
}

/**
 * The controller itself, for the pass-the-controller screen.
 *
 * A WIDER GRID than the face glyphs above: a pad is a shape rather than a
 * symbol, and it does not survive being drawn in twelve pixels. Same hard
 * edges and the same currentColor, so it still reads as part of the cabinet
 * and not as an icon borrowed from somewhere else.
 */
export function controllerGlyph() {
  return '<svg class="gl-pad" viewBox="0 0 24 16" aria-hidden="true">'
    // Body, with a grip dropping from each end and a waist between them.
    + '<path d="M3 4 H21 V12 H17 V10 H7 V12 H3 Z"/>'
    // D-pad, left. Two strokes, because at this size a cross is two strokes.
    + '<path d="M6.4 6.2 V8.8 M5.1 7.5 H7.7"/>'
    // Two face buttons, right.
    + '<circle cx="16.4" cy="7" r="0.9"/>'
    + '<circle cx="18.7" cy="8.9" r="0.9"/>'
    + '</svg>';
}

/** A whole keycap. `cls` is the caller's cap class - `.key` on the start
 *  screen, nothing in the prompt, which styles its own `b`. */
export function cap(name, cls = '') {
  const wide = !FACE[name] && name.length > 2 ? ' wide' : '';
  return '<b class="' + cls + ' pad-cap' + wide + '">' + glyph(name) + '</b>';
}

// The two control sheets on the start screen. Both are laid out three across,
// so both have a length that divides by three - a ragged last row on a panel
// that is read once, before the run, would be the first thing the eye lands on.
//
// LOOK and AIM are two different things and the sheet has to say so: LOOK is
// the mouse turning the view, AIM is the right button raising the gun. Naming
// them both "aim" was the state of this list before the sights existed.
//
// FIFTEEN NOW, not twelve, and crouching is what put the third row on. CROUCH
// and SLIDE are listed SEPARATELY even though they are one button: which of
// the two a press gives you depends on whether you are already running, and a
// single row reading "CROUCH / SLIDE" would leave the player to guess at the
// rule. Two rows state it - the slide's cap says SPRINT and then the button,
// which is the input, in order.
//
// The fifteenth row on each is the one that was cut when the sheet was twelve
// and now has its place back: FULLSCREEN, a real binding nothing else on the
// screen mentions, and the pad's D-PAD, which is how a controller walks the
// menus it is reading this sheet in.
export const KBM_CONTROLS = [
  ['WASD', 'MOVE'], ['SHIFT', 'SPRINT'], ['MOUSE', 'LOOK'],
  ['LMB', 'SHOOT'], ['RMB', 'AIM'], ['V', 'MELEE'],
  ['R', 'RELOAD'], ['SPACE', 'JUMP'], ['Q', 'ITEM'],
  ['C', 'CROUCH'], ['SHIFT C', 'SLIDE'], ['E', 'USE'],
  ['TAB', 'STATS'], ['F', 'FULLSCREEN'], ['ESC', 'PAUSE'],
];

export const PAD_CONTROLS = [
  ['L STICK', 'MOVE'], ['L3', 'SPRINT'], ['R STICK', 'LOOK'],
  ['R2', 'SHOOT'], ['L2', 'AIM'], ['R3', 'MELEE'],
  ['R1', 'ITEM'], ['cross', 'JUMP'], ['square', 'RELOAD'],
  ['circle', 'CROUCH'], ['L3 circle', 'SLIDE'], ['triangle', 'TAKE'],
  ['TOUCH PAD', 'STATS'], ['D-PAD', 'MENU'], ['OPTIONS', 'PAUSE'],
];

/**
 * Rewrites the control sheet in place. Called only when the input mode
 * actually changes, not per frame.
 * @param {HTMLElement} el the `.controls` panel
 * @param {boolean} pad true for the controller sheet
 */
export function renderControls(el, pad) {
  for (const old of el.querySelectorAll('.ctl')) old.remove();
  for (const [key, label] of (pad ? PAD_CONTROLS : KBM_CONTROLS)) {
    const ctl = document.createElement('div');
    ctl.className = 'ctl';
    ctl.innerHTML = cap(key, 'key') + '<span>' + label + '</span>';
    el.appendChild(ctl);
  }
  el.classList.toggle('pad', pad);
}

// ---- the focus driver -----------------------------------------------------

// How much a candidate is punished for being off to the side of the direction
// pushed. Above 1 so that "down" prefers the button directly below over one
// that is further across than it is down - which is what the eye expects and
// what makes the settings screen walk in a straight line.
const OFF_AXIS_COST = 2.4;

export class MenuDriver {
  constructor() {
    this.root = null;
    this.el = null;   // the focused element, or null
  }

  /**
   * Points the driver at an overlay. Re-pointing it at the same one is free,
   * so this is safe to call every frame.
   */
  setRoot(root) {
    if (root === this.root) return;
    this.clear();
    this.root = root;
    if (root) this.focus(this._default());
  }

  /**
   * Every focusable control the player can currently see, in DOM order.
   *
   * A STEPPER IS ONE TARGET, NOT TWO BUTTONS. Its `-` and `+` are a single
   * control with a value between them, and treating them as two stops meant
   * pressing right on a settings row walked the selection from one key to the
   * other without ever changing anything - which is exactly what a stepper
   * looks like when it is broken. The row owns its horizontal axis instead:
   * see adjust().
   */
  items() {
    if (!this.root) return [];
    const sel = 'button:not([disabled]), input:not([disabled]), .stepper, [data-pad-focus]';
    return [...this.root.querySelectorAll(sel)].filter(
      // offsetParent is null for anything inside a `.hidden` block, which is
      // how every optional panel in the game is hidden - the name-entry row,
      // the empty-board notice. A control the player cannot see must never be
      // a thing the selection can land on.
      (e) => e.offsetParent !== null && !e.closest('.hidden')
        && !(e.tagName === 'BUTTON' && e.closest('.stepper'))
    );
  }

  // The control a screen should open on: its primary action if it has one -
  // START, RESTART, RESUME, BACK - and otherwise whatever comes first.
  _default() {
    const items = this.items();
    if (!items.length) return null;
    return items.find((e) => e.closest('.primary-row')) || items[0];
  }

  focus(el) {
    if (this.el === el) return;
    if (this.el) this.el.classList.remove('pad-focus');
    this.el = el || null;
    if (!this.el) return;
    this.el.classList.add('pad-focus');
    // Focused for real as well as marked: it keeps the browser's own notion of
    // focus with the selection, so a player who reaches back for the keyboard
    // finds it where the pad left it.
    try { this.el.focus({ preventScroll: false }); } catch {}
  }

  clear() {
    if (this.el) this.el.classList.remove('pad-focus');
    this.el = null;
  }

  /**
   * Moves the selection. `dx`/`dy` are -1, 0 or 1 in SCREEN space, so +1 y is
   * down the page - the caller flips the stick, which points the other way.
   *
   * Geometric rather than ordinal: the nearest control in the direction
   * pushed wins, measured centre to centre with off-axis distance weighted
   * heavier. That is what lets one routine walk a vertical settings list, a
   * horizontal button row and a ten-wide keyboard without knowing which it is
   * looking at.
   */
  move(dx, dy) {
    const items = this.items();
    if (!items.length) return;
    if (!this.el || !items.includes(this.el)) {
      this.focus(this._default());
      return;
    }
    const from = this.el.getBoundingClientRect();
    const cx = from.left + from.width / 2;
    const cy = from.top + from.height / 2;
    // ALIGNED CANDIDATES WIN OUTRIGHT. A control whose box overlaps this one
    // across the direction of travel is in the same row or the same column as
    // it, and the eye reads those as the neighbours - pressing RIGHT on the
    // middle button of a row must reach the button beside it, never the wider
    // one half a row above that happens to score a shorter hop. Everything
    // else is only a fallback for when the row runs out.
    let aligned = null;
    let alignedScore = Infinity;
    let loose = null;
    let looseScore = Infinity;
    // The wrap candidate: the thing furthest AGAINST the direction pushed, so
    // walking off the bottom of a list lands on its top rather than stopping
    // dead. A menu that stops dead reads as a broken pad.
    let wrap = null;
    let wrapScore = -Infinity;
    for (const el of items) {
      if (el === this.el) continue;
      const r = el.getBoundingClientRect();
      const ddx = r.left + r.width / 2 - cx;
      const ddy = r.top + r.height / 2 - cy;
      const along = ddx * dx + ddy * dy;
      const across = Math.abs(ddx * dy - ddy * dx);
      if (along > 2) {
        const overlaps = dx
          ? r.top < from.bottom && r.bottom > from.top
          : r.left < from.right && r.right > from.left;
        const score = along + across * OFF_AXIS_COST;
        if (overlaps) {
          if (score < alignedScore) { alignedScore = score; aligned = el; }
        } else if (score < looseScore) { looseScore = score; loose = el; }
      } else if (along < -2) {
        const score = -along - across * OFF_AXIS_COST;
        if (score > wrapScore) { wrapScore = score; wrap = el; }
      }
    }
    this.focus(aligned || loose || wrap || this.el);
  }

  /**
   * LEFT AND RIGHT INSIDE A SETTINGS ROW change the value rather than moving
   * the selection. `dir` is -1 or 1.
   *
   * Scoped to `.set-row` on purpose. Everywhere else in the game a horizontal
   * press means "move to the control beside this one" - the three buttons
   * under PRESS START are a row the player walks along - and a rule that
   * swallowed left and right globally would strand the selection on the first
   * of them. A settings row is the one place where the thing beside the label
   * IS the value.
   *
   * @returns {boolean} true if it was handled, false to fall through to move()
   */
  adjust(dir) {
    const el = this.el;
    if (!el || !el.closest('.set-row')) return false;
    if (el.classList.contains('stepper')) {
      // Clicking a disabled end key does nothing, which is the correct answer
      // at the end of the scale - and it is still HANDLED, so the selection
      // does not go wandering off the row instead.
      const key = el.querySelector(dir < 0 ? '.step-btn:first-child' : '.step-btn:last-child');
      if (key && !key.disabled) key.click();
      return true;
    }
    // A two-state control has nowhere to go but over, so either direction
    // flips it. That is what the player means by pressing either one.
    if (el.tagName === 'BUTTON') {
      el.click();
      return true;
    }
    return false;
  }

  /** Presses the focused control. Returns what was pressed, or null. */
  activate() {
    const el = this.el;
    if (!el || el.disabled) return null;
    // CROSS on a stepper steps it up. It is the only control on these screens
    // with no single obvious action, and doing nothing at all would read as a
    // control the button does not work on.
    if (el.classList.contains('stepper')) {
      const key = el.querySelector('.step-btn:last-child');
      if (key && !key.disabled) key.click();
      return el;
    }
    el.click();
    // Buttons come and go as they are used - BACK closes the screen its
    // neighbours live on, a stepper key disables itself at the end of its
    // range - so the selection is re-seated rather than left on a node that
    // may now be gone or dead.
    if (!this.root || !this.root.contains(el) || el.disabled || el.offsetParent === null) {
      this.focus(this._default());
    }
    return el;
  }
}

// ---- the name keyboard ----------------------------------------------------

// Four rows of ten. A-Z then 0-9 in reading order, because a player hunting
// for a letter on a grid they have never seen scans alphabetically and nothing
// else; a QWERTY layout would be a map of a keyboard that is not in the room.
