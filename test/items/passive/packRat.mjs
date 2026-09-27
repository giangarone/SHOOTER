// One errand, whole: the rat sees the crate, ducks under it (the plate rides
// its back, still the same live pickup), hauls it across the room, and the
// PLAYER collects it off the rat through the ordinary pickup test - asserted
// by driving the pet's own update and then the real _updatePickups.
export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    const enemies = g.enemies.slice();
    const powerups = g.powerups.slice();
    const state = g.state;
    const time = g.time;
    const out = { ok: false };
    try {
      for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
      p.passiveItems[itemId] = 1;
      p.rebuildMods();
      g.state = 'playing';
      g.enemies.length = 0;
      g.powerups.length = 0;
      g._syncCompanions();
      const rat = g._companions[5];
      out.stoodUp = !!rat && !!rat.group.parent;
      const ctx = () => Object.assign({}, g._compCtx, { time: g.time, pulse: 0 });

      // A crate out in the room, the player at the origin six metres short of
      // it - classic errand ground.
      p.pos.set(0, 0, 0);
      p.reserveAmmo = 0;
      g._placeDrop('ammo', { x: 6, y: 0, z: 0 });
      const plate = g.powerups[g.powerups.length - 1];
      rat.pos.set(5, 0, 0.3);
      // The rat has to see it and come to it.
      for (let i = 0; i < 130 && !rat.carrying; i++) rat.update(0.016, ctx());
      out.grabs = rat.carrying === plate && plate.carriedBy === rat;

      // The plate rides the rat on the way home, and is STILL the live
      // pickup: walk the player into it mid-haul and the player's own
      // proximity test takes it off the rat's back. (The plate tracks the
      // rat's frame-start position, one move behind - that IS the ride.)
      rat.update(0.016, ctx());
      rat.pos.set(4.62, 0, 0);
      rat.update(0.016, ctx());
      out.rides = Math.abs(plate.pos.x - rat.pos.x) < 0.35
        && Math.abs(plate.pos.x - 6) > 0.4;
      p.pos.copy(rat.pos);
      g._updatePickups(0.05);
      // The rat notices its back is empty on its own next frame.
      rat.update(0.016, ctx());
      out.collectsNormally = p.reserveAmmo === 45 && plate.dead
        && rat.carrying === null;

      // And a rat with nothing to do follows at heel rather than standing in
      // the lens.
      rat.update(0.016, ctx());
      out.backToHeel = !rat.target;

      // THE HOP, over real cover: a cabinet between the rat and its errand
      // must not be a stall. Driven through Walker's own move, on a synthetic
      // obstacle, because the pet does not get the nav grid's walk-around.
      rat.station = null;
      rat.carrying = null;
      rat.pos.set(0, 0, 3);
      const crates = [{ min: { x: -2, y: 0, z: 1.2 }, max: { x: 2, y: 0.95, z: 1.8 } }];
      const ctxBox = () => Object.assign({}, g._compCtx,
        { time: g.time, pulse: 0, obstacles: crates });
      let peak = 0;
      out.crosses = false;
      for (let i = 0; i < 300 && !out.crosses; i++) {
        rat.step(0.016, 0, 0, 5.5, 13, 0.5, ctxBox());
        peak = Math.max(peak, rat.pos.y);
        out.crosses = rat.pos.z < 1.1;
      }
      out.hops = peak > 0.6;
      out.ok = out.stoodUp && out.grabs && out.rides && out.collectsNormally
        && out.backToHeel && out.crosses && out.hops;
    } finally {
      p.reserveAmmo = p.maxReserve;
      for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
      Object.assign(p.passiveItems, owned);
      p.rebuildMods();
      g._syncCompanions();
      for (const q of g.powerups) if (!powerups.includes(q)) q.destroy();
      g.powerups.length = 0;
      g.powerups.push(...powerups);
      g.enemies.length = 0;
      g.enemies.push(...enemies);
      g.state = state;
      g.time = time;
      p.pos.set(0, 0, 0);
    }
    return out;
  }, id);
  check('Pack Rat sees an ammo crate, carries it on its back, and the player collects it normally',
    result.ok, JSON.stringify(result));
}