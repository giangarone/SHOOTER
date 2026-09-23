// BULLET FEVER: sixty reserve rounds converted into thirty health. The whole
// card is the trade, so the assertions are the ledger: sixty leave the
// reserve, thirty land on the bar, and a bag that can't pay sixty refuses
// the sale rather than minting health for free.
export async function run({ page, check, id }) {
  const r = await page.evaluate((id) => {
    const g = window.__game;
    const P = g.player;
    const out = {};
    g.state = 'playing';
    g.waveState = 'active';
    P.passiveItems = {};
    P.rebuildMods();
    g.runningActiveItems.clear(g);
    g.enemies.length = 0;

    // The sell.
    P.reserveAmmo = 90;
    P.health = 50;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.sold = P.reserveAmmo === 30;
    out.healed = P.health === 80;

    // The refusal: forty in the bag, press denied, nothing moves. Charge too
    // - a gate that spends the meter is how an item punishes a player for
    // being broke, which the whole ready() convention exists to prevent.
    P.reserveAmmo = 30;
    P.health = 60;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.refused = P.reserveAmmo === 30 && P.health === 60;

    // It never overheals: standing on a fullish bar, only what fits lands.
    P.reserveAmmo = 90;
    P.health = P.maxHealth - 10;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.noOverheal = P.health === P.maxHealth;

    P.health = P.maxHealth;
    P.reserveAmmo = P.maxReserve;
    return out;
  }, id);
  check('BULLET FEVER trades 60 reserve for 30 HP, refuses under 60, never overheals',
    r.sold && r.healed && r.refused && r.noOverheal,
    JSON.stringify(r));
}
