// The toad stands with the pet slots, licks every status off the player once
// the five-second cooldown is ready, and holds its tongue inside it - asserted
// by HURTING the player with real statuses and watching the table the HUD
// reads, never a flag.
export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    const enemies = g.enemies.slice();
    const state = g.state;
    const time = g.time;
    const out = { ok: false };
    try {
      for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
      p.passiveItems[itemId] = 1;
      p.rebuildMods();
      g.state = 'playing';
      g.enemies.length = 0;
      g._syncCompanions();
      const toad = g._companions[2];
      out.stoodUp = !!toad && !!toad.group.parent;
      p.pos.set(0, 0, 0);
      toad.pos.set(0.5, 0, 0.5);
      const ctx = () => Object.assign({}, g._compCtx, { time: g.time, pulse: 0 });
      const anyStatus = () => Object.values(p.status).some((v) => v > 0);

      // Two statuses on the player; the lick takes ALL of them at once.
      p.applyStatus('fire');
      p.applyStatus('slowness');
      toad.update(0.016, ctx());
      out.lickedAll = !anyStatus() && toad._lick > 0;
      out.cooling = toad.nextLickAt > g.time;

      // Inside the cooldown the toad cannot help: a fresh burn runs.
      p.applyStatus('fire');
      toad.update(0.016, ctx());
      out.heldInCooldown = p.status.fire > 0;

      // Once the cooldown is ready, the very next frame burns it off.
      g.time = toad.nextLickAt + 0.01;
      toad.update(0.016, ctx());
      out.lickedAgain = !anyStatus() && toad._lick > 0;
      out.ok = out.stoodUp && out.lickedAll && out.cooling
        && out.heldInCooldown && out.lickedAgain;
    } finally {
      p.clearStatuses();
      for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
      Object.assign(p.passiveItems, owned);
      p.rebuildMods();
      g._syncCompanions();
      g.enemies.length = 0;
      g.enemies.push(...enemies);
      g.state = state;
      g.time = time;
    }
    return out;
  }, id);
  check('Marsh Toad clears every status on one lick, then holds its five-second cooldown',
    result.ok, JSON.stringify(result));
}