import { defineActiveItem } from '../shared.js';

// ---- the floor, and the wallet ------------------------------------------
export const id = 'itemTransfusion';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BLOOD TRANSFUSION',
    charge: 20,
    theme: THEME.blood,
    // EVERY PLATE ON THE FLOOR BECOMES A HEALTH PLATE. It is the one item that
    // acts on the LOOT rather than on the room, and what it is worth is
    // decided entirely by what a wave happened to drop - which makes it the
    // second item in the pool (after BODY COUNT) whose whole skill is knowing
    // when the floor is worth it.
    //
    // TWENTY POINTS, BECAUSE IT CAN BE WORTH NOTHING. An empty floor is an
    // empty press, out loud, and a floor with four ammo crates on it is a
    // hundred health - the spread is enormous and the charge is priced at the
    // bottom of it.
    //
    // THE PLATES ARE REPLACED WHERE THEY LIE, keeping the time they have left,
    // so a crate that was about to blink out becomes a health plate that is
    // about to blink out. Moving them to the player would make this a heal
    // with extra steps; leaving them where they are is what keeps it a thing
    // that happened to the ARENA.
    effects: [['ALL PICKUPS BECOME', GOOD], ['HEALTH PICKUPS', NOTE]],
    use: (game) => {
      const n = game._transfuse();
      const p = game.player;
      if (!n) {
        game.sfx.denied();
        game.effects.shockwave(p.pos, THEME.blood, 3, 0.3);
        return;
      }
      game.effects.shockwave(p.pos, THEME.blood, 26, 0.8);
      game.ui.banner('TRANSFUSED ' + n);
      game.sfx.itemHeal2();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........22222221........',
  '......222111112221......',
  '.....22111....11221.....',
  '....2111........1121....',
  '...221............211...',
  '...22211..........11....',
  '..12221....42...........',
  '...1221....42...........',
  '....121...4432..........',
  '.....11..443332.........',
  '.........433332..21.....',
  '.........433332..221....',
  '.........433332..2221...',
  '.........223222..22211..',
  '....21.....22...11221...',
  '...121............211...',
  '....1221........2211....',
  '.....12221....22211.....',
  '......112222222111......',
  '........11111111........',
  '........................',
  '........................',
];
