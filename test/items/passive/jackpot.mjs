export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    const saved = {
      health: p.health,
      reserveAmmo: p.reserveAmmo,
      pos: p.pos.clone(),
      vel: p.vel.clone(),
      onGround: p.onGround,
      prevJump: p._prevJump,
      jackpotFx: p.jackpotFx,
    };
    for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
    p.passiveItems[itemId] = 1;
    p.rebuildMods();

    const jump = { ...g.input, jump: true };
    const hop = (combat) => {
      p.pos.set(0, 0, 0);
      p.vel.set(0, 0, 0);
      p.onGround = true;
      p._prevJump = false;
      p.health = 1;
      p.reserveAmmo = 0;
      p.jackpotFx = false;
      p.update(0.016, jump, g.arena.obstacles, g.time, combat);
      return {
        health: p.health,
        ammo: p.reserveAmmo,
        fx: p.jackpotFx,
      };
    };

    const random = Math.random;
    try {
      Math.random = () => 0;
      return {
        shop: hop(false),
        wave: hop(true),
        maxHealth: p.maxHealth,
        maxReserve: p.maxReserve,
      };
    } finally {
      Math.random = random;
      for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
      Object.assign(p.passiveItems, owned);
      p.rebuildMods();
      p.health = saved.health;
      p.reserveAmmo = saved.reserveAmmo;
      p.pos.copy(saved.pos);
      p.vel.copy(saved.vel);
      p.onGround = saved.onGround;
      p._prevJump = saved.prevJump;
      p.jackpotFx = saved.jackpotFx;
    }
  }, id);

  check('Jackpot cannot trigger during the shop',
    result.shop.health === 1 && result.shop.ammo === 0 && !result.shop.fx,
    JSON.stringify(result.shop));
  check('Jackpot still triggers during an active wave',
    result.wave.health === result.maxHealth
      && result.wave.ammo === result.maxReserve
      && result.wave.fx,
    JSON.stringify(result.wave));
}
