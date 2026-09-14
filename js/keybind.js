// THE REBINDABLE KEYBOARD. The keydown and keyup handlers in main.js used to
// name their keys in the case labels ('KeyW', 'KeyR') and the start screen's
// control sheet in padmenu.js repeated them again as art - two lists of one
// fact, and a rebind system is the moment they would have started
// disagreeing. Both now ask this module, which is the one place a key's
// meaning lives and which also owns the save.
//
// Codes are KeyboardEvent.code throughout - the PHYSICAL key, so a binding
// travels with the player's hands rather than with whatever the OS keyboard
// layout says the key prints.

import { BTN_NAMES } from './pad.js';

// ---- the labels -------------------------------------------------------------

// Modifiers are read as FAMILIES, not sides. Sprint has always been "either
// shift" and crouch "either ctrl"; folding the two into one token here means
// every consumer gets that for free and a rebind onto one of them grabs the
// pair, which is what a player who has just pressed one of them means.
const FAMILIES = {
  ShiftLeft: 'ShiftAny', ShiftRight: 'ShiftAny',
  ControlLeft: 'ControlAny', ControlRight: 'ControlAny',
  AltLeft: 'AltAny', AltRight: 'AltAny',
};

/** A code as it is stored and compared. Idempotent. */
export function normCode(code) {
  return FAMILIES[code] || code;
}

// What a code is CALLED on screen. Everything here is short: a keycap is read
// as a shape, and punctuation stays punctuation because that is what is
// printed on the key.
const LABELS = {
  Space: 'SPACE', Tab: 'TAB', Enter: 'ENTER', Backspace: 'BKSP', Escape: 'ESC',
  CapsLock: 'CAPS', ContextMenu: 'MENU', PrintScreen: 'PRTSC', ScrollLock: 'SCRLK',
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  Insert: 'INS', Delete: 'DEL', Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN',
  ShiftAny: 'SHIFT', ControlAny: 'CTRL', AltAny: 'ALT',
  ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT', AltRight: 'R-ALT',
  MetaLeft: 'META', MetaRight: 'META',
};

/** One key's name for a cap, a row or a message. */
export function keyLabel(code) {
  if (LABELS[code]) return LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const np = /^Numpad(.+)$/.exec(code);
  if (np) return 'NUM ' + np[1].toUpperCase();
  return code.toUpperCase();
}

// ---- the table ----------------------------------------------------------------

// The bindable actions, in the order the settings rows and the control sheet
// show them. Escape is deliberately absent: the browser also uses it to leave
// pointer lock and fullscreen, and the game only ever reads it as "close the
// screen on top" - a rebind would hand one press two meanings. The mouse
// buttons are absent for the same class of reason: they are not KeyboardEvent
// codes and the aim/shoot pair is the mouse's.
export const KEY_ACTIONS = [
  { id: 'forward', label: 'FORWARD', keys: ['KeyW'] },
  { id: 'back', label: 'BACK', keys: ['KeyS'] },
  { id: 'left', label: 'LEFT', keys: ['KeyA'] },
  { id: 'right', label: 'RIGHT', keys: ['KeyD'] },
  { id: 'sprint', label: 'SPRINT', keys: ['ShiftAny'] },
  { id: 'jump', label: 'JUMP', keys: ['Space'] },
  // Two keys by default, because both are the one players reach for. See
  // bind() for what happens to the pair when one of them is rebinded away.
  { id: 'crouch', label: 'CROUCH', keys: ['KeyC', 'ControlAny'] },
  { id: 'melee', label: 'MELEE', keys: ['KeyV'] },
  { id: 'reload', label: 'RELOAD', keys: ['KeyR'] },
  { id: 'item', label: 'ITEM', keys: ['KeyQ'] },
  { id: 'use', label: 'USE', keys: ['KeyE'] },
  { id: 'stats', label: 'STATS', keys: ['Tab'] },
  { id: 'fullscreen', label: 'FULLSCREEN', keys: ['KeyF'] },
];

