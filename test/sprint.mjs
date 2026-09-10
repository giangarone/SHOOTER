// Focused check of SPRINTING and the stamina it spends.
//
// WHAT IS ASSERTED
//   1. Shift runs, and running is faster than walking.
//   2. The bar drains while running, holds for a beat, then refills - and the
//      readout on the HUD follows it cell for cell.
//   3. Running the bar to zero LOCKS the sprint out until a third of it is
//      back, which is the rule that stops stutter-sprinting on fumes.
//   4. The four things that refuse the button: an empty bar, a held trigger, a
//      shot just fired, and standing still.
//   5. Sprinting takes the gun out of the sights and widens the lens.
//   6. The shot cone scales with LIVE SPEED - standing, walking and sprinting
//      are three different guns - and the crosshair reads whichever it is.
import puppeteer from 'puppeteer-core';
import { CHROME, startServer } from './harness.mjs';

const PORT = 8216;
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
  browser = await puppeteer.launch({
    headless: true, executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?padtest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const results = await page.evaluate(async () => {
    const g = window.__game;
    // THE ARENA IS PROCEDURAL, so a fixture that walks a fixed path across it
    // is measuring the layout as much as the mechanic. This clears the
    // generated interior and pins the wave open - an empty queue would clear
    // the wave, sink the shop in and generate a fresh layout mid-measurement -
    // so every run below happens on the same bare floor.
    const clearArena = () => {
      if (g.terrain.state !== 'hidden') {
        g.terrain.reset();
        g.terrain.clearCollision();
        g.nav.rebake(g.arena.obstacles);
        g.navBig.rebake(g.arena.obstacles);
      }
      // A wave with an empty queue clears on the frame it starts, which sinks
      // the shop in and generates a fresh layout halfway through whatever is
      // being measured. One entry that never spawns holds it open instead.
      g.waveState = 'active';
      if (!g.queue.length) g.queue.push('chaser');
      g.spawnTimer = 1e9;
    };
    const p = g.player;
    const out = [];
    const t = (name, cond, extra = '') => out.push([name, !!cond, String(extra)]);
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const frames = async (n) => { for (let i = 0; i < n; i++) { clear(); await step(); } };
    // The spawner would otherwise walk something into the player halfway
    // through a measurement and change the numbers being measured.
    const clear = () => { g.queue.length = 0; g._clearEntities(); };
    const stamBar = () => {
      const m = /scaleX\(([\d.]+)\)/.exec(document.getElementById('stam-bar').style.transform);
      return m ? Number(m[1]) : -1;
    };
    const box = () => document.getElementById('hp-box').classList;
    // Everything below drives `input` the way both devices do, and resets the
    // player to the middle of the room first so a wall never ends a run early.
    const set = (o) => Object.assign(g.input, o);
    const rest = () => {
      clearArena();
      set({ forward: false, back: false, left: false, right: false, sprint: false, shoot: false, aim: false });
      p.pos.set(0, 0, 0);
      p.moveVX = 0;
      p.moveVZ = 0;
      p.dashEnd = -1;
      p.yaw = 0;
    };

    g.beginGame();
    await frames(4);
    rest();
    await frames(4);

    // ---- 1. the binding, and the gear -------------------------------------
    const standingCone = g._shotSpread();
    const run = async (sprint) => {
      rest();
      await frames(4);
      p.stamina = 100;
      p.staminaLocked = false;
      set({ forward: true, sprint });
      await frames(30);
      const d = Math.hypot(p.pos.x, p.pos.z);
      const cone = g._shotSpread();
      const sprinting = p.sprinting;
      const fov = g.camera.fov;
      rest();
      await frames(4);
      return { d, cone, sprinting, fov };
    };
    const walk = await run(false);
    const sprint = await run(true);
    t('sprint engages', sprint.sprinting === true && walk.sprinting === false);
    t('sprinting is faster', sprint.d > walk.d * 1.35,
      walk.d.toFixed(2) + ' -> ' + sprint.d.toFixed(2));
    t('sprinting widens the lens', sprint.fov > walk.fov + 3,
      walk.fov.toFixed(1) + ' -> ' + sprint.fov.toFixed(1));

    // ---- 6. three speeds, three guns --------------------------------------
    t('moving opens the cone', walk.cone > standingCone,
      standingCone.toFixed(3) + ' -> ' + walk.cone.toFixed(3));
    t('sprinting opens it further', sprint.cone > walk.cone,
      walk.cone.toFixed(3) + ' -> ' + sprint.cone.toFixed(3));
    t('a sprint roughly triples the standing cone',
      sprint.cone > standingCone * 2.7 && sprint.cone < standingCone * 3.3,
      (sprint.cone / standingCone).toFixed(2) + 'x');

    // THE TAIL. Firing cancels the sprint, so a penalty that ended with the
    // run would never be the cone a bullet was fired through. Measured one
    // frame after the run stops and again once the fade has run out.
    rest();
    p.stamina = 100;
    p.staminaLocked = false;
    set({ forward: true, sprint: true });
    await frames(20);
    set({ sprint: false });
    await frames(1);
    const justAfterRun = g._shotSpread();
    await frames(40);
    const settled = g._shotSpread();
    rest();
    await frames(4);
    t('the sprint cone outlives the sprint', justAfterRun > walk.cone * 1.3,
      walk.cone.toFixed(3) + ' walking, ' + justAfterRun.toFixed(3) + ' just after');
    t('and then it settles back', Math.abs(settled - walk.cone) < 0.01,
      settled.toFixed(3) + ' vs ' + walk.cone.toFixed(3));

    // ---- 2. the bar --------------------------------------------------------
    rest();
    p.stamina = 100;
    p.staminaLocked = false;
    await frames(4);
    const barFull = stamBar();
    set({ forward: true, sprint: true });
    await frames(60);
    const drained = p.stamina;
    const barDrained = stamBar();
    const runClass = box().contains('sprinting');
    // A band rather than a number: these frames are real frames, and a
    // software renderer takes as long over one as it likes.
    t('running drains the bar', drained < 95 && drained > 2, drained.toFixed(1));
    t('the readout follows it', barDrained < barFull && Math.abs(barDrained - drained / 100) < 0.05,
      barFull + ' -> ' + barDrained);
    // THE COLOUR IS THE LEVEL AND NOTHING ELSE. Running must not change it -
    // the same amount of stamina in two colours is a bar that needs a second
    // glance to read, which is the one thing a bar is for.
    t('running does not colour the bar', runClass === false);

    // It holds before it refills, so tapping the key cannot top it up free.
    rest();
    await frames(6);
    const held = p.stamina;
    t('the refill waits a beat', Math.abs(held - drained) < 2,
      drained.toFixed(1) + ' -> ' + held.toFixed(1));
    await frames(60);
    t('and then refills', p.stamina > held + 5, held.toFixed(1) + ' -> ' + p.stamina.toFixed(1));

    // ---- 3. exhaustion -----------------------------------------------------
    rest();
    p.stamina = 90;
    p.staminaLocked = false;
    await frames(4);
    const highColour = box().contains('stam-low');
    p.stamina = 20;
    await frames(4);
    const lowColour = box().contains('stam-low');
    t('a full bar is not red', highColour === false);
    t('a low bar is red', lowColour === true);

    p.stamina = 6;
    p.staminaLocked = false;
    await frames(4);
    set({ forward: true, sprint: true });
    await frames(30);
    const lockedNow = p.staminaLocked;
    const sprintingOnEmpty = p.sprinting;
    const spentClass = box().contains('spent');
    t('an empty bar locks the sprint', lockedNow === true && sprintingOnEmpty === false,
      p.stamina.toFixed(1));
    t('the bar says so', spentClass === true);
    // Held down through the lockout: the button must stay refused until the
    // bar is a third full, not the moment a single point comes back.
    await frames(30);
    const lockedStill = p.staminaLocked;
    t('a held key does not sprint on fumes',
      lockedStill === true && p.sprinting === false && p.stamina > 0,
      p.stamina.toFixed(1));
    rest();
    // Enough regen to clear the third, then it runs again.
    p.stamina = 40;
    await frames(4);
    set({ forward: true, sprint: true });
    await frames(6);
    t('a third of a bar unlocks it', p.staminaLocked === false && p.sprinting === true,
      p.stamina.toFixed(1));

    // ---- 4. the other refusals ---------------------------------------------
    rest();
    p.stamina = 100;
    p.staminaLocked = false;
    await frames(4);
    set({ sprint: true });
    await frames(10);
    t('standing still is not running', p.sprinting === false && p.stamina === 100,
      p.stamina.toFixed(1));

    set({ forward: true });
    await frames(6);
    const running = p.sprinting;
    set({ shoot: true });
    await frames(4);
    const afterTrigger = p.sprinting;
    set({ shoot: false });
    // The shot itself keeps them out of it for a moment after the trigger.
    await frames(2);
    const justAfter = p.sprinting;
    t('a held trigger refuses the sprint', running === true && afterTrigger === false);
    t('and a fired round keeps it refused', justAfter === false,
      (p.noSprintUntil - g.time).toFixed(2) + 's left');
    await frames(30);
    t('then it runs again', p.sprinting === true);

    // ---- 5. the sights beat the run ----------------------------------------
    // Aim is a press; sprint is a key held for seconds at a time. The press
    // wins - see _updateSprint - so a player who sights something mid-run is
    // out of the run and raising the weapon on the same frame, and gets the
    // run back the moment they let go.
    rest();
    p.stamina = 100;
    p.staminaLocked = false;
    set({ forward: true, aim: true });
    await frames(20);
    const aimedWalking = p.aimT;
    set({ sprint: true });
    await frames(20);
    const aimedRunning = p.aimT;
    const ranWhileAiming = p.sprinting;
    const stillAsking = g.input.sprint;
    set({ aim: false });
    await frames(20);
    const ranAfterAimOff = p.sprinting;
    const sightsDown = p.aimT;
    rest();
    t('walking still aims', aimedWalking > 0.99, aimedWalking.toFixed(3));
    t('aiming refuses the sprint outright',
      ranWhileAiming === false && stillAsking === true);
    t('and the sights stay up through it', aimedRunning > 0.99, aimedRunning.toFixed(3));
    t('letting go of aim hands the run straight back',
      ranAfterAimOff === true && sightsDown === 0, sightsDown.toFixed(3));

    // ---- 5b. the gun bobs with the player -----------------------------------
    // The walk animation and the sprint carry are offsets on the rest pose, so
    // what is asserted is that they MOVE and that they come back to nothing -
    // a viewmodel that drifts and never returns is the failure mode worth
    // pinning, not any particular amplitude.
    rest();
    p.stamina = 100;
    p.staminaLocked = false;
    // The RANGE of the sway over a stretch of running, not its absolute
    // value: the sprint carry is a large static offset on the same channels,
    // and peak-to-peak is what cancels it out and leaves the animation.
    const swing = async (n) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < n; i++) {
        await frames(1);
        lo = Math.min(lo, p._gunOffX);
        hi = Math.max(hi, p._gunOffX);
      }
      return hi - lo;
    };
    set({ forward: true, left: true });
    await frames(30);
    const walkSwing = await swing(60);
    set({ sprint: true });
    await frames(30);
    const runPose = {
      y: p._gunOffY, ry: p._gunOffRY, rz: p._gunOffRZ, blend: p._sprintPose,
    };
    const runSwing = await swing(60);
    // Aiming is the one thing that stops it outright - see _updateGunMotion.
    set({ forward: true, aim: true });
    await frames(30);
    const aimedSwing = await swing(60);
    set({ aim: false });
    rest();
    await frames(90);
    const atRest = Math.abs(p._gunOffX) + Math.abs(p._gunOffY)
      + Math.abs(p._gunOffRX) + Math.abs(p._gunOffRY) + Math.abs(p._gunOffRZ);
    t('walking bobs the gun', walkSwing > 0.004, walkSwing.toFixed(4));
    t('the sprint carries it across the body',
      runPose.blend > 0.95 && runPose.ry > 0.4 && runPose.y < -0.03,
      `ry=${runPose.ry.toFixed(2)} y=${runPose.y.toFixed(3)}`);
    t('and swings it wider than a walk', runSwing > walkSwing * 1.5,
      `${walkSwing.toFixed(4)} -> ${runSwing.toFixed(4)}`);
    t('aiming stops the bob dead', aimedSwing < 0.0005, aimedSwing.toFixed(5));
    t('standing still returns it to the rest pose', atRest < 0.002,
      atRest.toFixed(5));

    return out;
  });

  for (const [name, cond, extra] of results) ok(name, cond, extra);

  // The binding itself, through a real key rather than through `input`.
  await page.keyboard.down('Shift');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 60)));
  const shiftDown = await page.evaluate(() => window.__game.input.sprint);
  await page.keyboard.up('Shift');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 60)));
  const shiftUp = await page.evaluate(() => window.__game.input.sprint);
  ok('shift is the sprint key', shiftDown === true && shiftUp === false);

  console.log('CONSOLE ERRORS', JSON.stringify(errors));
  ok('no console errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  console.error(err);
  fails++;
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(fails ? `SPRINT TEST FAIL (${fails})` : 'SPRINT TEST PASS');
process.exit(fails ? 1 : 0);
