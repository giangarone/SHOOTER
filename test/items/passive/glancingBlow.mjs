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
  const reactions = await page.evaluate(() => {
    const g = window.__game;
    g.beginGame();
    const p = g.player;
    for (const key of ['glancingBlow', 'ceramicInsert', 'deadCat', 'glassCannon', 'carnage', 'bruiseRounds', 'jumperCables', 'absoluteZero']) p.takePassiveItem(key);
    p.health = p.maxHealth;
    p.carnageStacks = 3;
    p.cleanKills = p.goldKills = 4;
    p.mag = 1;
    p.wardCharges = 3;
    const ward = p.wardCharges;
    g._hurtPlayer(50, p.pos);
    const capped = p.health === p.maxHealth && p.carnageStacks === 3
      && p.cleanKills === 4 && p.goldKills === 4 && p.mag === 1
      && p.wardCharges === ward && p.frozenUntil <= g.time;
    g._hurtPlayerDot(5);
    const dot = p.carnageStacks === 3 && p.cleanKills === 4 && p.goldKills === 4;
    g.beginGame();
    p.takePassiveItem('glancingBlow');
    p.applyStatus('curse', 10);
    g._hurtPlayer(9, p.pos);
    const cursed = p.health;
    g.beginGame();
    return { capped, dot, cursed };
  });
  check('Ignored capped hits trigger no contact reactions or ward payment', reactions.capped, JSON.stringify(reactions));
  check('Ignored hazard ticks preserve hit streaks', reactions.dot, JSON.stringify(reactions));
  check('Glancing Blow measures damage after curse', reactions.cursed === 88.75, JSON.stringify(reactions));

}
