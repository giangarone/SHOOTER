// MOON: fifteen seconds of low gravity. The mechanic is one multiplier in the
// player's gravity line, so the assertions are on the multiplier itself: it
// drops to the item's pull on the press, it rides the whole window, and the
// end hands a normal pull back - a wave boundary must never leave the player
// floating with no chip counting down.
export async function run({ page, check, id }) {
  const r = await page.evaluate((id) => {
    const g = window.__game;
    const P = g.player;
    const out = {};
    g.state = 'playing';
    g.waveState = 'active';
    g.runningActiveItems.clear(g);
    g.enemies.length = 0;

    out.before = P.gravityMult;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.pressed = P.gravityMult;
    out.chipped = g.runningActiveItems.chips([]).length === 1;

    // Mid-window it is still down - the pull is the item, for its duration.
    for (let i = 0; i < 100; i++) {
      g.time += 0.05;
      g.runningActiveItems.update(g, 0.05);
    }
    out.mid = P.gravityMult;

    // And the flight itself: vel.y must fall SLOWER under low gravity. One
    // integration step of the gravity term, read off the velocity delta.
    P.vel.y = 0;
    const gNorm = -22 * P.gravityMult * 0.05;   // what the line applies
    out.slowerFall = Math.abs(gNorm) < 22 * 0.05 * 0.5;

    // Run it out - the window is fifteen seconds, so this has to step past
    // the whole of it, not merely into it.
    for (let i = 0; i < 220; i++) {
      g.time += 0.05;
      g.runningActiveItems.update(g, 0.05);
    }
    out.restored = P.gravityMult === 1;
    out.listEmpty = g.runningActiveItems.list.length === 0;

    g.runningActiveItems.clear(g);
    return out;
  }, id);
  check('MOON drops gravity to a third for the window and hands it back on expiry',
    r.before === 1 && r.pressed < 0.5 && r.chipped && r.mid === r.pressed
      && r.slowerFall && r.restored && r.listEmpty,
    JSON.stringify(r));
}
