// CHARITY CASE: ten seconds in which the gun deals no damage and every shot
// that lands heals one. Fired END-TO-END through shoot(), with the camera
// pointed the way the game points it - because the card's two halves live in
// two different places (the pellet's damage in _landShot, the collection on
// `hitAny` in shoot()) and a property tested on only one of them is half the
// item.
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
    P.status.fear = 0;

    // A fat body dead ahead: yaw zero aims down -z, the camera is stood
    // behind the player exactly the way applyCamera stands it every frame.
    const V = P.pos.constructor;
    const e = new g.__EnemyForTest('colossus', new V(P.pos.x, 0, P.pos.z - 5), 1, 1, 1);
    g.scene.add(e.group);
    g.enemies.push(e);
    P.yaw = 0;
    P.pitch = 0;
    P.applyCamera();
    g.camera.updateMatrixWorld(true);

    P.health = 50;
    P.mag = P.magSize;
    P.reserveAmmo = P.maxReserve;
    P.giveActiveItem(id);
    g.tryActiveItem();
    out.window = P.charityEnd > g.time;

    // One real trigger pull, straight into it.
    const hpBefore = e.hp;
    P.fireCd = 0;
    g.shoot();
    out.shotFired = true;
    out.noDamage = e.hp === hpBefore;
    out.collected = P.health === 51;

    // A second pull heals once more - per landed shot, not per pellet, so the
    // heal is exactly one however the pattern splits.
    P.fireCd = 0;
    g.input.shootFresh = true;
    g.shoot();
    out.collectedAgain = P.health === 52;
    out.stillNoDamage = e.hp === hpBefore;

    // The window ends, the gun starts killing again.
    for (let i = 0; i < 110; i++) {
      g.time += 0.1;
      g.runningActiveItems.update(g, 0.1);
    }
    out.windowClosed = P.charityEnd <= g.time && g.runningActiveItems.list.length === 0;
    P.fireCd = 0;
    g.input.shootFresh = true;
    g.shoot();
    out.damageResumes = e.hp < hpBefore;

    g.enemies.length = 0;
    g.scene.remove(e.group);
    g.runningActiveItems.clear(g);
    P.health = P.maxHealth;
    return out;
  }, id);
  check('CHARITY CASE silences the gun for 10s and pays 1 HP per landed shot',
    r.window && r.noDamage && r.collected && r.collectedAgain && r.stillNoDamage
      && r.windowClosed && r.damageResumes,
    JSON.stringify(r));
}
