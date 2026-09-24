import { defineActiveItem } from '../shared.js';

export const id = 'itemBlink';

const ITEM_THEME = 0x7c4dff;

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'COLD SPOT',
    charge: 40,
    theme: ITEM_THEME,
    // NOT A TELEPORT THE PLAYER AIMS. They press it because they are in
    // trouble, and being asked to pick a destination at that moment is being
    // asked to solve the problem the item is for. It picks the emptiest of the
    // arena's own spawn points, which are already the places the game
    // considers open ground.
    //
    // A SECOND AND A HALF OF INVULNERABILITY, not one. Arriving is not the
    // same as being safe: the room has to be given time to notice, and one
    // second is roughly a frame more than a chaser needs to close the gap it
    // was already closing.
    effects: [['TELEPORT TO OPEN GROUND', GOOD], ['IT PICKS WHERE, NOT YOU', NOTE], ['1.5s INVINCIBLE', GOOD]],
    use: (game) => {
      const p = game.player;
      let best = null;
      let bestScore = Infinity;
      for (const sp of game.arena.spawnPoints) {
        let score = 0;
        for (const e of game.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.pos.x - sp.x, e.pos.z - sp.z);
          // Inverse-square-ish crowding rather than a count inside a radius: a
          // point with one enemy at two metres is far worse than one with four
          // at fifteen, and a hard radius cannot say so.
          if (d < 18) score += 1 / (d * d + 1);
        }
        // Ties broken toward the FURTHER point, so the item always feels like
        // it moved you somewhere when the room is empty.
        score -= p.pos.distanceTo(sp) * 0.0004;
        if (score >= bestScore) continue;
        bestScore = score;
        best = sp;
      }
      if (best) {
        game.effects.burst(p.eyeInto(_v), 0x7c4dff, 30, 7, 3, 0.6);
        game.effects.shockwave(p.pos, ITEM_THEME, 6, 0.5);
        const fromX = p.pos.x;
        const fromZ = p.pos.z;
        p.pos.set(best.x, p.pos.y, best.z);
        p.vel.set(0, p.vel.y, 0);
        p.extX = 0;
        p.extZ = 0;
        // TURNED TO FACE WHERE YOU JUST WERE. A blink that left the view
        // pointing wherever it happened to be pointing dropped the player into
        // a strange corner facing a wall, with the thing they escaped somewhere
        // behind them - so the first second of a 1.5s invulnerability was spent
        // finding the fight again. Looking back at it means the escape and the
        // reassessment are the same moment.
        //
        // Forward is (-sin yaw, 0, -cos yaw) - see Player.forwardInto - so the
        // yaw that points at a delta is atan2 of its negated components.
        const dx = fromX - p.pos.x;
        const dz = fromZ - p.pos.z;
        if (dx * dx + dz * dz > 1e-6) p.yaw = Math.atan2(-dx, -dz);
      }
      p.invulnEnd = Math.max(p.invulnEnd, game.time + 1.5);
      game.effects.shockwave(p.pos, ITEM_THEME, 8, 0.7);
      game.effects.burst(p.eyeInto(_v), 0x7c4dff, 30, 7, 3, 0.6);
      game.sfx.itemBlink();
    },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '.....21..........42.....',
  '...222221......444342...',
  '.222222221...444333332..',
  '.222222221...433333332..',
  '.222222222444433333332..',
  '.222222221222333333332..',
  '.222222221...433333332..',
  '.112222211...223333322..',
  '...112111......223222...',
  '.....11..........22.....',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];
