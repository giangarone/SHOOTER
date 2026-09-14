import { defineActiveItem } from '../shared.js';

export const id = 'itemHumours';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'FOUR HUMOURS',
    charge: 40,
    theme: THEME.affliction,
    // EVERY ELEMENT IN THE GAME, ONE ROUND AT A TIME. The point is not the
    // damage - each of the four is weaker than the passive item that owns it -
    // it is that a crowd caught by eight seconds of this is burning AND
    // poisoned AND frozen AND arcing, and no draft the player could actually
    // assemble ever does all four at once.
    //
    // It cycles per SHOT and not per pellet, so one trigger pull is one
    // element however many pellets were in it - the same rule Hot Streak and
    // Devil's Gamble already follow.
    effects: [['SHOTS CYCLE FIRE, ICE,', GOOD], ['POISON, ARC, FOR 8s', NOTE]],
    duration: 8,
    use: (game) => {
      game.player.elementCycle = 0;
      game.effects.shockwave(game.player.pos, THEME.affliction, 6, 0.55);
      game.sfx.itemSurge();
    },
    end: (game) => { game.player.elementCycle = -1; },
}));
