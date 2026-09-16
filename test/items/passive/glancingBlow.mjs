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

    // Both edges of the line: 10 lands flat, 11 takes everything.
    p.health = p.maxHealth;
    p.takeDamage(10, 1);
    const ten = p.health;
    p.health = p.maxHealth;
    p.takeDamage(11, 1);
    const eleven = p.health;

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();
    p.health = savedHp;

    return { hp: p.maxHealth, ten, eleven };
  }, id);

  check('Glancing Blow swallows a 10-damage hit',
    result.ten === result.hp, JSON.stringify(result));
  check('Glancing Blow lets an 11-damage hit through',
    result.eleven === result.hp - 11, JSON.stringify(result));
}
