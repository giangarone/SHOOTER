// SLOT MACHINE: $100 a spin, one third a heal, one third ammunition, one
// third nothing. All three pockets are walked by pinning Math.random while
// the press is made; the pricing gate is the one assertion that can be made
// without the odds: broke players do not get to gamble.
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

    const R = Math.random;
    // One full spin: press with the die pinned, run the 0.9s window out, then
    // let the die go - nothing else in the press may consult it.
    const spin = (v) => {
      Math.random = () => v;
      P.giveActiveItem(id);
      g.tryActiveItem();
      Math.random = R;
      for (let i = 0; i < 25; i++) {
        g.time += 0.05;
        g.runningActiveItems.update(g, 0.05);
      }
    };

    g.credits = 400;
    P.health = 40;
    P.reserveAmmo = 10;
    out.readyWithMoney = g.__activeItemsForTest[id].ready(g);

    spin(0.05);           // first pocket: health
    out.winHeal = P.health === 45 && g.credits === 300;
    spin(0.5);            // second pocket: ammunition
    out.winAmmo = P.reserveAmmo === 25 && g.credits === 200;
    const hpAt = P.health;
    const ammoAt = P.reserveAmmo;
    spin(0.95);           // the house pocket: nothing
    out.bust = P.health === hpAt && P.reserveAmmo === ammoAt && g.credits === 100;

    // Broke: the press is refused and the wallet does not feel it.
    g.credits = 50;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.refusedBroke = g.credits === 50 && g.runningActiveItems.list.length === 0;

    g.credits = 1000;
    P.health = P.maxHealth;
    P.reserveAmmo = P.maxReserve;
    g.runningActiveItems.clear(g);
    return out;
  }, id);
  check('SLOT MACHINE sells all three pockets at $100 and refuses the broke',
    r.readyWithMoney && r.winHeal && r.winAmmo && r.bust && r.refusedBroke,
    JSON.stringify(r));
}
