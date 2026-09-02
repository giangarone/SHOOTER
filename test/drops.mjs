// Drop-system test.
//
// The smoke test only checks that nothing crashes or leaks; the properties
// that make drops FAIR are invisible to it. Drops are rolled per kill now
// rather than paid out of a per-wave budget (see rollDrop in powerups.js),
// so what is worth pinning down has changed with them:
//
//   the rates are the rates     a kill drops at the advertised chance, and
//                               the buffs stay rare - they are the numbers the
//                               whole economy of a wave is tuned against, and
//                               nothing else in the game would notice if one
//                               of them silently doubled
//   need moves health and ammo  and ONLY health and ammo: a player doing badly
//                               gets more of what keeps them alive, never more
//                               damage
//   one drop per kill at most   so a single death can never carpet the floor
//
// The old budget assertions are gone with the budget. What replaced the
// guarantee they encoded - two runs of a wave get the same loot - is nothing:
// that was the cost of rolling rather than scheduling, and it was paid on
// purpose.
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

  // ---- the advertised rates are the real rates ----
  const rates = await page.evaluate(async () => {
    const { rollDrop, dropChance, POWERUP_TYPES, AMMO_PICKUP } = await import('/js/powerups.js');
    const N = 200000;
    const sample = (hp, ammo, allowAmmo = true) => {
      const t = { nothing: 0 };
      for (let i = 0; i < N; i++) {
        const k = rollDrop(hp, ammo, allowAmmo);
        if (!k) t.nothing++;
        else t[k] = (t[k] || 0) + 1;
      }
      for (const k in t) t[k] = t[k] / N;
      return t;
    };
    return {
      full: sample(1, 1),
      // Just under a full bar. `full` is now the case where health is
      // withheld entirely, so the base rate has to be sampled from a player
      // who is missing something - anything.
      nicked: sample(0.99, 1),
      hurt: sample(0.1, 1),
      dry: sample(1, 0.05),
      noAmmo: sample(1, 0.05, false),
      // What the module itself says it should be doing, to check the sample
      // against rather than against numbers copied into this file.
      wantFull: dropChance(1, 1),
      wantDry: dropChance(1, 0.05),
      chances: {
        health: POWERUP_TYPES.health.chance,
        damageBoost: POWERUP_TYPES.damageBoost.chance,
        fireRateBoost: POWERUP_TYPES.fireRateBoost.chance,
        magnet: POWERUP_TYPES.magnet.chance,
        shield: POWERUP_TYPES.shield.chance,
        ammo: AMMO_PICKUP.chance,
      },
    };
  });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const anything = (t) => 1 - t.nothing;

  check('most kills drop nothing', rates.full.nothing > 0.8,
    `nothing=${rates.full.nothing.toFixed(3)}`);
  check('the overall rate matches dropChance()',
    near(anything(rates.full), rates.wantFull, 0.006),
    `sampled=${anything(rates.full).toFixed(4)} stated=${rates.wantFull.toFixed(4)}`);
  check('the overall rate matches dropChance() when starving',
    near(anything(rates.dry), rates.wantDry, 0.008),
    `sampled=${anything(rates.dry).toFixed(4)} stated=${rates.wantDry.toFixed(4)}`);

  // Each buff at its own advertised chance, within sampling noise. Ammo is
  // rolled first and eats a little of everything after it, which is why these
  // are checked at the "full bars" sample where its rate is lowest - and why
  // the tolerance is a fraction of the chance rather than an absolute.
  for (const [key, want] of Object.entries(rates.chances)) {
    if (key === 'ammo' || key === 'health') continue;
    check(`${key} drops at ~${(want * 100).toFixed(1)}% a kill`,
      near(rates.full[key] || 0, want, want * 0.25),
      `sampled=${((rates.full[key] || 0) * 100).toFixed(2)}%`);
  }

  // ---- need moves health and ammo, and nothing else ----
  // The need term is held equal to the base chance, so an empty bar at most
  // DOUBLES the rate - checked from both sides. The lower bound is what says
  // need still does something; the upper is what says the bailout stays a
  // nudge. The samples here sit at 0.81 and 0.90 of the squared need curve,
  // so they land just under the 2x ceiling rather than on it.
  const ratio = (a, b) => (b > 0 ? a / b : 0);
  const healthRatio = ratio(rates.hurt.health || 0, rates.nicked.health || 0);
  const ammoRatio = ratio(rates.dry.ammo || 0, rates.full.ammo || 0);
  check('low health raises the health rate, capped at 2x',
    healthRatio > 1.5 && healthRatio <= 2.05,
    `nicked=${(rates.nicked.health || 0).toFixed(3)} hurt=${(rates.hurt.health || 0).toFixed(3)} x${healthRatio.toFixed(2)}`);
  // A health plate on a full bar is a drop that cannot be spent: it is either
  // walked over for nothing or left to time out. Withheld outright rather
  // than merely made rare - see rollDrop().
  check('a full bar drops no health at all', !rates.full.health,
    `health=${rates.full.health}`);
  check('a bar one point down does', (rates.nicked.health || 0) > 0.03,
    `health=${(rates.nicked.health || 0).toFixed(3)}`);
  check('low ammo raises the ammo rate, capped at 2x',
    ammoRatio > 1.5 && ammoRatio <= 2.05,
    `full=${(rates.full.ammo || 0).toFixed(3)} dry=${(rates.dry.ammo || 0).toFixed(3)} x${ammoRatio.toFixed(2)}`);
  check('need never raises a buff rate',
    near(rates.hurt.shield || 0, rates.full.shield || 0, 0.004)
    && near(rates.hurt.damageBoost || 0, rates.full.damageBoost || 0, 0.006),
    `shield ${(rates.full.shield || 0).toFixed(4)} -> ${(rates.hurt.shield || 0).toFixed(4)}`);
  check('the ammo cap suppresses ammo entirely', !rates.noAmmo.ammo,
    `ammo=${rates.noAmmo.ammo}`);
  // Floor is well under the 0.5% base: ammo is rolled first and eats into it,
  // so a starving player sees the buffs at a shade under their flat rate - the
  // point is that they are still reachable, not that they are undiminished.
  check('a starving player still sees buffs',
    (rates.dry.damageBoost || 0) > 0.003,
    `damage=${(rates.dry.damageBoost || 0).toFixed(4)}`);

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
    const orig = g._placeDrop.bind(g);
    g._placeDrop = (kind, pos) => { bled++; return orig(kind, pos); };
    const b = g.bossFight.parts[0];
    const seen = [];
    // Walk the boss down through every threshold.
    for (const f of [0.8, 0.7, 0.55, 0.45, 0.3, 0.2]) {
      b.hp = b.maxHp * f;
      await new Promise((r) => setTimeout(r, 260));
      seen.push({ f, bled });
    }
    g._placeDrop = orig;
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
  //
  // A slot is a STAMP into the shared creep field now rather than a mesh of
  // its own, so "is it still being drawn" is its alpha rather than a mesh's
  // visible flag. Same question, asked of the thing that answers it.
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
      visible: g.effects.creep.filter((c) => c.alpha > 0).length,
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
