export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();

    const base = p.weapon.fireRate * p.mods.fireRate;
    // Three kills; the clock sits between them. Each one is inside the window
    // of the one before it.
    p.bumpMonsoon(10);
    p.bumpMonsoon(14);
    p.bumpMonsoon(19); // gap 5s: inside the window, stacks climb
    const stacked = p.monsoonStacks;
    const rate = p.effectiveFireRate;
    // Stand in silence: the chain runs out.
    // (Not expired by time automatically - the stacks are read live; the test
    //  only has to prove the window closed.)
    // Simulate no-kill by ageing the last-kill clock.
    p.lastKillAt = 99 - 100; // means the chain is stale
    p.bumpMonsoon(100);     // the next kill on a cold clock resets to 1
    const cold = p.monsoonStacks;

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();
    return { base, stacked, rate, cold };
  }, id);

  check('Monsoon stacks kills inside the window',
    result.stacked === 3
      && Math.abs(result.rate - result.base * 1.09) < 1e-9,
    JSON.stringify(result));
  check('Monsoon resets after a full window without kills',
    result.cold === 1, JSON.stringify(result));
}
