// SNOWMAN: a decoy that stands for 8s, takes the crowd's attention, and pays
// back every hit on it with a ring of cold. The two halves of the card are
// asserted separately: it must register as the game's lure (the whole "they
// attack IT" half is _findLure's lireat in main.js), and onHit must freeze
// what stands close - with the cooldown between bursts actually binding.
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
    g._clearDeployed();
    g.enemies.length = 0;
    P.yaw = 0;

    P.giveActiveItem(id);
    g.tryActiveItem();
    const snowman = g._deployed[g._deployed.length - 1];
    out.deployed = !!snowman && snowman.constructor.name === 'Snowman';
    out.lure = g._findLure() === snowman;
    out.armed = snowman.lure === true && snowman.armed === true;
    // Placed just ahead of the aim: yaw zero aims down -z, two metres out.
    out.ahead = (P.pos.z - snowman.pos.z) > 1 && (P.pos.z - snowman.pos.z) < 3.5;

    // An enemy standing inside the burst radius takes the freeze; one well
    // outside it does not.
    const V = P.pos.constructor;
    const near = new g.__EnemyForTest('chaser', new V(snowman.pos.x + 1.5, 0, snowman.pos.z), 40, 1, 1);
    const far = new g.__EnemyForTest('chaser', new V(snowman.pos.x + 20, 0, snowman.pos.z), 40, 1, 1);
    g.scene.add(near.group);
    g.scene.add(far.group);
    g.enemies.push(near, far);

    snowman.onHit(10, snowman.pos, near);
    out.freezesNear = near.status.freeze > 1.5;
    out.farSpared = far.status.freeze <= 0;

    // One blow, one answer: a second hit inside the burst cooldown must not
    // re-apply a fresh freeze on a body whose timer has been walked down.
    near.status.freeze = 0.5;
    snowman._burstCd = 0.6;
    snowman.onHit(10, snowman.pos, near);
    out.cooldownBinds = near.status.freeze === 0.5;

    // It melts on its own clock, and once it is gone it is no longer the lure.
    for (let i = 0; i < 85; i++) {
      g.time += 0.1;
      g._updateDeployed(0.1);
    }
    out.expired = !g._deployed.includes(snowman);
    out.lureFreed = g._findLure() !== snowman;

    g.enemies.length = 0;
    g.scene.remove(near.group);
    g.scene.remove(far.group);
    g._clearDeployed();
    return out;
  }, id);
  check('SNOWMAN lures the crowd, freezes hitters in a burst with a real cooldown, and melts at 8s',
    r.deployed && r.lure && r.armed && r.ahead && r.freezesNear && r.farSpared
      && r.cooldownBinds && r.expired && r.lureFreed,
    JSON.stringify(r));
}
