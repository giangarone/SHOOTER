import { defineActiveItem } from '../shared.js';

export const id = 'itemCharge';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'BONESAW',
    charge: 15,
    theme: THEME.surge,
    // THE SAME DASH BLINK DRIVE FIRES, with a hitbox on it. Deliberately the
    // same movement - the same envelope, the same distance, the same
    // forward-only commitment (see DASH_TIME in player.js) - because the point
    // of comparison IS the other item: one of them gets you out of a crowd and
    // the other one goes through it, and a player choosing between them should
    // be choosing what happens on the way, not learning a second movement.
    //
    // A QUARTER LONGER, AND INVULNERABLE FOR ALL OF IT. Both halves are the
    // same fix: an item whose whole instruction is "go through them" cannot
    // charge the player for the bodies it goes through, or the correct way to
    // press it is at nothing. The window is exactly the dash - it opens on the
    // press and closes when the movement does - so there is no invulnerability
    // left over on the far side to play around.
    //
    // The extra distance is bought with SPEED rather than with time (see
    // Player.dash), so the envelope, the window and the hand-back are still
    // BLINK DRIVE's to the frame, and the two items are still the same
    // movement with different things happening on the way.
    effects: [['DASH THROUGH ENEMIES,', GOOD], ['DEALING 3x DAMAGE, SAFE', GOOD]],
    duration: 0.7,
    hud: false,
    use: (game, s) => {
      const p = game.player;
      p.dash(game.time, 1.25, p.pitch);
      p.invulnEnd = Math.max(p.invulnEnd, game.time + 0.7);
      s.hit = new Set();
      game.effects.burst(game.player.pos, THEME.surge, 18, 6, 2, 0.4);
      game.sfx.activeItemCharge();
    },
    tick: (game, s) => {
      const p = game.player;
      const dmg = p.getEffectiveDamage(p.weapon.damage) * 3;
      for (const e of game.enemies) {
        if (e.dead || s.hit.has(e)) continue;
        const dx = e.pos.x - p.pos.x;
        const dz = e.pos.z - p.pos.z;
        const reach = e.radius + 1.3;
        if (dx * dx + dz * dz > reach * reach) continue;
        // Once each, which is what the set is for: a dash that lingered beside
        // a body for three frames would otherwise deal nine times damage to
        // whatever it happened to clip slowly.
        s.hit.add(e);
        _v.set(dx, 0, dz).normalize();
        game.hurtEnemy(e, dmg, _v);
        game._shove(e, _v, 2.2);
        game.effects.burst(e.pos, 0x1de9b6, 16, 6, 3, 0.35);
        game.effects.addShake(0.12);
        game.sfx.impact();
      }
    },
}));
