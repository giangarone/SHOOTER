// Seeker (homing) test.
//
// The passive item's whole promise is that it rescues MISSES and touches
// nothing else, and every part of that is invisible to the smoke test. Checked
// here:
//
//   a near miss lands           an off-aim shot inside the cone finds a target
//   a wide miss still misses    outside the cone nothing happens
//   hits are never moved        a shot already on target is left alone, so it
//                               can never be dragged off a weak point
//   cover still works           an enemy behind a pillar is not reachable
//   one enemy, then stop        a homed shot does not carry on through pierce
//   the arc pool drains         curved tracers are returned
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8220;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT);
await sleep(800);

let browser;
let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
};

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load' });
  await sleep(1500);

  // A rig that places enemies at exact spots and fires one aimed shot with no
  // spread, so a hit or a miss is a fact about the mechanic rather than a roll.
  const rig = await page.evaluate(async () => {
    const THREE = await import('three');
    const { Enemy } = await import('./js/enemy.js');
    const g = window.__game;
    // THE ARENA IS PROCEDURAL NOW, so this rig cannot assume a lane is clear
    // or that a particular pillar is standing. Every run wipes the generated
    // interior and puts down exactly the cover the case under test asks for -
    // which is what a fixture should have been doing all along.
    const coverMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const coverGeo = new THREE.BoxGeometry(1, 1, 1);
    let cover = null;
    window.__rig = async (opts) => {
      // Terrain is torn down BEFORE the shot, and the nav grids with it, so
      // the only thing between the muzzle and the target is whatever `cover`
      // puts there.
      g.terrain.reset();
      g.terrain.clearCollision();
      if (cover) { g.scene.remove(cover); cover = null; }
      if (opts.cover) {
        const [cx, cz] = opts.cover;
        cover = new THREE.Mesh(coverGeo, coverMat);
        cover.position.set(cx, 1.15, cz);
        cover.scale.set(1.5, 2.3, 1.5);
        cover.updateMatrixWorld(true);
        g.scene.add(cover);
        g.arena.meshList.push(cover);
        g.arena.obstacles.push({
          min: { x: cx - 0.75, y: 0, z: cz - 0.75 },
          max: { x: cx + 0.75, y: 2.3, z: cz + 0.75 },
        });
      }
      g.state = 'playing';
      g.waveState = 'active';
      g.queue.length = 0;
      g.enemies.forEach((e) => { g.scene.remove(e.group); e.dispose(); });
      g.enemies.length = 0;
      g.player.upgrades = {};
      g.player.rebuildMods();
      if (opts.seeker) {
        g.player.upgrades.seeker = 1;
        g.player.rebuildMods();
      }
      if (opts.pierce) {
        g.player.mods.pierce = 3;
        g.player.mods.pierceFalloff = 1;
      }
      g.player.pos.set(opts.from[0], 0, opts.from[1]);
      g.player.vel.set(0, 0, 0);
      g.player.yaw = opts.yaw || 0;
      // The camera sits at 1.7 and a chaser's hitbox tops out near 1.4, so a
      // level shot sails straight over one. Every test aims AT the target
      // height, which leaves the horizontal offset as the only thing under
      // test - otherwise a "near miss" is missing vertically too and the cone
      // is never really exercised.
      g.player.pitch = opts.pitch !== undefined
        ? opts.pitch
        : Math.atan2(0.8 - 1.7, opts.aimDist || 10);
      g.player.mag = 999;
      g.player.reserveAmmo = 999;
      g.player.fireCd = 0;
      g.player.reloading = 0;
      const made = [];
      for (const [x, z] of opts.enemies) {
        const e = new Enemy('chaser', new THREE.Vector3(x, 0, z), 40, 1, 1);
        g.scene.add(e.group);
        g.enemies.push(e);
        made.push(e);
      }
      // Matrices are what the raycast reads, and enemies have not updated yet.
      for (const e of made) e.group.updateMatrixWorld(true);
      g.camera.position.copy(g.player.eyeInto(new THREE.Vector3()));
      g.camera.rotation.set(g.player.pitch, g.player.yaw, 0, 'YXZ');
      g.camera.updateMatrixWorld(true);
      const hpBefore = made.map((e) => e.hp);
      // No spread: the shot goes exactly down the crosshair.
      const w = g.player.weapon;
      const keep = w.spread;
      w.spread = 0;
      const arcsBefore = g.effects.arcs.filter((a) => a.life > 0).length;
      g.input.shootFresh = true;
      g.shoot();
      w.spread = keep;
      const arcsAfter = g.effects.arcs.filter((a) => a.life > 0).length;
      const hurt = made.map((e, i) => +(hpBefore[i] - e.hp).toFixed(1));
      return { hurt, arcs: arcsAfter - arcsBefore };
    };
    return true;
  });
  if (!rig) throw new Error('rig failed to install');

  const run = (opts) => page.evaluate((o) => window.__rig(o), opts);

  // Every shot below is fired down the lane at x = 6 heading -z. The rig wipes
  // generated terrain before each one, so the lane is empty unless the case
  // asks for cover - which is the only reason a shot in this file can miss for
  // a reason other than the mechanic under test.
  const lane = (dz) => [6, dz];

  // Enemy 0.9m to the right at 10m out - about 5 degrees off, inside the 6
  // degree cone, and still clear of the 0.5m hitbox so it is a genuine miss
  // without Seeker. The gap between those two bounds is what the passive item
  // lives in, and halving the cone narrowed it: at the old 1.5m the shot is
  // now outside the cone and this reads as a wide miss.
  const nearMissOff = await run({ from: [6, 4], enemies: [[6.9, -6]], seeker: false, aimDist: 10 });
  check('without Seeker a near miss misses', nearMissOff.hurt[0] === 0,
    `damage=${nearMissOff.hurt[0]}`);

  const nearMissOn = await run({ from: [6, 4], enemies: [[6.9, -6]], seeker: true, aimDist: 10 });
  check('with Seeker a near miss lands', nearMissOn.hurt[0] > 0,
    `damage=${nearMissOn.hurt[0]} arcs=${nearMissOn.arcs}`);
  check('a homed shot draws its curve', nearMissOn.arcs > 0, `arcs=${nearMissOn.arcs}`);

  // 6m off at 10m out - about 31 degrees, far outside the cone.
  const wide = await run({ from: [6, 4], enemies: [[12, -6]], seeker: true, aimDist: 10 });
  check('a wide miss still misses', wide.hurt[0] === 0, `damage=${wide.hurt[0]}`);

  // Dead ahead at 15m, with a second enemy off to the side and nearer. The
  // straight shot connects, so nothing may be redirected onto the other one.
  const onTarget = await run({
    from: [6, 4], enemies: [[6, -11], [7.4, -4]], seeker: true, aimDist: 15,
  });
  // arcs must be 0: an arc means the shot was rescued, and a shot that was
  // already on target must never be.
  check('a shot already on target is not moved',
    onTarget.hurt[0] > 0 && onTarget.hurt[1] === 0 && onTarget.arcs === 0,
    `aimed=${onTarget.hurt[0]} bystander=${onTarget.hurt[1]} arcs=${onTarget.arcs}`);

  // A truss tower stood in the lane, at the size and height the generator's
  // `tower` piece builds one: 1.5m square, 2.3m tall.
  const covered = await run({
    from: [0, 20], enemies: [[0.8, 12]], seeker: true, aimDist: 8, cover: [0, 14],
  });
  check('cover still stops a homed shot', covered.hurt[0] === 0,
    `damage=${covered.hurt[0]}`);

  // Two enemies both inside the cone, with pierce owned. Exactly one may be hit.
  const noChain = await run({
    from: [6, 4], enemies: [[6.9, -6], [5.1, -6]], seeker: true, pierce: true,
    aimDist: 10,
  });
  const struck = noChain.hurt.filter((h) => h > 0).length;
  check('a homed shot stops at one enemy', struck === 1,
    `hits=${struck} of ${JSON.stringify(noChain.hurt)}`);

  const drained = await page.evaluate(async () => {
    const g = window.__game;
    // effects.update only advances inside the frame loop, and the rig leaves
    // the game in whatever state the last shot did; put it back to playing so
    // the pool is actually ticked.
    g.state = 'playing';
    // RELEASE THE TRIGGER FIRST. The rig pulls it and never lets go, so the
    // player carries on auto-firing through the wait below - and with Seeker
    // owned and enemies still standing, every homed shot lays down a FRESH
    // arc. The pool was draining correctly the whole time; the check just kept
    // catching a curve that was born in the last few frames of the window.
    //
    // The enemies are deliberately LEFT STANDING. Clearing them empties the
    // wave, which ends it, and a game that is no longer in a live wave stops
    // ticking effects at all - the arcs then sit at full life forever and the
    // check fails for the opposite reason. Silence the gun, not the field.
    // The trigger cannot just be released: ?autotest runs a bot that re-arms
    // it every frame (see Game._autoInput), so the flag is back to true before
    // the next tick. Switching the bot off is what actually stops the gun.
    g.autoTest = false;
    g.input.shoot = false;
    g.input.shootFresh = false;
    const t0 = g.effects.arcs.filter((a) => a.life > 0).length;
    // WAIT FOR FRAMES, NOT FOR WALL TIME. An arc lives a fraction of a second
    // of GAME time, and this suite runs on a software rasteriser that can
    // deliver anywhere between four and sixty frames in the same 900ms - so a
    // fixed sleep was really asserting "the machine was fast enough today".
    // Polling until the pool is empty tests the thing the check is named after
    // and nothing else; the wall-clock cap is still there so a pool that
    // genuinely never drains fails instead of hanging.
    const until = Date.now() + 8000;
    while (Date.now() < until) {
      if (!g.effects.arcs.some((a) => a.life > 0)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    return {
      t0,
      live: g.effects.arcs.filter((a) => a.life > 0).length,
      visible: g.effects.arcs.filter((a) => a.line.visible).length,
      fired: g.player.mag,
    };
  });
  check('arc pool drains', drained.live === 0 && drained.visible === 0,
    `${drained.t0} live -> live=${drained.live} visible=${drained.visible}`);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(bad ? `SEEKER TEST FAIL (${bad})` : 'SEEKER TEST PASS');
process.exitCode = bad ? 1 : 0;
