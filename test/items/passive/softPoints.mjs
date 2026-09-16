export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();

    // A slowed body reads the +30% through the same lens _hitMult uses, and a
    // clean one does not.
    const body = { hp: 100, maxHp: 100, boss: false, status: { slow: 0 } };
    const clean = g._hitMult(body, false, false);
    body.status.slow = 1.5;
    const slowed = g._hitMult(body, false, false);

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();

    return { clean, slowed };
  }, id);

  check('Soft Points pays nothing against a healthy body',
    Math.abs(result.clean - 1) < 1e-9, JSON.stringify(result));
  check('Soft Points pays +30% against a slowed one',
    Math.abs(result.slowed - 1.3) < 1e-9, JSON.stringify(result));
}
