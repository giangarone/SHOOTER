// WALK IT OFF: four seconds in which metres walked come back as health.
// Walking heals, STANDING does not, and a jump in position - a teleport - is
// not walking. The chip counts what actually landed, so the exchange rate is
// visible while it runs.
export async function run({ page, check, id }) {
  const r = await page.evaluate((id) => {
    const g = window.__game;
    const P = g.player;
    const out = {};
    g.state = 'playing';
    g.waveState = 'active';
    P.passiveItems = {};
    P.rebuildMods();
    g.runningActiveItems.clear(g);
    g.enemies.length = 0;

    P.health = 40;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.running = g.runningActiveItems.list.length === 1;

    // Walk: 0.3m per 50ms tick is a brisk six metres a second - inside the
    // teleport cap and comfortably over the whole-point threshold.
    for (let i = 0; i < 20; i++) {
      P.pos.x += 0.3;
      g.time += 0.05;
      g.runningActiveItems.update(g, 0.05);
    }
    out.healed = +(P.health - 40).toFixed(2);
    // 20 ticks x 0.3m = 6 metres = 6 HP, no more and no less.
    out.rate = out.healed === 6;

    // Stand still for a second: nothing may accrue.
    const at = P.health;
    for (let i = 0; i < 20; i++) {
      g.time += 0.05;
      g.runningActiveItems.update(g, 0.05);
    }
    out.stillFree = P.health === at;

    // A blink-sized jump is refused: position displacement past the cap in
    // one step must not pay out.
    const before = P.health;
    P.pos.x += 50;
    g.time += 0.05;
    g.runningActiveItems.update(g, 0.05);
    out.teleportFree = P.health === before;
    P.pos.x -= 50;

    // And it expires: the chip counts down to nothing and the walking stops
    // paying.
    for (let i = 0; i < 170; i++) {
      g.time += 0.05;
      g.runningActiveItems.update(g, 0.05);
    }
    out.expired = g.runningActiveItems.list.length === 0;
    const full = P.health;
    for (let i = 0; i < 10; i++) {
      P.pos.x += 0.3;
      g.time += 0.05;
      g.runningActiveItems.update(g, 0.05);
    }
    out.noHealAfter = P.health === full;

    P.health = P.maxHealth;
    g.runningActiveItems.clear(g);
    return out;
  }, id);
  check('WALK IT OFF pays 1 HP per metre, never for standing or teleporting, and expires',
    r.running && r.rate && r.stillFree && r.teleportFree && r.expired && r.noHealAfter,
    JSON.stringify(r));
}
