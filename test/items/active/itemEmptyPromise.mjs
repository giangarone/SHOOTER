// EMPTY PROMISE: the whole reserve destroyed for permanent max health at
// three rounds to the point. The assertions are the ledger: the reserve is
// EMPTIED, the cap rises by the floor of the trade, the health arrives with
// it, and a bag too light to pay a point is refused rather than burned.
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

    // Ninety rounds at three to the point is thirty on the cap - and on the
    // bar, because a graft that only raised the ceiling would be invisible.
    P.reserveAmmo = 90;
    P.health = 40;
    const capBefore = P.maxHealth;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.emptied = P.reserveAmmo === 0;
    out.capRose = P.maxHealth === capBefore + 30;
    out.barRose = P.health === 70;

    // It stacks, like GRAFT does: the second press climbs the bank again.
    P.reserveAmmo = 30;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.stacks = P.maxHealth === capBefore + 40 && P.health === 80;

    // A near-empty bag is refused outright - not burned for a gain of zero.
    P.reserveAmmo = 2;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.refusedLight = P.reserveAmmo === 2 && P.maxHealth === capBefore + 40;

    // Hand the bank back: this fragment shares a run with the rest of the
    // suite, and a cap forty points tall is a lie everyone else would read.
    P.hpBanked -= 40;
    P.health = P.maxHealth;
    P.reserveAmmo = P.maxReserve;
    return out;
  }, id);
  check('EMPTY PROMISE burns the whole reserve for permanent max HP at 1 per 3, and refuses dust',
    r.emptied && r.capRose && r.barRose && r.stacks && r.refusedLight,
    JSON.stringify(r));
}
