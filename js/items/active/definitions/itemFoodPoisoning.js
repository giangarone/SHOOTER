import { defineActiveItem } from '../shared.js';

export const id = 'itemFoodPoisoning';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'FOOD POISONING',
    charge: 40,
    theme: THEME.poison,
    // BRIMSTONE IN THE OTHER ELEMENT, AT THE OTHER SHAPE. Fire is three
    // seconds and a high rate; poison everywhere in this game is long and
    // patient (see status.js), so this is eight seconds of the whole room
    // going down slowly - and the difference on the floor is that a crowd
    // BRIMSTONE would have killed outright is instead a crowd that dies while
    // the player deals with something else.
    //
    // ONE OF THE PLAYER'S OWN SHOTS PER TICK, half of what BRIMSTONE's fire is
    // worth, because poison ticks once a beat where fire ticks twice - so the
    // two items are the same total damage arriving at different speeds, and
    // both are still worth a slot at wave thirty.
    effects: [['POISON ALL ENEMIES', GOOD], ['FOR 8s', NOTE]],
    use: (game) => {
      let n = 0;
      const dose = game.player.dotHit;
      for (const e of game.enemies) {
        if (e.dead) continue;
        e.applyStatus('poison', 8, dose);
        game.effects.impact(e.pos, 0x39d353, 6, 3, 2.5, 0.5);
        n++;
      }
      game.effects.shockwave(game.player.pos, THEME.poison, 30, 0.9);
      if (n) game.effects.addShake(0.2);
      game.sfx.itemBlast();
    },
}));
