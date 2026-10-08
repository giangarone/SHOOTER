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
  const ledger = await page.evaluate(() => {
    const g = window.__game;
    const prepare = (credits) => {
      g.beginGame();
      g.player.takePassiveItem('thinBlood');
      g.credits = g.player.balance = credits;
      return g.player;
    };
    let p = prepare(100);
    g._hurtPlayerDot(20);
    const dot = [p.health, g.credits];
    p = prepare(40);
    g._hurtPlayer(20, p.pos);
    g._hurtPlayer(20, p.pos);
    const repeated = [p.health, g.credits];
    p = prepare(-100);
    g._hurtPlayer(20, p.pos);
    const debt = [p.health, g.credits, p.hpDebt];
    p = prepare(10);
    g._hurtPlayerDot(20);
    const shortfall = [p.health, g.credits];
    p.takePassiveItem('glancingBlow');
    p.takeDamage(5, g.time);
    const ignoredDebt = p.hpDebt;
    g.beginGame();
    return { dot, repeated, debt, shortfall, ignoredDebt };
  });
  check('Thin Blood pays hazard damage immediately', ledger.dot[0] === 84 && ledger.dot[1] === 60, JSON.stringify(ledger));
  check('Thin Blood cannot spend the same credits twice in one frame', ledger.repeated[0] === 64 && ledger.repeated[1] === 0, JSON.stringify(ledger));
  check('Thin Blood treats debt as an empty wallet', ledger.debt[0] === 80 && ledger.debt[1] === -100 && ledger.debt[2] === 0, JSON.stringify(ledger));
  check('Thin Blood bills only funded protection and clears ignored debt', ledger.shortfall[0] === 81 && ledger.shortfall[1] === 0 && ledger.ignoredDebt === 0, JSON.stringify(ledger));

}
