// PAINFUL PEACE: five health for two seconds untouchable. It rides AEGIS's
// field, not its own machinery, so the assertions sit where the game's two
// damage sinks read it: damage cannot land inside the window, can land the
// moment after, and the press is refused when the bar is too thin to pay an
// exact five.
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
    g._pass = false;

    P.invulnEnd = 0;
    P.health = 50;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.paid = P.health === 45;
    out.windowOpen = P.invulnEnd > g.time && P.invulnEnd - g.time <= 2.01;

    // The door is shut: _hurtPlayer returns before anything can land.
    g._hurtPlayer(10, P.pos, null);
    out.noDamageInside = P.health === 45;

    // And the moment it passes, the world is dangerous again.
    g.time += 2.2;
    g._hurtPlayer(10, P.pos, null);
    out.damageAfter = P.health === 35;

    // The gate: five or fewer means the five on the card is not the price.
    P.health = 5;
    P.giveActiveItem(id);
    const wasEnd = P.invulnEnd;
    g.tryActiveItem();
    out.gateRefused = P.health === 5 && P.invulnEnd === wasEnd;

    P.invulnEnd = 0;
    P.health = P.maxHealth;
    return out;
  }, id);
  check('PAINFUL PEACE buys 2s of real invulnerability for exactly 5 HP, gated on having it',
    r.paid && r.windowOpen && r.noDamageInside && r.damageAfter && r.gateRefused,
    JSON.stringify(r));
}
