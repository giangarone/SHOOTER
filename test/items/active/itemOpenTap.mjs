// OPEN TAP: six seconds of free fire. The promises are accounting promises:
// the magazine never moves, the reserve never moves, an EMPTY gun still fires
// rather than starting a reload, and a reload already running is cancelled
// outright. After the window the gun bills exactly as it did before.
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
    P.status.fear = 0;

    // Baseline: a shot spends a round.
    P.mag = 10;
    P.reserveAmmo = 50;
    P.fireCd = 0;
    const shot = P.tryShoot(true);
    out.baselineShot = shot === 'shot';
    out.baselineBilled = P.mag === 10 - P.lastShotCost;
    P.mag = 10;
    P.reserveAmmo = 50;

    P.giveActiveItem(id);
    g.tryActiveItem();
    out.window = P.freeFireEnd > g.time;

    // Inside the window: shots leave both pools untouched.
    P.fireCd = 0;
    out.freeShot = P.tryShoot(true) === 'shot';
    out.magUntouched = P.mag === 10 && P.reserveAmmo === 50;

    // On an EMPTY gun the tap is still open: it fires and no reload begins.
    P.mag = 0;
    P.fireCd = 0;
    out.firesFromEmpty = P.tryShoot(true) === 'shot';
    out.noReload = P.reloading === 0;

    // The window ends - both the chip and the deadline - and the gun bills.
    for (let i = 0; i < 130; i++) {
      g.time += 0.05;
      g.runningActiveItems.update(g, 0.05);
    }
    out.windowClosed = P.freeFireEnd <= g.time && g.runningActiveItems.list.length === 0;
    P.mag = 10;
    P.fireCd = 0;
    out.billsAgain = P.tryShoot(true) === 'shot' && P.mag === 10 - P.lastShotCost;

    P.mag = P.magSize;
    P.reserveAmmo = P.maxReserve;
    g.runningActiveItems.clear(g);
    return out;
  }, id);
  check('OPEN TAP fires free for 6s - empty gun included - then bills normally again',
    r.baselineShot && r.baselineBilled && r.window && r.freeShot && r.magUntouched
      && r.firesFromEmpty && r.noReload && r.windowClosed && r.billsAgain,
    JSON.stringify(r));
}
