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

const PORT = 8211;
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
    const t0 = performance.now();
    while (performance.now() - t0 < 1200) await step();
    res.fearOffAfter = p.hasStatus('fear');
    res.fracAfter = p.statusFraction('fear');

    // ---- 2. damage over time ---------------------------------------------
    // Measured against the CLOCK rather than against a frame count: the sink
    // bills whole points only, so the assertion has to be a window and not an
    // equality.
    clean();
    p.applyStatus('fire', 3);
    const hp0 = p.health;
    const b0 = performance.now();
    while (performance.now() - b0 < 3200) await step();
    res.burn = { lost: hp0 - p.health, secs: (performance.now() - b0) / 1000 };

    // REFRESH, NOT STACK. Four applications over the same window must cost
    // the same as one - if they stacked, this would be four times the burn.
    clean();
    const hp1 = p.health;
    const b1 = performance.now();
    while (performance.now() - b1 < 3200) {
      p.applyStatus('fire', 3);
      await step();
    }
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
    const walk = async (slowed) => {
      clean();
      if (slowed) p.applyStatus('slowness');
      p.pos.set(0, 0, 8);
      p.yaw = 0;
      p.moveVX = 0;
      p.moveVZ = 0;
      g.input.forward = true;
      const from = p.pos.clone();
      await steps(45);
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

  // 7 dps over ~3s, billed in whole points, minus whatever the last partial
  // point never reached. A wide window on purpose: the point is that it bleeds
  // at roughly the rate on the table, not that it lands on an exact integer.
  ok('fire costs health at about its rate', out.burn.lost >= 15 && out.burn.lost <= 23,
    `${out.burn.lost.toFixed(1)} over ${out.burn.secs.toFixed(1)}s`);
  ok('re-applying it refreshes rather than stacks',
    Math.abs(out.burnStacked - out.burn.lost) <= 4,
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
