// Focused check of AIMING DOWN THE SIGHTS, the crosshair it drives, and the
// hit marker that sits inside it.
//
// THE BUG THIS EXISTS FOR
//   ui.hitMarker() added a `.show` class that set `opacity: 1`, and NOTHING
//   ever took it off again - there was nowhere to take it off from, since the
//   method is called out of the shot path and has no clock. So the marker
//   appeared on the first bullet that connected and then hung over the
//   crosshair for the rest of the run, reading as a permanent hit on nothing.
//   It is a self-terminating animation now, and the first three assertions
//   below are the regression test for exactly that.
//
// WHAT ELSE IS ASSERTED
//   4. The right mouse button raises the gun and V melees - the two bindings
//      that swapped when the sights arrived.
//   5. Raising the gun zooms, centres the viewmodel and tightens the cone, and
//      lowering it puts all three back exactly where they were.
//   6. THE CROSSHAIR IS THE CONE: its gap is the spread the next shot will be
//      drawn from, in pixels, on both sides of the blend.
//   7. Movement opens the cone from either pose, and costs less down the
//      sights than from the hip.
//   8. A reload takes the gun out of the aim and hands it back after.
import { launchBrowser, startServer } from './harness.mjs';

const PORT = 8213;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?padtest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  // ---- the run ------------------------------------------------------------
  //
  // Started before anything is measured, and not only because the arena has to
  // be running: the HUD is `hidden` on the menu, and an element inside a
  // display:none subtree does not run its animations at all - the hit marker
  // would sit at its first keyframe forever and the test below would pass a
  // bug it was written to catch.
  await page.evaluate(() => {
    const g = window.__game;
    g.beginGame();
    // The wave spawner would otherwise walk something into the player halfway
    // through a measurement and change the numbers being measured.
    g._keepClear = setInterval(() => { g.queue.length = 0; g._clearEntities(); }, 16);
  });

  const frames = (n) => page.evaluate(
    (k) => new Promise((done) => {
      let i = 0;
      const tick = () => (++i >= k ? done() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    }), n
  );
  const read = () => page.evaluate(() => {
    const g = window.__game;
    return {
      aiming: g.player.aiming,
      aimT: g.player.aimT,
      fov: g.camera.fov,
      gunX: g.player.gun.position.x,
      gunY: g.player.gun.position.y,
      gunZ: g.player.gun.position.z,
      spread: g._shotSpread(),
      melee: g.input.melee,
      gap: parseFloat(getComputedStyle(document.getElementById('crosshair')).getPropertyValue('--gap')),
      aimClass: document.getElementById('crosshair').classList.contains('aim'),
      h: innerHeight,
    };
  });

  await frames(4);
  const hip = await read();

  // ---- 1-3. the hit marker ------------------------------------------------
  //
  // Triggered from the page but measured after a real wait, because what broke
  // was the ENDING of the effect and nothing about its start. Run a few frames
  // into the game rather than on the menu: the HUD is `hidden` there, and an
  // element inside a display:none subtree does not run its animations at all.
  const markStart = await page.evaluate(() => {
    const h = document.getElementById('hitmarker');
    const before = getComputedStyle(h).opacity;
    window.__game.ui.hitMarker();
    return { before, during: getComputedStyle(h).opacity };
  });
  ok('marker is off before any hit', markStart.before === '0', markStart.before);
  ok('a hit shows the marker', markStart.during === '1', markStart.during);
  // WAITED ON THE ANIMATION, NOT ON A STOPWATCH. A CSS animation is driven by
  // the document timeline, which only moves when a frame is served, and it does
  // not even START until the first frame after the class lands. On a renderer
  // as slow as software GL that is a hundred milliseconds of the wait gone
  // before the animation begins and another frame's worth of timeline missing
  // at the end of it, so a fixed sleep of half a second was flaking on a
  // 200ms effect - the marker was read mid-animation, at full opacity, and the
  // failure looked exactly like the bug this asserts against. Bounded, so a
  // marker that genuinely never clears still fails here instead of hanging.
  const markEnd = await page.evaluate(async () => {
    const h = document.getElementById('hitmarker');
    await Promise.race([
      Promise.all(h.getAnimations().map((a) => a.finished.catch(() => {}))),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    return getComputedStyle(h).opacity;
  });
  ok('the marker clears itself', markEnd === '0', markEnd);
  const markAgain = await page.evaluate(() => {
    window.__game.ui.hitMarker();
    return getComputedStyle(document.getElementById('hitmarker')).opacity;
  });
  ok('a second hit re-triggers it', markAgain === '1', markAgain);
  await sleep(300);

  // ---- 4. the two bindings that moved -------------------------------------
  await page.keyboard.down('v');
  await frames(2);
  const meleeDown = (await read()).melee;
  await page.keyboard.up('v');
  await frames(2);
  ok('V melees', meleeDown === true && (await read()).melee === false);

  await page.evaluate(() => {
    const g = window.__game;
    window.__trace = [];
    const rec = () => {
      window.__trace.push(g.player.aimT);
      if (window.__trace.length < 60) requestAnimationFrame(rec);
    };
    requestAnimationFrame(rec);
  });
  await page.mouse.down({ button: 'right' });
  // Long enough that the whole raise lands inside the recording window - the
  // press itself arrives several frames after the recorder starts, and the
  // raise is only eight frames long.
  await frames(40);
  const aimed = await read();
  const trace = await page.evaluate(() => window.__trace);
  const between = trace.filter((v) => v > 0.05 && v < 0.95).length;
  ok('right button raises the gun', aimed.aiming === true && aimed.aimT > 0.99, aimed.aimT.toFixed(3));
  ok('the raise is animated, not a cut', between >= 2,
    between + ' frames mid-raise of ' + trace.length);

  // ---- 5. what aiming changes ---------------------------------------------
  ok('aiming zooms in', aimed.fov < hip.fov - 15, hip.fov + ' -> ' + aimed.fov.toFixed(1));
  ok('the gun centres', Math.abs(aimed.gunX) < 0.01 && hip.gunX > 0.2,
    hip.gunX.toFixed(2) + ' -> ' + aimed.gunX.toFixed(2));
  ok('the gun rises to the sight line', aimed.gunY > hip.gunY,
    hip.gunY.toFixed(3) + ' -> ' + aimed.gunY.toFixed(3));
  ok('aiming tightens the cone', aimed.spread < hip.spread * 0.2,
    hip.spread.toFixed(4) + ' -> ' + aimed.spread.toFixed(4));

  // ---- 6. the crosshair IS the cone ---------------------------------------
  const gapFor = (r) => 4 + r.spread * r.h * 0.25;
  ok('hip crosshair reads the hip cone', Math.abs(hip.gap - gapFor(hip)) <= 0.5,
    hip.gap + ' vs ' + gapFor(hip).toFixed(2));
  ok('aimed crosshair reads the aimed cone', Math.abs(aimed.gap - gapFor(aimed)) <= 0.5,
    aimed.gap + ' vs ' + gapFor(aimed).toFixed(2));
  ok('the crosshair closes when aiming', aimed.gap < hip.gap * 0.5,
    hip.gap + ' -> ' + aimed.gap);
  ok('the crosshair says it is aiming', aimed.aimClass === true && hip.aimClass === false);

  // ---- 7. movement, from both poses ---------------------------------------
  const walk = async () => {
    await page.evaluate(() => { window.__game.input.forward = true; });
    await frames(20);
    const r = await read();
    await page.evaluate(() => { window.__game.input.forward = false; });
    await frames(20);
    return r;
  };
  const movingAimed = await walk();
  await page.mouse.up({ button: 'right' });
  await frames(20);
  const down = await read();
  const movingHip = await walk();
  ok('moving opens the cone from the hip', movingHip.spread > down.spread,
    down.spread.toFixed(4) + ' -> ' + movingHip.spread.toFixed(4));
  ok('moving opens it down the sights too', movingAimed.spread > aimed.spread,
    aimed.spread.toFixed(4) + ' -> ' + movingAimed.spread.toFixed(4));
  ok('moving costs less down the sights',
    movingAimed.spread - aimed.spread < movingHip.spread - down.spread,
    (movingAimed.spread - aimed.spread).toFixed(4) + ' vs '
    + (movingHip.spread - down.spread).toFixed(4));

  // ---- 5b. and it all goes back -------------------------------------------
  ok('lowering restores the hip pose',
    down.aimT === 0 && down.fov === hip.fov
    && Math.abs(down.gunX - hip.gunX) < 0.001 && Math.abs(down.gunY - hip.gunY) < 0.001
    && Math.abs(down.gunZ - hip.gunZ) < 0.02,
    JSON.stringify({ aimT: down.aimT, fov: down.fov, x: down.gunX }));

  // ---- 8. reloading takes the gun out of the aim --------------------------
  await page.mouse.down({ button: 'right' });
  await frames(20);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.mag = 1;
    g.tryReload();
  });
  await frames(4);
  const reloading = await read();
  ok('a reload lowers the gun', reloading.aiming === false, String(reloading.aimT.toFixed(2)));
  await page.evaluate(() => { window.__game.player.reloading = 0; });
  await frames(20);
  const after = await read();
  ok('and it comes back up on its own', after.aiming === true && after.aimT > 0.99,
    after.aimT.toFixed(3));
  await page.mouse.up({ button: 'right' });

  await page.evaluate(() => clearInterval(window.__game._keepClear));
  console.log('CONSOLE ERRORS', JSON.stringify(errors));
  ok('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  console.error(err);
  fails++;
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(fails ? `AIM TEST FAIL (${fails})` : 'AIM TEST PASS');
process.exit(fails ? 1 : 0);
