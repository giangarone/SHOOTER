// A hit that LANDS sets the chicken off, and while the window runs the whole
// enemy context is handed the bird instead of the player - the same swap the
// monkey gets, asserted the same way: the decoy is a complete stand-in,
// nothing an enemy does reaches the player, and when the window closes the
// player is handed back.
export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    const enemies = g.enemies.slice();
    const state = g.state;
    const time = g.time;
    const health = p.health;
    const V = p.pos.constructor;
    const out = { ok: false };
    try {
      for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
      p.passiveItems[itemId] = 1;
      p.rebuildMods();
      g.state = 'playing';
      g.enemies.length = 0;
      g._syncCompanions();
      const chicken = g._companions[3];
      out.stoodUp = !!chicken && !!chicken.group.parent;
      out.calmBefore = !chicken.armed && g._findLure() === null;

      // The hit lands. ctx time says when the pet's next frame is.
      p.pos.set(0, 0, 0);
      p.invulnEnd = -1;
      p.wardReady = false;
      p.health = p.maxHealth;
      chicken.pos.set(0, 0, -14);
      g._hurtPlayer(10, p.pos);
      chicken.update(0.016, Object.assign({}, g._compCtx, { time: g.time, pulse: 0 }));
      out.armedByHit = chicken.armed;

      // The crowd is handed the chicken: the swap and the complete stand-in,
      // proven against a real enemy closing from BEYOND the bird.
      const e = new g.__EnemyForTest('chaser', new V(0, 0, -25), 1, 1, 1);
      g.enemies.push(e);
      const before = e.pos.z;
      g._updateEnemies(0.05);
      const d = g._enemyCtx.player;
      out.lureTaken = d === chicken.decoy && d.pos === chicken.pos;
      out.decoyMissing = ['pos', 'vel', 'yaw', 'eyeH', 'eyeInto', 'forwardInto']
        .filter((k) => d[k] === undefined);
      try {
        d.eyeInto(new V());
        d.forwardInto(new V());
        out.decoyCallable = true;
      } catch { out.decoyCallable = false; }
      p.health = p.maxHealth;
      g._enemyCtx.onHitPlayer(50, p.pos, e);
      out.absorbsDamage = p.health === p.maxHealth;
      out.closedOnIt = Math.abs(e.pos.z - chicken.pos.z) < Math.abs(before - chicken.pos.z);
      g.enemies.length = 0;

      // The window ends, and the player is handed back.
      chicken.update(0.016, Object.assign({}, g._compCtx,
        { time: chicken._decoyUntil + 0.01, pulse: 0 }));
      out.windowEnds = !chicken.armed;
      g._updateEnemies(0.016);
      out.handedBack = g._enemyCtx.player === p;
      g.enemies.length = 0;
      out.ok = out.stoodUp && out.calmBefore && out.armedByHit && out.lureTaken
        && out.decoyMissing.length === 0 && out.decoyCallable && out.absorbsDamage
        && out.closedOnIt && out.windowEnds && out.handedBack;
    } finally {
      for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
      Object.assign(p.passiveItems, owned);
      p.rebuildMods();
      g._syncCompanions();
      g.enemies.length = 0;
      g.enemies.push(...enemies);
      g.state = state;
      g.time = time;
      p.health = health;
      p.invulnEnd = -1;
      g._lure = null;
      g._enemyCtx.player = p;
    }
    return out;
  }, id);
  check('Rubber Chicken plants on a landed hit and the crowd is handed it for 3s',
    result.ok, JSON.stringify(result));
}