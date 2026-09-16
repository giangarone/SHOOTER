export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    const savedHp = p.health;
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();
    p.shield = 0;

    p.health = p.maxHealth;
    // One point of hit, funded: 20% drains 2 credits at 10 per HP.
    p.balance = 100;
    p.takeDamage(10, 1);
    const hpAfterFunded = p.health;
    const debt = p.hpDebt;

    // An empty wallet pays nothing and so stops nothing.
    p.health = p.maxHealth;
    p.balance = 0;
    p.takeDamage(10, 1);
    const hpAfterBroke = p.health;
    const debtBroke = p.hpDebt;

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();
    p.health = savedHp;

    return { hp: p.maxHealth, hpAfterFunded, debt, hpAfterBroke, debtBroke };
  }, id);

  check('Thin Blood diverts 20% of a hit to the wallet',
    Math.abs(result.hpAfterFunded - (result.hp - 8)) < 1e-9
      && Math.abs(result.debt - 20) < 1e-9, JSON.stringify(result));
  check('Thin Blood with an empty wallet takes the hit',
    Math.abs(result.hpAfterBroke - (result.hp - 10)) < 1e-9
      && result.debtBroke === 0, JSON.stringify(result));
}
