export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();

    // Read the rate at three population points. The only input the pick reads
    // is aliveCount, which the suite writes by hand - which is also the test's
    // whole distance from the game: the same mirror main.js publishes.
    p.aliveCount = 10;
    const ten = p.effectiveFireRate;   // 20% up
    p.aliveCount = 25;
    const capped = p.effectiveFireRate; // would be 50% without the cap
    const base = p.weapon.fireRate * p.mods.fireRate;

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();

    return { ten, capped, base };
  }, id);

  check('Wolf Pack reads the live count',
    Math.abs(result.ten - result.base * 1.2) < 1e-9, JSON.stringify(result));
  check('Wolf Pack caps at 1.4x',
    result.capped < result.base * 1.4 + 1e-9
      && result.capped > result.ten, JSON.stringify(result));
}
