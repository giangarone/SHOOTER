export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    const saved = {
      health: p.health,
      pos: p.pos.clone(),
      vel: p.vel.clone(),
      onGround: p.onGround,
    };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();
    p.health = p.maxHealth - 10;

    const before = p.health;
    p.update(0.5, {}, g.arena.obstacles, g.time, false);
    const afterShop = p.health;
    p.update(0.5, {}, g.arena.obstacles, g.time, true);
    const afterWave = p.health;

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();
    p.health = saved.health;
    p.pos.copy(saved.pos);
    p.vel.copy(saved.vel);
    p.onGround = saved.onGround;
    return { before, afterShop, afterWave };
  }, id);

  check('Healthy Core pauses during the shop',
    result.afterShop === result.before,
    JSON.stringify(result));
  check('Healthy Core regenerates during an active wave',
    Math.abs(result.afterWave - result.afterShop - 0.5) < 1e-9,
    JSON.stringify(result));
}
