export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    const saved = { mag: p.mag, magOnReload: p.magOnReload, reloading: p.reloading, banked: p.magnaRounds };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();

    const startMag = p.magSize;

    // Two reloads: the first from empty, the second with rounds left.
    // (startReload copies `mag` into magOnReload; update() is what pays.)
    p.mag = 0;
    p.magOnReload = 0;
    p.reloading = 0.01;
    p.reserveAmmo = 500;
    p.update(0.5, {}, g.arena.obstacles, g.time, false);
    const afterEmpty = p.magnaRounds;

    p.mag = 1; p.magOnReload = 1; p.reloading = 0.01;
    p.update(0.5, {}, g.arena.obstacles, g.time, false);
    const afterPart = p.magnaRounds;

    const finalMag = p.magSize;

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();
    p.mag = saved.mag;
    p.magOnReload = saved.magOnReload;
    p.reloading = saved.reloading;
    p.magnaRounds = saved.banked;

    return { startMag, afterEmpty, afterPart, finalMag };
  }, id);

  check('Magna Carta banks a round on an empty reload',
    result.afterEmpty === 1, JSON.stringify(result));
  check('Magna Carta pays nothing on a partial reload',
    result.afterPart === 1, JSON.stringify(result));
  check('Magna Carta widens the magazine',
    result.finalMag === result.startMag + 1, JSON.stringify(result));
}
