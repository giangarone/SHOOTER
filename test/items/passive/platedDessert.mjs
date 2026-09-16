export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    const saved = { hp: p.health, fleshBanked: p.fleshBanked };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();

    // The crate-side wiring: the game's pickup module mutates the player
    // itself, which is the one thing the fragment CAN reach. Applied as
    // though from a crate the game dropped: read the bank straight back.
    const before = p.fleshBanked;
    p.fleshBanked += p.mods.platedDessert;
    const after = p.maxHealth;

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();
    p.health = saved.hp;
    p.fleshBanked = saved.fleshBanked;

    return { pay: p.mods.platedDessert, before, after, base: p.maxHealth };
  }, id);

  check('Plated Dessert pays +5 max HP on a full bar crate',
    Math.abs(result.after - (result.base + 5)) < 1e-9, JSON.stringify(result));
}
