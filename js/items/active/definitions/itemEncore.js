import { defineActiveItem } from '../shared.js';

// ---- the windows on the gun ---------------------------------------------
export const id = 'itemEncore';

const ITEM_THEME = 0x6fd8c8;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'ENCORE',
    charge: 30,
    theme: ITEM_THEME,
    // EVERY TRIGGER PULL FIRED TWICE, AND THE SECOND ONE IS FREE. It is ECHO
    // CHAMBER's every-fourth-shot ghost turned all the way up for eight
    // seconds: the same pattern, the same spread, the same statuses, at full
    // strength and off no magazine at all.
    //
    // THE MAGAZINE IS WHAT MAKES IT A WINDOW AND NOT A BUFF. RED LINE doubles
    // the rate and doubles the reloads with it; this doubles the damage of a
    // magazine without touching the rounds, so eight seconds of it is eight
    // seconds where the gun is twice the gun AND lasts twice as long. Thirty
    // points is cheap for that, and it is meant to be: it is the item that
    // rewards being reloaded when it is pressed, which is a thing the player
    // has to have planned.
    //
    // IT DOES NOT STACK WITH ITSELF and cannot: re-firing refreshes, like
    // every other window in the running list.
    effects: [['EVERY SHOT FIRES TWICE', GOOD], ['FOR 8s, NO EXTRA AMMO', NOTE]],
    duration: 8,
    use: (game) => {
      game.player.encore = 1;
      game.effects.shockwave(game.player.pos, ITEM_THEME, 6, 0.55);
      game.sfx.itemSurge();
    },
    end: (game) => { game.player.encore = 0; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '.........1..............',
  '.........21.............',
  '........2221............',
  '........21121...........',
  '........21.11...........',
  '........21..21...42.....',
  '........21..11..4432....',
  '........21......4222....',
  '........21......42.42...',
  '........21......42.232..',
  '...2222221......42..22..',
  '..22222221......42......',
  '..22222211......42......',
  '..1222211.......42......',
  '...11111...4444442......',
  '..........44333332......',
  '..........43333322......',
  '..........2333322.......',
  '...........22222........',
  '........................',
  '........................',
];
