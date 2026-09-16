export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    const saved = { hp: p.health, fleshBanked: p.fleshBanked };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];

    // No pick: record the base frame.
    p.rebuildMods();
    const baseMax = p.maxHealth;

    p.passiveItems[itemId] = 1;
    p.rebuildMods();
    const costMax = p.maxHealth;
    // One health crate: one point banked back, on top of its own heal.
    p.fleshBanked += p.mods.fleshBankGain * 1;
    const healedMax = p.maxHealth;

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();
    p.health = saved.hp;
    p.fleshBanked = saved.fleshBanked;

    return { baseMax, costMax, healedMax };
  }, id);

  check('Flesh Bank costs 10 max HP up front',
    result.costMax === result.baseMax - 10, JSON.stringify(result));
  check('Flesh Bank banks a point per crate',
    result.healedMax === result.costMax + 1, JSON.stringify(result));
}
