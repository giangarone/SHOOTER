import { defineActiveItem } from '../shared.js';

export const id = 'itemCrit';

const ITEM_THEME = 0xff80ab;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'SWEET SPOT',
    charge: 60,
    theme: ITEM_THEME,
    // EIGHT SECONDS OF THE THING THE PLAYER HAS BEEN ROLLING FOR. Every run has
    // seen the yellow number since its first magazine - critChance is 5% in
    // DEFAULT_MODS precisely so that it has - so this item does not have to
    // teach anything. It hands over a number the player already wants more of.
    //
    // IT DOES NOT SET critChance TO 1, and the difference matters at both ends.
    // A window written into `mods` would be handed straight back by the next
    // totem walked into (rebuildMods replays the owned list from defaults), and
    // it would also OVERWRITE a DEAD CENTER run's halved chance rather than
    // sitting on top of it. `itemCritEnd` is a deadline on the player, read at
    // the moment a pellet lands (Game._resolveHit), which means the crit
    // MULTIPLIER is still whatever the build says it is: a run carrying DEAD
    // CENTER presses this and gets eight seconds of triple damage.
    //
    // Sixty - the pool's top price, beside AEGIS and OVERDRIVE. It is a damage
    // window like OVERDRIVE and it is worth slightly less on a bare build
    // (1.5x against 2x) and a great deal more on one that has drafted for it,
    // which is exactly the shape an item that rewards a build should have.
    effects: [['EVERY SHOT CRITS', GOOD], ['FOR 8s', NOTE]],
    duration: 8,
    hud: true,
    use: (game) => {
      const p = game.player;
      p.itemCritEnd = Math.max(p.itemCritEnd, game.time + 8);
      game.effects.shockwave(p.pos, ITEM_THEME, 6, 0.55);
      game.effects.burst(p.eyeInto(_v), 0xffe95e, 22, 5, 3, 0.6);
      game.sfx.itemSurge();
    },
    // Written back to zero rather than trusted to expire, for the same reason
    // every other window in this file has an end(): a wave boundary, a death or
    // a versus handover clears the running list, and a deadline that outlived
    // its chip would be eight seconds nobody was granted.
    end: (game) => { game.player.itemCritEnd = 0; },
}));

export const icon = [
  '........................',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '.......4..4222..4.......',
  '........44422344........',
  '........44000044........',
  '.......4400440032.......',
  '.2222222204444022222221.',
  '.1111112204444021111111.',
  '.......2300440022.......',
  '........44000044........',
  '........44322244........',
  '.......4..2212..4.......',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '...........21...........',
  '...........11...........',
  '........................',
];
