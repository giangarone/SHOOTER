// TOP OFF: thirty health for a full ammunition reload. Asserted as the
// trade: the HP comes off as a PRICE (pay() - it cannot kill and it cannot
// be earned back), the gun is full and the reserve topped the same frame,
// a reload already in flight is cancelled, and the press is refused on a bar
// too thin to pay the printed price.
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

    // Nearly dry, mid-reload, eighty on the bar.
    P.mag = 2;
    P.reserveAmmo = 13;
    P.health = 80;
    P.startReload();
    out.wasReloading = P.reloading > 0;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.paid = P.health === 50;
    out.magFull = P.mag === P.magSize;
    out.reserveFull = P.reserveAmmo === P.maxReserve;
    out.reloadCancelled = P.reloading === 0;

    // The gate: at thirty the press is denied and nothing moves - not the
    // bar, not the ammunition. pay() flooring at one would otherwise be a
    // quiet discount on exactly the moment the card was written for.
    P.health = 30;
    P.mag = 1;
    P.reserveAmmo = 1;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.gateRefused = P.health === 30 && P.mag === 1 && P.reserveAmmo === 1;

    P.health = P.maxHealth;
    P.mag = P.magSize;
    P.reserveAmmo = P.maxReserve;
    return out;
  }, id);
  check('TOP OFF pays 30 HP for full ammo - reload and all - and refuses a thin bar',
    r.wasReloading && r.paid && r.magFull && r.reserveFull && r.reloadCancelled && r.gateRefused,
    JSON.stringify(r));
}