// ---- the pad -------------------------------------------------------------------
//
// THE CONTROLLER'S HALF OF THE TABLE. Ten actions, one button each - the
// keyboard's fourteen minus five the hardware does not offer, plus the two
// the mouse owns on a keyboard (SHOOT and AIM, which on a pad are triggers).
// Until now this half was the fixed PAD_CONTROLS sheet in padmenu.js: the
// buttons were right but they were plastic, and a player who wanted R1 for
// jump had nowhere to say so.
//
// A pad binding is a NAME, not an index: 'cross', 'R1', 'TOUCH PAD'. The names
// come from BTN_NAMES in pad.js and are what the caps draw (a face button as
// its glyph, everything else as the word printed on the plastic), so a
// binding is legible in the store, in the settings rows and on the sheet
// without ever being translated back into a number.
//
// WHY THE MISSING FIVE ARE MISSING:
//   forward/back/left/right - the left stick is not four buttons. A stick is
//     one analogue input, and a rebind that offered it four ways would be
//     offering the same axis four times.
//   fullscreen - OPTIONS is the pause button and every other button is
//     spent; a browser's controller button for fullscreen does not exist.
//
// THE ONES THAT READ DIFFERENTLY ON A PAD, though the table does not care:
// sprint is a TOGGLE (clicking a stick is not something to hold for the
// length of a retreat), crouch is a HELD boolean that player.js turns into a
// toggle-or-slide, and shoot is a trigger with an analogue value, whose edge
// reading stays in _padPlay where it always was. The table only speaks in
// which button means which action; the shape of the press is the game's.
// The buttons NO ACTION may take. Exported because the capture in main.js
// has to tell a fixed press (swallowed, the row keeps listening) from a
// bindable one - the same distinction _rebindCapture makes for Meta and the
// numpad on the keyboard.
const PAD_FIXED = {
  // The pad's own OS/menu buttons, and the D-pad the menus walk. Fixed for
  // the same class of reason Escape is on the keyboard: a rebind onto them
  // would strand the menus themselves, and there is nothing else to give.
  CREATE: null, OPTIONS: null, PS: null,
  UP: null, DOWN: null, LEFT: null, RIGHT: null,
};
export const isPadFixed = (name) => Object.prototype.hasOwnProperty.call(PAD_FIXED, name);

// The row order the settings screen shows them in: the same order as the pad
// sheet, so a row and its cap on the start screen are never more than a
// screen apart.
export const PAD_ACTIONS = [
  { id: 'jump', label: 'JUMP', btn: 'cross' },
  { id: 'crouch', label: 'CROUCH', btn: 'circle' },
  { id: 'reload', label: 'RELOAD', btn: 'square' },
  { id: 'use', label: 'TAKE', btn: 'triangle' },
  { id: 'aim', label: 'AIM', btn: 'L2' },
  { id: 'shoot', label: 'SHOOT', btn: 'R2' },
  { id: 'item', label: 'ITEM', btn: 'R1' },
  { id: 'melee', label: 'MELEE', btn: 'R3' },
  { id: 'sprint', label: 'SPRINT', btn: 'L3' },
  { id: 'stats', label: 'STATS', btn: 'TOUCH PAD' },
];

const STORE = 'va-keys';
const PAD_STORE = 'va-pad-keys';
// A stored entry must look like a code. Anything else - a hand-edited store,
// a half-written one - falls back to that row's default rather than shipping
// a binding no switch can ever press.
const CODE_OK = /^[A-Za-z][A-Za-z0-9]*$/;
// The same test for a stored pad name. 'TOUCH PAD' has a space, which CODE_OK
// would refuse, so the rule is spelled for the pad's own vocabulary instead.
const PAD_NAME_OK = /^[A-Za-z][A-Za-z ]*$/;

function defaults() {
  const map = {};
  for (const a of KEY_ACTIONS) map[a.id] = a.keys.slice();
  return map;
}

