import { defineActiveItem } from '../shared.js';

export const id = 'itemArc';

const ITEM_THEME = 0xffee58;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: "JACOB'S LADDER",
    charge: 40,
    theme: ITEM_THEME,
    // A CHAIN, NOT A BURST, and the difference is the whole drawing: the bolt
    // walks from the player through five bodies in order, so what the item did
    // is legible as a LINE afterwards. Arc Rounds already owns the one-hop
    // jump; this is that idea taken as far as it goes.
    //
    // Five, because the beam pool and the eye both stop being able to follow a
    // chain at about six links, and because a number the player can count is
    // worth more here than a number that scales.
    // TWICE ONE OF THE PLAYER'S OWN SHOTS PER LINK, read live off the gun
    // through getEffectiveDamage the way BOOTSTRAP's blast is - so a flat 45
    // that had stopped mattering by wave ten is now five hits that are still
    // worth a slot at wave thirty.
    effects: [['ZAP THE 5 NEAREST', GOOD], ['ENEMIES, CHAINED', NOTE]],
    use: (game) => {
      const p = game.player;
      const dmg = p.getEffectiveDamage(p.weapon.damage) * 2;
      const chain = nearestEnemies(game, 5);
      if (!chain.length) {
        game.effects.shockwave(game.player.pos, ITEM_THEME, 6, 0.4);
        return;
      }
      let from = game.player.eyeInto(_v).clone();
      for (const e of chain) {
        const to = e.pos.clone().setY(1.0);
        game.effects.beam(from, to, 0xffee58);
        game.effects.lightning(e.pos.x, e.pos.z, 2.2);
        game.hurtEnemy(e, dmg);
        from = to;
      }
      game.effects.addShake(0.2);
      game.sfx.itemArc();
    },
}));

export const icon = [
  '........................',
  '........................',
  '...221............4221..',
  '...221.......444444321..',
  '...221.444444433222321..',
  '...23344332222222..221..',
  '...23222222........221..',
  '...222...........44221..',
  '...221.....44444422321..',
  '...222444444222222.221..',
  '...2332222222......221..',
  '...2222............221..',
  '...221.........4444221..',
  '...221....444222222221..',
  '...22344222222.....221..',
  '...222222..........221..',
  '...221.............221..',
  '...221........22222221..',
  '...221...222222....221..',
  '...2222222.........221..',
  '...221.............221..',
  '...221.............221..',
  '...111.............111..',
  '........................',
];
