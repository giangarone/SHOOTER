import { defineActiveItem } from '../shared.js';

// ---- the room, all at once (the second helping) -------------------------
export const id = 'itemPanic';

const ITEM_THEME = 0x9d4edd;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'PANIC BUTTON',
    charge: 30,
    theme: ITEM_THEME,
    // EIGHT SECONDS IN WHICH NOTHING IS COMING TOWARD YOU. It is CRYO PULSE's
    // opposite number and priced ten points under it: freeze holds the crowd
    // where it is and hands the player a stationary target, this sends the
    // crowd AWAY and hands them a scattered one. What the player buys is the
    // same thing either way - distance - and which is better is a question
    // about the room they are standing in.
    //
    // IT IS THE STATUS TERROR ALREADY APPLIES, so a boss staggers rather than
    // running (fearMode 'stagger' - see js/enemies/) and a resistant type
    // shortens it, exactly as they do for every other fear in the game. An
    // item that could send a boss to the far wall for eight seconds would be
    // the only boss strategy there is.
    effects: [['EVERY ENEMY FLEES', GOOD], ['FOR 8s', NOTE]],
    use: (game) => {
      for (const e of game.enemies) {
        if (e.dead) continue;
        e.applyStatus('fear', 8);
        game.effects.impact(e.pos, 0x9d4edd, 6, 3, 2.5, 0.5);
      }
      game.effects.shockwave(game.player.pos, ITEM_THEME, 30, 0.9);
      game.effects.addShake(0.25);
      game.sfx.itemRites();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '.........444442.........',
  '.......4443333342.......',
  '.....44433333333342.....',
  '....4433333333333332....',
  '....4333333333333332....',
  '....4333333333333332....',
  '....4333333333333332....',
  '....43333333333333332...',
  '....43333333333333332...',
  '....43333333333333322...',
  '....4333322222233332....',
  '....2222222222222221....',
  '..22222222222222222221..',
  '..222222222222222222221.',
  '..222222222222222222221.',
  '..122222222222222222111.',
  '...112222222222222111...',
  '.....22222222222221.....',
  '.....222222222222221....',
  '.....110000000000011....',
  '........................',
];
