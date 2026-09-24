import { defineActiveItem } from '../shared.js';

// =========================================================================
// THE REST OF THE POOL
// =========================================================================
//
// Thirty-three more, and the five above are unchanged - which is the test
// this whole extension had to pass. What made the original five work is that
// each is ONE decision the player makes at one second of one fight, and that
// is still the rule: nothing below is a passive with a button on it.
//
// THE FILE'S OLD NOTE SAID an item that needed a new system would be a system
// with one caller. That was true at five and it is not true at thirty-eight:
// seven items leave something in the arena, so there is one deployable list
// (js/deploy.js) with seven callers, and fourteen run for a window, so there
// is one running-item list with fourteen. Two systems, twenty-one callers.
// Nothing here has a system of its own.

// ---- the room, all at once ---------------------------------------------
export const id = 'itemPurify';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'WHITE CELL',
    // FIFTEEN, NOT TWENTY. It is the cheapest item in the pool and it should
    // be: what it answers is a status the player is already suffering, so a
    // meter that is still filling while they burn is an item that arrives
    // after the thing it was for. Everything else here creates an opportunity;
    // this one only ever undoes something.
    charge: 15,
    theme: THEME.antidote,
    // THE CLEANSE ALONE IS NOT THE ITEM. Every status in the game arrives from
    // something that is still there - a lava patch under your feet, a gas
    // cloud you are inside of, a cinder that is still chasing you - so a
    // cleanse with no window after it can be undone on the very next frame,
    // and an item whose whole payload expires before the button finishes being
    // pressed is one the player will call broken. Two seconds is enough to
    // walk out of what put it on you, which is the actual answer.
    effects: [['CLEAR ALL STATUS ON YOU', GOOD], ['THEN 2s IMMUNE', GOOD]],
    duration: 2,
    hud: true,
    use: (game) => {
      const p = game.player;
      p.clearStatuses();
      p.statusLockEnd = Math.max(p.statusLockEnd, game.time + 2);
      game.effects.shockwave(p.pos, THEME.antidote, 6, 0.55);
      game.effects.burst(p.eyeInto(_v), 0xd6ffdd, 22, 5, 3, 0.6);
      game.sfx.itemHeal2();
    },
    end: (game) => { game.player.statusLockEnd = 0; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '.......22222221.1.......',
  '.....222222222222221....',
  '....22222222222222221...',
  '...2222233333322222221..',
  '...2222333333330000221..',
  '..22223333333300000221..',
  '..222333333333000002211.',
  '..22233333333330000221..',
  '..22233333333333002221..',
  '..22233333333333322211..',
  '..2223333333333222211...',
  '..222333333333322221....',
  '..122233333333332211....',
  '...2222333333332221.....',
  '...1222233333322211.....',
  '....12222222222211......',
  '.....112222222111.......',
  '.......11111111.........',
  '........................',
  '........................',
  '........................',
];
