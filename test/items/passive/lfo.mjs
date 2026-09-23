// LFO. The three stats the card sweeps, measured on BOTH sides of the
// second - a number that is only ever read on one phase is a number a
// broken phase test cannot tell apart from a constant.
export async function run({ page, check, id }) {
  const result = await page.evaluate((itemId) => {
    const g = window.__game;
    const p = g.player;
    const owned = { ...p.passiveItems };
    const savedNow = p.now;
    const savedPos = p.pos.clone();
    const out = {};
    const bare = () => {
      for (const k of Object.keys(p.passiveItems)) delete p.passiveItems[k];
      p.rebuildMods();
    };
    const give = (iid) => { p.passiveItems[iid] = 1; p.rebuildMods(); };
    // The speed half is only reachable through update(), so the fixture walks
    // one frame per phase with the stick pushed and reads the velocity the
    // frame produced. Pos is cleared of anything the last frame left.
    const walkSpeedAt = (t) => {
      p.now = t;
      p.update(0.016, { moveF: 1 }, [], t, false);
      return Math.hypot(p.moveVX, p.moveVZ);
    };

    bare();
    out.baseDamage = p.getEffectiveDamage(100);
    out.baseRate = p.effectiveFireRate;
    out.baseWalk = walkSpeedAt(0.5);

    give(itemId);
    // The high second: 0.5 sits inside second zero, the run's first.
    p.now = 0.5;
    out.upDamage = p.getEffectiveDamage(100);
    out.upRate = p.effectiveFireRate;
    // The low second.
    p.now = 1.5;
    out.downDamage = p.getEffectiveDamage(100);
    out.downRate = p.effectiveFireRate;
    // And back up again - the sweep is a wave, not a step.
    p.now = 2.5;
    out.upAgain = p.getEffectiveDamage(100);
    // Speed on both phases, through the real movement code. The parity is
    // the floor of the second: 2.5 sits in an UP second, 3.5 in a DOWN one.
    out.upWalk = walkSpeedAt(2.5);
    out.downWalk = walkSpeedAt(3.5);

    bare();
    out.offWalk = walkSpeedAt(5.5);
    out.offDamage = p.getEffectiveDamage(100);

    for (const k of Object.keys(p.passiveItems)) delete p.passiveItems[k];
    Object.assign(p.passiveItems, owned);
    p.rebuildMods();
    p.now = savedNow;
    p.pos.copy(savedPos);
    return out;
  }, id);

  check('LFO highs the damage, rate and speed on the even second',
    Math.abs(result.upDamage - result.baseDamage * 1.3) < 1e-6
      && Math.abs(result.upRate - result.baseRate * 1.25) < 1e-6
      && Math.abs(result.upWalk - result.baseWalk * 1.15) < 1e-6,
    JSON.stringify(result));
  check('LFO lows them on the odd second',
    Math.abs(result.downDamage - result.baseDamage * 0.9) < 1e-6
      && Math.abs(result.downRate - result.baseRate * 0.85) < 1e-6
      && Math.abs(result.downWalk - result.baseWalk * 0.95) < 1e-6,
    JSON.stringify(result));
  check('LFO comes back up - the sweep is a wave, not a step',
    Math.abs(result.upAgain - result.upDamage) < 1e-6,
    JSON.stringify(result));
  check('LFO off means every stat reads its bare value',
    Math.abs(result.offDamage - result.baseDamage) < 1e-6
      && Math.abs(result.offWalk - result.baseWalk) < 1e-6,
    JSON.stringify(result));
}
