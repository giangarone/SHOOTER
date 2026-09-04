// Focused check of the player's status effects - status.js, and the hooks it
// has in player.js, main.js and ui.js.
//
// WHY THIS IS A BROWSER TEST AND NOT A UNIT TEST
//   Four of the six effects are only real at the far end of a hook somebody
//   else owns: the two damage-over-time effects are billed by main.js, fear is
//   a refusal inside tryShoot, slowness is one multiplier in the movement
//   branch, and every one of them is supposed to put a chip on the HUD. A test
//   that called applyStatus and read player.status back would pass with all of
//   that wiring cut.
//
// WHAT IS ASSERTED
//   1. Timers run down and the effect ends.
//   2. Fire and poison actually cost health, through the same sink a hazard
//      pool uses - so they are throttled, they break Carnage, and they can end
//      a run.
//   3. Fear stops the trigger and NOTHING else - reload and melee still work.
//   4. Weakness cuts outgoing damage, curse raises incoming damage, slowness
//      cuts distance covered.
//   5. They REFRESH rather than stack: two applications are one effect.
//   6. Every active effect wears a chip, marked bad, and the chip goes when
//      the effect does.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8213;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { stdio: 'inherit' });
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
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const out = await page.evaluate(async () => {
    const g = window.__game;
    const p = g.player;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };

    // The bot drives the player and shoots; every measurement below is about
    // what the PLAYER does, so it has to be switched off first. The arena is
    // cleared for the same reason - an enemy landing a hit mid-measurement
    // would be counted as the burn.
    g.autoTest = false;
    g._clearEntities();
    g.input.shoot = false;
    g.input.shootFresh = false;

    const clean = () => {
      p.clearStatuses();
      p.health = p.maxHealth;
      p.shield = 0;
      p.invulnEnd = -1;
      p.mods.hazardMult = 1;
      p.mods.damageTakenMult = 1;
    };

    const res = {};

    // ---- 1. the clock -----------------------------------------------------
    clean();
    p.applyStatus('fear', 0.4);
    res.fearOnAtStart = p.hasStatus('fear');
    res.fracAtStart = p.statusFraction('fear');
    // WAITED IN GAME TIME, NOT WALL TIME. The status clock counts down in
    // game seconds, and this suite runs on a software rasteriser whose frame
    // rate varies by an order of magnitude - so a fixed 1200ms of wall time
    // was really asserting "the machine was fast enough today". The wall-clock
    // cap is still there so a clock that genuinely never runs out fails rather
    // than hanging.
    const t0 = g.time;
    const wall = performance.now();
    while (g.time - t0 < 1.2 && performance.now() - wall < 15000) await step();
    res.fearOffAfter = p.hasStatus('fear');
    res.fracAfter = p.statusFraction('fear');

    // ---- 2. damage over time ---------------------------------------------
    // Measured on the GAME'S CLOCK, and burning for longer than the window.
    // Both of those are fixes for the same flake, and both are worth keeping.
    //
    // THE CLOCK. dt is clamped to 0.05 in _loop, so below twenty frames a
    // second the game's clock LAGS the wall clock - and under swiftshader it
    // does. A 3.2s WALL window is then some unknown amount of game time, while
    // the burn it bills is proportional to the game time and not to the window,
    // so the same correct code measured anywhere from 16 to 22 points depending
    // on how the frames happened to fall.
    //
    // THE DURATION. The refresh check below re-applies every frame and so
    // always burns for the whole window. A single three-second application
    // measured over 3.2s does not: it expires inside the window. Comparing the
    // two was comparing a burn that ended with one that did not, which is a
    // real difference of about a point and a half sitting inside a tolerance of
    // four. Both applications now outlast the window, so the only thing left
    // between them is the whole-point billing, which is worth at most one.
    //
    // The wall-clock guard is a deadlock stop, not a measurement: if the game
    // clock ever stops advancing this must fail an assertion rather than hang
    // the suite.
    const burnFor = async (secs, onStep) => {
      const t0g = g.time;
      const wall = performance.now();
      while (g.time - t0g < secs && performance.now() - wall < 20000) {
        if (onStep) onStep();
        await step();
      }
      return g.time - t0g;
    };

    clean();
    p.applyStatus('fire', 30);
    const hp0 = p.health;
    const burnSecs = await burnFor(3.2);
    res.burn = { lost: hp0 - p.health, secs: burnSecs };

    // REFRESH, NOT STACK. An application every frame over the same window must
    // cost what one did - if they stacked, this would be many times the burn.
    clean();
    p.applyStatus('fire', 30);
    const hp1 = p.health;
    res.stackedSecs = await burnFor(3.2, () => p.applyStatus('fire', 30));
    res.burnStacked = hp1 - p.health;

    // ---- 3. fear stops the trigger and nothing else -----------------------
    clean();
    p.mag = p.magSize;
    p.reloading = 0;
    p.fireCd = 0;
    p.meleeCd = 0;
    res.shootsWhenClean = p.tryShoot(true);
    p.fireCd = 0;
    p.applyStatus('fear', 5);
    res.shootsWhenAfraid = p.tryShoot(true);
    res.meleeWhenAfraid = p.tryMelee();
    p.mag = 1;
    p.startReload();
    res.reloadsWhenAfraid = p.reloading > 0;

    // ---- 4. the three multipliers ----------------------------------------
    clean();
    const outClean = p.getEffectiveDamage(100);
    p.applyStatus('weakness');
    const outWeak = p.getEffectiveDamage(100);

    clean();
    p.health = 100;
    p.takeDamage(20, g.time);
    const tookClean = 100 - p.health;
    clean();
    p.health = 100;
    p.applyStatus('curse');
    p.takeDamage(20, g.time);
    const tookCursed = 100 - p.health;
    res.dmg = { outClean, outWeak, tookClean, tookCursed };

    // Distance actually covered with the forward key held, clean and slowed.
    // EVERY KEY IS CLEARED FIRST and forward is re-pressed on every frame.
    // The autotest bot drives this same input object and leaves whatever it
    // was holding behind when it is switched off - a stale `back` cancels the
    // press exactly, and the measurement comes out as zero metres for both
    // halves, which looks like a broken slow rather than a broken test.
    const walk = async (slowed) => {
      clean();
      for (const k of ['forward', 'back', 'left', 'right', 'jump', 'shoot']) {
        g.input[k] = false;
      }
      if (slowed) p.applyStatus('slowness');
      p.pos.set(0, 0, 8);
      p.yaw = 0;
      p.moveVX = 0;
      p.moveVZ = 0;
      const from = p.pos.clone();
      for (let i = 0; i < 45; i++) {
        g.input.forward = true;
        await step();
      }
      g.input.forward = false;
      const d = p.pos.distanceTo(from);
      await steps(5);
      return d;
    };
    res.walkClean = await walk(false);
    res.walkSlow = await walk(true);

    // ---- 5. the HUD -------------------------------------------------------
    clean();
    const keys = ['fire', 'poison', 'fear', 'weakness', 'curse', 'slowness'];
    for (const k of keys) p.applyStatus(k, 30);
    await steps(3);
    const chips = () => [...document.querySelectorAll('#buffs .buff-icon.bad')]
      .filter((e) => e.style.display !== 'none');
    res.chipsUp = chips().length;
    // Read off the SCREEN, not off the DOM. The chips are created lazily, in
    // whatever order the run hands them out, and the strip is put back in
    // order by the CSS `order` property - so the DOM proves nothing and the
    // left edge of each chip proves everything.
    res.chipsOrdered = chips()
      .map((e) => ({ order: Number(e.style.order), x: e.getBoundingClientRect().left }))
      .sort((a, b) => a.x - b.x)
      .every((c, i, a) => i === 0 || a[i - 1].order < c.order);
    res.chipsHaveArt = chips().every((e) => {
      const c = e.querySelector('canvas.buff-art');
      return !!c && c.width > 0 && c.height > 0;
    });
    p.clearStatuses();
    await steps(3);
    res.chipsDown = chips().length;

    // ---- 6. a new run starts clean ---------------------------------------
    for (const k of keys) p.applyStatus(k, 30);
    p.reset();
    res.afterReset = keys.some((k) => p.hasStatus(k));

    return res;
  });

  ok('an effect is on the moment it is applied', out.fearOnAtStart && out.fracAtStart === 1);
  ok('and off when its clock runs out', !out.fearOffAfter && out.fracAfter === 0);

  // 7 dps over 3.2s of GAME time is 22.4, billed in whole points, minus
  // whatever the last partial point never reached. Still a window rather than
  // an equality - the billing is what makes it one - but a much narrower window
  // than it used to need, because the measurement is no longer at the mercy of
  // the frame rate.
  ok('fire costs health at about its rate', out.burn.lost >= 20 && out.burn.lost <= 23,
    `${out.burn.lost.toFixed(1)} over ${out.burn.secs.toFixed(1)}s`);
  // Both windows now burn for the same amount of game time and neither expires
  // inside it, so anything past a point or two apart is the statuses stacking.
  // The second half is the check the name is actually about: stacking would not
  // be a near miss, it would be a multiple.
  ok('re-applying it refreshes rather than stacks',
    Math.abs(out.burnStacked - out.burn.lost) <= 2
      && out.burnStacked < out.burn.lost * 1.5,
    `${out.burnStacked.toFixed(1)} vs ${out.burn.lost.toFixed(1)}`);

  ok('a clean player shoots', out.shootsWhenClean === 'shot', String(out.shootsWhenClean));
  ok('a frightened one does not', out.shootsWhenAfraid === 'feared', String(out.shootsWhenAfraid));
  ok('but can still swing', out.meleeWhenAfraid === true);
  ok('and can still reload', out.reloadsWhenAfraid === true);

  ok('weakness cuts outgoing damage', out.dmg.outWeak < out.dmg.outClean * 0.99,
    `${out.dmg.outClean} -> ${out.dmg.outWeak}`);
  ok('curse takes 25% more', Math.abs(out.dmg.tookCursed / out.dmg.tookClean - 1.25) < 0.01,
    `${out.dmg.tookClean} -> ${out.dmg.tookCursed}`);
  ok('slowness covers less ground', out.walkSlow < out.walkClean * 0.8,
    `${out.walkClean.toFixed(2)}m -> ${out.walkSlow.toFixed(2)}m`);

  ok('every active effect wears a chip', out.chipsUp === 6, String(out.chipsUp));
  ok('the chips hold their order', out.chipsOrdered === true);
  ok('and each carries its drawing', out.chipsHaveArt === true);
  ok('the chips go when the effects do', out.chipsDown === 0, String(out.chipsDown));
  ok('a new run starts clean', out.afterReset === false);

  ok('no console errors', errors.length === 0, errors.join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? 'STATUS TEST FAIL' : 'STATUS TEST PASS');
process.exit(fails ? 1 : 0);
