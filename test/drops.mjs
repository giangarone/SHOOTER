// Drop-system test.
//
// The smoke test only checks that nothing crashes or leaks; the properties
// that make drops FAIR are invisible to it. This checks the three that matter:
//
//   the budget is a ceiling      a wave can never yield more loot than
//                                calcDropsForWave, however it is played
//   the budget is actually spent clearing a wave yields close to all of it,
//                                so the ceiling is not hiding a drought
//   need picks the type          low health drops health, low ammo drops ammo,
//                                and a player with full bars gets buffs
//
// The first two together are the leaderboard guarantee: two runs of the same
// wave get the same amount of loot. Only its composition varies.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8217;
const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { stdio: 'ignore' });
await sleep(800);

let browser;
let bad = 0;
const check = (name, ok, detail) => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
};

try {
  browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load' });
  await sleep(1500);

  // ---- type selection responds to need ----
  const mix = await page.evaluate(async () => {
    const { pickDropType } = await import('/js/powerups.js');
    const roll = (hp, ammo) => {
      const t = {};
      for (let i = 0; i < 4000; i++) {
        const k = pickDropType(hp, ammo);
        t[k] = (t[k] || 0) + 1;
      }
      for (const k in t) t[k] = +(t[k] / 4000).toFixed(3);
      return t;
    };
    return {
      hurt: roll(0.15, 1),
      dry: roll(1, 0.08),
      both: roll(0.2, 0.2),
      full: roll(1, 1),
    };
  });
  check('low health mostly drops health', (mix.hurt.health || 0) > 0.75,
    `health=${mix.hurt.health} of ${JSON.stringify(mix.hurt)}`);
  check('low ammo mostly drops ammo', (mix.dry.ammo || 0) > 0.75,
    `ammo=${mix.dry.ammo}`);
  check('both low splits between them', (mix.both.health || 0) > 0.3 && (mix.both.ammo || 0) > 0.3,
    `health=${mix.both.health} ammo=${mix.both.ammo}`);
  check('full bars drop only buffs',
    !mix.full.health && !mix.full.ammo,
    JSON.stringify(mix.full));

  // ---- budget is a ceiling, and is spent ----
  // Run several waves with the player unkillable, counting every drop.
  const waves = [3, 7, 12, 18];
  for (const w of waves) {
    const res = await page.evaluate(async (wave) => {
      const g = window.__game;
      const { calcDropsForWave } = await import('/js/powerups.js');
      g.wave = wave - 1;
      g.enemies.forEach((e) => { e.dead = true; });
      g.queue.length = 0;
      g.powerups.forEach((p) => p.destroy());
      g.powerups.length = 0;
      g.waveState = 'idle';
      g.interT = 0.05;
      // maxHealth is a getter; keep the player alive by topping health up.
      g.player.health = g.player.maxHealth;
      // Count every drop this wave by wrapping the spawner.
      let dropped = 0;
      const orig = g._spawnDrop.bind(g);
      g._spawnDrop = (pos) => { dropped++; return orig(pos); };
      let relief = 0;
      const origR = g._updateReliefDrop.bind(g);
      g._updateReliefDrop = (dt) => {
        const before = g.powerups.length;
        origR(dt);
        if (g.powerups.length > before) relief++;
      };
      // Let the wave start, then kill everything as it arrives.
      const budget = calcDropsForWave(wave);
      const deadline = Date.now() + 22000;
      await new Promise((done) => {
        const t = setInterval(() => {
          g.player.health = g.player.maxHealth;
          g.player.reserveAmmo = 0; g.player.mag = 0;   // keep need high
          for (const e of g.enemies) e.takeDamage(1e6, true, 0, 1);
          const cleared = g.waveState !== 'active' && g.wave === wave;
          if (cleared || Date.now() > deadline) { clearInterval(t); done(); }
        }, 120);
      });
      g._spawnDrop = orig;
      g._updateReliefDrop = origR;
      return { wave: g.wave, budget, dropped, relief, left: g.dropsLeft };
    }, w);
    check(`wave ${w} drops never exceed budget`, res.dropped <= res.budget,
      `dropped=${res.dropped} budget=${res.budget}`);
    check(`wave ${w} budget mostly spent`, res.dropped >= Math.ceil(res.budget * 0.6),
      `dropped=${res.dropped}/${res.budget} left=${res.left}`);
  }

  // ---- boss bleeds at its thresholds ----
  const boss = await page.evaluate(async () => {
    const g = window.__game;
    g.wave = 4;
    g.enemies.forEach((e) => { e.dead = true; });
    g.queue.length = 0;
    g.waveState = 'idle'; g.interT = 0.05;
    const alive = setInterval(() => { g.player.health = g.player.maxHealth; }, 40);
    await new Promise((r) => {
      const t = setInterval(() => { if (g.bossFight) { clearInterval(t); r(); } }, 60);
    });
    let bled = 0;
    const orig = g._spawnDrop.bind(g);
    g._spawnDrop = (pos) => { bled++; return orig(pos); };
    const b = g.bossFight.parts[0];
    const seen = [];
    // Walk the boss down through every threshold.
    for (const f of [0.8, 0.7, 0.55, 0.45, 0.3, 0.2]) {
      b.hp = b.maxHp * f;
      await new Promise((r) => setTimeout(r, 260));
      seen.push({ f, bled });
    }
    g._spawnDrop = orig;
    clearInterval(alive);
    return { seen, bled, thresholds: g.bossFight ? g.bossFight.bleedAt : -1 };
  });
  check('boss bleeds once per threshold', boss.bled === 3,
    `bled=${boss.bled} bleedAt=${boss.thresholds} (want 3)`);

  // ---- relief fires when starved ----
  const relief = await page.evaluate(async () => {
    const g = window.__game;
    // Relief only runs while a wave is ACTIVE - it is a combat safety net, not
    // a between-waves handout. Put the game back into a live wave first.
    g.wave = 6;
    g.enemies.forEach((e) => { e.dead = true; });
    g.queue.length = 0;
    g.totemArea.dismiss();
    g.waveState = 'idle'; g.interT = 0.05;
    await new Promise((r) => setTimeout(r, 900));
    g.powerups.forEach((p) => p.destroy());
    g.powerups.length = 0;
    // maxHealth is a GETTER off mods, so it cannot be assigned; starve the
    // player through the fields that are real.
    const hold = setInterval(() => {
      g.player.health = g.player.maxHealth * 0.2;
      g.player.reserveAmmo = 0;
      g.player.mag = 0;
    }, 30);
    g._reliefT = 0.05;
    const before = g.powerups.length;
    await new Promise((r) => setTimeout(r, 2000));
    clearInterval(hold);
    const kinds = g.powerups.map((p) => p.typeKey);
    return { before, after: g.powerups.length, kinds, waveState: g.waveState };
  });
  check('relief spawns when starved', relief.after > relief.before,
    `pickups ${relief.before}->${relief.after} state=${relief.waveState} ${JSON.stringify(relief.kinds)}`);
  check('relief favours ammo when both are empty', relief.kinds.includes('ammo'),
    JSON.stringify(relief.kinds));

  // ---- ground zones hand their decals back ----
  // Every lingering zone holds a slot in the creep pool for its whole life.
  // The pool is thirty deep and shared by ash clouds, blight pools and magma
  // trails, so a
  // zone that expired without releasing would go unnoticed until, several
  // waves later, zones silently stopped being drawn at all - the exact failure
  // the decals were added to fix.
  const creep = await page.evaluate(async () => {
    const g = window.__game;
    g._ash.forEach((a) => g.effects.creepRelease(a.creep));
    g._ash.length = 0;
    g._hazard.forEach((h) => g.effects.creepRelease(h.creep));
    g._hazard.length = 0;
    g.waveState = 'active';
    g.player.mods.ashDps = 18;
    g.player.mods.ashRadius = 3.5;
    g.player.mods.ashTime = 1.2;
    // More zones than the per-kind caps hold (8 clouds, 4 pools), so the
    // recycling path is exercised too.
    for (let i = 0; i < 10; i++) g._addAsh({ x: -8 + i * 1.7, z: 4 });
    for (let i = 0; i < 6; i++) g._addHazard(-6 + i * 2.4, 9, 3, 1.2, 9);
    const peak = g.effects.creep.filter((c) => c.used).length;
    await new Promise((r) => setTimeout(r, 4000));
    return {
      peak,
      held: g.effects.creep.filter((c) => c.used).length,
      visible: g.effects.creep.filter((c) => c.group.visible).length,
      zones: g._ash.length + g._hazard.length,
    };
  });
  check('zone decals are drawn while zones live', creep.peak > 0, `peak=${creep.peak}`);
  check('zone decals return to the pool', creep.held === 0 && creep.visible === 0,
    `held=${creep.held} visible=${creep.visible} zones=${creep.zones}`);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(bad ? `DROP TEST FAIL (${bad})` : 'DROP TEST PASS');
process.exitCode = bad ? 1 : 0;
