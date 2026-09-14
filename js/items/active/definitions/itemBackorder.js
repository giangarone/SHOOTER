import { defineActiveItem } from '../shared.js';

export const id = 'itemBackorder';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BACKORDER',
    charge: 60,
    theme: THEME.vitality,
    // TWENTY-FIVE HEALTH, IN TEN SECONDS' TIME. TRAUMA KIT is twenty-five now
    // for fifty, so this is dearer AND slower - and what the extra ten points
    // of charge buy is that the parcel is already paid for when the fight
    // turns. It is pressed at the top of a wave, not in the middle of one.
    //
    // IT IS NOT A RUNNING ITEM, deliberately. Every window in the running list
    // is torn down when a wave ends (see RunningActiveItems.clear, called from
    // _clearHazards), and a delivery that was silently cancelled by the wave
    // clearing under it would read as the item having simply failed. The
    // deadline lives on the PLAYER instead - one field, rebased across a
    // versus handover like every other clock there - so the parcel arrives
    // through the shop, through the next wave's opening, wherever the player
    // happens to be when the ten seconds are up.
    //
    // A DEATH CANCELS IT, which needs no code at all: the run is over, and
    // Player.reset clears the field with everything else.
    effects: [['HEAL 25 HP', GOOD], ['ARRIVES IN 10s', NOTE]],
    use: (game) => {
      const p = game.player;
      p.backordered = true;
      p.backorderAt = game.time + 10;
      game.effects.shockwave(p.pos, THEME.vitality, 5, 0.45);
      game.ui.banner('DISPATCHED');
      game.sfx.itemDeploy();
    },
}));
