import { defineActiveItem } from '../shared.js';

export const id = 'itemExecutive';

const ITEM_THEME = 0x880e4f;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'EXECUTIVE DECISION',
    charge: 120,
    theme: ITEM_THEME,
    // TWICE THE PRICE OF ANYTHING ELSE IN THE POOL, FOR ONE BOSS. A hundred
    // and twenty points is a hundred and twenty basic enemies - most of two
    // waves - which means it can be charged in the run-up to a boss and
    // nowhere else, and it can never be charged twice for the same one.
    //
    // IT IS THE ONLY THING IN THE GAME THAT IGNORES A HEALTH BAR. LAST RITES
    // finishes what the player already beat down; this deletes the fight from
    // full, and the reason it is allowed to exist at all is the price: a
    // player who spends two waves' worth of charge to skip the wave they were
    // charging it for has not won anything, they have chosen which fight to
    // have.
    //
    // THE WAVE STILL PAYS. The parts are killed rather than removed - unlike
    // GOLDEN PARACHUTE, which cannot pay or it refunds itself - because a boss
    // bounty is a fixed sum that no amount of pressing this can farm: there is
    // exactly one boss per boss wave.
    effects: [['KILL A BOSS INSTANTLY', GOOD]],
    // REFUSED WHERE THERE IS NO BOSS, on SECOND OPINION's terms: a press that
    // spent two waves of charge on an empty room would be the worst failure in
    // the pool by a distance.
    ready: (game) => !!game.bossFight && game.bossFight.parts.length > 0,
    use: (game) => {
      game._executeBoss();
      game.effects.shockwave(game.player.pos, ITEM_THEME, 30, 1.0);
      game.effects.addShake(0.8);
      game.ui.banner('TERMINATED');
      game.sfx.itemRites();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '....44444444444444444...',
  '....44444444444444444...',
  '....22222222222222221...',
  '....22222222222222221...',
  '....22222222222222221...',
  '....11111112211111111...',
  '...........221..........',
  '...........221..........',
  '...........221..........',
  '...........221..........',
  '...........221..........',
  '...........221..........',
  '...........111..........',
  '........................',
  '...4444444444444444442..',
  '...4333333333333333332..',
  '...4333333333333333332..',
  '...2222222222222221222..',
  '......2222222222221.....',
  '......1111111111111.....',
  '........................',
];
