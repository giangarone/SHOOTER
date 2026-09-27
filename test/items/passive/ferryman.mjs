// The ferryman's errand is the rat's, pointed at the bar that keeps you
// alive: it fetches HEALTH plates, one at a time, and the pickup test that
// pays out is the player's own. Ammo is not its fare - asserted by leaving
// one of each on the floor and watching which plate moves.
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
      const ferry = g._companions[6];
      out.stoodUp = !!ferry && !!ferry.group.parent;
      const ctx = () => Object.assign({}, g._compCtx, { time: g.time, pulse: 0 });

      // Health AND ammo on the floor; only the plate is its fare.
      p.pos.set(0, 0, 0);
      p.health = 50;
      g._placeDrop('health', { x: 6, y: 0, z: 0 });
      g._placeDrop('ammo', { x: 6, y: 0, z: 2 });
      const plate = g.powerups[g.powerups.length - 2];
      const wrong = g.powerups[g.powerups.length - 1];
      ferry.pos.set(5, 0, 0.3);
      for (let i = 0; i < 130 && !ferry.carrying; i++) ferry.update(0.016, ctx());
      out.takesHealthNotAmmo = ferry.carrying === plate && !wrong.carriedBy;

      // Hauled to the feet, collected there by the player's own walk-over.
      p.pos.copy(ferry.pos);
      for (let i = 0; i < 130 && ferry.carrying; i++) {
        ferry.update(0.016, ctx());
        p.pos.copy(ferry.pos);
      }
      g._updatePickups(0.05);
      out.delivers = p.health === 75 && plate.dead;
      out.ok = out.stoodUp && out.takesHealthNotAmmo && out.delivers;
    } finally {
      p.health = p.maxHealth;
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
  check('Ferryman fetches only health plates and delivers them to the player’s feet',
    result.ok, JSON.stringify(result));
}