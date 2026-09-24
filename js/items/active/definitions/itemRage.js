import { defineActiveItem } from '../shared.js';

export const id = 'itemRage';

const ITEM_THEME = 0xff3d00;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'OVERDRIVE',
    charge: 60,
    theme: ITEM_THEME,
    // Rides damageBoostEnd, the same field the RAGE pickup uses, so it expires
    // through machinery that already exists and shows in the buff strip without
    // being taught to. Math.max against whatever is already running, because a
    // rage pickup landing on top of this must not DOWNGRADE it to 1.5x - the
    // shorter of two overlapping boosts still wins the expiry, which is the
    // honest reading of "for 5 seconds".
    effects: [['2x DAMAGE FOR 10s', GOOD]],
    use: (game) => {
      const p = game.player;
      p.damageMult = Math.max(p.damageMult, 2);
      // The length goes with the deadline, and ONLY when this write wins it:
      // five seconds landing under a rage pickup's remaining ten must leave
      // the HUD chip measuring against the ten it is actually counting down.
      const end = game.time + 10;
      if (end > p.damageBoostEnd) {
        p.damageBoostEnd = end;
        p.damageBoostFull = 10;
      }
      game.effects.shockwave(p.pos, ITEM_THEME, 6, 0.6);
    },
}));

// PAST THE REDLINE. A mil-marked dial with its needle buried in the red
// zone, the hub lit, and bolts coming off both sides - twice the damage,
// ten seconds, no further questions.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '.........433331.........',
  '.......4232223331.......',
  '......423222234331......',
  '......322222234331......',
  '......322222232321......',
  '......322222322321......',
  '......322224432221......',
  '....4.222232222221.4....',
  '...33.222222222221.33...',
  '...3...2222222221...3...',
  '..4.....22222221.....4..',
  '........21111111........',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
