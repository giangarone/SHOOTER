export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    // The pick's whole context: a deep magazine, a reload, and the flag the
    // reload sets before the rounds land.
    const owned = { ...p.passiveItems };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();

    const reloadBase = p.weapon.reloadTime;
    const withPick = p.reloadTime;      // Fat Handgun shortens the clock
    const mag = p.magSize;              // ... and thins the magazine.
    const magVanilla = p.weapon.magSize;

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();

    return { reloadBase, withPick, mag, magVanilla };
  }, id);

  // 25 on the starting rifle: 25 - 2 = 23. If the weapon changes the suite
  // must change with it - same as every other test that pins a weapon stat.
  check('Fat Handgun shortens the reload',
    Math.abs(result.withPick - result.reloadBase * 0.8) < 1e-9,
    JSON.stringify(result));
  check('Fat Handgun holds two fewer rounds',
    result.mag === result.magVanilla - 2, JSON.stringify(result));
}
