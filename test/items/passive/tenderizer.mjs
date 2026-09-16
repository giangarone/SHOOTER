export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();

    // A body at full health reads +50%; a chip of damage and it stops.
    const body = { hp: 100, maxHp: 100, boss: false, status: { slow: 0 } };
    const full = g._hitMult(body, false, false);
    body.hp = 99.99;
    const notFull = g._hitMult(body, false, false);

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();

    return { full, notFull };
  }, id);

  check('Tenderizer pays +50% on a full-HP enemy',
    Math.abs(result.full - 1.5) < 1e-9, JSON.stringify(result));
  check('Tenderizer stops on a body that already took one',
    Math.abs(result.notFull - 1) < 1e-9, JSON.stringify(result));
}
