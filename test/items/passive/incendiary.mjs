export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const V = p.pos.constructor;
    const owned = { ...p.passiveItems };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();

    const land = () => {
      let applied = null;
      const body = {
        wardT: 0, hp: 100, maxHp: 100, dead: false, boss: false, radius: 0.4,
        pos: new V(0, 0, -3),
        status: { freeze: 0, burn: 0, poison: 0, slow: 0, fear: 0 },
        takeDamage() {},
        applyStatus(status, duration, power) { applied = { status, duration, power }; },
      };
      g._shotHits.clear();
      g._landShot(body, body.pos, new V(0, 0, -1), 0, 0);
      return applied;
    };

    const baseWeapon = p.getEffectiveDamage(p.weapon.damage);
    const base = land();
    p.mods.damage = 9;
    const boostedWeapon = p.getEffectiveDamage(p.weapon.damage);
    const boosted = land();

    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();
    g._shotHits.clear();

    return { baseWeapon, boostedWeapon, base, boosted };
  }, id);

  check('Incendiary applies a ten-point fire tick for three seconds',
    result.base?.status === 'burn' && result.base.duration === 3 && result.base.power === 10,
    JSON.stringify(result));
  check('Incendiary does not scale with weapon damage',
    result.boostedWeapon > result.baseWeapon && result.boosted?.power === 10,
    JSON.stringify(result));
}
