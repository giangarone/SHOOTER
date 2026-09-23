// MACHINE FEAST: no charge at all - the ten health IS the charge. Buying
// pays the bar and plants a ten-second turret; the gate below ten is what
// keeps the printed price exact rather than "whatever was left in the bar".
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
    g._clearDeployed();
    g.enemies.length = 0;
    P.yaw = 0;

    // The buy: ten health, one turret, just ahead of the player.
    P.health = 50;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.paid = P.health === 40;
    const t = g._deployed[g._deployed.length - 1];
    out.planted = !!t && t.constructor.name === 'Turret';
    out.clocked10 = t && Math.round(t.life * 10) / 10 <= 10;
    out.ahead = t && (P.pos.z - t.pos.z) > 1 && (P.pos.z - t.pos.z) < 3.5;

    // It lives out its ten seconds and then it is gone, health uninvolved.
    const hpAt = P.health;
    for (let i = 0; i < 105; i++) {
      g.time += 0.1;
      g._updateDeployed(0.1);
    }
    out.expired = !g._deployed.includes(t);
    out.noFurtherCost = P.health === hpAt;

    // The gate: too thin to open. Nothing moves - not the bar, not the arena.
    P.health = 10;
    const deployedAt = g._deployed.length;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.gateRefused = P.health === 10 && g._deployed.length === deployedAt;

    P.health = P.maxHealth;
    g._clearDeployed();
    return out;
  }, id);
  check('MACHINE FEAST turns 10 HP into a ten-second turret and refuses below ten',
    r.paid && r.planted && r.clocked10 && r.ahead && r.expired && r.noFurtherCost && r.gateRefused,
    JSON.stringify(r));
}
