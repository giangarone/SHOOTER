import * as THREE from 'three';
import { THEME } from '../passive/shared.js';
import {
  Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE,
} from '../../deploy.js';
import { BURN_TICK, POISON_TICK } from '../../enemies/index.js';
import { BOUND } from '../../arena.js';

// Scratch vectors. Every one of these functions runs at most once per button
// press, but they run inside the render loop and the game allocates nothing
// per frame anywhere else either.
const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();

// ---- shared helpers -------------------------------------------------------

// The living enemies, nearest first, capped. Four items pick "the N closest"
// and a sort per item would be four sorts that could disagree about what
// "closest" measures from - this measures from the player's FEET, which is
// where every enemy position in the game already is.
function nearestEnemies(game, n, from = game.player.pos) {
  const out = [];
  for (const e of game.enemies) {
    if (!e.dead) out.push(e);
  }
  out.sort((a, b) => a.pos.distanceToSquared(from) - b.pos.distanceToSquared(from));
  out.length = Math.min(out.length, n);
  return out;
}

// The direction the player is looking, flattened onto the floor. Everything
// thrown, placed or aimed by an item uses this, so no two of them can disagree
// about which way "forward" is - and it is the same -sin/-cos pair Player.dash
// builds its heading from.
function facing(game, out = _dir) {
  return out.set(-Math.sin(game.player.yaw), 0, -Math.cos(game.player.yaw));
}

// Heals without ever going over the cap. Six items do this and the seventh
// would have been the one that forgot.
//
// A PASSTHROUGH NOW, and worth keeping as one: the clamp moved onto the player
// when OVERDRAW needed a single place to see what did not fit (see
// Player.heal), and the six call sites below read better asking to heal a
// player than reaching into one.
function heal(player, amount) {
  player.heal(amount);
}

// Takes health as a PRICE rather than as damage: it does not go through the
// damage sinks, so Evasion cannot dodge it, Holy Mantle cannot eat it, Thorns
// cannot reflect it and Carnage does not drop. An item's own cost is not
// something happening TO the player - they pressed the button - and it can
// never kill them, which is what the floor of 1 is for.
function pay(player, amount) {
  player.health = Math.max(1, player.health - amount);
}

// The lines under an item's name on the box's card, in the same vocabulary
// items/passive/index.js uses - 1 benefit, 0 qualifier. An item has no drawbacks to draw
// in red: what it costs is the slot, and the slot is not on the card.
const GOOD = 1;
const NOTE = 0;

// WHAT AN ITEM'S READOUT DOES NOT SAY: how long it takes to charge.
//
// It is the most quotable number an item has and it is deliberately nowhere -
// not on the box's card, not in the prompt, not in the HUD. The bar already
// answers it, in the only unit it is ever thought about in: one segment is one
// second, so a glance at the slot says "three blocks" or "twenty hairlines"
// without a number, and the answer arrives from having carried the thing rather
// than from having read it. A player choosing between a heal and a dash should
// be weighing what they do, and a printed "20s" makes that a sum instead.


export const PAY_TO_WIN_COST = 1000;
export const PARACHUTE_COST = 5000;

const ACTIVE_ITEM_CONTEXT = Object.freeze({
  THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey,
  MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE,
  PAY_TO_WIN_COST, PARACHUTE_COST,
  // The flat per-tick rates every burn and poison in the game is charged at -
  // passed through so an item that sets fire or poisons never has to import
  // the enemy module for the game's own number.
  BURN_TICK, POISON_TICK,
});

export function defineActiveItem(build) {
  return build(ACTIVE_ITEM_CONTEXT);
}