function load() {
  const map = defaults();
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch {}
  if (!raw || typeof raw !== 'object') return map;
  for (const a of KEY_ACTIONS) {
    const v = raw[a.id];
    if (Array.isArray(v) && v.length && v.every((c) => typeof c === 'string' && CODE_OK.test(c))) {
      map[a.id] = v.map(normCode);
    }
  }
  return map;
}

function padDefaults() {
  const map = {};
  for (const a of PAD_ACTIONS) map[a.id] = a.btn;
  return map;
}

// The pad's load, on the same rule as the keyboard's: one button per action,
// a bad entry falls back to the default, and PAD_FIXED is the whole refusal
// list - a name that is fixed cannot be a binding, so it is rejected here
// rather than bound and stranded.
function padLoad() {
  const map = padDefaults();
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(PAD_STORE) || 'null'); } catch {}
  if (!raw || typeof raw !== 'object') return map;
  for (const a of PAD_ACTIONS) {
    const v = raw[a.id];
    if (typeof v === 'string' && PAD_NAME_OK.test(v)
      && !Object.prototype.hasOwnProperty.call(PAD_FIXED, v)) {
      map[a.id] = v;
    }
  }
  return map;
}

export class Keybinds {
  constructor() {
    this.map = load();
    // The pad table, loaded beside the keyboard one because the actions are
    // shared and so is the save - one class, two devices, one row order.
    this.padMap = padLoad();
  }

  save() {
    try { localStorage.setItem(STORE, JSON.stringify(this.map)); } catch {}
  }

  /** True when `code` - normalized - is one of `id`'s bindings. */
  is(id, code) {
    const b = this.map[id];
    return !!b && b.includes(normCode(code));
  }

  codes(id) {
    return this.map[id] || [];
  }

  /** The row label: every key the action answers to, "C / CTRL" style. */
  label(id) {
    return this.codes(id).map(keyLabel).join(' / ');
  }

  /**
   * Rebinds an action to one key. Returns the action whose key could not be
   * taken, or null on success.
   *
   * A STEAL IS ALLOWED when the other action can spare the key - crouch
   * defaults to a pair, so melee can take C and leave it the Ctrl - but a key
   * that is an action's LAST one is refused: an empty binding is a game that
   * cannot be played, and "the rebind took your only crouch key" is a fact
   * no player should have to reconstruct from the rows.
   *
   * Rebinding an action REPLACES its list rather than appending to it: the
   * second key of a pair is a default, not a promise, and a player who has
   * moved the action has said where it lives now.
   */
  bind(id, code) {
    code = normCode(code);
    if (this.map[id].includes(code)) return null;
    for (const other of KEY_ACTIONS) {
      if (other.id === id) continue;
      const theirs = this.map[other.id];
      const at = theirs.indexOf(code);
      if (at === -1) continue;
      if (theirs.length === 1) return other.id;
      theirs.splice(at, 1);
    }
    this.map[id] = [code];
    this.save();
    return null;
  }

  // ---- the pad -------------------------------------------------------------
  //
  // ONE BUTTON PER ACTION, so there is no pair to spare and no steal: a
  // pad bind is a SWAP with whichever action already owns the button. That
  // is the only polite answer on ten buttons and ten actions - refusing
  // would strand the player on a layout they have already said is wrong,
  // and a swap is what a player holding both buttons means.

  /** True when `name` - a BTN_NAMES entry - is `id`'s pad binding. */
  padIs(id, name) {
    return this.padMap[id] === name;
  }

  /** The button name `id` is bound to on the pad. */
  padBtn(id) {
    return this.padMap[id] || '';
  }

