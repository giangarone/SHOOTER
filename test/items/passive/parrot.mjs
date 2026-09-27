// The parrot memorises one press per thirty seconds and plays it back, free,
// five seconds later - asserted through the REAL press funnel: the heal lands
// twice while the charge is spent once, a press inside the cooldown memorises
// nothing, and an item whose use bills the player is never mimicked.
export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const ITEMS = g.__activeItemsForTest;
    const owned = { ...p.passiveItems };
    const enemies = g.enemies.slice();
    const state = g.state;
    const time = g.time;
    const carried = p.activeItem;
    const carriedCharge = p.activeItemCharge;
    const health = p.health;
    const out = { ok: false };
    try {
      for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
      p.passiveItems[itemId] = 1;
      p.rebuildMods();
      g.state = 'playing';
      g.enemies.length = 0;
      g._syncCompanions();
      const parrot = g._companions[4];
      out.stoodUp = !!parrot && !!parrot.group.parent;
      p.pos.set(0, 0, 0);
      const ctx = (t) => Object.assign({}, g._compCtx, { time: t, pulse: 0 });

      // One press of TRAUMA KIT: 25 now, and the echo owes 25 more.
      p.activeItem = 'itemHeal';
      p.activeItemCharge = ITEMS.itemHeal.charge;
      p.health = 50;
      g.tryActiveItem();
      out.memorised = parrot.echoId === 'itemHeal'
        && Math.abs(parrot.echoAt - (g.time + 5)) < 1e-9
        && Math.abs(parrot.readyAt - (g.time + 30)) < 1e-9;
      out.firstHeal = p.health === 75;
      parrot.update(0.016, ctx(g.time + 5.01));
      out.echoFired = p.health === 100 && parrot.echoId === null;

      // A press inside the cooldown is heard and politely not learnt.
      parrot.update(0.016, ctx(g.time + 6));
      p.activeItemCharge = ITEMS.itemHeal.charge;
      p.health = 50;
      g.tryActiveItem();
      out.cooldownSkips = parrot.echoId === null && p.health === 75;

      // PAY TO WIN bills the player per press; the bird copies the press, not
      // the bill, so it never mimics it at all.
      p.activeItem = 'itemPayToWin';
      p.activeItemCharge = ITEMS.itemPayToWin.charge;
      p.health = p.maxHealth;
      g.credits = 5000;
      g.tryActiveItem();
      out.billNotCopied = parrot.echoId === null && g.credits === 4000;
      out.ok = out.stoodUp && out.memorised && out.firstHeal && out.echoFired
        && out.cooldownSkips && out.billNotCopied;
    } finally {
      for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
      Object.assign(p.passiveItems, owned);
      p.rebuildMods();
      p.activeItem = carried;
      p.activeItemCharge = carriedCharge;
      g._syncCompanions();
      g.runningActiveItems.clear(g);
      g.enemies.length = 0;
      g.enemies.push(...enemies);
      g.state = state;
      g.time = time;
      p.health = health;
    }
    return out;
  }, id);
  check('Parrot repeats the press 5s later for free, at most once per 30s, never the bill',
    result.ok, JSON.stringify(result));
}