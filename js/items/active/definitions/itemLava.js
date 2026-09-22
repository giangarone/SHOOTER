import { defineActiveItem } from '../shared.js';

export const id = 'itemLava';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'FLOOR IS LAVA',
    charge: 40,
    theme: THEME.hellfire,
    // THE ONE ITEM THAT CHANGES WHERE THE GAME IS PLAYED. For four seconds the
    // arena floor is not a place anybody can stand - the player included - and
    // the only ground left is what the terrain generator put ABOVE it: the
    // decks, the tiers, the stairs and the crates the player has spent the
    // whole run running past.
    //
    // IT BURNS ITS OWN THROWER, AND THAT IS THE ITEM. Every other room-wide
    // payload in the pool is free to the player; this one is pressed and then
    // SURVIVED, which is why it is the only one whose value depends on where
    // the player was standing when they pressed it. Press it from a catwalk
    // and it is BRIMSTONE for forty points; press it in the open and it is
    // four seconds of being chased onto furniture.
    //
    // THE ENEMIES CANNOT ANSWER IT. They path on the floor, most of them
    // cannot climb, and the ones that fly are above it anyway - so what the
    // player is buying is four seconds in which the room's own geometry is the
    // only safe thing in it, and they are the only one who knows that.
    effects: [['THE WHOLE FLOOR BURNS', GOOD], ['YOU TOO, FOR 4s', NOTE], ['GET UP ON SOMETHING', NOTE]],
    duration: 4,
    use: (game) => {
      game._lavaFloorStart();
      game.effects.shockwave(game.player.pos, THEME.hellfire, 30, 1.0);
      game.effects.addShake(0.4);
      game.ui.banner('THE FLOOR IS LAVA');
      game.sfx.itemBlast();
    },
    tick: (game, s, dt) => { game._lavaFloorTick(dt); },
    end: (game) => { game._lavaFloorEnd(); },
}));