  /**
   * Rebinds a pad action, SWAPPING with the action that owns the button.
   * Returns null - there is no refusal, and no action is ever left empty,
   * because the previous owner takes the button being given up. A name that
   * is not a pad button at all is ignored rather than bound: it could only
   * come from a hand-edited store or a stale version, and the row keeps the
   * binding it had.
   */
  padBind(id, name) {
    if (!this.padMap.hasOwnProperty(id)) return null;
    if (!BTN_NAMES.includes(name) || PAD_FIXED.hasOwnProperty(name)) return null;
    if (this.padMap[id] === name) return null;
    for (const other of PAD_ACTIONS) {
      if (other.id !== id && this.padMap[other.id] === name) {
        this.padMap[other.id] = this.padMap[id];
      }
    }
    this.padMap[id] = name;
    this.savePad();
    return null;
  }

  /** The row label: the button's name, for a cap or a row. */
  padLabel(id) {
    return this.padBtn(id);
  }

  padReset() {
    this.padMap = padDefaults();
    this.savePad();
  }

  savePad() {
    try { localStorage.setItem(PAD_STORE, JSON.stringify(this.padMap)); } catch {}
  }

  /**
   * THE PAD SHEET for the start screen, in the same fifteen-row shape as
   * sheet(): a fixed frame around the ten rebindable rows. The five rows a
   * pad cannot change - MOVE, LOOK, MENU, PAUSE and the D-pad - are the
   * hardware's own, printed on its plastic, and they stay in the order the
   * keyboard sheet put them in so the two sheets read as one list.
   */
  padSheet() {
    const P = (id) => this.padBtn(id);
    return [
      ['L STICK', 'MOVE'], [P('sprint'), 'SPRINT'], ['R STICK', 'LOOK'],
      [P('shoot'), 'SHOOT'], [P('aim'), 'AIM'], [P('melee'), 'MELEE'],
      [P('item'), 'ITEM'], [P('jump'), 'JUMP'], [P('reload'), 'RELOAD'],
      [P('crouch'), 'CROUCH'], [P('sprint') + ' ' + P('crouch'), 'SLIDE'],
      [P('use'), 'TAKE'], [P('stats'), 'STATS'], ['D-PAD', 'MENU'],
      ['OPTIONS', 'PAUSE'],
    ];
  }

  reset() {
    this.map = defaults();
    this.save();
  }

  /**
   * The KEYBOARD sheet for the start screen, in its fifteen-row shape.
   *
   * LOOK and AIM are two different things and the sheet has to say so: LOOK
   * is the mouse turning the view, AIM is the right button raising the gun.
   * Naming them both "aim" was the state of this list before the sights
   * existed.
   *
   * CROUCH and SLIDE are listed SEPARATELY even though they are one button:
   * which of the two a press gives you depends on whether you are already
   * running, and a single row reading "CROUCH / SLIDE" would leave the player
   * to guess at the rule. The slide's cap says SPRINT and then the button,
   * which is the input, in order.
   *
   * ESC and the mouse rows are fixed text: those are the bindings this table
   * does not own - see the note on KEY_ACTIONS.
   */
  sheet() {
    const L = (id) => this.label(id);
    // MOVE is the four directions in W-A-S-D order, fused into one cap while
    // they are all single characters - the word "WASD" is what the eye is
    // looking for - and spaced once a rebind makes any of them a word.
    const move = ['forward', 'left', 'back', 'right'].map(L);
    const moveStr = move.every((s) => s.length === 1) ? move.join('') : move.join(' ');
    return [
      [moveStr, 'MOVE'], [L('sprint'), 'SPRINT'], ['MOUSE', 'LOOK'],
      ['LMB', 'SHOOT'], ['RMB', 'AIM'], [L('melee'), 'MELEE'],
      [L('reload'), 'RELOAD'], [L('jump'), 'JUMP'], [L('item'), 'ITEM'],
      [L('crouch'), 'CROUCH'], [L('sprint') + ' ' + keyLabel(this.codes('crouch')[0]), 'SLIDE'],
      [L('use'), 'USE'], [L('stats'), 'STATS'], [L('fullscreen'), 'FULLSCREEN'],
      ['ESC', 'PAUSE'],
    ];
  }
}
