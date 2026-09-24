import { defineActiveItem } from '../shared.js';

export const id = 'itemHeal';

const ITEM_THEME = 0x00e676;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'TRAUMA KIT',
    charge: 50,
    theme: ITEM_THEME,
    // NO OVERHEAL, unlike the health pickup, which goes 25 over the cap. A
    // pickup has to be walked to across a live arena and this is a button, so
    // the button is the weaker of the two at the thing they both do. Forty
    // seconds is most of a wave: it is one recovery per fight, not a tap.
    effects: [['HEAL 25 HP', GOOD]],
    use: (game) => {
      const p = game.player;
      p.heal(25);
      game.effects.shockwave(p.pos, ITEM_THEME, 5, 0.5);
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '..........22221.........',
  '..........20001.........',
  '..........20001.........',
  '...2222222222222222221..',
  '...2222222222222222221..',
  '...2222222233322222221..',
  '...2222222233322222221..',
  '...2222222233322222221..',
  '...2222222233322222221..',
  '...1113333333333333111..',
  '...1113333333333333111..',
  '...2223333333333333221..',
  '...2222222233322222221..',
  '...2222222233322222221..',
  '...2222222233322222221..',
  '...2222222233322222221..',
  '...2222222222222222221..',
  '...2222222222222222221..',
  '...1111111111111111111..',
  '........................',
  '........................',
];
