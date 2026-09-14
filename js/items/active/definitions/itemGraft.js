import { defineActiveItem } from '../shared.js';

export const id = 'itemGraft';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'GRAFT',
    charge: 60,
    theme: THEME.temper,
    // THE ONLY ITEM THAT LEAVES A MARK ON THE RUN. Everything else in the pool
    // is spent the moment it is pressed; this one is three health that is
    // still there an hour later, and a run that carries it from wave four to
    // wave twenty is carrying a real number by the end.
    //
    // It rides hpBanked - the field UNTOUCHED and SCAR TISSUE already write -
    // rather than a new one, so it survives rebuildMods() and shows up in the
    // maxHealth getter without anything being taught about it.
    //
    // Sixty seconds, and it stays sixty. A permanent gain has to be rare or it
    // is not a decision, it is a tax on not pressing the button.
    effects: [['+3 MAX HEALTH', GOOD], ['PERMANENTLY', GOOD]],
    use: (game) => {
      const p = game.player;
      p.hpBanked += 3;
      heal(p, 3);
      game.effects.shockwave(p.pos, THEME.temper, 6, 0.6);
      game.effects.burst(p.eyeInto(_v), 0xb2ff59, 24, 5, 3, 0.7);
      game.ui.banner('+3 MAX HP');
      game.sfx.itemGraft();
    },
}));
