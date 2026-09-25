import { defineActiveItem } from '../shared.js';

export const id = 'itemEmptyPromise';

const ITEM_THEME = 0x689f38;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'EMPTY PROMISE',
    charge: 60,
    theme: ITEM_THEME,
    // THE WHOLE RESERVE, SET ON FIRE, AT THREE ROUNDS TO THE POINT. GRAFT's
    // promise carried on the ammo bill: what comes back is permanent max
    // health, banked into hpBanked where GRAFT banks its three, so it
    // survives rebuildMods and shows up in the cap without anything being
    // taught about it. The health it bought is granted at the same moment,
    // because a cap that rose with the bar staying thin is a number nobody
    // saw.
    //
    // Sixty points and the ROUNDS BOTH, on GRAFT's rule: a permanent gain
    // has to be rare or it is not a decision, it is a tax on not pressing
    // the button. A full early reserve is ninety rounds - thirty points on
    // the bar - and an endgame one is over twice that, which is the whole
    // shape: the item is worth most to the run that has stopped needing the
    // ammunition at all.
    //
    // REFUSED WHEN THE RESERVE CANNOT PAY A POINT. A press at two rounds
    // would destroy them for nothing - LANCE's rule again, the charge spent
    // on a trade with no goods at the other end.
    effects: [['DESTROY ALL RESERVE AMMO', NOTE], ['GAIN MAX HP FROM IT', GOOD], ['1 HP PER 3 ROUNDS', NOTE]],
    ready: (game) => game.player.reserveAmmo >= 3,
    use: (game) => {
      const p = game.player;
      const rounds = p.reserveAmmo;
      const gain = Math.floor(rounds / 3);
      p.reserveAmmo = 0;
      p.hpBanked += gain;
      // The new cap includes the bank the instant it is written (maxHealth
      // is a getter), so this heal can only land in headroom the press just
      // created - the bar grows AND fills by the same number, which is what
      // a graft is for.
      p.heal(gain);
      game.ui.flashReserve();
      game.ui.banner('+' + gain + ' MAX HP');
      game.effects.shockwave(p.pos, ITEM_THEME, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0x689f38, 24, 5, 3, 0.7);
      game.sfx.itemGraft();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..........444441........',
  '.........44222221.......',
  '.........42322321.......',
  '.........12233221.......',
  '...44441..11411124441...',
  '...44221...1..1.42241...',
  '...42221....41..42221...',
  '...112200000000002111...',
  '.....40000000000001.....',
  '.....42222222222221.....',
  '.....42222220222221.....',
  '.....42222220222221.....',
  '.....42222220222221.....',
  '.....42222220222221.....',
  '.....42222220222221.....',
  '.....11111111111111.....',
  '........................',
  '........................',
  '........................',
];
