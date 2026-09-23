// ORBITAL DEBRIS: blades circle the player for 8s and cut whatever closes in.
// The two ends of the card: a body on the ring must take 4x-shot cuts while
// the window runs, and the blades must be GONE when the window is - the ring
// that outlived its chip would be damage nobody was granted.
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

    // A chaser parked on the ring's path: orbit radius 2.4 dead ahead of the
    // player, beefy enough that the cuts land without killing it.
    const V = P.pos.constructor;
    const e = new g.__EnemyForTest('chaser', new V(P.pos.x + 2.4, 0, P.pos.z), 40, 1, 1);
    g.scene.add(e.group);
    g.enemies.push(e);

    const sceneBefore = g.scene.children.length;
    P.giveActiveItem(id);
    g.tryActiveItem();
    const running = g.runningActiveItems.list[0];
    out.started = !!running && running.id === id;
    // 4x the player's own shot, snapshotted on the press.
    out.dmg = running ? +running.s.dmg.toFixed(2) : -1;
    out.expected = +(P.getEffectiveDamage(P.weapon.damage) * 4).toFixed(2);
    out.bladesPlaced = g.scene.children.length === sceneBefore + 3;

    const hpBefore = e.hp;
    // Two seconds of orbit, stepped by hand: several blade passes, so several
    // separate cuts have to land rather than one suspicious frame's worth.
    for (let i = 0; i < 40; i++) {
      g.time += 0.05;
      g.runningActiveItems.update(g, 0.05);
    }
    out.cut = e.hp < hpBefore;
    out.cutAmount = +(hpBefore - e.hp).toFixed(1);
    out.stillRunning = g.runningActiveItems.list.length === 1;

    // Run the window out: the blades leave the scene and the list the same
    // frame, or the ring fights forever with no chip on the HUD.
    for (let i = 0; i < 130; i++) {
      g.time += 0.05;
      g.runningActiveItems.update(g, 0.05);
    }
    out.expired = g.runningActiveItems.list.length === 0;
    out.bladesGone = g.scene.children.length === sceneBefore;

    e.dead = true;
    g.enemies.length = 0;
    g.scene.remove(e.group);
    g.runningActiveItems.clear(g);
    return out;
  }, id);
  check('ORBITAL DEBRIS starts, cuts at 4x shot damage, and cleans up its blades',
    r.started && r.cut && r.dmg === r.expected && r.bladesPlaced && r.expired && r.bladesGone,
    JSON.stringify(r));
}
