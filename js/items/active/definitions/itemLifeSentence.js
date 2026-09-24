import { defineActiveItem } from '../shared.js';

export const id = 'itemLifeSentence';

const ITEM_THEME = 0x8d6e63;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'LIFE SENTENCE',
    charge: 20,
    theme: ITEM_THEME,
    // A FULL HEAL FOR TWENTY POINTS, AND YOU ARE SLOWER FOREVER. It is the
    // cheapest full heal in the game by a distance - SIX CHAMBERS costs
    // thirty-six for a coin toss at one - and the price is not paid in health
    // or in money but in the thing the whole game is played with.
    //
    // TEN PERCENT, COMPOUNDING, AND IT NEVER COMES BACK. Two presses is a
    // fifth of the player's legs, four is a third, and a run that answers
    // every bad wave with this one arrives at wave twenty unable to leave
    // anything. That is the item: it always works, and it is always the last
    // thing you want to have needed.
    //
    // It rides `moveLoss`, a PERMANENT mark on the player beside hpBanked
    // rather than a mod, for the same reason GRAFT's three health is: a
    // rebuildMods() on the next totem claimed would wipe anything written into
    // the block, and this is meant to outlive the build.
    effects: [['HEAL TO FULL', GOOD], ['EACH PRESS: -10%', NOTE], ['MOVE SPEED, FOREVER', NOTE]],
    use: (game) => {
      const p = game.player;
      p.health = p.maxHealth;
      p.moveLoss *= 0.9;
      game.effects.shockwave(p.pos, ITEM_THEME, 8, 0.7);
      game.effects.burst(p.eyeInto(_v), 0x8d6e63, 30, 5, 3, 0.8);
      game.ui.banner('SENTENCED');
      game.sfx.itemGraft();
    },
}));

export const icon = [
  '........................',
  '...442..................',
  '.422222.................',
  '.42...42................',
  '.42...42................',
  '.42...42................',
  '.232.442................',
  '..224431................',
  '....42221...............',
  '....112221....21........',
  '......1222222222221.....',
  '.......1222222222221....',
  '........1222222222221...',
  '.........222222222221...',
  '........22222222222221..',
  '........22224222222221..',
  '........22222222222221..',
  '........22222222222221..',
  '........12222222222211..',
  '.........222222222221...',
  '.........122222222211...',
  '..........1122222111....',
  '............111111......',
  '........................',
];
