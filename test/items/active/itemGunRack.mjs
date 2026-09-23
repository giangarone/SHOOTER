// GUN RACK: three turrets in an arc facing the aim, living eight seconds.
// The card draws a shape, so the test checks the shape: 3 deployables, one
// straight ahead and one off each wing; each clocked at 8s rather than the
// class's own fifteen; and all of them gone once the clocks run out. The
// firing itself is Turret's own territory and has its own suite.
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

    // Known aim: yaw zero looks down -z, see Player.forwardInto.
    P.yaw = 0;
    const px = P.pos.x, pz = P.pos.z;
    const before = g._deployed.length;
    P.giveActiveItem(id);
    g.tryActiveItem();

    out.count = g._deployed.length - before === 3;
    const turrets = g._deployed.slice(-3);
    out.lives = turrets.map((t) => Math.round(t.life * 10) / 10);
    out.live8 = out.lives.every((l) => l <= 8.01 && l > 7.5);
    // The arc: positions relative to the pressed-in direction. At yaw zero
    // the aim is (0, 0, -1), so the centre post is straight north and the
    // wings split off east and west.
    const rel = turrets.map((t) => ({
      x: +(t.pos.x - px).toFixed(2), z: +(t.pos.z - pz).toFixed(2),
    }));
    out.rel = rel;
    const centre = rel.find((r2) => Math.abs(r2.x) < 0.6 && r2.z < -1.5);
    const left = rel.find((r2) => r2.x < -0.5 && r2.z < -1);
    const right = rel.find((r2) => r2.x > 0.5 && r2.z < -1);
    out.arcShape = !!centre && !!left && !!right;
    // Every one of them faces where it was aimed while it still has no
    // target of its own. A Turret's own yaw convention is atan2(dx, dz) off
    // the target (it sets it that way itself when it acquires one), so the
    // barrel reads as (sin, cos) of it - the opposite sign from the player's
    // forward, and the reason this assertion knows whose convention it is
    // holding.
    out.facingAim = turrets.every((t) => {
      const f = { x: Math.sin(t.yaw), z: Math.cos(t.yaw) };
      return f.z < -0.7;
    });

    // They die with their clocks and not a frame beyond them.
    for (let i = 0; i < 90; i++) {
      g.time += 0.1;
      g._updateDeployed(0.1);
    }
    out.expired = g._deployed.length === before;
    g._clearDeployed();
    return out;
  }, id);
  check('GUN RACK plants three turrets in an arc facing the aim, clocked at 8s, then gone',
    r.count && r.live8 && r.arcShape && r.facingAim && r.expired,
    JSON.stringify(r));
}
