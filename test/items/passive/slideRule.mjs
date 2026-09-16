export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    const saved = { mag: p.mag, reserveAmmo: p.reserveAmmo };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();

    // A slide started dry from the hip: ten rounds move from reserve to mag.
    p.mag = 0;
    p.reserveAmmo = 300;
    p.onGround = true;
    p.stamina = 100;
    p._startSlide(1, 0);
    const magAfter = p.mag;
    const reserveAfter = p.reserveAmmo;

    // A slide with an empty reserve moves nothing.
    p.mods.slideRule = 10;
    p.mag = 0;
    p.reserveAmmo = 0;
    p._slideBuf = 0; p.sliding = false;
    p._startSlide(1, 0);
    const magDry = p.mag;

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();
    p.mag = saved.mag;
    p.reserveAmmo = saved.reserveAmmo;
    p.sliding = false;

    return { magAfter, reserveAfter, magDry };
  }, id);

  check('Slide Rule seats ten rounds on the slide',
    result.magAfter === 10, JSON.stringify(result));
  check('Slide Rule pays them from the reserve',
    result.reserveAfter === 290, JSON.stringify(result));
  check('Slide Rule on an empty reserve does nothing',
    result.magDry === 0, JSON.stringify(result));
}
