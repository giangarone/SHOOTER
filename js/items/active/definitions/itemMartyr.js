import { defineActiveItem } from '../shared.js';

export const id = 'itemMartyr';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'MARTYR',
    charge: 60,
    theme: THEME.blast,
    // THE BIGGEST NUMBER IN THE POOL, AND THE ONLY ONE THAT COSTS EVERYTHING.
    // It is not a nuke with a downside: it is a trade the player makes at ten
    // percent health either way, and pressing it at full health is how the
    // item teaches what it does. Sixteen metres is most of the arena.
    //
    // It cannot kill you. A button that ends the run is not a decision, it is
    // a misclick - and the ten HP left is the item's real cost, because the
    // next thing that touches you finishes the job.
    effects: [['HUGE BLAST AT YOUR FEET', GOOD], ['LEAVES YOU AT 10 HP', NOTE]],
    use: (game) => {
      const p = game.player;
      _v.set(p.pos.x, 0, p.pos.z);
      // TWENTY OF THE PLAYER'S OWN SHOTS, read live off the gun rather than
      // the flat 400 it used to be - the biggest number in the pool has to
      // still be the biggest number in the pool at wave thirty.
      game._blast(_v, p.getEffectiveDamage(p.weapon.damage) * 20, 16, null, false);
      p.health = Math.min(p.health, 10);
      p.clearCarnage();
      game.effects.shockwave(_v, THEME.blast, 16, 1.0);
      game.effects.burst(p.eyeInto(_v), 0xffe9a8, 50, 16, 6, 0.9);
      game.effects.burst(p.pos, 0xff6f00, 60, 12, 8, 1.1);
      game.effects.addShake(0.9);
      game.pad.rumble(1, 0.9, 420, 2);
      game.sfx.itemBlast();
    },
}));
